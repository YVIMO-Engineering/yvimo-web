alter table public.mes_production_schedule_queue
  drop constraint if exists mes_production_schedule_queue_station_id_position_key;
alter table public.mes_production_schedule_queue
  add constraint mes_production_schedule_queue_station_id_position_key
  unique (station_id, position) deferrable initially immediate;

create or replace function public.reorder_mes_production_schedule_queue(
  p_organization_id uuid,
  p_station_id uuid,
  p_queue_item_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_expected_count integer;
begin
  select count(*) into v_expected_count
  from public.mes_production_schedule_queue
  where organization_id = p_organization_id and station_id = p_station_id;

  if cardinality(p_queue_item_ids) <> v_expected_count
    or (select count(distinct item_id) from unnest(p_queue_item_ids) as queued(item_id)) <> v_expected_count
    or exists (
      select 1 from unnest(p_queue_item_ids) as queued(item_id)
      where not exists (
        select 1 from public.mes_production_schedule_queue queue_item
        where queue_item.id = item_id
          and queue_item.organization_id = p_organization_id
          and queue_item.station_id = p_station_id
      )
    )
  then
    raise exception 'Queue order does not match the selected station';
  end if;

  set constraints mes_production_schedule_queue_station_id_position_key deferred;

  update public.mes_production_schedule_queue queue_item
  set position = ordered.position
  from unnest(p_queue_item_ids) with ordinality as ordered(id, position)
  where queue_item.id = ordered.id;
end;
$$;

grant execute on function public.reorder_mes_production_schedule_queue(uuid, uuid, uuid[]) to authenticated;
