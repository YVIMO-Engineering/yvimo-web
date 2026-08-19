alter table public.mes_quotations
  add column if not exists coating_provider text not null default 'Balzers';

alter table public.mes_quotations
  drop constraint if exists mes_quotations_coating_provider_check;

alter table public.mes_quotations
  add constraint mes_quotations_coating_provider_check
  check (coating_provider in ('Balzers', 'Voestalpine'));
