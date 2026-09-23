-- IVA is a recoverable tax credit: it is reported on its own and no longer forms part of the
-- import landed cost, the minimum / recommended unit prices or the profit / loss result.
-- Rebuild the historical estimates whose logistics_cost still carries the tax amount.
with legacy as (
  select id, taxes,
    international_freight+insurance+customs_agent_fees+handling+domestic_transport+other_expenses+logistics_management as logistics_without_tax
  from public.mes_import_cost_estimates
  where taxes>0
    and abs(logistics_cost-(international_freight+insurance+taxes+customs_agent_fees+handling+domestic_transport+other_expenses+logistics_management))<0.01
)
update public.mes_import_cost_estimates as estimate
set logistics_cost=legacy.logistics_without_tax,
    total_cost=estimate.merchandise_cost+legacy.logistics_without_tax,
    profit_loss=estimate.client_sale-(estimate.merchandise_cost+legacy.logistics_without_tax),
    minimum_unit_price=(estimate.merchandise_cost+legacy.logistics_without_tax)/estimate.quantity/estimate.sale_fx,
    recommended_unit_price=(estimate.merchandise_cost+legacy.logistics_without_tax)/estimate.quantity/estimate.sale_fx*(1+estimate.desired_margin_percent/100),
    result=case
      when estimate.client_sale-(estimate.merchandise_cost+legacy.logistics_without_tax)<-0.005 then 'LOSS'
      when estimate.client_sale-(estimate.merchandise_cost+legacy.logistics_without_tax)>0.005 then 'PROFIT'
      else 'BREAK-EVEN' end
from legacy
where legacy.id=estimate.id;
