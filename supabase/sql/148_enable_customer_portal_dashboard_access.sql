create or replace function public.customer_portal_has_permission(
  p_organization_id uuid,
  p_customer_id uuid,
  p_permission text,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.customer_portal_accesses access
    where access.organization_id = p_organization_id
      and access.customer_id = p_customer_id
      and access.user_id = p_user_id
      and access.status = 'active'
      and coalesce((access.permissions ->> p_permission)::boolean, false)
  );
$$;

drop policy if exists "Portal users can read assigned production orders" on public.mes_production_orders;
create policy "Portal users can read assigned production orders"
on public.mes_production_orders for select
using (
  customer_id is not null
  and public.customer_portal_has_permission(organization_id, customer_id, 'orders')
);

drop policy if exists "Portal users can read assigned customer assets" on public.mes_customer_assets;
create policy "Portal users can read assigned customer assets"
on public.mes_customer_assets for select
using (public.customer_portal_has_permission(organization_id, customer_id, 'tools'));

drop policy if exists "Portal users can read assigned reception vouchers" on public.mes_customer_reception_vouchers;
create policy "Portal users can read assigned reception vouchers"
on public.mes_customer_reception_vouchers for select
using (
  customer_id is not null
  and public.customer_portal_has_permission(organization_id, customer_id, 'orders')
);

drop policy if exists "Portal users can read assigned reception items" on public.mes_customer_reception_items;
create policy "Portal users can read assigned reception items"
on public.mes_customer_reception_items for select
using (public.customer_portal_has_permission(organization_id, customer_id, 'orders'));

drop policy if exists "Portal users can read shared quality documents" on public.mes_quality_inspection_documents;
create policy "Portal users can read shared quality documents"
on public.mes_quality_inspection_documents for select
using (
  public.customer_portal_has_permission(
    organization_id,
    (select production_order.customer_id from public.mes_production_orders production_order where production_order.id = production_order_id),
    'documents'
  )
);

grant execute on function public.customer_portal_has_permission(uuid, uuid, text, uuid) to authenticated;
