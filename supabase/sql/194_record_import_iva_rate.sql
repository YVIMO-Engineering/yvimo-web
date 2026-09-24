-- IVA on an import depends on the product: 16 %, 11 %, 6 %, 0 %, or an amount captured by hand from the
-- customs entry. The rate is recorded with the estimate; null means the IVA amount in taxes was entered by hand.
alter table public.mes_import_cost_estimates add column if not exists iva_rate numeric
  check (iva_rate is null or (iva_rate>=0 and iva_rate<=100));
comment on column public.mes_import_cost_estimates.iva_rate is 'IVA rate (percent) applied to the invoice value; null when taxes holds an amount captured by hand.';
-- Estimates saved before this migration were always taxed at 16 % of the merchandise value. Those whose
-- taxes still match that rate are recorded as 16 %; any other amount stays null and reads as a custom amount.
update public.mes_import_cost_estimates
set iva_rate=16
where iva_rate is null
  and abs(taxes-round(merchandise_cost*0.16,2))<0.01;
