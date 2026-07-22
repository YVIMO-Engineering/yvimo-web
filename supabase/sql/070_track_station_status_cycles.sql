create table if not exists public.mes_station_status_cycles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  work_center_id uuid not null references public.mes_work_centers(id) on delete cascade,
  station_id uuid not null references public.mes_work_center_stations(id) on delete cascade,
  work_center_code text not null,
  station_code text not null,
  status text not null check (status in ('available', 'running', 'idle', 'setup', 'down', 'maintenance', 'offline')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);

create unique index if not exists mes_station_status_cycles_active_uidx
  on public.mes_station_status_cycles (station_id) where ended_at is null;
create index if not exists mes_station_status_cycles_station_started_idx
  on public.mes_station_status_cycles (organization_id, station_id, started_at desc);

alter table public.mes_station_status_cycles enable row level security;
grant select, insert, update, delete on public.mes_station_status_cycles to authenticated;

drop policy if exists "Members can read station status cycles" on public.mes_station_status_cycles;
create policy "Members can read station status cycles" on public.mes_station_status_cycles
for select using (public.is_manufacturing_organization_member(organization_id));

create or replace function public.track_mes_station_status_cycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_work_center_code text;
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then return new; end if;

  select work_center.code into v_work_center_code
  from public.mes_work_centers work_center
  where work_center.id = new.work_center_id;

  update public.mes_station_status_cycles
  set ended_at = now()
  where station_id = new.id and ended_at is null;

  insert into public.mes_station_status_cycles (
    organization_id, work_center_id, station_id, work_center_code,
    station_code, status, started_at
  ) values (
    new.organization_id, new.work_center_id, new.id, coalesce(v_work_center_code, ''),
    new.code, new.status, now()
  );
  return new;
end;
$$;

drop trigger if exists track_mes_station_status_cycle on public.mes_work_center_stations;
create trigger track_mes_station_status_cycle
after insert or update of status on public.mes_work_center_stations
for each row execute function public.track_mes_station_status_cycle();

insert into public.mes_station_status_cycles (
  organization_id, work_center_id, station_id, work_center_code,
  station_code, status, started_at
)
select station.organization_id, station.work_center_id, station.id, work_center.code,
  station.code, station.status, coalesce(station.updated_at, now())
from public.mes_work_center_stations station
join public.mes_work_centers work_center on work_center.id = station.work_center_id
where not exists (
  select 1 from public.mes_station_status_cycles cycle
  where cycle.station_id = station.id and cycle.ended_at is null
)
on conflict do nothing;
