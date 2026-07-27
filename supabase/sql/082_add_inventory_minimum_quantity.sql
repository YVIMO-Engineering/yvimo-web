alter table public.mes_inventory_items
  add column if not exists minimum_quantity numeric(14, 3) not null default 0
  check (minimum_quantity >= 0);

comment on column public.mes_inventory_items.minimum_quantity is
  'Minimum desired stock. Current quantity below, at, or above this value drives the inventory status color.';
