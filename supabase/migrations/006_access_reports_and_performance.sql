-- Account activation, reporting indexes, and access enforcement for BahayRentahan.
-- Run after 005_lease_billing_ledger.sql.

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.account_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'active', 'expired', 'suspended')),
  plan text not null default 'Full access',
  activated_at timestamptz,
  expires_at timestamptz,
  amount_paid numeric(12,2) check (amount_paid is null or amount_paid >= 0),
  payment_method text check (payment_method in ('Cash', 'GCash', 'Bank transfer', 'Complimentary')),
  payment_reference text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or activated_at is null or expires_at > activated_at)
);

alter table public.account_access add column if not exists amount_paid numeric(12,2);

create table if not exists public.account_access_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  changed_by uuid not null references auth.users(id) on delete restrict,
  previous_status text check (previous_status is null or previous_status in ('pending', 'active', 'expired', 'suspended')),
  new_status text not null check (new_status in ('pending', 'active', 'expired', 'suspended')),
  expires_at timestamptz,
  amount_paid numeric(12,2) check (amount_paid is null or amount_paid >= 0),
  payment_method text check (payment_method in ('Cash', 'GCash', 'Bank transfer', 'Complimentary')),
  payment_reference text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists account_access_status_idx on public.account_access(status, expires_at);
create index if not exists account_access_events_user_created_idx on public.account_access_events(user_id, created_at desc);
create index if not exists payments_property_paid_at_idx on public.payments(property_id, paid_at desc);
create index if not exists billing_charges_property_period_status_idx on public.billing_charges(property_id, period_start, status);
create index if not exists lease_terms_property_status_idx on public.lease_terms(property_id, status);
create index if not exists occupancies_boarder_status_idx on public.occupancies(boarder_id, status);

alter table public.app_admins enable row level security;
alter table public.account_access enable row level security;
alter table public.account_access_events enable row level security;

revoke all on table public.app_admins, public.account_access, public.account_access_events from anon, authenticated;
grant select on table public.app_admins, public.account_access to authenticated;

create or replace function public.is_app_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_admins administrator
    where administrator.user_id = p_user_id
  );
$$;

