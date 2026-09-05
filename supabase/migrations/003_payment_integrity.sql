-- Secure rent collection rules. Run after 002_complete_ux_workflows.sql.

-- Older paid records may predate the RPC workflow. Their creation timestamp is
-- the most reliable available cash-received date for dashboard reporting.
update public.payments
set paid_at = created_at
where status = 'paid' and paid_at is null;

create sequence if not exists public.payment_receipt_sequence;

create or replace function public.next_payment_receipt_number()
returns text
language sql
volatile
security definer
set search_path = public
as $$
  select 'BK-' || to_char(current_date, 'YYYYMM') || '-' ||
    lpad(nextval('public.payment_receipt_sequence')::text, 6, '0');
$$;

revoke all on function public.next_payment_receipt_number() from public, authenticated;

drop policy if exists "Owner manages payments" on public.payments;
drop policy if exists "Owner reads payments" on public.payments;
create policy "Owner reads payments" on public.payments
for select to authenticated
using (public.owns_property(property_id));

create or replace function public.record_rent_payment(
  p_property_id uuid,
  p_boarder_id uuid,
  p_amount numeric,
  p_method text,
  p_period_start date,
  p_status text,
  p_reference_number text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_occupancy_id uuid;
  v_monthly_rent numeric(12,2);
  v_paid_total numeric(12,2);
  v_payment_id uuid;
  v_period_end date;
begin
  if not public.owns_property(p_property_id) then
    raise exception 'You do not have access to this property';
  end if;
  if not exists (
    select 1 from public.boarders
    where id = p_boarder_id and property_id = p_property_id and status = 'active'
  ) then
    raise exception 'Select an active boarder from this property';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;
  if p_method not in ('GCash', 'Cash', 'Bank transfer') then
    raise exception 'Select a valid payment method';
  end if;
  if p_status not in ('paid', 'pending') then
    raise exception 'Select a valid payment status';
  end if;
  if p_period_start is null or p_period_start <> date_trunc('month', p_period_start)::date then
    raise exception 'Rent period must start on the first day of a month';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_boarder_id::text || ':' || p_period_start::text, 0));
  v_period_end := (p_period_start + interval '1 month - 1 day')::date;

  select o.id, o.monthly_rent
  into v_occupancy_id, v_monthly_rent
  from public.occupancies o
  where o.boarder_id = p_boarder_id
    and o.start_date <= v_period_end
    and (o.end_date is null or o.end_date >= p_period_start)
  order by o.start_date desc, o.created_at desc
  limit 1;

  if v_occupancy_id is null then
    raise exception 'Assign this boarder to a bedspace before recording rent for this period';
  end if;

  if p_status = 'paid' then
    select coalesce(sum(amount), 0)
    into v_paid_total
    from public.payments
    where property_id = p_property_id
      and boarder_id = p_boarder_id
      and period_start = p_period_start
      and status = 'paid';

    if v_paid_total + p_amount > v_monthly_rent then
      raise exception 'Payment exceeds the remaining balance of %',
        to_char(greatest(v_monthly_rent - v_paid_total, 0), 'FM999999990.00');
    end if;
  end if;

  insert into public.payments (
    property_id, boarder_id, occupancy_id, amount, method, period_start,
    paid_at, status, reference_number, receipt_number
  ) values (
    p_property_id, p_boarder_id, v_occupancy_id, p_amount, p_method, p_period_start,
    case when p_status = 'paid' then now() else null end,
    p_status, nullif(trim(p_reference_number), ''),
    case when p_status = 'paid' then public.next_payment_receipt_number() else null end
  ) returning id into v_payment_id;

  return v_payment_id;
end;
$$;

revoke all on function public.record_rent_payment(uuid, uuid, numeric, text, date, text, text) from public;
grant execute on function public.record_rent_payment(uuid, uuid, numeric, text, date, text, text) to authenticated;

create or replace function public.confirm_rent_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_property_id uuid;
  v_boarder_id uuid;
  v_occupancy_id uuid;
  v_period_start date;
  v_amount numeric(12,2);
  v_monthly_rent numeric(12,2);
  v_paid_total numeric(12,2);
  v_status text;
begin
  select property_id, boarder_id, occupancy_id, period_start, amount, status
  into v_property_id, v_boarder_id, v_occupancy_id, v_period_start, v_amount, v_status
  from public.payments
  where id = p_payment_id
  for update;

  if v_property_id is null or not public.owns_property(v_property_id) then
    raise exception 'You do not have access to this payment';
  end if;
  if v_status <> 'pending' then
    raise exception 'Only pending payments can be confirmed';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_boarder_id::text || ':' || v_period_start::text, 0));
  select monthly_rent into v_monthly_rent from public.occupancies where id = v_occupancy_id;
  if v_monthly_rent is null then
    raise exception 'The related occupancy record is unavailable';
  end if;

  select coalesce(sum(amount), 0)
  into v_paid_total
  from public.payments
  where property_id = v_property_id
    and boarder_id = v_boarder_id
    and period_start = v_period_start
    and status = 'paid'
    and id <> p_payment_id;

  if v_paid_total + v_amount > v_monthly_rent then
    raise exception 'Payment exceeds the remaining balance of %',
      to_char(greatest(v_monthly_rent - v_paid_total, 0), 'FM999999990.00');
  end if;

  update public.payments
  set status = 'paid', paid_at = now(), receipt_number = public.next_payment_receipt_number()
  where id = p_payment_id;
end;
$$;

revoke all on function public.confirm_rent_payment(uuid) from public;
grant execute on function public.confirm_rent_payment(uuid) to authenticated;

create or replace function public.void_rent_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_property_id uuid;
  v_status text;
begin
  select property_id, status into v_property_id, v_status
  from public.payments where id = p_payment_id for update;
  if v_property_id is null or not public.owns_property(v_property_id) then
    raise exception 'You do not have access to this payment';
  end if;
  if v_status = 'void' then
    raise exception 'This payment is already void';
  end if;
  update public.payments set status = 'void' where id = p_payment_id;
end;
$$;

revoke all on function public.void_rent_payment(uuid) from public;
grant execute on function public.void_rent_payment(uuid) to authenticated;

-- Make newly created RPC functions available to the REST API immediately.
notify pgrst, 'reload schema';
