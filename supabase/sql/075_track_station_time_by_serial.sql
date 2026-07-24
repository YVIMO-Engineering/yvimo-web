create or replace function public.sync_mes_station_cycle_serial_context()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.mes_production_orders%rowtype;
  v_active_cycle public.mes_station_status_cycles%rowtype;
  v_next_serial_number text;
begin
  if new.result is null then return new; end if;

  select * into v_order
  from public.mes_production_orders
  where id = new.production_order_id;

  if not found then return new; end if;

  select cycle.*
    into v_active_cycle
  from public.mes_station_status_cycles cycle
  where cycle.organization_id = new.organization_id
    and cycle.station_code = v_order.assigned_station
    and cycle.status = 'running'
    and cycle.ended_at is null
  for update;

  if not found then return new; end if;

  update public.mes_station_status_cycles
  set production_order_id = v_order.id,
      order_number = v_order.order_number,
      serial_number = new.serial_number,
      client_name = v_order.client_name,
      ended_at = now()
  where id = v_active_cycle.id;

  select serial.serial_number
    into v_next_serial_number
  from public.mes_production_serials serial
  where serial.production_order_id = v_order.id
    and serial.id <> new.id
    and serial.result is null
  order by serial.piece_sequence
  limit 1;

  insert into public.mes_station_status_cycles (
    organization_id,
    work_center_id,
    station_id,
    work_center_code,
    station_code,
    status,
    production_order_id,
    order_number,
    serial_number,
    client_name,
    started_at
  ) values (
    v_active_cycle.organization_id,
    v_active_cycle.work_center_id,
    v_active_cycle.station_id,
    v_active_cycle.work_center_code,
    v_active_cycle.station_code,
    'running',
    v_order.id,
    v_order.order_number,
    v_next_serial_number,
    v_order.client_name,
    now()
  );

  return new;
end;
$$;
