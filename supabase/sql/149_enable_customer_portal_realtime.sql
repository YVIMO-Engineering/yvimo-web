do $$
declare
  v_table_name text;
  v_realtime_tables text[] := array[
    'customer_portal_accesses',
    'manufacturing_organizations',
    'mes_customers',
    'mes_production_orders',
    'mes_customer_assets',
    'mes_customer_reception_vouchers',
    'mes_customer_reception_items',
    'mes_quality_inspection_documents'
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
