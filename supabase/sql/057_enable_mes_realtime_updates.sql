do $$
declare
  v_table_name text;
  v_realtime_tables text[] := array[
    'mes_production_orders',
    'mes_work_centers',
    'mes_work_center_stations',
    'mes_customers',
    'mes_production_serials',
    'mes_quality_measurements',
    'mes_quality_inspection_documents',
    'mes_quality_serial_inspections'
  ];
begin
  foreach v_table_name in array v_realtime_tables
  loop
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
