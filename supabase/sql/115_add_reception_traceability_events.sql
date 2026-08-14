alter table public.mes_operator_terminal_events
  drop constraint if exists mes_operator_terminal_events_event_type_check;

alter table public.mes_operator_terminal_events
  add constraint mes_operator_terminal_events_event_type_check
  check (
    event_type in (
      'job-started', 'job-resumed', 'job-paused',
      'downtime-started', 'downtime-ended',
      'production-good', 'production-scrap',
      'manufacturing-completed', 'operation-completed',
      'traceability-saved', 'quality-inspection-saved', 'quality-inspection-skipped',
      'measurement-corrected', 'adjustment',
      'inventory-received', 'inventory-consumed',
      'maintenance-started', 'maintenance-ended',
      'station-offline', 'station-online',
      'reception-created', 'coating-dispatched', 'coating-received', 'reception-sent'
    )
  );

create or replace function public.log_customer_reception_created_traceability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_name text;
begin
  select customer.customer_name into v_customer_name
  from public.mes_customers customer
  where customer.id = new.customer_id;

  insert into public.mes_operator_terminal_events (
    organization_id, production_order_id, work_center_code, station_code,
    event_type, quantity, comment, payload, created_at
  ) values (
    new.organization_id, null, 'RECEPTIONS', 'CLIENT-RECEPTIONS',
    'reception-created', new.quantity_expected, nullif(new.notes, ''),
    jsonb_build_object(
      'source', 'customer-receptions',
      'reception_voucher_id', new.id,
      'voucher_number', new.voucher_number,
      'customer_id', new.customer_id,
      'client_name', coalesce(v_customer_name, ''),
      'customer_reference', new.customer_reference,
      'packing_slip', new.packing_slip,
      'lot_serial', new.lot_serial,
      'quantity', new.quantity_expected
    ),
    new.created_at
  );
  return new;
end;
$$;

create or replace function public.log_customer_reception_item_traceability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_voucher public.mes_customer_reception_vouchers%rowtype;
  v_customer_name text;
  v_work_center text := 'RECEPTIONS';
  v_station text := 'CLIENT-RECEPTIONS';
begin
  select * into v_voucher
  from public.mes_customer_reception_vouchers
  where id = new.reception_voucher_id;

  select customer.customer_name into v_customer_name
  from public.mes_customers customer
  where customer.id = new.customer_id;

  if new.production_order_id is not null then
    select coalesce(nullif(production_order.assigned_work_center, ''), v_work_center),
           coalesce(nullif(production_order.assigned_station, ''), v_station)
    into v_work_center, v_station
    from public.mes_production_orders production_order
    where production_order.id = new.production_order_id;
  end if;

  if old.coating_sent_at is null and new.coating_sent_at is not null then
    insert into public.mes_operator_terminal_events (
      organization_id, production_order_id, work_center_code, station_code,
      event_type, quantity, payload, created_at
    ) values (
      new.organization_id, new.production_order_id, v_work_center, v_station,
      'coating-dispatched', new.quantity,
      jsonb_build_object('source', 'customer-receptions', 'reception_item_id', new.id,
        'reception_voucher_id', new.reception_voucher_id, 'voucher_number', v_voucher.voucher_number,
        'client_name', coalesce(v_customer_name, ''), 'production_order_number', new.production_order_number,
        'lot_serial', v_voucher.lot_serial, 'quantity', new.quantity),
      new.coating_sent_at
    );
  end if;

  if old.coating_returned_at is null and new.coating_returned_at is not null then
    insert into public.mes_operator_terminal_events (
      organization_id, production_order_id, work_center_code, station_code,
      event_type, quantity, payload, created_at
    ) values (
      new.organization_id, new.production_order_id, v_work_center, v_station,
      'coating-received', new.quantity,
      jsonb_build_object('source', 'customer-receptions', 'reception_item_id', new.id,
        'reception_voucher_id', new.reception_voucher_id, 'voucher_number', v_voucher.voucher_number,
        'client_name', coalesce(v_customer_name, ''), 'production_order_number', new.production_order_number,
        'lot_serial', v_voucher.lot_serial, 'quantity', new.quantity),
      new.coating_returned_at
    );
  end if;

  if old.sent_at is null and new.sent_at is not null then
    insert into public.mes_operator_terminal_events (
      organization_id, production_order_id, work_center_code, station_code,
      event_type, quantity, payload, created_at
    ) values (
      new.organization_id, new.production_order_id, v_work_center, v_station,
      'reception-sent', new.quantity,
      jsonb_build_object('source', 'customer-receptions', 'reception_item_id', new.id,
        'reception_voucher_id', new.reception_voucher_id, 'voucher_number', v_voucher.voucher_number,
        'client_name', coalesce(v_customer_name, ''), 'production_order_number', new.production_order_number,
        'lot_serial', v_voucher.lot_serial, 'quantity', new.quantity),
      new.sent_at
    );
  end if;
  return new;
