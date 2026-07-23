create or replace function public.keep_station_down_while_downtime_is_open()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'down' and exists (
    select 1
    from public.mes_operator_terminal_downtime downtime
    join public.mes_work_centers work_center
      on work_center.organization_id = downtime.organization_id
     and work_center.code = downtime.work_center_code
    where downtime.organization_id = new.organization_id
      and downtime.station_code = new.code
      and work_center.id = new.work_center_id
      and downtime.ended_at is null
  ) then
    new.status := 'down';
    new.last_event := 'Downtime reported';
  end if;
  return new;
end;
$$;

drop trigger if exists keep_station_down_while_downtime_is_open on public.mes_work_center_stations;
create trigger keep_station_down_while_downtime_is_open
before update of status on public.mes_work_center_stations
for each row execute function public.keep_station_down_while_downtime_is_open();

create or replace function public.mes_operator_switch_active_order(
  p_order_id uuid,
  p_organization_id uuid,
  p_station_code text,
  p_comment text default null,
  p_shift text default null
)
returns public.mes_production_orders
language plpgsql
security invoker
as $$
declare
  v_order public.mes_production_orders%rowtype;
  v_station_code text;
begin
  if not public.is_manufacturing_organization_member(p_organization_id) then
    raise exception 'Organization access denied.';
  end if;

  select *
    into v_order
  from public.mes_production_orders
  where id = p_order_id
    and organization_id = p_organization_id
    and manufacturing_type = 'single-operation'
    and status in ('released', 'running', 'paused')
  for update;

  if not found then
    raise exception 'Production order not found.';
  end if;

  v_station_code = coalesce(nullif(p_station_code, ''), v_order.assigned_station);

  update public.mes_production_orders
  set status = 'paused'
  where organization_id = p_organization_id
    and manufacturing_type = 'single-operation'
    and assigned_work_center = v_order.assigned_work_center
    and assigned_station = v_station_code
    and status = 'running';

  update public.mes_production_orders
  set status = 'paused'
  where id = v_order.id
  returning * into v_order;

  insert into public.mes_operator_terminal_events (
    organization_id,
    production_order_id,
    work_center_code,
    station_code,
    event_type,
    comment,
    payload
  )
  values (
    p_organization_id,
    v_order.id,
    v_order.assigned_work_center,
    v_station_code,
    'job-paused',
    p_comment,
    jsonb_build_object(
      'action', 'active-order-selected',
      'awaiting_operator_start', true,
      'shift', p_shift
    )
  );

  update public.mes_work_center_stations
  set current_job = v_order.order_number,
      status = 'idle',
      last_event = 'Order selected - awaiting operator start'
  where organization_id = p_organization_id
    and code = v_station_code;

  return v_order;
end;
$$;

grant execute on function public.mes_operator_switch_active_order(uuid, uuid, text, text, text)
  to authenticated;
