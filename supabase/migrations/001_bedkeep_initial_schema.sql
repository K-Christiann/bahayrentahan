-- BahayRentahan free-tier schema
-- Run this once in Supabase Dashboard -> SQL Editor for a new project.

create extension if not exists pgcrypto;

do $$ begin
  create type public.bedspace_status as enum ('vacant', 'occupied', 'maintenance');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.boarder_status as enum ('active', 'inactive');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.occupancy_status as enum ('active', 'ended');
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text not null default 'Owner',
  phone text,
  location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  city text not null default '',
  address text not null default '',
  contact_phone text not null default '',
  currency text not null default 'PHP' check (currency = 'PHP'),
  rent_due_day smallint not null default 5 check (rent_due_day between 1 and 28),
  preferred_payment_method text not null default 'GCash' check (preferred_payment_method in ('GCash', 'Cash', 'Bank transfer')),
  gcash_number text not null default '',
  receipt_footer text not null default 'Thank you for paying on time.',
  notification_preferences jsonb not null default '{"overdue":true,"moveOut":true,"maintenance":true,"weeklyReport":false}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists properties_owner_id_idx on public.properties(owner_id);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  name text not null,
  floor text not null default '',
  description text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(property_id, name)
);

create index if not exists rooms_property_id_idx on public.rooms(property_id);

create table if not exists public.bedspaces (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  label text not null,
  monthly_rent numeric(12,2) not null default 0 check (monthly_rent >= 0),
  status public.bedspace_status not null default 'vacant',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(room_id, label)
);

create index if not exists bedspaces_room_id_idx on public.bedspaces(room_id);

