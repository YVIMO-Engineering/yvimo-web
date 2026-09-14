-- Intelligent Scheduling.
--
-- One switch per organization. While it is on, the Production Schedule stops being a
-- board somebody has to fill by hand: every active order that belongs to a station is
-- queued automatically and every station queue is kept sorted by delivery urgency
-- (overdue first, then high risk, then the pieces held in quarantine, then moderate
-- and low risk), so a green order can never sit in front of a red one.
--
-- The setting is shared: whoever opens the schedule sees the same automation state.

create table if not exists public.mes_production_schedule_settings (
  organization_id uuid primary key references public.manufacturing_organizations(id) on delete cascade,
  intelligent_scheduling boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.mes_production_schedule_settings.intelligent_scheduling is
  'When true the Production Schedule queues pending orders on its own and keeps every station queue ordered by delivery urgency.';

alter table public.mes_production_schedule_settings enable row level security;

grant select, insert, update on public.mes_production_schedule_settings to authenticated;

drop policy if exists "Members can read production schedule settings" on public.mes_production_schedule_settings;
create policy "Members can read production schedule settings"
  on public.mes_production_schedule_settings for select
  using (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can create production schedule settings" on public.mes_production_schedule_settings;
create policy "Members can create production schedule settings"
  on public.mes_production_schedule_settings for insert
  with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can update production schedule settings" on public.mes_production_schedule_settings;
create policy "Members can update production schedule settings"
  on public.mes_production_schedule_settings for update
  using (public.is_manufacturing_organization_member(organization_id))
  with check (public.is_manufacturing_organization_member(organization_id));

drop trigger if exists set_mes_production_schedule_settings_updated_at on public.mes_production_schedule_settings;
create trigger set_mes_production_schedule_settings_updated_at
before update on public.mes_production_schedule_settings
for each row execute function public.set_updated_at();

-- The switch is shared, so turning it on or off reaches every open schedule.
alter table public.mes_production_schedule_settings replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'mes_production_schedule_settings'
  ) then
    alter publication supabase_realtime
      add table public.mes_production_schedule_settings;
  end if;
end;
$$;
