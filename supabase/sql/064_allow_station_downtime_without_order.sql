create or replace function public.mes_operator_report_station_downtime(
  p_organization_id uuid,
  p_work_center_code text,
  p_station_code text,
  p_reason text default null,
  p_comment text default null,
  p_shift text default null
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_downtime_id uuid;
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
    'downtime-started',
    coalesce(nullif(btrim(p_reason), ''), 'Downtime reported'),
    nullif(btrim(p_comment), ''),
    jsonb_build_object('shift', p_shift, 'without_order', true)
  );

  insert into public.mes_operator_terminal_downtime (
    organization_id,
    production_order_id,
    work_center_code,
    station_code,
    reason,
    comment
  )
  values (
    p_organization_id,
    null,
    p_work_center_code,
    p_station_code,
    coalesce(nullif(btrim(p_reason), ''), 'Downtime reported'),
    nullif(btrim(p_comment), '')
  )
  returning id into v_downtime_id;

  update public.mes_work_center_stations
  set current_job = null,
      status = 'down',
      last_event = 'Downtime reported'
  where organization_id = p_organization_id
    and code = p_station_code;

  return v_downtime_id;
end;
$$;

grant execute on function public.mes_operator_report_station_downtime(uuid, text, text, text, text, text)
  to authenticated;
