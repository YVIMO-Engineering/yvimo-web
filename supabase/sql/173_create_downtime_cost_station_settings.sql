create table if not exists public.mes_downtime_cost_excluded_stations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  work_center_code text not null check (length(btrim(work_center_code)) > 0),
  station_code text not null check (length(btrim(station_code)) > 0),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (organization_id, work_center_code, station_code)
);

comment on table public.mes_downtime_cost_excluded_stations is
  'Stations whose down time must NOT be priced into the Operation Cost Tracker downtime KPI. A missing row means the station counts, so the default for every new station is "included".';
comment on column public.mes_downtime_cost_excluded_stations.work_center_code is
  'Work center code as stored on mes_station_status_cycles, so the exclusion survives station renames.';
comment on column public.mes_downtime_cost_excluded_stations.station_code is
  'Station code as stored on mes_station_status_cycles.';

create index if not exists mes_downtime_cost_excluded_stations_organization_idx
  on public.mes_downtime_cost_excluded_stations (organization_id);

alter table public.mes_downtime_cost_excluded_stations enable row level security;

drop policy if exists "Members can read downtime cost exclusions" on public.mes_downtime_cost_excluded_stations;
create policy "Members can read downtime cost exclusions" on public.mes_downtime_cost_excluded_stations
  for select using (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can create downtime cost exclusions" on public.mes_downtime_cost_excluded_stations;
create policy "Members can create downtime cost exclusions" on public.mes_downtime_cost_excluded_stations
  for insert with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can delete downtime cost exclusions" on public.mes_downtime_cost_excluded_stations;
create policy "Members can delete downtime cost exclusions" on public.mes_downtime_cost_excluded_stations
  for delete using (public.is_manufacturing_organization_member(organization_id));

grant select, insert, delete on public.mes_downtime_cost_excluded_stations to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.mes_downtime_cost_excluded_stations;
exception when duplicate_object then null;
end $$;
