-- Some imports are brought in only to support another business unit (warranty / support shipments):
-- the merchandise is not charged and only the logistics cost is recovered. The flag is recorded on the
-- estimate so its saved merchandise_cost of zero stays explained.
alter table public.mes_import_cost_estimates add column if not exists warranty boolean not null default false;
comment on column public.mes_import_cost_estimates.warranty is 'Warranty / business-unit support import: merchandise_cost is zero and only the logistics cost is charged.';
