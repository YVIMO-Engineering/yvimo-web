create table if not exists public.mes_customer_reception_serial_progress (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  reception_item_id uuid not null references public.mes_customer_reception_items(id) on delete cascade,
  production_serial_id uuid not null references public.mes_production_serials(id) on delete cascade,
  coating_sent_at timestamptz,
  coating_sent_by uuid references auth.users(id) on delete set null,
  coating_returned_at timestamptz,
  coating_returned_by uuid references auth.users(id) on delete set null,
  sent_at timestamptz,
  sent_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (reception_item_id, production_serial_id)
);

create index if not exists mes_reception_serial_progress_item_idx
  on public.mes_customer_reception_serial_progress (reception_item_id);

alter table public.mes_customer_reception_serial_progress enable row level security;
grant select on public.mes_customer_reception_serial_progress to authenticated;

drop policy if exists "Members can read reception serial progress" on public.mes_customer_reception_serial_progress;
create policy "Members can read reception serial progress"
  on public.mes_customer_reception_serial_progress for select
  using (public.is_manufacturing_organization_member(organization_id));

-- Existing completed pieces inherit the previous sub-reception timestamps.
insert into public.mes_customer_reception_serial_progress (
  organization_id, reception_item_id, production_serial_id,
  coating_sent_at, coating_returned_at, sent_at
)
select item.organization_id, item.id, serial.id,
       item.coating_sent_at, item.coating_returned_at, item.sent_at
from public.mes_customer_reception_items item
join public.mes_production_serials serial
  on serial.production_order_id = item.production_order_id and serial.result = 'good'
on conflict (reception_item_id, production_serial_id) do nothing;

create or replace function public.ensure_customer_reception_serial_progress()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'mes_production_serials' then
    if new.result = 'good' then
      insert into public.mes_customer_reception_serial_progress
        (organization_id, reception_item_id, production_serial_id)
      select new.organization_id, item.id, new.id
      from public.mes_customer_reception_items item
      where item.production_order_id = new.production_order_id
      on conflict (reception_item_id, production_serial_id) do nothing;
    end if;
  elsif new.production_order_id is not null then
    insert into public.mes_customer_reception_serial_progress
      (organization_id, reception_item_id, production_serial_id)
    select new.organization_id, new.id, serial.id
    from public.mes_production_serials serial
    where serial.production_order_id = new.production_order_id and serial.result = 'good'
    on conflict (reception_item_id, production_serial_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists ensure_reception_progress_from_serial on public.mes_production_serials;
create trigger ensure_reception_progress_from_serial
after insert or update of result on public.mes_production_serials
for each row execute function public.ensure_customer_reception_serial_progress();

drop trigger if exists ensure_reception_progress_from_item on public.mes_customer_reception_items;
create trigger ensure_reception_progress_from_item
after insert or update of production_order_id on public.mes_customer_reception_items
for each row execute function public.ensure_customer_reception_serial_progress();

revoke all on function public.ensure_customer_reception_serial_progress() from public;

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
declare v_item public.mes_customer_reception_items; v_count integer; v_now timestamptz := now(); v_order_status text;
begin
  if not public.is_manufacturing_organization_member(p_organization_id) then
    raise exception using errcode = '42501', message = 'You do not have access to this organization.';
  end if;
  if p_action not in ('coating-sent', 'coating-returned', 'sent') then
    raise exception using errcode = '22023', message = 'Invalid serial progress action.';
  end if;
  select * into v_item from public.mes_customer_reception_items
    where id = p_item_id and organization_id = p_organization_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Reception item was not found.'; end if;
  select status into v_order_status from public.mes_production_orders
    where id = v_item.production_order_id and organization_id = p_organization_id;
  if p_action = 'coating-sent' and coalesce(v_order_status, '') <> 'completed' then
    raise exception using errcode = '22023', message = 'Only completed pieces can be sent to coating.';
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
    where p.reception_item_id = v_item.id and p.coating_returned_at is not null and p.sent_at is null
      and (p_production_serial_id is null or p.production_serial_id = p_production_serial_id);
  end if;
  get diagnostics v_count = row_count;
  perform public.recalculate_customer_reception_progress(v_item.id);
  return v_count;
end;
$$;

revoke all on function public.update_customer_reception_serial_progress(uuid, uuid, text, uuid) from public;
grant execute on function public.update_customer_reception_serial_progress(uuid, uuid, text, uuid) to authenticated;