create table if not exists public.boarders (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  full_name text not null,
  phone text,
  email text,
  emergency_contact text,
  status public.boarder_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists boarders_property_id_idx on public.boarders(property_id);

create table if not exists public.occupancies (
  id uuid primary key default gen_random_uuid(),
  bedspace_id uuid not null references public.bedspaces(id) on delete restrict,
  boarder_id uuid not null references public.boarders(id) on delete restrict,
  start_date date not null default current_date,
  end_date date,
  monthly_rent numeric(12,2) not null check (monthly_rent >= 0),
  status public.occupancy_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

create unique index if not exists one_active_occupancy_per_bedspace on public.occupancies(bedspace_id) where status = 'active';
create unique index if not exists one_active_occupancy_per_boarder on public.occupancies(boarder_id) where status = 'active';

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  boarder_id uuid not null references public.boarders(id) on delete restrict,
  occupancy_id uuid references public.occupancies(id) on delete set null,
  amount numeric(12,2) not null check (amount > 0),
  method text not null check (method in ('GCash', 'Cash', 'Bank transfer')),
  period_start date not null,
  paid_at timestamptz,
  status text not null default 'paid' check (status in ('paid', 'pending', 'void')),
  reference_number text,
  created_at timestamptz not null default now()
);

create index if not exists payments_property_id_idx on public.payments(property_id);
create index if not exists payments_boarder_id_idx on public.payments(boarder_id);

create table if not exists public.maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  boarder_id uuid references public.boarders(id) on delete set null,
  title text not null,
  location text not null default '',
  priority text not null default 'normal' check (priority in ('urgent', 'normal', 'low')),
  status text not null default 'open' check (status in ('open', 'in progress', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists maintenance_property_id_idx on public.maintenance_requests(property_id);

create or replace function public.owns_property(p_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.properties
    where id = p_property_id and owner_id = auth.uid()
  );
$$;

revoke all on function public.owns_property(uuid) from public;
grant execute on function public.owns_property(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.properties enable row level security;
alter table public.rooms enable row level security;
alter table public.bedspaces enable row level security;
alter table public.boarders enable row level security;
alter table public.occupancies enable row level security;
alter table public.payments enable row level security;
alter table public.maintenance_requests enable row level security;

drop policy if exists "Owner reads profile" on public.profiles;
create policy "Owner reads profile" on public.profiles for select to authenticated using (id = auth.uid());
drop policy if exists "Owner updates profile" on public.profiles;
create policy "Owner updates profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "Owner manages properties" on public.properties;
create policy "Owner manages properties" on public.properties for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "Owner manages rooms" on public.rooms;
create policy "Owner manages rooms" on public.rooms for all to authenticated using (public.owns_property(property_id)) with check (public.owns_property(property_id));

drop policy if exists "Owner manages bedspaces" on public.bedspaces;
create policy "Owner manages bedspaces" on public.bedspaces for all to authenticated
using (exists (select 1 from public.rooms r where r.id = room_id and public.owns_property(r.property_id)))
with check (exists (select 1 from public.rooms r where r.id = room_id and public.owns_property(r.property_id)));

drop policy if exists "Owner manages boarders" on public.boarders;
create policy "Owner manages boarders" on public.boarders for all to authenticated using (public.owns_property(property_id)) with check (public.owns_property(property_id));

drop policy if exists "Owner manages occupancies" on public.occupancies;
create policy "Owner manages occupancies" on public.occupancies for all to authenticated
using (exists (
  select 1 from public.bedspaces b
  join public.rooms r on r.id = b.room_id
  join public.boarders br on br.id = boarder_id and br.property_id = r.property_id
  where b.id = bedspace_id and public.owns_property(r.property_id)
))
with check (exists (
  select 1 from public.bedspaces b
  join public.rooms r on r.id = b.room_id
  join public.boarders br on br.id = boarder_id and br.property_id = r.property_id
  where b.id = bedspace_id and public.owns_property(r.property_id)
));

drop policy if exists "Owner manages payments" on public.payments;
create policy "Owner manages payments" on public.payments for all to authenticated
using (public.owns_property(payments.property_id) and exists (select 1 from public.boarders br where br.id = payments.boarder_id and br.property_id = payments.property_id))
with check (public.owns_property(payments.property_id) and exists (select 1 from public.boarders br where br.id = payments.boarder_id and br.property_id = payments.property_id));

drop policy if exists "Owner manages maintenance" on public.maintenance_requests;
create policy "Owner manages maintenance" on public.maintenance_requests for all to authenticated
using (public.owns_property(maintenance_requests.property_id) and (maintenance_requests.boarder_id is null or exists (select 1 from public.boarders br where br.id = maintenance_requests.boarder_id and br.property_id = maintenance_requests.property_id)))
with check (public.owns_property(maintenance_requests.property_id) and (maintenance_requests.boarder_id is null or exists (select 1 from public.boarders br where br.id = maintenance_requests.boarder_id and br.property_id = maintenance_requests.property_id)));

create or replace function public.create_room_with_beds(
  p_property_id uuid,
  p_name text,
  p_floor text,
  p_bed_count integer,
  p_monthly_rent numeric
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_id uuid;
  v_index integer;
begin
  if not public.owns_property(p_property_id) then
    raise exception 'You do not have access to this property';
  end if;
  if p_bed_count < 1 or p_bed_count > 20 then
    raise exception 'A room must contain between 1 and 20 bedspaces';
  end if;
  if p_monthly_rent < 0 then
    raise exception 'Monthly rent cannot be negative';
  end if;

  insert into public.rooms(property_id, name, floor)
  values (p_property_id, trim(p_name), coalesce(trim(p_floor), ''))
  returning id into v_room_id;

  for v_index in 1..p_bed_count loop
    insert into public.bedspaces(room_id, label, monthly_rent, sort_order)
    values (v_room_id, 'Bed ' || lpad(v_index::text, 2, '0'), p_monthly_rent, v_index);
  end loop;

  return v_room_id;
end;
$$;

revoke all on function public.create_room_with_beds(uuid, text, text, integer, numeric) from public;
grant execute on function public.create_room_with_beds(uuid, text, text, integer, numeric) to authenticated;

create or replace function public.assign_boarder_to_bedspace(
  p_bedspace_id uuid,
  p_boarder_id uuid,
  p_monthly_rent numeric
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_property_id uuid;
  v_boarder_property_id uuid;
  v_occupancy_id uuid;
begin
  select r.property_id into v_property_id
  from public.bedspaces b join public.rooms r on r.id = b.room_id
  where b.id = p_bedspace_id;

  select property_id into v_boarder_property_id
  from public.boarders where id = p_boarder_id and status = 'active';

  if v_property_id is null or not public.owns_property(v_property_id) then
    raise exception 'You do not have access to this bedspace';
  end if;
  if v_boarder_property_id is distinct from v_property_id then
    raise exception 'The boarder and bedspace must belong to the same property';
  end if;

  insert into public.occupancies(bedspace_id, boarder_id, monthly_rent)
  values (p_bedspace_id, p_boarder_id, p_monthly_rent)
  returning id into v_occupancy_id;

  update public.bedspaces set status = 'occupied', updated_at = now() where id = p_bedspace_id;
  return v_occupancy_id;
end;
$$;

revoke all on function public.assign_boarder_to_bedspace(uuid, uuid, numeric) from public;
grant execute on function public.assign_boarder_to_bedspace(uuid, uuid, numeric) to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id, email, full_name)
  values (new.id, new.email, coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 'Owner'))
  on conflict (id) do nothing;

  insert into public.properties(owner_id, name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'property_name'), ''), 'My Bedspace'));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

revoke all on function public.handle_new_user() from public;
