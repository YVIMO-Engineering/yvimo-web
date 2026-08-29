grant select on public.mes_customer_reception_serial_progress to authenticated;

drop policy if exists "Portal users can read assigned reception serial progress"
  on public.mes_customer_reception_serial_progress;
create policy "Portal users can read assigned reception serial progress"
on public.mes_customer_reception_serial_progress for select
using (
  exists (
    select 1
    from public.mes_customer_reception_items item
    where item.id = reception_item_id
      and public.customer_portal_has_permission(item.organization_id, item.customer_id, 'orders')
  )
);

alter table public.mes_customer_reception_serial_progress replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'mes_customer_reception_serial_progress'
  ) then
    alter publication supabase_realtime
      add table public.mes_customer_reception_serial_progress;
  end if;
end;
$$;
