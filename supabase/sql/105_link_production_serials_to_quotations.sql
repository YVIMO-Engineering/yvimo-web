alter table public.mes_production_serials
  add column if not exists quotation_id uuid references public.mes_quotations(id) on delete set null;

create index if not exists mes_production_serials_quotation_idx
  on public.mes_production_serials (quotation_id)
  where quotation_id is not null;
