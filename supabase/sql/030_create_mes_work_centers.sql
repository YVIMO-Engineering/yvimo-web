create table if not exists public.mes_work_centers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade default auth.uid(),
  code text not null,
  name text not null,
  type text not null,
  plant text not null default '',
  area text not null default '',
  address text not null,
  latitude double precision not null,
  longitude double precision not null,
  status text not null default 'idle' check (status in ('running', 'idle', 'setup', 'down', 'maintenance', 'offline')),
  description text not null default '',
  current_job text,
  current_operator text not null default 'Unassigned',
  current_step text not null default 'Ready for assignment',
  queue_count integer not null default 0 check (queue_count >= 0),
  wip_count integer not null default 0 check (wip_count >= 0),
  utilization integer not null default 0 check (utilization >= 0 and utilization <= 100),
  last_event text not null default 'Just now',
  active_downtime boolean not null default false,
  downtime_today_minutes integer not null default 0 check (downtime_today_minutes >= 0),
  next_available text not null default 'Available now',
  capacity_mode text not null default 'Cycle time',
  default_cycle_time text not null default 'Not configured',
  unit_of_measure text not null default 'Unit',
  queue_capacity integer not null default 0 check (queue_capacity >= 0),
  wip_capacity integer not null default 0 check (wip_capacity >= 0),
  requires_operator boolean not null default true,
  bottleneck_candidate boolean not null default false,
  maintenance_status text not null default 'Healthy',
  maintenance_interval text not null default 'Not configured',
  last_maintenance_date date not null default current_date,
  next_maintenance_date date not null default current_date,
  maintenance_notes text not null default 'No maintenance notes yet.',
  capabilities text[] not null default '{}',
  queue jsonb not null default '[]'::jsonb,
  events jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, code)
);

create table if not exists public.mes_work_center_stations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade default auth.uid(),
  work_center_id uuid not null references public.mes_work_centers(id) on delete cascade,
  code text not null,
  name text not null,
  type text not null,
  image_url text,
  capability_color text,
  status text not null default 'idle' check (status in ('running', 'idle', 'setup', 'down', 'maintenance', 'offline')),
  current_job text,
  operator text not null default 'Unassigned',
  process_step text not null default 'Ready for assignment',
  queue_count integer not null default 0 check (queue_count >= 0),
  wip_count integer not null default 0 check (wip_count >= 0),
  utilization integer not null default 0 check (utilization >= 0 and utilization <= 100),
  due_risk text not null default 'low' check (due_risk in ('low', 'medium', 'high')),
  maintenance_status text not null default 'Healthy',
  capabilities text[] not null default '{}',
  last_event text not null default 'No recent activity',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, work_center_id, code)
);

alter table public.mes_work_centers enable row level security;
alter table public.mes_work_center_stations enable row level security;

grant select, insert, update, delete on public.mes_work_centers to authenticated;
grant select, insert, update, delete on public.mes_work_center_stations to authenticated;

create policy "Users can read their own MES work centers"
  on public.mes_work_centers
  for select
  using (auth.uid() = user_id);

create policy "Users can create their own MES work centers"
  on public.mes_work_centers
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own MES work centers"
  on public.mes_work_centers
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own MES work centers"
  on public.mes_work_centers
  for delete
  using (auth.uid() = user_id);

create policy "Users can read their own MES work center stations"
  on public.mes_work_center_stations
  for select
  using (auth.uid() = user_id);

create policy "Users can create their own MES work center stations"
  on public.mes_work_center_stations
  for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.mes_work_centers work_center
      where work_center.id = work_center_id
        and work_center.user_id = auth.uid()
    )
  );

create policy "Users can update their own MES work center stations"
  on public.mes_work_center_stations
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own MES work center stations"
  on public.mes_work_center_stations
  for delete
  using (auth.uid() = user_id);

create index if not exists mes_work_centers_user_code_idx
  on public.mes_work_centers (user_id, code);

create index if not exists mes_work_center_stations_work_center_idx
  on public.mes_work_center_stations (work_center_id);

create or replace function public.set_mes_work_centers_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_mes_work_centers_updated_at on public.mes_work_centers;
create trigger set_mes_work_centers_updated_at
before update on public.mes_work_centers
for each row
execute function public.set_mes_work_centers_updated_at();

drop trigger if exists set_mes_work_center_stations_updated_at on public.mes_work_center_stations;
create trigger set_mes_work_center_stations_updated_at
before update on public.mes_work_center_stations
for each row
execute function public.set_mes_work_centers_updated_at();
