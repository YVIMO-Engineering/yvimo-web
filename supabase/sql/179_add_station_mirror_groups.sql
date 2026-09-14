-- Mirror machines.
--
-- Two stations are mirrors when the work of one can be produced on the other (the
-- Gemini pair, for instance): same capability, different machine. Stations that share
-- a mirror_group_id form one pool, so the Production Schedule can treat an order that
-- belongs to any of them as runnable on all of them, and Intelligent Scheduling can
-- level the load between them instead of stacking every urgent order on one machine.
--
-- The group is just a shared identifier: adding a station to a group writes the group
-- id on it, removing it writes null. A group with a single member behaves as no group.

alter table public.mes_work_center_stations
  add column if not exists mirror_group_id uuid;

comment on column public.mes_work_center_stations.mirror_group_id is
  'Stations sharing this identifier are mirror machines: interchangeable for planning and load balancing in the Production Schedule.';

create index if not exists mes_work_center_stations_mirror_group_idx
  on public.mes_work_center_stations (organization_id, mirror_group_id)
  where mirror_group_id is not null;

-- Moving a queued card to a mirror station changes its station and its position at the
-- same time, which trips the (station_id, position) unique index halfway through the
-- update. The whole rebalance is applied here, with the constraint deferred, so the
-- queue is never left in a half-moved state.
create or replace function public.reassign_mes_production_schedule_queue(
  p_organization_id uuid,
  p_assignments jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_matched integer;
  v_total integer := coalesce(jsonb_array_length(p_assignments), 0);
begin
  if v_total = 0 then
    return;
  end if;

  select count(*)
  into v_matched
  from jsonb_array_elements(p_assignments) as assignment
  join public.mes_production_schedule_queue queue_item
    on queue_item.id = (assignment ->> 'id')::uuid
   and queue_item.organization_id = p_organization_id;

  if v_matched <> v_total then
    raise exception 'Queue assignment does not match this organization';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_assignments) as assignment
    where not exists (
      select 1
      from public.mes_work_center_stations station
      where station.id = (assignment ->> 'station_id')::uuid
        and station.organization_id = p_organization_id
    )
  ) then
    raise exception 'Target station does not belong to this organization';
  end if;

  set constraints mes_production_schedule_queue_station_id_position_key deferred;

  update public.mes_production_schedule_queue queue_item
  set station_id = (assignment ->> 'station_id')::uuid,
      position = (assignment ->> 'position')::integer
  from jsonb_array_elements(p_assignments) as assignment
  where queue_item.id = (assignment ->> 'id')::uuid
    and queue_item.organization_id = p_organization_id;
end;
$$;

grant execute on function public.reassign_mes_production_schedule_queue(uuid, jsonb) to authenticated;
