-- The previous organization-wide table may already be part of the Realtime
-- publication. FULL identity allows the one-time cleanup before the new
-- composite primary key exists.
alter table public.mes_statistics_settings replica identity full;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'mes_statistics_settings'
      and column_name = 'work_center_code'
  ) then
    alter table public.mes_statistics_settings add column work_center_code text;
    alter table public.mes_statistics_settings drop constraint if exists mes_statistics_settings_pkey;

    insert into public.mes_statistics_settings (
      organization_id, work_center_code, daily_production_target,
      production_work_days, updated_by, created_at, updated_at
    )
    select
      setting.organization_id, center.code, setting.daily_production_target,
      setting.production_work_days, setting.updated_by, setting.created_at, setting.updated_at
    from public.mes_statistics_settings setting
    join public.mes_work_centers center
      on center.organization_id = setting.organization_id
    where setting.work_center_code is null;

    delete from public.mes_statistics_settings where work_center_code is null;
    alter table public.mes_statistics_settings alter column work_center_code set not null;
    alter table public.mes_statistics_settings add primary key (organization_id, work_center_code);
  end if;
end $$;

-- The new composite primary key now identifies Realtime update/delete rows.
alter table public.mes_statistics_settings replica identity default;

create index if not exists mes_statistics_settings_work_center_idx
  on public.mes_statistics_settings (organization_id, work_center_code);
