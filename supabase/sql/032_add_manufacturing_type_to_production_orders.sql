alter table public.mes_production_orders
  add column if not exists manufacturing_type text not null default 'multi-step'
    check (manufacturing_type in ('multi-step', 'single-operation')),
  add column if not exists production_flow text not null default 'standard-assembly-flow',
  add column if not exists assigned_station text not null default '';

update public.mes_production_orders
set manufacturing_type = 'multi-step'
where manufacturing_type is null;
