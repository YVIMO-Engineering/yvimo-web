create table if not exists public.mes_production_schedule_queue (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  station_id uuid not null references public.mes_work_center_stations(id) on delete cascade,
  production_order_id uuid not null references public.mes_production_orders(id) on delete cascade,
  position integer not null check (position > 0),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (station_id, production_order_id),
  unique (station_id, position)
);

alter table public.mes_production_schedule_queue enable row level security;
grant select, insert, update, delete on public.mes_production_schedule_queue to authenticated;
drop policy if exists "Members manage production schedule queue" on public.mes_production_schedule_queue;
create policy "Members manage production schedule queue" on public.mes_production_schedule_queue for all
  using (public.is_manufacturing_organization_member(organization_id))
  with check (public.is_manufacturing_organization_member(organization_id));
create index if not exists mes_production_schedule_queue_org_station_idx on public.mes_production_schedule_queue (organization_id, station_id, position);
drop trigger if exists set_mes_production_schedule_queue_updated_at on public.mes_production_schedule_queue;
create trigger set_mes_production_schedule_queue_updated_at before update on public.mes_production_schedule_queue for each row execute function public.set_updated_at();
