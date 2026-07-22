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
      'downtime-ended',
      'production-good',
      'production-scrap',
      'manufacturing-completed',
      'operation-completed',
      'traceability-saved',
      'quality-inspection-saved',
      'quality-inspection-skipped',
      'measurement-corrected',
      'adjustment'
    )
  );

create or replace function public.mes_operator_resume_station(
  p_organization_id uuid,
  p_work_center_code text,
  p_station_code text,
  p_comment text default null,
  p_shift text default null
)
returns void
language plpgsql
security invoker
as $$
begin
  if not public.is_manufacturing_organization_member(p_organization_id) then
    raise exception 'Organization access denied.';
  end if;

  if nullif(btrim(p_work_center_code), '') is null or nullif(btrim(p_station_code), '') is null then
    raise exception 'Work Center and Station are required.';
  end if;

  if not exists (
    select 1
    from public.mes_work_center_stations station
    join public.mes_work_centers work_center on work_center.id = station.work_center_id
    where station.organization_id = p_organization_id
      and station.code = p_station_code
      and work_center.organization_id = p_organization_id
      and work_center.code = p_work_center_code
  ) then
    raise exception 'Station not found in the selected Work Center.';
  end if;

  update public.mes_operator_terminal_downtime
  set ended_at = now()
  where organization_id = p_organization_id
    and work_center_code = p_work_center_code
    and station_code = p_station_code
    and ended_at is null;

  insert into public.mes_operator_terminal_events (
    organization_id,
    production_order_id,
    work_center_code,
    station_code,
    event_type,
    reason,
    comment,
    payload
  )
  values (
    p_organization_id,
    null,
    p_work_center_code,
    p_station_code,
    'downtime-ended',
    'Station returned to service',
    nullif(btrim(p_comment), ''),
    jsonb_build_object('shift', p_shift, 'without_order', true)
  );

  update public.mes_work_center_stations
  set current_job = null,
      status = 'idle',
      last_event = 'Station returned to service'
  where organization_id = p_organization_id
    and code = p_station_code;
end;
$$;

grant execute on function public.mes_operator_resume_station(uuid, text, text, text, text)
  to authenticated;
