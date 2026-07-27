create table if not exists public.mes_inventory_sections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  description text not null default '',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.mes_inventory_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  section_id uuid not null references public.mes_inventory_sections(id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  description text not null default '',
  quantity numeric(14, 3) not null default 0 check (quantity >= 0),
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mes_inventory_item_stations (
  inventory_item_id uuid not null references public.mes_inventory_items(id) on delete cascade,
  station_id uuid not null references public.mes_work_center_stations(id) on delete cascade,
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (inventory_item_id, station_id)
);

create index if not exists mes_inventory_items_section_idx on public.mes_inventory_items (section_id);
create index if not exists mes_inventory_item_stations_station_idx on public.mes_inventory_item_stations (station_id);

alter table public.mes_inventory_sections enable row level security;
alter table public.mes_inventory_items enable row level security;
alter table public.mes_inventory_item_stations enable row level security;

create policy "Members can manage inventory sections" on public.mes_inventory_sections for all
  using (public.is_manufacturing_organization_member(organization_id))
  with check (public.is_manufacturing_organization_member(organization_id));
create policy "Members can manage inventory items" on public.mes_inventory_items for all
  using (public.is_manufacturing_organization_member(organization_id))
  with check (public.is_manufacturing_organization_member(organization_id));
create policy "Members can manage inventory station links" on public.mes_inventory_item_stations for all
  using (public.is_manufacturing_organization_member(organization_id))
  with check (public.is_manufacturing_organization_member(organization_id));

grant select, insert, update, delete on public.mes_inventory_sections to authenticated;
grant select, insert, update, delete on public.mes_inventory_items to authenticated;
grant select, insert, update, delete on public.mes_inventory_item_stations to authenticated;

insert into storage.buckets (id, name, public)
values ('mes-inventory-images', 'mes-inventory-images', true)
on conflict (id) do update set public = true;

create policy "Organization members can upload inventory images" on storage.objects for insert to authenticated
with check (
  bucket_id = 'mes-inventory-images'
  and public.is_manufacturing_organization_member((storage.foldername(name))[1]::uuid)
);
create policy "Anyone can view inventory images" on storage.objects for select
using (bucket_id = 'mes-inventory-images');
create policy "Organization members can update inventory images" on storage.objects for update to authenticated
using (
  bucket_id = 'mes-inventory-images'
  and public.is_manufacturing_organization_member((storage.foldername(name))[1]::uuid)
);
create policy "Organization members can delete inventory images" on storage.objects for delete to authenticated
using (
  bucket_id = 'mes-inventory-images'
  and public.is_manufacturing_organization_member((storage.foldername(name))[1]::uuid)
);
