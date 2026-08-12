alter table public.mes_production_serials
  add column if not exists before_height numeric;

comment on column public.mes_production_serials.before_height is
  'Optional preassigned Before Sharpening height for Shaper pieces.';
