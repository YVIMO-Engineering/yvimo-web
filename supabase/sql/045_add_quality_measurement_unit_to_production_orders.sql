alter table public.mes_production_orders
  add column if not exists quality_measurement_unit text not null default 'microns';

alter table public.mes_production_orders
  drop constraint if exists mes_production_orders_quality_measurement_unit_check;

alter table public.mes_production_orders
  add constraint mes_production_orders_quality_measurement_unit_check
  check (quality_measurement_unit in ('microns', 'tenths'));