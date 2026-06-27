alter table public.mes_production_orders
  add column if not exists client_name text not null default '';

update public.mes_production_orders
set client_name = ''
where client_name is null;
