alter table public.mes_station_status_cycles
  add column if not exists production_order_id uuid references public.mes_production_orders(id) on delete set null,
  add column if not exists order_number text,
  add column if not exists serial_number text,
  add column if not exists client_name text;

create index if not exists mes_station_status_cycles_order_idx
  on public.mes_station_status_cycles (organization_id, production_order_id, started_at desc);

create or replace function public.track_mes_station_status_cycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_work_center_code text;
  v_order public.mes_production_orders%rowtype;
  v_serial_number text;
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then return new; end if;

  select work_center.code into v_work_center_code
  from public.mes_work_centers work_center
  where work_center.id = new.work_center_id;

  select production_order.*
    into v_order
  from public.mes_production_orders production_order
  where production_order.organization_id = new.organization_id
    and production_order.assigned_work_center = v_work_center_code
    and production_order.assigned_station = new.code
    and (
      production_order.order_number = new.current_job
      or production_order.status = 'running'
    )
  order by
    case when production_order.order_number = new.current_job then 0 else 1 end,
    production_order.updated_at desc nulls last
  limit 1;

  if v_order.id is not null then
    select serial.serial_number
      into v_serial_number
    from public.mes_production_serials serial
    where serial.production_order_id = v_order.id
      and serial.result is null
    order by serial.piece_sequence
    limit 1;
  end if;

  update public.mes_station_status_cycles
  set ended_at = now()
  where station_id = new.id and ended_at is null;

  insert into public.mes_station_status_cycles (
    organization_id, work_center_id, station_id, work_center_code,
    station_code, status, production_order_id, order_number,
    serial_number, client_name, started_at
  ) values (
    new.organization_id, new.work_center_id, new.id, coalesce(v_work_center_code, ''),
    new.code, new.status, v_order.id, v_order.order_number,
    v_serial_number, v_order.client_name, now()
  );
  return new;
end;
$$;

create or replace function public.sync_mes_station_cycle_serial_context()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.mes_production_orders%rowtype;
begin
  if new.result is null then return new; end if;

  select * into v_order
  from public.mes_production_orders
  where id = new.production_order_id;

  update public.mes_station_status_cycles cycle
  set production_order_id = v_order.id,
      order_number = v_order.order_number,
      serial_number = new.serial_number,
      client_name = v_order.client_name
  where cycle.organization_id = new.organization_id
    and cycle.station_code = v_order.assigned_station
    and cycle.status = 'running'
    and cycle.ended_at is null;

  return new;
end;
$$;

drop trigger if exists sync_mes_station_cycle_serial_context on public.mes_production_serials;
create trigger sync_mes_station_cycle_serial_context
after insert or update of result, serial_number on public.mes_production_serials
for each row execute function public.sync_mes_station_cycle_serial_context();

with matched_cycles as (
  select distinct on (cycle.id)
    cycle.id as cycle_id,
    terminal_event.production_order_id,
    terminal_event.payload,
    production_order.order_number,
    production_order.client_name
  from public.mes_station_status_cycles cycle
  join public.mes_operator_terminal_events terminal_event
    on terminal_event.organization_id = cycle.organization_id
   and terminal_event.station_code = cycle.station_code
   and terminal_event.production_order_id is not null
   and terminal_event.created_at >= cycle.started_at
   and terminal_event.created_at <= coalesce(cycle.ended_at, now())
  join public.mes_production_orders production_order
    on production_order.id = terminal_event.production_order_id
  where cycle.production_order_id is null
  order by cycle.id, terminal_event.created_at desc
)
update public.mes_station_status_cycles cycle
set production_order_id = matched.production_order_id,
    order_number = matched.order_number,
    serial_number = nullif(matched.payload ->> 'serial_number', ''),
    client_name = matched.client_name
from matched_cycles matched
where cycle.id = matched.cycle_id;
