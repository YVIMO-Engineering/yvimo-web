alter table public.mes_inventory_items
  add column if not exists item_key text not null default '',
  add column if not exists supplier_key text not null default '',
  add column if not exists application_alias text not null default '',
  add column if not exists supplier text not null default '';

comment on column public.mes_inventory_items.item_key is
  'Internal inventory item key.';
comment on column public.mes_inventory_items.supplier_key is
  'Item key or part number assigned by the supplier.';
comment on column public.mes_inventory_items.application_alias is
  'Application, common name, or alias used to identify the item.';
comment on column public.mes_inventory_items.supplier is
  'Supplier name for the inventory item.';

create index if not exists mes_inventory_items_item_key_idx
  on public.mes_inventory_items (organization_id, item_key);
