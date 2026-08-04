alter table public.mes_quotations
  add column if not exists measurement_unit text not null default 'mm';

alter table public.mes_quotations
  drop constraint if exists mes_quotations_measurement_unit_check;

alter table public.mes_quotations
  add constraint mes_quotations_measurement_unit_check
  check (measurement_unit in ('in', 'mm'));
