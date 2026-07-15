alter table public.mes_operator_terminal_events
  drop constraint if exists mes_operator_terminal_events_event_type_check;

alter table public.mes_operator_terminal_events
  add constraint mes_operator_terminal_events_event_type_check
  check (
    event_type in (
      'job-started',
      'job-resumed',
      'job-paused',
      'downtime-started',
      'production-good',
      'production-scrap',
      'manufacturing-completed',
      'operation-completed',
      'traceability-saved',
      'quality-inspection-saved',
      'measurement-corrected',
      'adjustment'
    )
  );

drop policy if exists "Members can update MES production serials" on public.mes_production_serials;
create policy "Members can update MES production serials"
  on public.mes_production_serials
  for update
  using (public.is_manufacturing_organization_member(organization_id))
  with check (public.is_manufacturing_organization_member(organization_id));

grant update on public.mes_production_serials to authenticated;
