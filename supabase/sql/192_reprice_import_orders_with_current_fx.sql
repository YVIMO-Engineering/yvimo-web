-- ONE-TIME HISTORICAL CORRECTION.
-- Import estimates saved before the exchange-rate fix could keep the rate of a previously selected
-- currency (a failed lookup left the earlier value in the form), so EUR operations were costed with
-- the USD rate. This reprices every estimate with the rates published on 2026-09-22 and stamps them
-- so the correction is traceable. From here on an estimate keeps the rates it was costed with:
-- only a new calculation requests the current ones.
-- Apply after migration 191, which adds the traceability columns.
with market_rate(currency, rate, market_date) as (
  values ('USD', 17.249100::numeric, date '2026-09-22'),
         ('EUR', 19.772700::numeric, date '2026-09-22'),
         ('JPY', 0.109740::numeric, date '2026-09-22'),
         ('GBP', 23.050000::numeric, date '2026-09-22'),
         ('MXN', 1.000000::numeric, date '2026-09-22')
), repriced as (
  select estimate.id, purchase.rate as purchase_fx, purchase.market_date as purchase_market_date,
    sale.rate as sale_fx, sale.market_date as sale_market_date,
    round(estimate.quantity*estimate.invoice_unit_value*purchase.rate,4) as merchandise_cost,
    round(estimate.quantity*estimate.client_unit_price*sale.rate,4) as client_sale,
    -- IVA stays out of the landed cost and is rebuilt as 16% of the repriced merchandise value.
    round(estimate.quantity*estimate.invoice_unit_value*purchase.rate*0.16,2) as taxes,
    estimate.international_freight+estimate.insurance+estimate.customs_agent_fees+estimate.handling+estimate.domestic_transport+estimate.other_expenses+estimate.logistics_management as logistics_cost
  from public.mes_import_cost_estimates as estimate
  join market_rate as purchase on purchase.currency=estimate.purchase_currency
  join market_rate as sale on sale.currency=estimate.sale_currency
), totals as (
  select repriced.*, repriced.merchandise_cost+repriced.logistics_cost as total_cost from repriced
)
update public.mes_import_cost_estimates as estimate
set purchase_fx=totals.purchase_fx,
    sale_fx=totals.sale_fx,
    merchandise_cost=totals.merchandise_cost,
    logistics_cost=totals.logistics_cost,
    taxes=totals.taxes,
    total_cost=totals.total_cost,
    client_sale=totals.client_sale,
    profit_loss=round(totals.client_sale-totals.total_cost,4),
    minimum_unit_price=round(totals.total_cost/estimate.quantity/totals.sale_fx,4),
    recommended_unit_price=round(totals.total_cost/estimate.quantity/totals.sale_fx*(1+estimate.desired_margin_percent/100),4),
    result=case
      when totals.client_sale-totals.total_cost<-0.005 then 'LOSS'
      when totals.client_sale-totals.total_cost>0.005 then 'PROFIT'
      else 'BREAK-EVEN' end,
    fx_source='Frankfurter · ECB reference rates · one-time historical correction',
    purchase_fx_market_date=totals.purchase_market_date,
    sale_fx_market_date=totals.sale_market_date,
    fx_captured_at=now()
from totals
where totals.id=estimate.id;
