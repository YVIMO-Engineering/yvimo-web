alter table public.mes_work_center_stations
  add column if not exists schedule_position integer;

with ranked as (
  select id, row_number() over (partition by organization_id order by name, code, id)::integer as position
  from public.mes_work_center_stations
  where schedule_position is null
)
update public.mes_work_center_stations station
set schedule_position = ranked.position
from ranked
where station.id = ranked.id;

alter table public.mes_work_center_stations
  drop constraint if exists mes_work_center_stations_organization_schedule_position_key;
alter table public.mes_work_center_stations
  add constraint mes_work_center_stations_organization_schedule_position_key
  unique (organization_id, schedule_position) deferrable initially immediate;

create or replace function public.reorder_mes_production_schedule_stations(
  p_organization_id uuid,
  p_station_ids uuid[]
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
  from public.mes_work_center_stations
  where organization_id = p_organization_id;

  if cardinality(p_station_ids) <> v_expected_count
    or (select count(distinct station_id) from unnest(p_station_ids) as requested(station_id)) <> v_expected_count
    or exists (
      select 1 from unnest(p_station_ids) as requested(station_id)
      where not exists (
        select 1 from public.mes_work_center_stations station
        where station.id = requested.station_id and station.organization_id = p_organization_id
      )
    )
  then
    raise exception 'Station order does not match the organization';
  end if;

  set constraints mes_work_center_stations_organization_schedule_position_key deferred;

  update public.mes_work_center_stations station
  set schedule_position = requested.position
  from unnest(p_station_ids) with ordinality as requested(id, position)
  where station.id = requested.id;
end;
$$;

grant execute on function public.reorder_mes_production_schedule_stations(uuid, uuid[]) to authenticated;
