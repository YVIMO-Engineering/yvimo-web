create table if not exists public.mes_production_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade default auth.uid(),
  order_number text not null,
  part_number text not null,
  part_name text not null,
  planned_quantity integer not null default 0 check (planned_quantity >= 0),
  completed_quantity integer not null default 0 check (completed_quantity >= 0),
  scrap_quantity integer not null default 0 check (scrap_quantity >= 0),
  status text not null default 'planned' check (status in ('planned', 'released', 'running', 'paused', 'completed', 'cancelled')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'expedite')),
  due_date date not null,
  assigned_work_center text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, order_number)
);

alter table public.mes_production_orders enable row level security;

create policy "Users can read their own MES production orders"
  on public.mes_production_orders
  for select
  using (auth.uid() = user_id);

create policy "Users can create their own MES production orders"
  on public.mes_production_orders
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own MES production orders"
  on public.mes_production_orders
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own MES production orders"
  on public.mes_production_orders
  for delete
  using (auth.uid() = user_id);

create index if not exists mes_production_orders_user_due_date_idx
  on public.mes_production_orders (user_id, due_date);

create index if not exists mes_production_orders_user_status_idx
  on public.mes_production_orders (user_id, status);

create or replace function public.set_mes_production_orders_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_mes_production_orders_updated_at on public.mes_production_orders;

create trigger set_mes_production_orders_updated_at
before update on public.mes_production_orders
for each row
execute function public.set_mes_production_orders_updated_at();
