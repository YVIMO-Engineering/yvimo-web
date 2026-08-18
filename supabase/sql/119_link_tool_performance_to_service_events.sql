alter table public.mes_tool_performance_runs
  add column if not exists service_event_id uuid
  references public.mes_customer_asset_service_events(id) on delete cascade;

create unique index if not exists mes_tool_performance_runs_service_event_uidx
  on public.mes_tool_performance_runs (service_event_id)
  where service_event_id is not null;
