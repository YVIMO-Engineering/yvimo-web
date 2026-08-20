alter table public.health_patients replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'health_patients'
  ) then
    alter publication supabase_realtime add table public.health_patients;
  end if;
end;
$$;
