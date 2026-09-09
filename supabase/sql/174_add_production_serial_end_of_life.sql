-- End of Life scrap.
--
-- A tool can arrive already dead: it reached its minimum life, its maximum number
-- of sharpenings, or it is physically broken beyond repair. That is decided while
-- the Production Order is being created (in "Assign Tool IDs and Serial Numbers"),
-- never at the Operator Terminal, so it is stored on the piece itself instead of
-- being inferred from the text an operator typed into a scrap event.
--
-- The Operation Cost Tracker reads these columns for its "End of Life" KPI, while
-- every scrap reported from the Operator Terminal now counts as Generated Scrap.

alter table public.mes_production_serials
  add column if not exists end_of_life boolean not null default false,
  add column if not exists end_of_life_reason text,
  add column if not exists end_of_life_notes text,
  add column if not exists end_of_life_at timestamptz,
  add column if not exists end_of_life_by uuid references auth.users(id) on delete set null;

comment on column public.mes_production_serials.end_of_life is
  'True when the piece was declared End of Life during Production Order intake. It is reversible: unchecking it clears the reason, the notes and the timestamp.';
comment on column public.mes_production_serials.end_of_life_reason is
  'Why the piece is End of Life (minimum life reached, body crack, etc.).';
comment on column public.mes_production_serials.end_of_life_at is
  'When End of Life was confirmed. The Operation Cost Tracker filters its period by this column.';

create index if not exists mes_production_serials_end_of_life_idx
  on public.mes_production_serials (organization_id, end_of_life_at desc)
  where end_of_life;
