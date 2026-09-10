-- Stream Production Schedule changes (queue cards, orders, pieces and stations) to connected clients.
do $$
declare
  v_table_name text;
  v_realtime_tables text[] := array[
    'mes_production_schedule_queue',
    'mes_production_orders',
    'mes_production_serials',
    'mes_work_center_stations'
  ];
begin
  foreach v_table_name in array v_realtime_tables
  loop
    if not exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = v_table_name
    ) then
      continue;
    end if;

    -- Required so realtime can evaluate organization_id filters and RLS on updates and deletes.
    execute format('alter table public.%I replica identity full', v_table_name);

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table_name);
    end if;
  end loop;
end;
$$;