create or replace function public.has_active_access(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_app_admin(p_user_id) or exists (
    select 1
    from public.account_access access_record
    where access_record.user_id = p_user_id
      and access_record.status = 'active'
      and (access_record.expires_at is null or access_record.expires_at > now())
  );
$$;

revoke all on function public.is_app_admin(uuid) from public;
revoke all on function public.has_active_access(uuid) from public;
grant execute on function public.is_app_admin(uuid) to authenticated;
grant execute on function public.has_active_access(uuid) to authenticated;

-- Preserve access for accounts that existed before this migration.
insert into public.account_access(user_id, status, plan, activated_at)
select profile.id, 'active', 'Full access', coalesce(profile.created_at, now())
from public.profiles profile
on conflict (user_id) do nothing;

drop policy if exists "User reads own access" on public.account_access;
create policy "User reads own access" on public.account_access
for select to authenticated
using (user_id = auth.uid());

drop policy if exists "Administrator reads own role" on public.app_admins;
create policy "Administrator reads own role" on public.app_admins
for select to authenticated
using (user_id = auth.uid());

create or replace function public.owns_property(p_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_active_access(auth.uid()) and exists (
    select 1 from public.properties property_record
    where property_record.id = p_property_id
      and property_record.owner_id = auth.uid()
  );
$$;

revoke all on function public.owns_property(uuid) from public;
grant execute on function public.owns_property(uuid) to authenticated;

drop policy if exists "Owner manages properties" on public.properties;
drop policy if exists "Active owner manages properties" on public.properties;
create policy "Active owner manages properties" on public.properties
for all to authenticated
using (owner_id = auth.uid() and public.has_active_access(auth.uid()))
with check (owner_id = auth.uid() and public.has_active_access(auth.uid()));

create or replace function public.get_my_access()
returns table (
  user_id uuid,
  access_status text,
  plan text,
  activated_at timestamptz,
  expires_at timestamptz,
  is_admin boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid(),
    case
      when public.is_app_admin(auth.uid()) then 'active'
      when access_record.status = 'active' and access_record.expires_at is not null and access_record.expires_at <= now() then 'expired'
      else coalesce(access_record.status, 'pending')
    end,
    coalesce(access_record.plan, 'Full access'),
    access_record.activated_at,
    access_record.expires_at,
    public.is_app_admin(auth.uid())
  from (select 1) seed
  left join public.account_access access_record on access_record.user_id = auth.uid();
$$;

revoke all on function public.get_my_access() from public;
grant execute on function public.get_my_access() to authenticated;

create or replace function public.admin_list_accounts()
returns table (
  user_id uuid,
  email text,
  full_name text,
  property_name text,
  access_status text,
  plan text,
  activated_at timestamptz,
  expires_at timestamptz,
  payment_method text,
  amount_paid numeric,
  payment_reference text,
  notes text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_app_admin(auth.uid()) then
    raise exception 'Administrator access is required';
  end if;

  return query
  select
    profile.id,
    profile.email,
    profile.full_name,
    coalesce(properties.property_names, 'No property'),
    case
      when access_record.status = 'active' and access_record.expires_at is not null and access_record.expires_at <= now() then 'expired'
      else coalesce(access_record.status, 'pending')
    end,
    coalesce(access_record.plan, 'Full access'),
    access_record.activated_at,
    access_record.expires_at,
    access_record.payment_method,
    access_record.amount_paid,
    access_record.payment_reference,
    access_record.notes,
    profile.created_at
  from public.profiles profile
  left join public.account_access access_record on access_record.user_id = profile.id
  left join lateral (
    select string_agg(property_record.name, ', ' order by property_record.created_at) as property_names
    from public.properties property_record
    where property_record.owner_id = profile.id
  ) properties on true
  where not public.is_app_admin(profile.id)
  order by profile.created_at desc;
end;
$$;

revoke all on function public.admin_list_accounts() from public;
grant execute on function public.admin_list_accounts() to authenticated;

create or replace function public.admin_set_account_access(
  p_user_id uuid,
  p_status text,
  p_expires_at timestamptz default null,
  p_amount_paid numeric default null,
  p_payment_method text default null,
  p_payment_reference text default null,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous_status text;
begin
  if not public.is_app_admin(auth.uid()) then
    raise exception 'Administrator access is required';
  end if;
  if public.is_app_admin(p_user_id) then
    raise exception 'Administrator access cannot be changed here';
  end if;
  if p_status not in ('pending', 'active', 'expired', 'suspended') then
    raise exception 'Invalid account status';
  end if;
  if p_payment_method is not null and p_payment_method not in ('Cash', 'GCash', 'Bank transfer', 'Complimentary') then
    raise exception 'Invalid activation payment method';
  end if;
  if p_amount_paid is not null and p_amount_paid < 0 then
    raise exception 'Activation payment cannot be negative';
  end if;
  if p_status = 'active' and p_expires_at is not null and p_expires_at <= now() then
    raise exception 'An active account must expire in the future';
  end if;
  if not exists (select 1 from public.profiles profile where profile.id = p_user_id) then
    raise exception 'Account was not found';
  end if;

  select access_record.status into v_previous_status
  from public.account_access access_record
  where access_record.user_id = p_user_id;

  insert into public.account_access (
    user_id, status, plan, activated_at, expires_at,
    amount_paid, payment_method, payment_reference, notes, updated_at
  ) values (
    p_user_id, p_status, 'Full access',
    case when p_status = 'active' then now() else null end,
    p_expires_at, p_amount_paid, p_payment_method, nullif(trim(p_payment_reference), ''), nullif(trim(p_notes), ''), now()
  )
  on conflict (user_id) do update
  set status = excluded.status,
      plan = 'Full access',
      activated_at = case
        when excluded.status = 'active' then coalesce(public.account_access.activated_at, now())
        else public.account_access.activated_at
      end,
      expires_at = excluded.expires_at,
      amount_paid = excluded.amount_paid,
      payment_method = excluded.payment_method,
      payment_reference = excluded.payment_reference,
      notes = excluded.notes,
      updated_at = now();

  insert into public.account_access_events (
    user_id, changed_by, previous_status, new_status, expires_at,
    amount_paid, payment_method, payment_reference, notes
  ) values (
    p_user_id, auth.uid(), v_previous_status, p_status, p_expires_at,
    p_amount_paid, p_payment_method, nullif(trim(p_payment_reference), ''), nullif(trim(p_notes), '')
  );
end;
$$;

revoke all on function public.admin_set_account_access(uuid, text, timestamptz, numeric, text, text, text) from public;
grant execute on function public.admin_set_account_access(uuid, text, timestamptz, numeric, text, text, text) to authenticated;

create or replace function public.admin_list_access_events(p_user_id uuid)
returns table (
  id uuid,
  previous_status text,
  new_status text,
  expires_at timestamptz,
  amount_paid numeric,
  payment_method text,
  payment_reference text,
  notes text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_app_admin(auth.uid()) then
    raise exception 'Administrator access is required';
  end if;

  return query
  select event.id, event.previous_status, event.new_status, event.expires_at,
    event.amount_paid, event.payment_method, event.payment_reference, event.notes, event.created_at
  from public.account_access_events event
  where event.user_id = p_user_id
  order by event.created_at desc
  limit 20;
end;
$$;

revoke all on function public.admin_list_access_events(uuid) from public;
grant execute on function public.admin_list_access_events(uuid) to authenticated;

-- New signups receive a property shell but cannot access operational records
-- until an administrator activates the account.
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

  insert into public.account_access(user_id, status, plan)
  values (new.id, 'pending', 'Full access')
  on conflict (user_id) do nothing;

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
