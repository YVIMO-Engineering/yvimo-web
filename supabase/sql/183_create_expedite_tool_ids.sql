-- Expedite Orders (APS): the Tool IDs an organization wants auto-detected as urgent.
-- When one of these Tool IDs is assigned to a piece in Production Orders, the order due
-- date is forced to the lead time configured here, counted with the organization day
-- count mode stored in public.mes_order_risk_settings.
create table if not exists public.mes_expedite_tool_ids (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  tool_id text not null check (length(btrim(tool_id)) > 0),
  customer_id uuid references public.mes_customers(id) on delete set null,
  client_name text not null default '',
  lead_time_days integer not null default 1 check (lead_time_days between 0 and 365),
  reason text not null default '',
  notes text not null default '',
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One rule per Tool ID per organization, matched case-insensitively the same way the
-- Production Orders assignment modal compares what the planner typed.
create unique index if not exists mes_expedite_tool_ids_org_tool_uidx
  on public.mes_expedite_tool_ids (organization_id, lower(btrim(tool_id)));

create index if not exists mes_expedite_tool_ids_org_active_idx
  on public.mes_expedite_tool_ids (organization_id, is_active);

alter table public.mes_expedite_tool_ids enable row level security;

grant select, insert, update, delete on public.mes_expedite_tool_ids to authenticated;

drop policy if exists "Members can read expedite tool ids" on public.mes_expedite_tool_ids;
create policy "Members can read expedite tool ids"
  on public.mes_expedite_tool_ids for select
  using (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can create expedite tool ids" on public.mes_expedite_tool_ids;
create policy "Members can create expedite tool ids"
  on public.mes_expedite_tool_ids for insert
  with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can update expedite tool ids" on public.mes_expedite_tool_ids;
create policy "Members can update expedite tool ids"
  on public.mes_expedite_tool_ids for update
  using (public.is_manufacturing_organization_member(organization_id))
  with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can delete expedite tool ids" on public.mes_expedite_tool_ids;
create policy "Members can delete expedite tool ids"
  on public.mes_expedite_tool_ids for delete
  using (public.is_manufacturing_organization_member(organization_id));

drop trigger if exists set_mes_expedite_tool_ids_updated_at on public.mes_expedite_tool_ids;
create trigger set_mes_expedite_tool_ids_updated_at
before update on public.mes_expedite_tool_ids
for each row execute function public.set_updated_at();

comment on column public.mes_expedite_tool_ids.lead_time_days is
  'Lead time forced on any production order that assigns this Tool ID, counted in calendar or business days per mes_order_risk_settings.day_count_mode.';

do $$
begin
  alter publication supabase_realtime add table public.mes_expedite_tool_ids;
exception when duplicate_object then null;
end $$;
