-- Shavers do not receive coating. Complete both coating milestones as soon as
-- their production order is completed so the reception can move to delivery.
create or replace function public.auto_complete_shaver_reception_coating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_now timestamptz := now();
begin
  if new.status <> 'completed'
    or lower(btrim(coalesce(new.piece_type, ''))) not in ('shaver', 'shavers') then
    return new;
  end if;

  for v_item in
    select item.id
    from public.mes_customer_reception_items item
    where item.production_order_id = new.id
      and item.organization_id = new.organization_id
      and (item.coating_sent_at is null or item.coating_returned_at is null)
  loop
    insert into public.mes_customer_reception_serial_progress (
      organization_id,
      reception_item_id,
      production_serial_id,
      coating_sent_at,
      coating_returned_at
    )
    select
      new.organization_id,
      v_item.id,
      serial.id,
      v_now,
      v_now
    from public.mes_production_serials serial
    where serial.production_order_id = new.id
      and serial.organization_id = new.organization_id
      and serial.result = 'good'
    on conflict (reception_item_id, production_serial_id) do update
    set coating_sent_at = coalesce(mes_customer_reception_serial_progress.coating_sent_at, excluded.coating_sent_at),
        coating_returned_at = coalesce(mes_customer_reception_serial_progress.coating_returned_at, excluded.coating_returned_at),
        updated_at = v_now;

    if exists (
      select 1
      from public.mes_customer_reception_serial_progress progress
      where progress.reception_item_id = v_item.id
    ) then
      perform public.recalculate_customer_reception_progress(v_item.id);
    else
      -- Keep non-serialized legacy orders moving through the same workflow.
      update public.mes_customer_reception_items
      set coating_sent_at = coalesce(coating_sent_at, v_now),
          coating_returned_at = coalesce(coating_returned_at, v_now),
          updated_at = v_now
      where id = v_item.id;

      update public.mes_customer_reception_vouchers voucher
      set status = case
            when not exists (
              select 1 from public.mes_customer_reception_items item
              where item.reception_voucher_id = voucher.id and item.sent_at is null
            ) then 'sent'
            when not exists (
              select 1 from public.mes_customer_reception_items item
              where item.reception_voucher_id = voucher.id and item.coating_returned_at is null
            ) then 'waiting-delivery'
            else 'coating'
          end,
          updated_at = v_now
      where voucher.id = (
        select item.reception_voucher_id
        from public.mes_customer_reception_items item
        where item.id = v_item.id
      )
        and voucher.status <> 'discrepancy';
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function public.auto_complete_shaver_reception_coating() from public;

drop trigger if exists auto_complete_shaver_reception_coating
on public.mes_production_orders;

create trigger auto_complete_shaver_reception_coating
after insert or update of status, piece_type
on public.mes_production_orders
for each row
execute function public.auto_complete_shaver_reception_coating();

-- Bring already-completed shaver sub-receptions in line with the new rule.
-- Updating a watched column to its current value intentionally invokes the
-- trigger without changing the production order itself.
update public.mes_production_orders
set piece_type = piece_type
where status = 'completed'
  and lower(btrim(coalesce(piece_type, ''))) in ('shaver', 'shavers');
