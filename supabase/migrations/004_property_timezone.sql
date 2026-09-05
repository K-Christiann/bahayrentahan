-- Property-local reporting time. Run after 003_payment_integrity.sql.

alter table public.properties
add column if not exists timezone text not null default 'Asia/Manila';

update public.properties
set timezone = 'Asia/Manila'
where timezone is null or trim(timezone) = '';

notify pgrst, 'reload schema';
