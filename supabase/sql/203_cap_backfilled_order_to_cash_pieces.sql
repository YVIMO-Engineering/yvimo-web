-- 202 backfilled every existing OTC link to cover the whole production order, without capping
-- it to the pieces of the PO, remission or invoice it points to (e.g. a remission of 7 pieces
-- showed 13 of 13 covered). This brings every link back within the bounds 202 enforces:
--
--   1. A registry record covers at most the pieces it holds, handed to its links in the order
--      they were linked.
--   2. Per production order, POs cover at most its pieces, remissions at most what its POs
--      cover and invoices at most what its remissions cover, again in link order.
--
-- A link left with no pieces is removed, and its order goes back to awaiting that document.
-- The new values are consistent by construction, so the coverage trigger is paused while they
-- are written (lowering a PO before its remission would otherwise be refused).

create temp table otc_link_fix as
select
  document.id,
  document.production_order_id,
  document.stage,
  document.linked_at,
  document.pieces,
  coalesce(document.purchase_order_id, document.remission_id, document.invoice_id) as registry_id,
  case
    when document.purchase_order_id is not null then (
      select coalesce(sum(item.quantity), 0) from public.mes_customer_purchase_order_items item where item.purchase_order_id = document.purchase_order_id
    )
    when document.remission_id is not null then (
      select coalesce(sum(item.quantity), 0) from public.mes_customer_remission_items item where item.remission_id = document.remission_id
    )
    when document.invoice_id is not null then (
      select coalesce(sum(item.quantity), 0) from public.mes_customer_invoice_items item where item.invoice_id = document.invoice_id
    )
  end as capacity,
  document.pieces as target
from public.mes_order_to_cash_documents document;

-- 1. Registry capacity. Files uploaded directly in OTC (no registry record) have no capacity.
update otc_link_fix fix
set target = capped.target
from (
  select
    link.id,
    least(
      link.pieces,
      greatest(0, link.capacity - coalesce(sum(link.pieces) over (
        partition by link.registry_id
        order by link.linked_at, link.id
        rows between unbounded preceding and 1 preceding
      ), 0))
    )::integer as target
  from otc_link_fix link
  where link.registry_id is not null
) capped
where capped.id = fix.id;

-- 2. Per production order, one stage at a time so each sees the stage before it already capped.
do $$
declare
  v_stage text;
begin
  foreach v_stage in array array['purchase-order', 'remission', 'invoice'] loop
    update otc_link_fix fix
    set target = capped.target
    from (
      select
        link.id,
        least(
          link.target,
          greatest(0, stage_limit.pieces - coalesce(sum(link.target) over (
            partition by link.production_order_id
            order by link.linked_at, link.id
            rows between unbounded preceding and 1 preceding
          ), 0))
        )::integer as target
      from otc_link_fix link
      cross join lateral (
        select case v_stage
          when 'purchase-order' then (
            select coalesce(sum(item.quantity), 0)
            from public.mes_customer_reception_items item
            where item.production_order_id = link.production_order_id
          )
          else (
            select coalesce(sum(previous.target), 0)
            from otc_link_fix previous
            where previous.production_order_id = link.production_order_id
              and previous.stage = case v_stage when 'remission' then 'purchase-order' else 'remission' end
          )
        end as pieces
      ) stage_limit
      where link.stage = v_stage
    ) capped
    where capped.id = fix.id;
  end loop;
end;
$$;

alter table public.mes_order_to_cash_documents disable trigger check_order_to_cash_coverage;

update public.mes_order_to_cash_documents document
set pieces = fix.target
from otc_link_fix fix
where fix.id = document.id
  and fix.target > 0
  and fix.target <> document.pieces;

delete from public.mes_order_to_cash_documents document
using otc_link_fix fix
where fix.id = document.id
  and fix.target = 0;

alter table public.mes_order_to_cash_documents enable trigger check_order_to_cash_coverage;

drop table otc_link_fix;
