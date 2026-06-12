alter table public.mes_production_orders
  add column if not exists planned_shifts text[] not null default '{}';

update public.mes_production_orders
set planned_shifts = '{}'
where planned_shifts is null;
