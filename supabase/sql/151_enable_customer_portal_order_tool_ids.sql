grant select on public.mes_production_serials to authenticated;

drop policy if exists "Portal users can read assigned production serials"
  on public.mes_production_serials;
create policy "Portal users can read assigned production serials"
on public.mes_production_serials for select
using (
  exists (
    select 1
    from public.mes_production_orders production_order
    where production_order.id = mes_production_serials.production_order_id
      and production_order.customer_id is not null
      and public.customer_portal_has_permission(
        production_order.organization_id,
        production_order.customer_id,
        'orders'
      )
  )
);

alter table public.mes_production_serials replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'mes_production_serials'
  ) then
    alter publication supabase_realtime add table public.mes_production_serials;
  end if;
end;
$$;
