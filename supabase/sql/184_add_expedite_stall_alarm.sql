-- The stall alarm for Expedite Orders: how long an urgent order may sit with no movement
-- at all (no status change, no produced or scrapped piece, no coating or delivery step)
-- before the production alarm slider raises it in Statistics and Production Schedule.
-- Counted with the organization day count mode, so a weekend never trips the alarm.
alter table public.mes_expedite_tool_ids
  add column if not exists stall_alert_hours integer not null default 12;

alter table public.mes_expedite_tool_ids
  drop constraint if exists mes_expedite_tool_ids_stall_alert_hours_check,
  add constraint mes_expedite_tool_ids_stall_alert_hours_check
  check (stall_alert_hours between 0 and 720);

comment on column public.mes_expedite_tool_ids.stall_alert_hours is
  'Hours without any movement on an order carrying this Tool ID before the expedite stall alarm fires. Zero disables the stall alarm for this Tool ID.';
