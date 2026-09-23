-- An import estimate is a commercial record: it must keep the exchange rates it was costed with,
-- together with the market date and the moment those rates were retrieved, so the saved result
-- never drifts when the market moves. Fresh rates are only requested for a new calculation.
alter table public.mes_import_cost_estimates add column if not exists fx_source text;
alter table public.mes_import_cost_estimates add column if not exists purchase_fx_market_date date;
alter table public.mes_import_cost_estimates add column if not exists sale_fx_market_date date;
alter table public.mes_import_cost_estimates add column if not exists fx_captured_at timestamptz;
comment on column public.mes_import_cost_estimates.fx_source is 'Provider that published the purchase_fx and sale_fx rates recorded on the estimate.';
comment on column public.mes_import_cost_estimates.purchase_fx_market_date is 'Market date of the published purchase_fx rate.';
comment on column public.mes_import_cost_estimates.sale_fx_market_date is 'Market date of the published sale_fx rate.';
comment on column public.mes_import_cost_estimates.fx_captured_at is 'Moment purchase_fx and sale_fx were retrieved and applied to the estimate.';
-- Estimates created before this migration keep their rates; their capture moment is unknown and stays null,
-- which the workspace reports as "capture time not recorded" instead of inventing a timestamp.