end;
$$;

drop trigger if exists log_customer_reception_created_traceability on public.mes_customer_reception_vouchers;
create trigger log_customer_reception_created_traceability
after insert on public.mes_customer_reception_vouchers
for each row execute function public.log_customer_reception_created_traceability();

drop trigger if exists log_customer_reception_item_traceability on public.mes_customer_reception_items;
create trigger log_customer_reception_item_traceability
after update of coating_sent_at, coating_returned_at, sent_at on public.mes_customer_reception_items
for each row execute function public.log_customer_reception_item_traceability();

revoke all on function public.log_customer_reception_created_traceability() from public;
revoke all on function public.log_customer_reception_item_traceability() from public;

-- Backfill the reception history that predates these triggers.
insert into public.mes_operator_terminal_events (
  organization_id, production_order_id, work_center_code, station_code,
  event_type, quantity, comment, payload, created_at
)
select voucher.organization_id, null, 'RECEPTIONS', 'CLIENT-RECEPTIONS',
       'reception-created', voucher.quantity_expected, nullif(voucher.notes, ''),
       jsonb_build_object('source', 'customer-receptions', 'reception_voucher_id', voucher.id,
         'voucher_number', voucher.voucher_number, 'customer_id', voucher.customer_id,
         'client_name', coalesce(customer.customer_name, ''), 'customer_reference', voucher.customer_reference,
         'packing_slip', voucher.packing_slip, 'lot_serial', voucher.lot_serial, 'quantity', voucher.quantity_expected),
       voucher.created_at
from public.mes_customer_reception_vouchers voucher
left join public.mes_customers customer on customer.id = voucher.customer_id
where not exists (
  select 1 from public.mes_operator_terminal_events event
  where event.event_type = 'reception-created'
    and event.payload ->> 'reception_voucher_id' = voucher.id::text
);

insert into public.mes_operator_terminal_events (
  organization_id, production_order_id, work_center_code, station_code,
  event_type, quantity, payload, created_at
)
select item.organization_id, item.production_order_id,
       coalesce(nullif(production_order.assigned_work_center, ''), 'RECEPTIONS'),
       coalesce(nullif(production_order.assigned_station, ''), 'CLIENT-RECEPTIONS'),
       milestone.event_type, item.quantity,
       jsonb_build_object('source', 'customer-receptions', 'reception_item_id', item.id,
         'reception_voucher_id', item.reception_voucher_id, 'voucher_number', voucher.voucher_number,
         'client_name', coalesce(customer.customer_name, ''), 'production_order_number', item.production_order_number,
         'lot_serial', voucher.lot_serial, 'quantity', item.quantity),
       milestone.happened_at
from public.mes_customer_reception_items item
join public.mes_customer_reception_vouchers voucher on voucher.id = item.reception_voucher_id
left join public.mes_customers customer on customer.id = item.customer_id
left join public.mes_production_orders production_order on production_order.id = item.production_order_id
cross join lateral (values
  ('coating-dispatched'::text, item.coating_sent_at),
  ('coating-received'::text, item.coating_returned_at),
  ('reception-sent'::text, item.sent_at)
) milestone(event_type, happened_at)
where milestone.happened_at is not null
  and not exists (
    select 1 from public.mes_operator_terminal_events event
    where event.event_type = milestone.event_type
      and event.payload ->> 'reception_item_id' = item.id::text
  );
