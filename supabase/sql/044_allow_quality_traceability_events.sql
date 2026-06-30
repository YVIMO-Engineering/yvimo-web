alter table public.mes_operator_terminal_events
drop constraint if exists mes_operator_terminal_events_event_type_check;

alter table public.mes_operator_terminal_events
add constraint mes_operator_terminal_events_event_type_check
check (
  event_type in (
    'job-started',
    'job-resumed',
    'job-paused',
    'downtime-started',
    'production-good',
    'production-scrap',
    'operation-completed',
    'traceability-saved',
    'quality-inspection-saved',
    'adjustment'
  )
);
