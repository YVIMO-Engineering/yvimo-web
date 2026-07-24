create or replace function public.reconcile_mes_station_runtime_status(
  p_organization_id uuid,
  p_work_center_code text,
  p_station_code text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_station public.mes_work_center_stations%rowtype;
  v_running_order public.mes_production_orders%rowtype;
  v_assigned_order public.mes_production_orders%rowtype;
  v_has_open_downtime boolean;
  v_next_status text;
  v_next_job text;
  v_next_event text;
begin
  if nullif(btrim(p_station_code), '') is null then return; end if;

  select station.*
    into v_station
  from public.mes_work_center_stations station
  join public.mes_work_centers work_center on work_center.id = station.work_center_id
  where station.organization_id = p_organization_id
    and station.code = p_station_code
    and work_center.code = p_work_center_code
  for update;

  if not found then return; end if;

  select exists (
    select 1
    from public.mes_operator_terminal_downtime downtime
    where downtime.organization_id = p_organization_id
      and downtime.work_center_code = p_work_center_code
      and downtime.station_code = p_station_code
      and downtime.ended_at is null
  ) into v_has_open_downtime;

  select production_order.*
    into v_running_order
  from public.mes_production_orders production_order
  where production_order.organization_id = p_organization_id
    and production_order.assigned_work_center = p_work_center_code
    and production_order.assigned_station = p_station_code
    and production_order.status = 'running'
  order by production_order.updated_at desc nulls last
  limit 1;

  select production_order.*
    into v_assigned_order
  from public.mes_production_orders production_order
  where production_order.organization_id = p_organization_id
    and production_order.assigned_work_center = p_work_center_code
    and production_order.assigned_station = p_station_code
    and production_order.status in ('paused', 'released')
  order by
    case production_order.status when 'paused' then 0 else 1 end,
    production_order.updated_at desc nulls last
  limit 1;

  if v_has_open_downtime then
    v_next_status := 'down';
    v_next_job := coalesce(v_running_order.order_number, v_assigned_order.order_number, v_station.current_job);
    v_next_event := 'Downtime reported';
  elsif v_station.status in ('setup', 'maintenance', 'offline') then
    -- Explicit machine modes take precedence until the operator closes them.
    v_next_status := v_station.status;
    v_next_job := coalesce(v_running_order.order_number, v_assigned_order.order_number, v_station.current_job);
    v_next_event := v_station.last_event;
  elsif v_running_order.id is not null then
    v_next_status := 'running';
    v_next_job := v_running_order.order_number;
    v_next_event := 'Job running';
  else
    v_next_status := 'idle';
    v_next_job := coalesce(v_assigned_order.order_number, null);
    v_next_event := case
      when v_assigned_order.status = 'paused' then 'Job paused'
      when v_assigned_order.status = 'released' then 'Order selected - awaiting operator start'
      else 'Ready'
    end;
  end if;

  update public.mes_work_center_stations
  set status = v_next_status,
      current_job = v_next_job,
      last_event = v_next_event
  where id = v_station.id
    and (
      status is distinct from v_next_status
      or current_job is distinct from v_next_job
      or last_event is distinct from v_next_event
    );
end;
$$;

revoke execute on function public.reconcile_mes_station_runtime_status(uuid, text, text)
  from public, anon, authenticated;

create or replace function public.reconcile_mes_station_from_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.reconcile_mes_station_runtime_status(
      old.organization_id,
      old.assigned_work_center,
      old.assigned_station
    );
    return old;
  end if;

  if tg_op = 'UPDATE'
    and (
      old.organization_id is distinct from new.organization_id
      or old.assigned_work_center is distinct from new.assigned_work_center
      or old.assigned_station is distinct from new.assigned_station
    ) then
    perform public.reconcile_mes_station_runtime_status(
      old.organization_id,
      old.assigned_work_center,
      old.assigned_station
    );
  end if;

  perform public.reconcile_mes_station_runtime_status(
    new.organization_id,
    new.assigned_work_center,
    new.assigned_station
  );
  return new;
end;
$$;

revoke execute on function public.reconcile_mes_station_from_order()
  from public, anon, authenticated;

drop trigger if exists reconcile_mes_station_from_order on public.mes_production_orders;
create trigger reconcile_mes_station_from_order
after insert or update of status, assigned_work_center, assigned_station or delete
on public.mes_production_orders
for each row execute function public.reconcile_mes_station_from_order();

do $$
declare
  station_record record;
begin
  for station_record in
    select
      station.organization_id,
      work_center.code as work_center_code,
      station.code as station_code
    from public.mes_work_center_stations station
    join public.mes_work_centers work_center on work_center.id = station.work_center_id
  loop
    perform public.reconcile_mes_station_runtime_status(
      station_record.organization_id,
      station_record.work_center_code,
      station_record.station_code
    );
  end loop;
end;
$$;
