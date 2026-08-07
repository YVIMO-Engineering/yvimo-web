create table if not exists public.mes_import_cost_estimates (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  reference_number text not null, client_name text not null, supplier text not null, part_number text not null, item_description text not null,
  quantity numeric(14,4) not null check(quantity>0), country text not null, operation_type text not null,
  purchase_currency text not null, invoice_unit_value numeric(14,4) not null check(invoice_unit_value>=0), purchase_fx numeric(14,6) not null check(purchase_fx>0),
  sale_currency text not null, client_unit_price numeric(14,4) not null check(client_unit_price>=0), sale_fx numeric(14,6) not null check(sale_fx>0), desired_margin_percent numeric(8,4) not null default 0,
  international_freight numeric(14,4) not null default 0, insurance numeric(14,4) not null default 0, taxes numeric(14,4) not null default 0,
  customs_agent_fees numeric(14,4) not null default 0, handling numeric(14,4) not null default 0, domestic_transport numeric(14,4) not null default 0,
  other_expenses numeric(14,4) not null default 0, logistics_management numeric(14,4) not null default 0,
  shipment_weight_kg numeric(14,4), freight_mode text, freight_rate_source text, freight_base_charge numeric(14,4), freight_rate_per_kg numeric(14,4),
  origin_city text, origin_postal_code text, destination_city text, destination_postal_code text, package_length_cm numeric(14,4), package_width_cm numeric(14,4), package_height_cm numeric(14,4),
  carrier text, customs_entry_number text, customs_office text, financing_monthly_percent numeric(8,4), tariff_fraction text, incoterm text,
  merchandise_cost numeric(14,4) not null, logistics_cost numeric(14,4) not null, total_cost numeric(14,4) not null,
  client_sale numeric(14,4) not null, profit_loss numeric(14,4) not null, minimum_unit_price numeric(14,4) not null, recommended_unit_price numeric(14,4) not null,
  result text not null check(result in ('PROFIT','BREAK-EVEN','LOSS')), status text not null default 'draft' check(status in ('draft','offered','accepted','declined')),
  created_by uuid references auth.users(id) on delete set null default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(organization_id,reference_number)
);
alter table public.mes_import_cost_estimates enable row level security;
alter table public.mes_import_cost_estimates add column if not exists shipment_weight_kg numeric(14,4);
alter table public.mes_import_cost_estimates add column if not exists freight_mode text;
alter table public.mes_import_cost_estimates add column if not exists freight_rate_source text;
alter table public.mes_import_cost_estimates add column if not exists freight_base_charge numeric(14,4);
alter table public.mes_import_cost_estimates add column if not exists freight_rate_per_kg numeric(14,4);
alter table public.mes_import_cost_estimates add column if not exists origin_city text;
alter table public.mes_import_cost_estimates add column if not exists origin_postal_code text;
alter table public.mes_import_cost_estimates add column if not exists destination_city text;
alter table public.mes_import_cost_estimates add column if not exists destination_postal_code text;
alter table public.mes_import_cost_estimates add column if not exists package_length_cm numeric(14,4);
alter table public.mes_import_cost_estimates add column if not exists package_width_cm numeric(14,4);
alter table public.mes_import_cost_estimates add column if not exists package_height_cm numeric(14,4);
alter table public.mes_import_cost_estimates drop constraint if exists mes_import_cost_estimates_result_check;
alter table public.mes_import_cost_estimates add constraint mes_import_cost_estimates_result_check check(result in ('PROFIT','BREAK-EVEN','LOSS'));
grant select,insert,update,delete on public.mes_import_cost_estimates to authenticated;
drop policy if exists "Members manage import cost estimates" on public.mes_import_cost_estimates;
create policy "Members manage import cost estimates" on public.mes_import_cost_estimates for all using(public.is_manufacturing_organization_member(organization_id)) with check(public.is_manufacturing_organization_member(organization_id));
create index if not exists mes_import_cost_estimates_org_created_idx on public.mes_import_cost_estimates(organization_id,created_at desc);
drop trigger if exists set_mes_import_cost_estimates_updated_at on public.mes_import_cost_estimates;
create trigger set_mes_import_cost_estimates_updated_at before update on public.mes_import_cost_estimates for each row execute function public.set_updated_at();
