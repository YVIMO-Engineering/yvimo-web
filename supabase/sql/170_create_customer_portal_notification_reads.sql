create table if not exists public.customer_portal_notification_reads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  customer_id uuid not null references public.mes_customers(id) on delete cascade,
  notification_key text not null check (length(btrim(notification_key)) > 0),
  acknowledged_at timestamptz not null default now(),
  unique (user_id, notification_key)
);

create index if not exists customer_portal_notification_reads_scope_idx
  on public.customer_portal_notification_reads (user_id, organization_id, customer_id);

alter table public.customer_portal_notification_reads enable row level security;

drop policy if exists "Portal users can read their notification acknowledgements"
  on public.customer_portal_notification_reads;
create policy "Portal users can read their notification acknowledgements"
  on public.customer_portal_notification_reads
  for select
  using (user_id = auth.uid());

drop policy if exists "Portal users can acknowledge their notifications"
  on public.customer_portal_notification_reads;
create policy "Portal users can acknowledge their notifications"
  on public.customer_portal_notification_reads
  for insert
  with check (
    user_id = auth.uid()
    and public.customer_portal_has_permission(organization_id, customer_id, 'orders')
  );

drop policy if exists "Portal users can undo their notification acknowledgements"
  on public.customer_portal_notification_reads;
create policy "Portal users can undo their notification acknowledgements"
  on public.customer_portal_notification_reads
  for delete
  using (user_id = auth.uid());

grant select, insert, delete on public.customer_portal_notification_reads to authenticated;

alter table public.customer_portal_notification_reads replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'customer_portal_notification_reads'
  ) then
    alter publication supabase_realtime
      add table public.customer_portal_notification_reads;
  end if;
end;
$$;
