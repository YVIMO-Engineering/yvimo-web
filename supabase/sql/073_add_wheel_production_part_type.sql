alter table public.mes_production_orders
  drop constraint if exists mes_production_orders_piece_type_check;

alter table public.mes_production_orders
  add constraint mes_production_orders_piece_type_check
  check (piece_type is null or piece_type in ('hobs', 'shaper', 'shavers', 'skiving', 'wheel'));
