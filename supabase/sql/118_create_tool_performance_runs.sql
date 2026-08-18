create table if not exists public.mes_tool_performance_runs (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  tool_id text not null check (btrim(tool_id) <> ''), cutter_serial_number text not null check (btrim(cutter_serial_number) <> ''), part_number text not null default '',
  regrind_number integer not null check (regrind_number >= 0), tool_life integer not null check (tool_life >= 0), coating_type text not null default '', coating_batch text not null default '', coating_thickness numeric,
  machine text not null default '', run_date date not null, customer_name text not null default '', notes text not null default '', created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (organization_id, tool_id, cutter_serial_number, regrind_number, run_date)
);
create index if not exists mes_tool_performance_runs_study_idx on public.mes_tool_performance_runs (organization_id, lower(btrim(tool_id)), run_date, regrind_number);
alter table public.mes_tool_performance_runs enable row level security;
grant select, insert, update, delete on public.mes_tool_performance_runs to authenticated;
create policy "Members can manage tool performance runs" on public.mes_tool_performance_runs for all using (public.is_manufacturing_organization_member(organization_id)) with check (public.is_manufacturing_organization_member(organization_id));
create trigger set_mes_tool_performance_runs_updated_at before update on public.mes_tool_performance_runs for each row execute function public.set_updated_at();
