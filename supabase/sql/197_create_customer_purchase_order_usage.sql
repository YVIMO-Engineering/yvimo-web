-- How much of each purchase order has been used.
--
-- Every piece (production serial) of a production order linked to a PO in OTC step 2 uses
-- one unit of that PO. The piece's Tool ID decides which PO line it uses; the app matches
-- it against the Tool IDs of each line. The Tool ID is the one reported on the serial, or
-- the one captured in its traceability record (same resolution as the customer portal).
--
-- A reworked piece is the same physical tool running again, so the serial opened to rework
-- it does not use the PO a second time.
--
-- security_invoker keeps the RLS of the underlying tables in force for the caller.

create or replace view public.mes_customer_purchase_order_usage
with (security_invoker = true)
as
select
  document.organization_id,
  document.purchase_order_id,
  resolved.tool_id,
  count(*)::integer as pieces
from public.mes_order_to_cash_documents document
join public.mes_production_serials serial
  on serial.production_order_id = document.production_order_id
 and serial.organization_id = document.organization_id
left join lateral (
  select trace.tool_id
  from public.mes_operator_terminal_traceability trace
  where trace.organization_id = serial.organization_id
    and trace.production_order_id = serial.production_order_id
    and nullif(btrim(trace.tool_id), '') is not null
    and (
      trace.id = serial.traceability_id
      or lower(btrim(trace.serial_number)) = lower(btrim(serial.serial_number))
    )
  order by (trace.id = serial.traceability_id) desc, trace.created_at desc
  limit 1
) traceability on true
cross join lateral (
  select nullif(btrim(coalesce(nullif(serial.tool_id, ''), traceability.tool_id)), '') as tool_id
) resolved
where document.purchase_order_id is not null
  and not exists (
    select 1
    from public.mes_production_serial_reworks rework
    where rework.rework_production_serial_id = serial.id
  )
group by document.organization_id, document.purchase_order_id, resolved.tool_id;

grant select on public.mes_customer_purchase_order_usage to authenticated;
