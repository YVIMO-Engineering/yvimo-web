create table if not exists public.mes_statistics_settings (
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  work_center_code text not null,
  daily_production_target integer not null default 30 check (daily_production_target > 0),
  production_work_days smallint[] not null default array[1, 2, 3, 4, 5, 6]::smallint[],
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, work_center_code),
  constraint mes_statistics_settings_valid_work_days check (
    production_work_days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
    and cardinality(production_work_days) > 0
  )
);

create index if not exists mes_statistics_settings_work_center_idx
  on public.mes_statistics_settings (organization_id, work_center_code);

alter table public.mes_statistics_settings enable row level security;

grant select, insert, update on public.mes_statistics_settings to authenticated;

drop policy if exists "Members can read statistics settings" on public.mes_statistics_settings;
create policy "Members can read statistics settings"
  on public.mes_statistics_settings for select
  using (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can create statistics settings" on public.mes_statistics_settings;
create policy "Members can create statistics settings"
  on public.mes_statistics_settings for insert
  with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can update statistics settings" on public.mes_statistics_settings;
create policy "Members can update statistics settings"
  on public.mes_statistics_settings for update
  using (public.is_manufacturing_organization_member(organization_id))
  with check (public.is_manufacturing_organization_member(organization_id));

drop trigger if exists set_mes_statistics_settings_updated_at on public.mes_statistics_settings;
create trigger set_mes_statistics_settings_updated_at
before update on public.mes_statistics_settings
for each row execute function public.set_updated_at();

do $$
begin
  alter publication supabase_realtime add table public.mes_statistics_settings;
exception when duplicate_object then null;
end $$;
