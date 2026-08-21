alter table public.mes_import_cost_estimates
  add column if not exists invoice_number text,
  add column if not exists odc_number text,
  add column if not exists purchase_order_number text;

create index if not exists mes_import_cost_estimates_invoice_idx
  on public.mes_import_cost_estimates (organization_id, invoice_number);

create index if not exists mes_import_cost_estimates_odc_idx
  on public.mes_import_cost_estimates (organization_id, odc_number);

create index if not exists mes_import_cost_estimates_purchase_order_idx
  on public.mes_import_cost_estimates (organization_id, purchase_order_number);
