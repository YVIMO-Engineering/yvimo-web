drop index if exists public.mes_tool_performance_runs_service_event_uidx;

create unique index if not exists mes_tool_performance_runs_service_event_uidx
  on public.mes_tool_performance_runs (service_event_id);
