create table if not exists public.mes_customer_tool_ids (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  tool_id text not null check (length(btrim(tool_id)) > 0),
  part_type text not null check (length(btrim(part_type)) > 0),
  minimum_life numeric not null check (minimum_life >= 0),
  measurement_unit text not null default 'in' check (measurement_unit in ('in', 'mm')),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists mes_customer_tool_ids_org_tool_uidx
  on public.mes_customer_tool_ids (organization_id, lower(btrim(tool_id)));

create table if not exists public.mes_customer_tool_id_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  tool_definition_id uuid not null references public.mes_customer_tool_ids(id) on delete cascade,
  storage_bucket text not null default 'mes-customer-assets',
  file_name text not null,
  file_path text not null,
  file_type text not null,
  uploaded_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.mes_customer_assets
  add column if not exists tool_definition_id uuid references public.mes_customer_tool_ids(id) on delete set null;

create index if not exists mes_customer_assets_tool_definition_idx
  on public.mes_customer_assets (organization_id, tool_definition_id);

create or replace function public.link_mes_customer_asset_tool_id()
returns trigger
language plpgsql
security invoker
as $$
declare
  v_tool_id text;
begin
  if new.tool_definition_id is not null then
    return new;
  end if;

  select serial.tool_id into v_tool_id
  from public.mes_production_serials serial
  where serial.organization_id = new.organization_id
    and serial.production_order_id = coalesce(new.last_production_order_id, new.source_production_order_id)
    and lower(btrim(serial.serial_number)) = lower(btrim(new.serial_number))
  order by serial.reported_at desc nulls last
  limit 1;

  if nullif(btrim(v_tool_id), '') is not null then
    select tool.id into new.tool_definition_id
    from public.mes_customer_tool_ids tool
    where tool.organization_id = new.organization_id
      and lower(btrim(tool.tool_id)) = lower(btrim(v_tool_id))
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists link_mes_customer_asset_tool_id on public.mes_customer_assets;
create trigger link_mes_customer_asset_tool_id
before insert or update of last_production_order_id, source_production_order_id, serial_number
on public.mes_customer_assets
for each row execute function public.link_mes_customer_asset_tool_id();

update public.mes_customer_assets asset
set tool_definition_id = tool.id
from public.mes_production_serials serial, public.mes_customer_tool_ids tool
where asset.tool_definition_id is null
  and serial.organization_id = asset.organization_id
  and serial.production_order_id = coalesce(asset.last_production_order_id, asset.source_production_order_id)
  and lower(btrim(serial.serial_number)) = lower(btrim(asset.serial_number))
  and tool.organization_id = asset.organization_id
  and lower(btrim(tool.tool_id)) = lower(btrim(serial.tool_id));

alter table public.mes_customer_tool_ids enable row level security;
alter table public.mes_customer_tool_id_documents enable row level security;

grant select, insert, update, delete on public.mes_customer_tool_ids to authenticated;
grant select, insert, update, delete on public.mes_customer_tool_id_documents to authenticated;

drop policy if exists "Members can manage organization Tool IDs" on public.mes_customer_tool_ids;
create policy "Members can manage organization Tool IDs"
  on public.mes_customer_tool_ids for all
  using (public.is_manufacturing_organization_member(organization_id))
  with check (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can manage organization Tool ID documents" on public.mes_customer_tool_id_documents;
create policy "Members can manage organization Tool ID documents"
  on public.mes_customer_tool_id_documents for all
  using (public.is_manufacturing_organization_member(organization_id))
  with check (
    public.is_manufacturing_organization_member(organization_id)
    and exists (
      select 1 from public.mes_customer_tool_ids tool
      where tool.id = tool_definition_id and tool.organization_id = organization_id
    )
  );

drop trigger if exists set_mes_customer_tool_ids_updated_at on public.mes_customer_tool_ids;
create trigger set_mes_customer_tool_ids_updated_at
before update on public.mes_customer_tool_ids
for each row execute function public.set_updated_at();
