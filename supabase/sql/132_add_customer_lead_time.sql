alter table public.mes_customers
  add column if not exists lead_time_days integer not null default 15;

alter table public.mes_customers
  drop constraint if exists mes_customers_lead_time_days_check,
  add constraint mes_customers_lead_time_days_check
  check (lead_time_days between 0 and 3650);

comment on column public.mes_customers.lead_time_days is
  'Base delivery lead time agreed with the customer, interpreted using the organization day count mode.';
