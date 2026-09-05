-- Complete BahayRentahan owner workflows. Run after 001_bedkeep_initial_schema.sql.

alter table public.rooms add column if not exists archived_at timestamptz;
alter table public.bedspaces add column if not exists archived_at timestamptz;
alter table public.payments add column if not exists receipt_number text;
alter table public.maintenance_requests add column if not exists description text;
create unique index if not exists payments_receipt_number_unique on public.payments(receipt_number) where receipt_number is not null;

create or replace function public.delete_room_safely(p_room_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_property_id uuid;
begin
  select property_id into v_property_id from public.rooms where id = p_room_id;
  if v_property_id is null or not public.owns_property(v_property_id) then raise exception 'You do not have access to this room'; end if;
  if exists (select 1 from public.occupancies o join public.bedspaces b on b.id = o.bedspace_id where b.room_id = p_room_id and o.status = 'active') then
    raise exception 'Move out or transfer every boarder before deleting this room';
  end if;
  if exists (select 1 from public.occupancies o join public.bedspaces b on b.id = o.bedspace_id where b.room_id = p_room_id) then
    update public.rooms set archived_at = now(), updated_at = now() where id = p_room_id;
    update public.bedspaces set archived_at = now(), updated_at = now() where room_id = p_room_id;
  else
    delete from public.rooms where id = p_room_id;
  end if;
end; $$;
revoke all on function public.delete_room_safely(uuid) from public;
grant execute on function public.delete_room_safely(uuid) to authenticated;

create or replace function public.delete_bedspace_safely(p_bedspace_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_property_id uuid;
begin
  select r.property_id into v_property_id from public.bedspaces b join public.rooms r on r.id = b.room_id where b.id = p_bedspace_id;
  if v_property_id is null or not public.owns_property(v_property_id) then raise exception 'You do not have access to this bedspace'; end if;
  if exists (select 1 from public.occupancies where bedspace_id = p_bedspace_id and status = 'active') then raise exception 'Move out or transfer the boarder before deleting this bedspace'; end if;
  if exists (select 1 from public.occupancies where bedspace_id = p_bedspace_id) then
    update public.bedspaces set archived_at = now(), updated_at = now() where id = p_bedspace_id;
  else
    delete from public.bedspaces where id = p_bedspace_id;
  end if;
end; $$;
revoke all on function public.delete_bedspace_safely(uuid) from public;
grant execute on function public.delete_bedspace_safely(uuid) to authenticated;

create or replace function public.move_out_boarder(p_boarder_id uuid, p_end_date date default current_date)
returns void language plpgsql security definer set search_path = public as $$
declare v_property_id uuid; v_bedspace_id uuid;
begin
  select property_id into v_property_id from public.boarders where id = p_boarder_id;
  if v_property_id is null or not public.owns_property(v_property_id) then raise exception 'You do not have access to this boarder'; end if;
  select bedspace_id into v_bedspace_id from public.occupancies where boarder_id = p_boarder_id and status = 'active' limit 1;
  if v_bedspace_id is null then raise exception 'This boarder has no active bedspace assignment'; end if;
  update public.occupancies set status = 'ended', end_date = p_end_date, updated_at = now() where boarder_id = p_boarder_id and status = 'active';
  update public.bedspaces set status = 'vacant', updated_at = now() where id = v_bedspace_id;
end; $$;
revoke all on function public.move_out_boarder(uuid, date) from public;
grant execute on function public.move_out_boarder(uuid, date) to authenticated;

create or replace function public.transfer_boarder(p_boarder_id uuid, p_target_bedspace_id uuid, p_monthly_rent numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_property_id uuid; v_target_property_id uuid; v_old_bedspace_id uuid; v_new_occupancy_id uuid;
begin
  select property_id into v_property_id from public.boarders where id = p_boarder_id and status = 'active';
  select r.property_id into v_target_property_id from public.bedspaces b join public.rooms r on r.id = b.room_id where b.id = p_target_bedspace_id and b.archived_at is null and r.archived_at is null;
  if v_property_id is null or v_target_property_id is distinct from v_property_id or not public.owns_property(v_property_id) then raise exception 'The boarder and bedspace must belong to your active property'; end if;
  if exists (select 1 from public.occupancies where bedspace_id = p_target_bedspace_id and status = 'active') then raise exception 'The selected bedspace is already occupied'; end if;
  select bedspace_id into v_old_bedspace_id from public.occupancies where boarder_id = p_boarder_id and status = 'active' limit 1;
  if v_old_bedspace_id is not null then
    update public.occupancies set status = 'ended', end_date = current_date, updated_at = now() where boarder_id = p_boarder_id and status = 'active';
    update public.bedspaces set status = 'vacant', updated_at = now() where id = v_old_bedspace_id;
  end if;
  insert into public.occupancies(bedspace_id, boarder_id, monthly_rent) values (p_target_bedspace_id, p_boarder_id, p_monthly_rent) returning id into v_new_occupancy_id;
  update public.bedspaces set status = 'occupied', updated_at = now() where id = p_target_bedspace_id;
  return v_new_occupancy_id;
end; $$;
revoke all on function public.transfer_boarder(uuid, uuid, numeric) from public;
grant execute on function public.transfer_boarder(uuid, uuid, numeric) to authenticated;

create or replace function public.archive_boarder(p_boarder_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_property_id uuid; v_bedspace_id uuid;
begin
  select property_id into v_property_id from public.boarders where id = p_boarder_id;
  if v_property_id is null or not public.owns_property(v_property_id) then raise exception 'You do not have access to this boarder'; end if;
  select bedspace_id into v_bedspace_id from public.occupancies where boarder_id = p_boarder_id and status = 'active' limit 1;
  if v_bedspace_id is not null then
    update public.occupancies set status = 'ended', end_date = current_date, updated_at = now() where boarder_id = p_boarder_id and status = 'active';
    update public.bedspaces set status = 'vacant', updated_at = now() where id = v_bedspace_id;
  end if;
  update public.boarders set status = 'inactive', updated_at = now() where id = p_boarder_id;
end; $$;
revoke all on function public.archive_boarder(uuid) from public;
grant execute on function public.archive_boarder(uuid) to authenticated;

create or replace function public.delete_boarder_safely(p_boarder_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_property_id uuid;
begin
  select property_id into v_property_id from public.boarders where id = p_boarder_id;
  if v_property_id is null or not public.owns_property(v_property_id) then raise exception 'You do not have access to this boarder'; end if;
  if exists (select 1 from public.occupancies where boarder_id = p_boarder_id and status = 'active') then raise exception 'Move out the boarder before deleting their record'; end if;
  if exists (select 1 from public.occupancies where boarder_id = p_boarder_id) or exists (select 1 from public.payments where boarder_id = p_boarder_id) then
    update public.boarders set status = 'inactive', updated_at = now() where id = p_boarder_id;
  else
    delete from public.boarders where id = p_boarder_id;
  end if;
end; $$;
revoke all on function public.delete_boarder_safely(uuid) from public;
grant execute on function public.delete_boarder_safely(uuid) to authenticated;
