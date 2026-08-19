alter table public.mes_production_serials
  add column if not exists verified_quotation_price numeric(12,2),
  add column if not exists quotation_damage_inches numeric,
  add column if not exists quotation_damage_match boolean;

comment on column public.mes_production_serials.verified_quotation_price is
  'Immutable quotation price snapshot verified against the piece stock-to-remove value.';
comment on column public.mes_production_serials.quotation_damage_inches is
  'Stock-to-remove value in inches used to verify or reprocess the linked quotation.';

-- Existing linked pieces receive the same deterministic snapshot used by the UI.
-- Damage values are normalized to inches throughout quotation pricing.
update public.mes_production_serials s
set
  quotation_damage_inches = s.stock_to_remove,
  quotation_damage_match = abs(coalesce(s.stock_to_remove, 0) - q.damage_inches) < 0.0005,
  verified_quotation_price = round((
    q.total_price - q.damage_surcharge +
    case coalesce(settings.method, 'standard')
      when 'waived' then 0
      when 'fixed' then q.damage_surcharge
      when 'percentage' then q.machine_price
        * case when coalesce(s.stock_to_remove, 0) > 0.02 then ceil((s.stock_to_remove - 0.02) / 0.01) else 0 end
        * coalesce(settings.percent, 25) / 100
      else q.machine_price
        * case when coalesce(s.stock_to_remove, 0) > 0.02 then ceil((s.stock_to_remove - 0.02) / 0.01) else 0 end
        * 0.25
    end
  )::numeric, 2)
from public.mes_quotations q
left join lateral (
  select
    coalesce(nullif(i.notes, '')::jsonb ->> 'method', 'standard') as method,
    coalesce((nullif(i.notes, '')::jsonb ->> 'percent')::numeric, 25) as percent
  from public.mes_quotation_items i
  where i.quotation_id = q.id and i.category = 'damage_surcharge'
  order by i.sort_order desc
  limit 1
) settings on true
where s.quotation_id = q.id
  and s.stock_to_remove is not null
  and s.verified_quotation_price is null;
