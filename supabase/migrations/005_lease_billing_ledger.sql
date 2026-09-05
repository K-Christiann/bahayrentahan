-- Lease-aware billing ledger for BahayRentahan.
-- Run after 004_property_timezone.sql.

alter table public.properties
drop constraint if exists properties_rent_due_day_check;

alter table public.properties
add constraint properties_rent_due_day_check check (rent_due_day between 1 and 31);

-- Repair the legacy zero-rent condition that could make a valid payment appear
-- to exceed a remaining balance of 0.00 after a bedspace rent was edited.
update public.occupancies o
set monthly_rent = b.monthly_rent,
    updated_at = now()
from public.bedspaces b
where b.id = o.bedspace_id
  and o.monthly_rent <= 0
  and b.monthly_rent > 0;

create table if not exists public.lease_terms (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  boarder_id uuid not null references public.boarders(id) on delete restrict,
  occupancy_id uuid not null references public.occupancies(id) on delete restrict,
  monthly_rent numeric(12,2) not null check (monthly_rent > 0),
  rent_due_day smallint not null check (rent_due_day between 1 and 31),
  grace_period_days smallint not null default 0 check (grace_period_days between 0 and 31),
  security_deposit_amount numeric(12,2) not null default 0 check (security_deposit_amount >= 0),
  advance_rent_amount numeric(12,2) not null default 0 check (advance_rent_amount >= 0),
  rent_control_covered boolean not null default true,
  effective_from date not null,
  effective_to date,
  status text not null default 'active' check (status in ('active', 'ended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (occupancy_id),
  check (effective_to is null or effective_to >= effective_from),
  check (not rent_control_covered or advance_rent_amount <= monthly_rent),
  check (not rent_control_covered or security_deposit_amount <= monthly_rent * 2)
);

create unique index if not exists one_active_lease_per_boarder
on public.lease_terms(boarder_id)
where status = 'active';

create index if not exists lease_terms_property_id_idx on public.lease_terms(property_id);
create index if not exists lease_terms_boarder_id_idx on public.lease_terms(boarder_id);

create table if not exists public.billing_charges (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  lease_id uuid not null references public.lease_terms(id) on delete restrict,
  boarder_id uuid not null references public.boarders(id) on delete restrict,
  occupancy_id uuid not null references public.occupancies(id) on delete restrict,
  charge_type text not null check (charge_type in ('rent', 'advance_rent', 'security_deposit', 'other')),
  description text not null,
  period_start date,
  due_date date not null,
  amount numeric(12,2) not null check (amount > 0),
  paid_amount numeric(12,2) not null default 0 check (paid_amount >= 0 and paid_amount <= amount),
  status text not null default 'open' check (status in ('open', 'partial', 'paid', 'void')),
  source text not null default 'generated' check (source in ('generated', 'opening', 'migration', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (charge_type in ('rent', 'advance_rent') and period_start is not null and period_start = date_trunc('month', period_start)::date)
    or (charge_type in ('security_deposit', 'other'))
  )
);

create unique index if not exists one_rent_charge_per_boarder_period
on public.billing_charges(property_id, boarder_id, period_start)
where charge_type in ('rent', 'advance_rent') and status <> 'void';

create unique index if not exists one_deposit_charge_per_lease
on public.billing_charges(lease_id)
where charge_type = 'security_deposit' and status <> 'void';

create index if not exists billing_charges_property_id_idx on public.billing_charges(property_id);
create index if not exists billing_charges_boarder_id_idx on public.billing_charges(boarder_id);
create index if not exists billing_charges_due_date_idx on public.billing_charges(due_date);

create table if not exists public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete restrict,
  charge_id uuid not null references public.billing_charges(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (payment_id, charge_id)
);

create index if not exists payment_allocations_payment_id_idx on public.payment_allocations(payment_id);
create index if not exists payment_allocations_charge_id_idx on public.payment_allocations(charge_id);

alter table public.lease_terms enable row level security;
alter table public.billing_charges enable row level security;
alter table public.payment_allocations enable row level security;

-- Occupancy changes now need to travel through the lease-aware assignment,
-- transfer, move-out, and archive functions. Keep direct browser access read-only.
drop policy if exists "Owner manages occupancies" on public.occupancies;
drop policy if exists "Owner reads occupancies" on public.occupancies;
create policy "Owner reads occupancies" on public.occupancies
for select to authenticated using (
  exists (
    select 1
    from public.bedspaces bed
    join public.rooms room on room.id = bed.room_id
    join public.boarders boarder on boarder.id = occupancies.boarder_id
    where bed.id = occupancies.bedspace_id
      and boarder.property_id = room.property_id
      and public.owns_property(room.property_id)
  )
);

drop policy if exists "Owner reads lease terms" on public.lease_terms;
create policy "Owner reads lease terms" on public.lease_terms
for select to authenticated using (public.owns_property(property_id));

drop policy if exists "Owner reads billing charges" on public.billing_charges;
create policy "Owner reads billing charges" on public.billing_charges
for select to authenticated using (public.owns_property(property_id));

drop policy if exists "Owner reads payment allocations" on public.payment_allocations;
create policy "Owner reads payment allocations" on public.payment_allocations
for select to authenticated using (
  exists (
    select 1 from public.billing_charges charge
    where charge.id = payment_allocations.charge_id
      and public.owns_property(charge.property_id)
  )
);

create or replace function public.billing_due_date(p_period_start date, p_due_day smallint)
returns date
language sql
immutable
strict
set search_path = public
as $$
  select make_date(
    extract(year from p_period_start)::integer,
    extract(month from p_period_start)::integer,
    least(
      p_due_day::integer,
      extract(day from (date_trunc('month', p_period_start) + interval '1 month - 1 day'))::integer
    )
  );
$$;

revoke all on function public.billing_due_date(date, smallint) from public, authenticated;

create or replace function public.refresh_billing_charge(p_charge_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount numeric(12,2);
  v_paid numeric(12,2);
  v_status text;
begin
  select amount, status into v_amount, v_status
  from public.billing_charges where id = p_charge_id for update;

  if v_amount is null or v_status = 'void' then return; end if;

  select coalesce(sum(allocation.amount), 0)
  into v_paid
  from public.payment_allocations allocation
  join public.payments payment on payment.id = allocation.payment_id
  where allocation.charge_id = p_charge_id
    and payment.status = 'paid';

  if v_paid > v_amount then
    raise exception 'Paid allocations exceed this charge';
  end if;

  update public.billing_charges
  set paid_amount = v_paid,
      status = case when v_paid >= v_amount then 'paid' when v_paid > 0 then 'partial' else 'open' end,
      updated_at = now()
  where id = p_charge_id;
end;
$$;

revoke all on function public.refresh_billing_charge(uuid) from public, authenticated;

create or replace function public.generate_monthly_charges(p_property_id uuid, p_period_start date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer := 0;
  v_period_end date;
begin
  if not public.owns_property(p_property_id) then
    raise exception 'You do not have access to this property';
  end if;
  if p_period_start is null or p_period_start <> date_trunc('month', p_period_start)::date then
    raise exception 'Billing period must start on the first day of a month';
  end if;

  v_period_end := (p_period_start + interval '1 month - 1 day')::date;

  insert into public.billing_charges (
    property_id, lease_id, boarder_id, occupancy_id, charge_type,
    description, period_start, due_date, amount, source
  )
  select lease.property_id, lease.id, lease.boarder_id, lease.occupancy_id, 'rent',
    to_char(p_period_start, 'FMMonth YYYY') || ' rent', p_period_start,
    greatest(public.billing_due_date(p_period_start, lease.rent_due_day), lease.effective_from),
    lease.monthly_rent, 'generated'
  from public.lease_terms lease
  join public.boarders boarder on boarder.id = lease.boarder_id and boarder.status = 'active'
  where lease.property_id = p_property_id
    and lease.effective_from <= v_period_end
    and (lease.effective_to is null or lease.effective_to >= p_period_start)
  on conflict do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke all on function public.generate_monthly_charges(uuid, date) from public;
grant execute on function public.generate_monthly_charges(uuid, date) to authenticated;

create or replace function public.assign_boarder_with_lease(
  p_bedspace_id uuid,
  p_boarder_id uuid,
  p_monthly_rent numeric,
  p_start_date date,
  p_rent_due_day smallint,
  p_grace_period_days smallint,
  p_security_deposit_amount numeric,
  p_advance_rent_amount numeric,
  p_rent_control_covered boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_property_id uuid;
  v_boarder_property_id uuid;
  v_occupancy_id uuid;
  v_lease_id uuid;
  v_period_start date;
begin
  select room.property_id into v_property_id
  from public.bedspaces bed
  join public.rooms room on room.id = bed.room_id
  where bed.id = p_bedspace_id and bed.archived_at is null and room.archived_at is null;

  select property_id into v_boarder_property_id
  from public.boarders where id = p_boarder_id and status = 'active';

  if v_property_id is null or not public.owns_property(v_property_id) then
    raise exception 'You do not have access to this bedspace';
  end if;
  if v_boarder_property_id is distinct from v_property_id then
    raise exception 'The boarder and bedspace must belong to the same property';
  end if;
  if exists (select 1 from public.occupancies where bedspace_id = p_bedspace_id and status = 'active') then
    raise exception 'The selected bedspace is already occupied';
  end if;
  if exists (select 1 from public.occupancies where boarder_id = p_boarder_id and status = 'active') then
    raise exception 'Transfer this boarder instead of creating another active assignment';
  end if;
  if p_monthly_rent is null or p_monthly_rent <= 0 then
    raise exception 'Set a monthly rent greater than zero before assigning this boarder';
  end if;
  if p_start_date is null or p_start_date > current_date then
    raise exception 'Move-in date cannot be in the future';
  end if;
  if p_rent_due_day is null or p_rent_due_day not between 1 and 31 then
    raise exception 'Choose a rent due day between 1 and 31';
  end if;
  if p_grace_period_days is null or p_grace_period_days not between 0 and 31 then
    raise exception 'Grace period must be between 0 and 31 days';
  end if;
  if coalesce(p_security_deposit_amount, 0) < 0 or coalesce(p_advance_rent_amount, 0) < 0 then
    raise exception 'Advance rent and security deposit cannot be negative';
  end if;
  if coalesce(p_advance_rent_amount, 0) > 0 and p_advance_rent_amount <> p_monthly_rent then
    raise exception 'Advance rent must be either zero or one full month';
  end if;
  if coalesce(p_rent_control_covered, true) and coalesce(p_advance_rent_amount, 0) > p_monthly_rent then
    raise exception 'For a covered rental, advance rent cannot exceed one month';
  end if;
  if coalesce(p_rent_control_covered, true) and coalesce(p_security_deposit_amount, 0) > p_monthly_rent * 2 then
    raise exception 'For a covered rental, security deposit cannot exceed two months';
  end if;

  insert into public.occupancies (bedspace_id, boarder_id, start_date, monthly_rent)
  values (p_bedspace_id, p_boarder_id, p_start_date, p_monthly_rent)
  returning id into v_occupancy_id;

  insert into public.lease_terms (
    property_id, boarder_id, occupancy_id, monthly_rent, rent_due_day,
    grace_period_days, security_deposit_amount, advance_rent_amount,
    rent_control_covered, effective_from
  ) values (
    v_property_id, p_boarder_id, v_occupancy_id, p_monthly_rent, p_rent_due_day,
    p_grace_period_days, coalesce(p_security_deposit_amount, 0),
    coalesce(p_advance_rent_amount, 0), coalesce(p_rent_control_covered, true), p_start_date
  ) returning id into v_lease_id;

  v_period_start := date_trunc('month', p_start_date)::date;

  if coalesce(p_security_deposit_amount, 0) > 0 then
    insert into public.billing_charges (
      property_id, lease_id, boarder_id, occupancy_id, charge_type,
      description, due_date, amount, source
    ) values (
      v_property_id, v_lease_id, p_boarder_id, v_occupancy_id, 'security_deposit',
      'Security deposit', p_start_date, p_security_deposit_amount, 'opening'
    );
  end if;

  insert into public.billing_charges (
    property_id, lease_id, boarder_id, occupancy_id, charge_type,
    description, period_start, due_date, amount, source
  ) values (
    v_property_id, v_lease_id, p_boarder_id, v_occupancy_id,
    case when coalesce(p_advance_rent_amount, 0) > 0 then 'advance_rent' else 'rent' end,
    case when coalesce(p_advance_rent_amount, 0) > 0
      then 'Advance rent for ' || to_char(v_period_start, 'FMMonth YYYY')
      else to_char(v_period_start, 'FMMonth YYYY') || ' rent' end,
    v_period_start,
    case when coalesce(p_advance_rent_amount, 0) > 0
      then p_start_date
      else greatest(public.billing_due_date(v_period_start, p_rent_due_day), p_start_date) end,
    case when coalesce(p_advance_rent_amount, 0) > 0 then p_advance_rent_amount else p_monthly_rent end,
    'opening'
  );

  update public.bedspaces
  set status = 'occupied', monthly_rent = p_monthly_rent, updated_at = now()
  where id = p_bedspace_id;

  return v_occupancy_id;
end;
$$;

revoke all on function public.assign_boarder_with_lease(uuid, uuid, numeric, date, smallint, smallint, numeric, numeric, boolean) from public;
grant execute on function public.assign_boarder_with_lease(uuid, uuid, numeric, date, smallint, smallint, numeric, numeric, boolean) to authenticated;

create or replace function public.create_manual_charge(
  p_property_id uuid,
  p_boarder_id uuid,
  p_description text,
  p_due_date date,
  p_amount numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lease public.lease_terms%rowtype;
  v_charge_id uuid;
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

  select * into v_lease
  from public.lease_terms
  where property_id = p_property_id and boarder_id = p_boarder_id and status = 'active'
  limit 1;

  if v_lease.id is null then
    raise exception 'Assign this boarder to a bedspace before adding a charge';
  end if;
  if nullif(trim(p_description), '') is null or length(trim(p_description)) > 120 then
    raise exception 'Charge description must contain between 1 and 120 characters';
  end if;
  if p_due_date is null then raise exception 'Choose a due date'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Charge amount must be greater than zero'; end if;

  insert into public.billing_charges (
    property_id, lease_id, boarder_id, occupancy_id, charge_type,
    description, due_date, amount, source
  ) values (
    p_property_id, v_lease.id, p_boarder_id, v_lease.occupancy_id, 'other',
    trim(p_description), p_due_date, p_amount, 'manual'
  ) returning id into v_charge_id;

  return v_charge_id;
end;
$$;

revoke all on function public.create_manual_charge(uuid, uuid, text, date, numeric) from public;
grant execute on function public.create_manual_charge(uuid, uuid, text, date, numeric) to authenticated;

create or replace function public.record_billing_payment(
  p_property_id uuid,
  p_boarder_id uuid,
  p_amount numeric,
  p_method text,
  p_status text,
  p_reference_number text,
  p_allocations jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_id uuid;
  v_allocation jsonb;
  v_charge_id uuid;
  v_allocation_amount numeric(12,2);
  v_allocation_total numeric(12,2);
  v_charge_amount numeric(12,2);
  v_reserved numeric(12,2);
  v_charge_property_id uuid;
  v_charge_boarder_id uuid;
  v_period_start date;
  v_occupancy_id uuid;
begin
  if not public.owns_property(p_property_id) then
    raise exception 'You do not have access to this property';
  end if;
  if not exists (
    select 1 from public.boarders
    where id = p_boarder_id and property_id = p_property_id
  ) then
    raise exception 'Select a boarder from this property';
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
  if p_allocations is null or jsonb_typeof(p_allocations) <> 'array' or jsonb_array_length(p_allocations) = 0 then
    raise exception 'Select at least one charge for this payment';
  end if;
  if (
    select count(*) <> count(distinct value ->> 'charge_id')
    from jsonb_array_elements(p_allocations)
  ) then
    raise exception 'A charge cannot be selected more than once';
  end if;

  select coalesce(sum((value ->> 'amount')::numeric), 0)
  into v_allocation_total
  from jsonb_array_elements(p_allocations);

  if abs(v_allocation_total - p_amount) > 0.005 then
    raise exception 'Payment amount must equal the allocated total';
  end if;

  for v_allocation in select value from jsonb_array_elements(p_allocations)
  loop
    v_charge_id := (v_allocation ->> 'charge_id')::uuid;
    v_allocation_amount := (v_allocation ->> 'amount')::numeric;

    select property_id, boarder_id, amount
    into v_charge_property_id, v_charge_boarder_id, v_charge_amount
    from public.billing_charges
    where id = v_charge_id and status <> 'void'
    for update;

    if v_charge_property_id is null or v_charge_property_id <> p_property_id or v_charge_boarder_id <> p_boarder_id then
      raise exception 'Every allocation must belong to the selected boarder and property';
    end if;
    if v_allocation_amount is null or v_allocation_amount <= 0 then
      raise exception 'Every allocation amount must be greater than zero';
    end if;

    select coalesce(sum(allocation.amount), 0)
    into v_reserved
    from public.payment_allocations allocation
    join public.payments payment on payment.id = allocation.payment_id
    where allocation.charge_id = v_charge_id
      and payment.status in ('paid', 'pending');

    if v_reserved + v_allocation_amount > v_charge_amount then
      raise exception 'Allocation exceeds the remaining charge balance of %',
        to_char(greatest(v_charge_amount - v_reserved, 0), 'FM999999990.00');
    end if;
  end loop;

  select min(coalesce(charge.period_start, date_trunc('month', charge.due_date)::date)),
         (array_agg(charge.occupancy_id order by charge.due_date))[1]
  into v_period_start, v_occupancy_id
  from public.billing_charges charge
  where charge.id in (
    select (value ->> 'charge_id')::uuid from jsonb_array_elements(p_allocations)
  );

  insert into public.payments (
    property_id, boarder_id, occupancy_id, amount, method, period_start,
    paid_at, status, reference_number, receipt_number
  ) values (
    p_property_id, p_boarder_id, v_occupancy_id, p_amount, p_method, v_period_start,
    case when p_status = 'paid' then now() else null end,
    p_status, nullif(trim(p_reference_number), ''),
    case when p_status = 'paid' then public.next_payment_receipt_number() else null end
  ) returning id into v_payment_id;

  for v_allocation in select value from jsonb_array_elements(p_allocations)
  loop
    v_charge_id := (v_allocation ->> 'charge_id')::uuid;
    v_allocation_amount := (v_allocation ->> 'amount')::numeric;
    insert into public.payment_allocations(payment_id, charge_id, amount)
    values (v_payment_id, v_charge_id, v_allocation_amount);
    if p_status = 'paid' then perform public.refresh_billing_charge(v_charge_id); end if;
  end loop;

  return v_payment_id;
end;
$$;

revoke all on function public.record_billing_payment(uuid, uuid, numeric, text, text, text, jsonb) from public;
grant execute on function public.record_billing_payment(uuid, uuid, numeric, text, text, text, jsonb) to authenticated;

-- The period-only RPC cannot express allocations and would create orphaned
-- payment records after this migration, so authenticated clients may no longer call it.
revoke all on function public.record_rent_payment(uuid, uuid, numeric, text, date, text, text) from public, authenticated;

create or replace function public.confirm_rent_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_property_id uuid;
  v_status text;
  v_item record;
  v_paid_elsewhere numeric(12,2);
begin
  select property_id, status into v_property_id, v_status
  from public.payments where id = p_payment_id for update;

  if v_property_id is null or not public.owns_property(v_property_id) then
    raise exception 'You do not have access to this payment';
  end if;
  if v_status <> 'pending' then
    raise exception 'Only pending payments can be confirmed';
  end if;
  if not exists (select 1 from public.payment_allocations where payment_id = p_payment_id) then
    raise exception 'This pending payment has no billing allocation';
  end if;

  for v_item in
    select allocation.charge_id, allocation.amount as allocated_amount, charge.amount as charge_amount
    from public.payment_allocations allocation
    join public.billing_charges charge on charge.id = allocation.charge_id
    where allocation.payment_id = p_payment_id and charge.status <> 'void'
    for update of charge
  loop
    select coalesce(sum(other_allocation.amount), 0)
    into v_paid_elsewhere
    from public.payment_allocations other_allocation
    join public.payments other_payment on other_payment.id = other_allocation.payment_id
    where other_allocation.charge_id = v_item.charge_id
      and other_payment.status = 'paid'
      and other_payment.id <> p_payment_id;

    if v_paid_elsewhere + v_item.allocated_amount > v_item.charge_amount then
      raise exception 'Payment exceeds the remaining charge balance of %',
        to_char(greatest(v_item.charge_amount - v_paid_elsewhere, 0), 'FM999999990.00');
    end if;
  end loop;

  update public.payments
  set status = 'paid', paid_at = now(), receipt_number = public.next_payment_receipt_number()
  where id = p_payment_id;

  for v_item in select charge_id from public.payment_allocations where payment_id = p_payment_id
  loop
    perform public.refresh_billing_charge(v_item.charge_id);
  end loop;
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
  v_charge_id uuid;
begin
  select property_id, status into v_property_id, v_status
  from public.payments where id = p_payment_id for update;

  if v_property_id is null or not public.owns_property(v_property_id) then
    raise exception 'You do not have access to this payment';
  end if;
  if v_status = 'void' then raise exception 'This payment is already void'; end if;

  update public.payments set status = 'void' where id = p_payment_id;

  for v_charge_id in select charge_id from public.payment_allocations where payment_id = p_payment_id
  loop
    perform public.refresh_billing_charge(v_charge_id);
  end loop;
end;
$$;

revoke all on function public.void_rent_payment(uuid) from public;
grant execute on function public.void_rent_payment(uuid) to authenticated;

-- Existing occupancies become lease-term versions. Zero monetary values that
-- cannot be repaired are normalized to 1.00 so the record remains visible and
-- can be corrected by the owner rather than breaking the billing ledger.
insert into public.lease_terms (
  property_id, boarder_id, occupancy_id, monthly_rent, rent_due_day,
  effective_from, effective_to, status
)
select boarder.property_id, occupancy.boarder_id, occupancy.id,
  greatest(occupancy.monthly_rent, bed.monthly_rent, 1), property.rent_due_day,
  occupancy.start_date, occupancy.end_date,
  case when occupancy.status = 'active' then 'active' else 'ended' end
from public.occupancies occupancy
join public.boarders boarder on boarder.id = occupancy.boarder_id
join public.properties property on property.id = boarder.property_id
join public.bedspaces bed on bed.id = occupancy.bedspace_id
on conflict (occupancy_id) do nothing;

-- Create one rent charge for every historical payment period before assigning
-- those payment records to the new ledger.
insert into public.billing_charges (
  property_id, lease_id, boarder_id, occupancy_id, charge_type,
  description, period_start, due_date, amount, source
)
select payment.property_id, lease.id, payment.boarder_id, lease.occupancy_id, 'rent',
  to_char(payment.period_start, 'FMMonth YYYY') || ' rent', payment.period_start,
  greatest(public.billing_due_date(payment.period_start, lease.rent_due_day), lease.effective_from),
  greatest(
    lease.monthly_rent,
    coalesce((
      select sum(month_payment.amount)
      from public.payments month_payment
      where month_payment.property_id = payment.property_id
        and month_payment.boarder_id = payment.boarder_id
        and month_payment.period_start = payment.period_start
        and month_payment.status = 'paid'
    ), 0),
    1
  ),
  'migration'
from public.payments payment
join public.lease_terms lease on lease.occupancy_id = payment.occupancy_id
where payment.period_start is not null
on conflict do nothing;

insert into public.payment_allocations(payment_id, charge_id, amount)
select payment.id, charge.id, payment.amount
from public.payments payment
join public.billing_charges charge
  on charge.property_id = payment.property_id
 and charge.boarder_id = payment.boarder_id
 and charge.period_start = payment.period_start
 and charge.charge_type in ('rent', 'advance_rent')
 and charge.status <> 'void'
where not exists (
  select 1 from public.payment_allocations allocation
  where allocation.payment_id = payment.id and allocation.charge_id = charge.id
)
on conflict do nothing;

do $$
declare v_charge_id uuid;
begin
  for v_charge_id in select id from public.billing_charges
  loop
    perform public.refresh_billing_charge(v_charge_id);
  end loop;
end;
$$;

insert into public.billing_charges (
  property_id, lease_id, boarder_id, occupancy_id, charge_type,
  description, period_start, due_date, amount, source
)
select lease.property_id, lease.id, lease.boarder_id, lease.occupancy_id, 'rent',
  to_char(date_trunc('month', current_date)::date, 'FMMonth YYYY') || ' rent',
  date_trunc('month', current_date)::date,
  greatest(
    public.billing_due_date(date_trunc('month', current_date)::date, lease.rent_due_day),
    lease.effective_from
  ),
  lease.monthly_rent, 'migration'
from public.lease_terms lease
join public.boarders boarder on boarder.id = lease.boarder_id and boarder.status = 'active'
where lease.effective_from <= (date_trunc('month', current_date) + interval '1 month - 1 day')::date
  and (lease.effective_to is null or lease.effective_to >= date_trunc('month', current_date)::date)
on conflict do nothing;

-- Keep lease versions aligned with future transfers and move-outs.
create or replace function public.transfer_boarder(p_boarder_id uuid, p_target_bedspace_id uuid, p_monthly_rent numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_property_id uuid;
  v_target_property_id uuid;
  v_old_bedspace_id uuid;
  v_new_occupancy_id uuid;
  v_old_lease public.lease_terms%rowtype;
begin
  select property_id into v_property_id from public.boarders where id = p_boarder_id and status = 'active';
  select room.property_id into v_target_property_id
  from public.bedspaces bed join public.rooms room on room.id = bed.room_id
  where bed.id = p_target_bedspace_id and bed.archived_at is null and room.archived_at is null;

  if v_property_id is null or v_target_property_id is distinct from v_property_id or not public.owns_property(v_property_id) then
    raise exception 'The boarder and bedspace must belong to your active property';
  end if;
  if p_monthly_rent is null or p_monthly_rent <= 0 then
    raise exception 'Set a monthly rent greater than zero before transferring this boarder';
  end if;
  if exists (select 1 from public.occupancies where bedspace_id = p_target_bedspace_id and status = 'active') then
    raise exception 'The selected bedspace is already occupied';
  end if;

  select bedspace_id into v_old_bedspace_id
  from public.occupancies where boarder_id = p_boarder_id and status = 'active' limit 1;
  select * into v_old_lease
  from public.lease_terms where boarder_id = p_boarder_id and status = 'active' limit 1;

  if v_old_bedspace_id is null then
    raise exception 'Assign this boarder from a vacant bedspace so lease terms and opening charges are created together';
  end if;

  update public.occupancies set status = 'ended', end_date = current_date, updated_at = now()
  where boarder_id = p_boarder_id and status = 'active';
  update public.bedspaces set status = 'vacant', updated_at = now() where id = v_old_bedspace_id;
  if v_old_lease.id is not null then
    update public.lease_terms set status = 'ended', effective_to = current_date, updated_at = now()
    where id = v_old_lease.id;
  end if;

  insert into public.occupancies(bedspace_id, boarder_id, start_date, monthly_rent)
  values (p_target_bedspace_id, p_boarder_id, current_date, p_monthly_rent)
  returning id into v_new_occupancy_id;

  insert into public.lease_terms (
    property_id, boarder_id, occupancy_id, monthly_rent, rent_due_day,
    grace_period_days, security_deposit_amount, advance_rent_amount,
    rent_control_covered, effective_from
  ) values (
    v_property_id, p_boarder_id, v_new_occupancy_id, p_monthly_rent,
    coalesce(v_old_lease.rent_due_day, 5), coalesce(v_old_lease.grace_period_days, 0),
    coalesce(v_old_lease.security_deposit_amount, 0), 0,
    coalesce(v_old_lease.rent_control_covered, true), current_date
  );

  update public.bedspaces set status = 'occupied', monthly_rent = p_monthly_rent, updated_at = now()
  where id = p_target_bedspace_id;
  perform public.generate_monthly_charges(v_property_id, date_trunc('month', current_date)::date);
  return v_new_occupancy_id;
end;
$$;

revoke all on function public.transfer_boarder(uuid, uuid, numeric) from public;
grant execute on function public.transfer_boarder(uuid, uuid, numeric) to authenticated;

create or replace function public.move_out_boarder(p_boarder_id uuid, p_end_date date default current_date)
returns void language plpgsql security definer set search_path = public as $$
declare v_property_id uuid; v_bedspace_id uuid;
begin
  select property_id into v_property_id from public.boarders where id = p_boarder_id;
  if v_property_id is null or not public.owns_property(v_property_id) then raise exception 'You do not have access to this boarder'; end if;
  select bedspace_id into v_bedspace_id from public.occupancies where boarder_id = p_boarder_id and status = 'active' limit 1;
  if v_bedspace_id is null then raise exception 'This boarder has no active bedspace assignment'; end if;
  if p_end_date is null or p_end_date > current_date then raise exception 'Move-out date cannot be in the future'; end if;

  update public.occupancies set status = 'ended', end_date = p_end_date, updated_at = now()
  where boarder_id = p_boarder_id and status = 'active';
  update public.lease_terms set status = 'ended', effective_to = p_end_date, updated_at = now()
  where boarder_id = p_boarder_id and status = 'active';
  update public.billing_charges set status = 'void', updated_at = now()
  where boarder_id = p_boarder_id
    and charge_type in ('rent', 'advance_rent')
    and period_start > date_trunc('month', p_end_date)::date
    and paid_amount = 0;
  update public.bedspaces set status = 'vacant', updated_at = now() where id = v_bedspace_id;
end;
$$;

revoke all on function public.move_out_boarder(uuid, date) from public;
grant execute on function public.move_out_boarder(uuid, date) to authenticated;

create or replace function public.archive_boarder(p_boarder_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_property_id uuid; v_bedspace_id uuid;
begin
  select property_id into v_property_id from public.boarders where id = p_boarder_id;
  if v_property_id is null or not public.owns_property(v_property_id) then raise exception 'You do not have access to this boarder'; end if;
  select bedspace_id into v_bedspace_id from public.occupancies where boarder_id = p_boarder_id and status = 'active' limit 1;
  if v_bedspace_id is not null then
    update public.occupancies set status = 'ended', end_date = current_date, updated_at = now()
    where boarder_id = p_boarder_id and status = 'active';
    update public.lease_terms set status = 'ended', effective_to = current_date, updated_at = now()
    where boarder_id = p_boarder_id and status = 'active';
    update public.billing_charges set status = 'void', updated_at = now()
    where boarder_id = p_boarder_id
      and charge_type in ('rent', 'advance_rent')
      and period_start > date_trunc('month', current_date)::date
      and paid_amount = 0;
    update public.bedspaces set status = 'vacant', updated_at = now() where id = v_bedspace_id;
  end if;
  update public.boarders set status = 'inactive', updated_at = now() where id = p_boarder_id;
end;
$$;

revoke all on function public.archive_boarder(uuid) from public;
grant execute on function public.archive_boarder(uuid) to authenticated;

notify pgrst, 'reload schema';
