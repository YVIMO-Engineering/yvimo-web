create or replace function public.enrich_mes_station_cycle_job_context()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.mes_production_orders%rowtype;
  v_current_job text;
begin
  if new.production_order_id is not null and nullif(btrim(coalesce(new.serial_number, '')), '') is not null then
    return new;
  end if;

  select station.current_job
    into v_current_job
  from public.mes_work_center_stations station
  where station.id = new.station_id;

  select production_order.*
    into v_order
  from public.mes_production_orders production_order
  where production_order.organization_id = new.organization_id
    and (
      production_order.id = new.production_order_id
      or production_order.order_number = new.order_number
      or production_order.order_number = v_current_job
    )
  order by
    case when production_order.id = new.production_order_id then 0
         when production_order.order_number = v_current_job then 1
         else 2 end,
    production_order.updated_at desc nulls last
  limit 1;

  if v_order.id is null then
    return new;
  end if;

  new.production_order_id := v_order.id;
  new.order_number := v_order.order_number;
  new.client_name := v_order.client_name;

  if nullif(btrim(coalesce(new.serial_number, '')), '') is null then
    select serial.serial_number
      into new.serial_number
    from public.mes_production_serials serial
    where serial.organization_id = new.organization_id
      and serial.production_order_id = v_order.id
      and serial.result is null
    order by serial.piece_sequence
    limit 1;
  end if;

  update public.mes_production_orders
  set assigned_station = new.station_code
  where id = v_order.id
    and assigned_station is distinct from new.station_code;

  return new;
end;
$$;

drop trigger if exists enrich_mes_station_cycle_job_context on public.mes_station_status_cycles;
create trigger enrich_mes_station_cycle_job_context
before insert on public.mes_station_status_cycles
for each row execute function public.enrich_mes_station_cycle_job_context();

update public.mes_production_orders production_order
set assigned_station = station.code
from public.mes_work_center_stations station
where station.organization_id = production_order.organization_id
  and station.current_job = production_order.order_number
  and production_order.status in ('running', 'paused')
  and production_order.assigned_station is distinct from station.code;

with active_context as (
  select
    cycle.id,
    production_order.id as production_order_id,
    production_order.order_number,
    production_order.client_name,
    (
      select serial.serial_number
      from public.mes_production_serials serial
      where serial.organization_id = cycle.organization_id
        and serial.production_order_id = production_order.id
        and serial.result is null
      order by serial.piece_sequence
      limit 1
    ) as serial_number
  from public.mes_station_status_cycles cycle
  join public.mes_work_center_stations station
    on station.id = cycle.station_id
   and station.organization_id = cycle.organization_id
  join public.mes_production_orders production_order
    on production_order.organization_id = cycle.organization_id
   and production_order.order_number = station.current_job
  where cycle.ended_at is null
)
update public.mes_station_status_cycles cycle
set production_order_id = active_context.production_order_id,
    order_number = active_context.order_number,
    client_name = active_context.client_name,
    serial_number = coalesce(nullif(cycle.serial_number, ''), active_context.serial_number)
from active_context
where cycle.id = active_context.id;
