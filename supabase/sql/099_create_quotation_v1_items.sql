alter table public.mes_quotations
  add column if not exists service_history text,
  add column if not exists sharpening_program_id text,
  add column if not exists measurement_program_id text,
  add column if not exists program_revision text,
  add column if not exists program_status text,
  add column if not exists currency text,
  add column if not exists one_time_engineering_subtotal numeric(14,4),
  add column if not exists recurring_service_subtotal numeric(14,4),
  add column if not exists addons_subtotal numeric(14,4),
  add column if not exists other_subtotal numeric(14,4),
  add column if not exists estimated_future_repeat_price numeric(14,4),
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

alter table public.mes_quotations drop constraint if exists mes_quotations_service_history_check;
alter table public.mes_quotations add constraint mes_quotations_service_history_check check (service_history is null or service_history in ('first_time','existing_program','program_modification','inspection_required'));

create table if not exists public.mes_quotation_items (
  id uuid primary key default gen_random_uuid(), quotation_id uuid not null references public.mes_quotations(id) on delete cascade,
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  category text not null, pricing_type text not null, name text not null, description text not null default '', quantity numeric(14,4) not null default 1,
  unit text not null default 'service', hours numeric(14,4) not null default 0, unit_price numeric(14,4) not null default 0,
  hourly_rate numeric(14,4) not null default 0, internal_cost numeric(14,4) not null default 0, subtotal numeric(14,4) not null default 0,
  sort_order integer not null default 0, is_optional boolean not null default false, is_selected boolean not null default true,
  is_recurring boolean not null default false, is_customer_visible boolean not null default true, notes text not null default '',
  source_type text, source_reference_id uuid, metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(), updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (quantity>=0 and hours>=0 and unit_price>=0 and hourly_rate>=0 and internal_cost>=0 and subtotal>=0),
  check (category in ('one_time_engineering','recurring_service','coating','damage_surcharge','addon','logistics','other')),
  check (pricing_type in ('fixed','hourly','quantity','calculated'))
);

create table if not exists public.mes_quotation_addon_catalog (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  name text not null, description text not null default '', category text not null default 'Other', default_unit text not null default 'service',
  default_unit_price numeric(14,4) not null default 0, default_internal_cost numeric(14,4) not null default 0,
  default_is_optional boolean not null default false, default_is_recurring boolean not null default false, is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(), updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,name)
);

alter table public.mes_quotation_items enable row level security; alter table public.mes_quotation_addon_catalog enable row level security;
grant select,insert,update,delete on public.mes_quotation_items,public.mes_quotation_addon_catalog to authenticated;
create policy "Members manage quotation items" on public.mes_quotation_items for all using (public.is_manufacturing_organization_member(organization_id)) with check (public.is_manufacturing_organization_member(organization_id));
create policy "Members read addon catalog" on public.mes_quotation_addon_catalog for select using (public.is_manufacturing_organization_member(organization_id));
create policy "Admins manage addon catalog" on public.mes_quotation_addon_catalog for all using (public.is_manufacturing_organization_admin(organization_id)) with check (public.is_manufacturing_organization_admin(organization_id));
create index if not exists mes_quotation_items_quote_order_idx on public.mes_quotation_items(quotation_id,sort_order);
create or replace function public.set_quotation_updated_by() returns trigger language plpgsql security invoker set search_path=public as $$ begin new.updated_by=auth.uid(); return new; end; $$;
drop trigger if exists set_mes_quotations_updated_by on public.mes_quotations; create trigger set_mes_quotations_updated_by before update on public.mes_quotations for each row execute function public.set_quotation_updated_by();
drop trigger if exists set_mes_quotation_items_updated_by on public.mes_quotation_items; create trigger set_mes_quotation_items_updated_by before update on public.mes_quotation_items for each row execute function public.set_quotation_updated_by();
drop trigger if exists set_mes_quotation_addon_catalog_updated_by on public.mes_quotation_addon_catalog; create trigger set_mes_quotation_addon_catalog_updated_by before update on public.mes_quotation_addon_catalog for each row execute function public.set_quotation_updated_by();
drop trigger if exists set_mes_quotation_items_updated_at on public.mes_quotation_items; create trigger set_mes_quotation_items_updated_at before update on public.mes_quotation_items for each row execute function public.set_updated_at();
drop trigger if exists set_mes_quotation_addon_catalog_updated_at on public.mes_quotation_addon_catalog; create trigger set_mes_quotation_addon_catalog_updated_at before update on public.mes_quotation_addon_catalog for each row execute function public.set_updated_at();
