create or replace function public.reconcile_single_operation_schedule_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.manufacturing_type = 'single-operation'
    and (
      old.assigned_station is distinct from new.assigned_station
      or old.assigned_work_center is distinct from new.assigned_work_center
      or old.manufacturing_type is distinct from new.manufacturing_type
    )
  then
    delete from public.mes_production_schedule_queue queue_item
    using public.mes_work_center_stations station
    left join public.mes_work_centers center on center.id = station.work_center_id
    where queue_item.production_order_id = new.id
      and queue_item.organization_id = new.organization_id
      and station.id = queue_item.station_id
      and (
        case
          when nullif(btrim(coalesce(new.assigned_station, '')), '') is not null
            then not (station.code = any(regexp_split_to_array(btrim(new.assigned_station), '\s*,\s*')))
          when nullif(btrim(coalesce(new.assigned_work_center, '')), '') is not null
            then center.code is distinct from new.assigned_work_center
          else false
        end
      );
  end if;
  return new;
end;
$$;

drop trigger if exists reconcile_single_operation_schedule_assignment on public.mes_production_orders;
create trigger reconcile_single_operation_schedule_assignment
after update of assigned_station, assigned_work_center, manufacturing_type
on public.mes_production_orders
for each row execute function public.reconcile_single_operation_schedule_assignment();

-- Repair incompatible queue entries that existed before this trigger.
delete from public.mes_production_schedule_queue queue_item
using public.mes_production_orders production_order,
      public.mes_work_center_stations station
left join public.mes_work_centers center on center.id = station.work_center_id
where production_order.id = queue_item.production_order_id
  and station.id = queue_item.station_id
  and production_order.manufacturing_type = 'single-operation'
  and (
    case
      when nullif(btrim(coalesce(production_order.assigned_station, '')), '') is not null
        then not (station.code = any(regexp_split_to_array(btrim(production_order.assigned_station), '\s*,\s*')))
      when nullif(btrim(coalesce(production_order.assigned_work_center, '')), '') is not null
        then center.code is distinct from production_order.assigned_work_center
      else false
    end
  );
