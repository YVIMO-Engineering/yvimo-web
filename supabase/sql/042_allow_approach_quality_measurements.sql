alter table public.mes_quality_measurements
  drop constraint if exists mes_quality_measurements_result_check;

alter table public.mes_quality_measurements
  add constraint mes_quality_measurements_result_check
  check (result in ('ok', 'approach', 'nok'));