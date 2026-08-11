create or replace function public.recalculate_customer_reception_progress(p_item_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.mes_customer_reception_items; v_now timestamptz := now();
begin
  select * into v_item from public.mes_customer_reception_items where id = p_item_id for update;
  if not found then return; end if;

  update public.mes_customer_reception_items
  set coating_sent_at = case when exists (select 1 from public.mes_customer_reception_serial_progress p where p.reception_item_id = v_item.id)
                                  and not exists (select 1 from public.mes_customer_reception_serial_progress p where p.reception_item_id = v_item.id and p.coating_sent_at is null)
                             then coalesce(coating_sent_at, v_now) else null end,
      coating_returned_at = case when exists (select 1 from public.mes_customer_reception_serial_progress p where p.reception_item_id = v_item.id)
                                      and not exists (select 1 from public.mes_customer_reception_serial_progress p where p.reception_item_id = v_item.id and p.coating_returned_at is null)
                                 then coalesce(coating_returned_at, v_now) else null end,
      sent_at = case when exists (select 1 from public.mes_customer_reception_serial_progress p where p.reception_item_id = v_item.id)
                          and not exists (select 1 from public.mes_customer_reception_serial_progress p where p.reception_item_id = v_item.id and p.sent_at is null)
                     then coalesce(sent_at, v_now) else null end,
      updated_at = v_now
  where id = v_item.id;

  update public.mes_customer_reception_vouchers voucher
  set status = case
    when not exists (select 1 from public.mes_customer_reception_items i where i.reception_voucher_id = voucher.id and i.sent_at is null) then 'sent'
    when voucher.status = 'waiting-delivery' then 'waiting-delivery'
    when not exists (select 1 from public.mes_customer_reception_items i where i.reception_voucher_id = voucher.id and i.coating_returned_at is null) then 'waiting-delivery'
    else 'coating' end,
    updated_at = v_now
  where voucher.id = v_item.reception_voucher_id and voucher.status not in ('discrepancy');
end;
$$;

revoke all on function public.recalculate_customer_reception_progress(uuid) from public;

create or replace function public.update_customer_reception_serial_progress(
  p_item_id uuid, p_organization_id uuid, p_action text, p_production_serial_id uuid default null
)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_item public.mes_customer_reception_items;
  v_count integer;
  v_now timestamptz := now();
  v_order_status text;
  v_voucher_status text;
  v_serial_is_good boolean := false;
begin
  if not public.is_manufacturing_organization_member(p_organization_id) then
    raise exception using errcode = '42501', message = 'You do not have access to this organization.';
  end if;
  if p_action not in ('coating-sent', 'coating-returned', 'sent') then
    raise exception using errcode = '22023', message = 'Invalid serial progress action.';
  end if;

  select * into v_item from public.mes_customer_reception_items
    where id = p_item_id and organization_id = p_organization_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Reception item was not found.';
  end if;

  select status into v_order_status from public.mes_production_orders
    where id = v_item.production_order_id and organization_id = p_organization_id;
  select status into v_voucher_status from public.mes_customer_reception_vouchers
    where id = v_item.reception_voucher_id and organization_id = p_organization_id;

  if p_production_serial_id is not null then
    select exists (
      select 1 from public.mes_production_serials serial
      where serial.id = p_production_serial_id
        and serial.production_order_id = v_item.production_order_id
        and serial.organization_id = p_organization_id
        and serial.result = 'good'
    ) into v_serial_is_good;
    if not v_serial_is_good then
      raise exception using errcode = '22023', message = 'Only a completed good piece from this production order can be processed.';
    end if;
  end if;

  if p_action = 'coating-sent'
    and p_production_serial_id is null
    and coalesce(v_order_status, '') <> 'completed' then
    raise exception using errcode = '22023', message = 'The full production order must be completed before all pieces can be sent to coating.';
  end if;

  insert into public.mes_customer_reception_serial_progress (organization_id, reception_item_id, production_serial_id)
  select p_organization_id, v_item.id, serial.id from public.mes_production_serials serial
  where serial.production_order_id = v_item.production_order_id and serial.result = 'good'
  on conflict (reception_item_id, production_serial_id) do nothing;

  if p_action = 'coating-sent' then
    update public.mes_customer_reception_serial_progress p set coating_sent_at = v_now, coating_sent_by = auth.uid(), updated_at = v_now
    where p.reception_item_id = v_item.id and p.coating_sent_at is null
      and (p_production_serial_id is null or p.production_serial_id = p_production_serial_id);
  elsif p_action = 'coating-returned' then
    update public.mes_customer_reception_serial_progress p set coating_returned_at = v_now, coating_returned_by = auth.uid(), updated_at = v_now
    where p.reception_item_id = v_item.id and p.coating_sent_at is not null and p.coating_returned_at is null
      and (p_production_serial_id is null or p.production_serial_id = p_production_serial_id);
  else
    update public.mes_customer_reception_serial_progress p set sent_at = v_now, sent_by = auth.uid(), updated_at = v_now
    where p.reception_item_id = v_item.id
      and (p.coating_returned_at is not null or v_voucher_status = 'waiting-delivery')
      and p.sent_at is null
      and (p_production_serial_id is null or p.production_serial_id = p_production_serial_id);
  end if;
  get diagnostics v_count = row_count;
  perform public.recalculate_customer_reception_progress(v_item.id);
  return v_count;
end;
$$;

revoke all on function public.update_customer_reception_serial_progress(uuid, uuid, text, uuid) from public;
grant execute on function public.update_customer_reception_serial_progress(uuid, uuid, text, uuid) to authenticated;
