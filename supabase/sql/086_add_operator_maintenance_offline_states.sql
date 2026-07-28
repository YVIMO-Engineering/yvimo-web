alter table public.mes_operator_terminal_events
  drop constraint if exists mes_operator_terminal_events_event_type_check;

alter table public.mes_operator_terminal_events
  add constraint mes_operator_terminal_events_event_type_check
  check (
    event_type in (
      'job-started', 'job-resumed', 'job-paused',
      'downtime-started', 'downtime-ended',
      'production-good', 'production-scrap',
      'manufacturing-completed', 'operation-completed',
      'traceability-saved', 'quality-inspection-saved', 'quality-inspection-skipped',
      'measurement-corrected', 'adjustment',
      'inventory-received', 'inventory-consumed',
      'maintenance-started', 'maintenance-ended',
      'station-offline', 'station-online'
    )
  );

create or replace function public.mes_operator_set_station_availability(
  p_organization_id uuid,
  p_work_center_code text,
  p_station_code text,
  p_status text,
  p_reason text default null,
  p_comment text default null,
  p_shift text default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_station public.mes_work_center_stations%rowtype;
  v_previous_status text;
  v_event_type text;
  v_last_event text;
begin
  if not public.is_manufacturing_organization_member(p_organization_id) then
    raise exception 'Organization access denied.';
  end if;
  if p_status not in ('maintenance', 'offline', 'idle') then
    raise exception 'Unsupported station availability status: %', p_status;
  end if;

  select station.* into v_station
  from public.mes_work_center_stations station
  join public.mes_work_centers center on center.id = station.work_center_id
  where station.organization_id = p_organization_id
    and station.code = p_station_code
    and center.code = p_work_center_code
  for update;
  if not found then raise exception 'Station not found.'; end if;

  v_previous_status = v_station.status;
  if p_status = 'idle' and v_previous_status not in ('maintenance', 'offline') then
    raise exception 'Only Maintenance or Offline stations can be restored with this action.';
  end if;
  if p_status in ('maintenance', 'offline') and v_previous_status in ('maintenance', 'offline') then
    raise exception 'Station is already unavailable.';
  end if;

  v_event_type = case
    when p_status = 'maintenance' then 'maintenance-started'
    when p_status = 'offline' then 'station-offline'
    when v_previous_status = 'maintenance' then 'maintenance-ended'
    else 'station-online'
  end;
  v_last_event = case v_event_type
    when 'maintenance-started' then 'Maintenance in progress'
    when 'station-offline' then 'Station offline'
    when 'maintenance-ended' then 'Maintenance completed'
    else 'Station returned online'
  end;

  if p_status in ('maintenance', 'offline') then
    update public.mes_production_orders
    set status = 'paused'
    where organization_id = p_organization_id
      and assigned_work_center = p_work_center_code
      and assigned_station = p_station_code
      and status = 'running';
  end if;

  update public.mes_work_center_stations
  set status = p_status,
      last_event = v_last_event
  where id = v_station.id;

  insert into public.mes_operator_terminal_events (
    organization_id, production_order_id, work_center_code, station_code,
    event_type, quantity, reason, comment, payload
  ) values (
    p_organization_id, null, p_work_center_code, p_station_code,
    v_event_type, 0, p_reason, p_comment,
    jsonb_build_object(
      'shift', p_shift,
      'previous_station_status', v_previous_status,
      'station_status', p_status,
      'source', 'operator-terminal'
    )
  );
end;
$$;

grant execute on function public.mes_operator_set_station_availability(uuid, text, text, text, text, text, text) to authenticated;
