alter table public.mes_customer_reception_items
  add column if not exists sent_at timestamptz,
  add column if not exists sent_by uuid references auth.users(id) on delete set null;

create index if not exists mes_customer_reception_items_sent_idx
  on public.mes_customer_reception_items (reception_voucher_id, sent_at);

-- Preserve completed voucher history when introducing item-level delivery.
update public.mes_customer_reception_items item
set sent_at = coalesce(voucher.updated_at, voucher.created_at),
    updated_at = now()
from public.mes_customer_reception_vouchers voucher
where voucher.id = item.reception_voucher_id
  and voucher.status = 'sent'
  and item.sent_at is null;

create or replace function public.mark_customer_reception_item_sent(
  p_item_id uuid,
  p_organization_id uuid
)
returns public.mes_customer_reception_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.mes_customer_reception_items;
  v_order_status text;
  v_voucher_status text;
  v_sent_at timestamptz := now();
begin
  if not public.is_manufacturing_organization_member(p_organization_id) then
    raise exception using errcode = '42501', message = 'You do not have access to this organization.';
  end if;

  select item.* into v_item
  from public.mes_customer_reception_items item
  where item.id = p_item_id
    and item.organization_id = p_organization_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Reception item was not found.';
  end if;

  if v_item.sent_at is not null then
    return v_item;
  end if;

  select voucher.status into v_voucher_status
  from public.mes_customer_reception_vouchers voucher
  where voucher.id = v_item.reception_voucher_id
    and voucher.organization_id = p_organization_id;

  if v_item.production_order_id is not null then
    select production_order.status into v_order_status
    from public.mes_production_orders production_order
    where production_order.id = v_item.production_order_id
      and production_order.organization_id = p_organization_id;
  end if;

  if coalesce(v_order_status, '') <> 'completed'
    and coalesce(v_voucher_status, '') <> 'waiting-delivery' then
    raise exception using errcode = '22023', message = 'Only completed sub-receptions can be marked as sent.';
  end if;

  update public.mes_customer_reception_items
  set sent_at = v_sent_at,
      sent_by = auth.uid(),
      updated_at = v_sent_at
  where id = v_item.id
  returning * into v_item;

  if not exists (
    select 1
    from public.mes_customer_reception_items pending_item
    where pending_item.reception_voucher_id = v_item.reception_voucher_id
      and pending_item.sent_at is null
  ) then
    update public.mes_customer_reception_vouchers
    set status = 'sent',
        updated_at = v_sent_at
    where id = v_item.reception_voucher_id
      and organization_id = p_organization_id;
  end if;

  return v_item;
end;
$$;

revoke all on function public.mark_customer_reception_item_sent(uuid, uuid) from public;
grant execute on function public.mark_customer_reception_item_sent(uuid, uuid) to authenticated;
