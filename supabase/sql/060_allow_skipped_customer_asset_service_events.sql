alter table public.mes_customer_asset_service_events
  drop constraint if exists mes_customer_asset_service_events_result_check;

alter table public.mes_customer_asset_service_events
  add constraint mes_customer_asset_service_events_result_check
  check (result in ('completed', 'ok', 'approach', 'nok', 'scrap', 'skipped'));
