alter table public.mes_production_orders
  add column if not exists piece_type text,
  add column if not exists quality_checks_enabled boolean not null default false,
  add column if not exists quality_checks text[] not null default '{}';

alter table public.mes_production_orders
  drop constraint if exists mes_production_orders_piece_type_check;

alter table public.mes_production_orders
  add constraint mes_production_orders_piece_type_check
  check (piece_type is null or piece_type in ('hobs', 'shaper', 'shavers', 'skiving'));

update public.mes_production_orders
set
  quality_checks_enabled = false,
  quality_checks = '{}'
where quality_checks_enabled is null
   or quality_checks is null;
