alter table public.mes_quotations
  drop constraint if exists mes_quotations_status_check;

alter table public.mes_quotations
  add constraint mes_quotations_status_check
  check (status in ('draft', 'sent', 'approved', 'declined'));
