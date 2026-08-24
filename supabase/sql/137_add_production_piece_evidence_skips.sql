create table if not exists public.mes_production_piece_evidence_skips (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  production_order_id uuid not null references public.mes_production_orders(id) on delete cascade,
  production_serial_id uuid not null references public.mes_production_serials(id) on delete cascade,
  stage text not null check (stage in ('after-sharpening', 'after-coating')),
  skipped_by uuid references auth.users(id) on delete set null default auth.uid(),
  skipped_at timestamptz not null default now(),
  unique (production_serial_id, stage)
);

create index if not exists mes_production_piece_evidence_skips_order_idx
  on public.mes_production_piece_evidence_skips (production_order_id, production_serial_id, stage);

alter table public.mes_production_piece_evidence_skips enable row level security;

drop policy if exists "Members can read production piece evidence skips" on public.mes_production_piece_evidence_skips;
create policy "Members can read production piece evidence skips"
  on public.mes_production_piece_evidence_skips for select
  using (public.is_manufacturing_organization_member(organization_id));

grant select on public.mes_production_piece_evidence_skips to authenticated;

create or replace function public.skip_production_piece_evidence(
  p_organization_id uuid,
  p_production_order_id uuid,
  p_production_serial_id uuid,
  p_stage text,
  p_confirmation_code text
)
returns public.mes_production_piece_evidence_skips
language plpgsql
security definer
set search_path = public
as $$
declare
  v_skip public.mes_production_piece_evidence_skips;
begin
  if coalesce(p_confirmation_code, '') <> '1590' then
    raise exception using errcode = '22023', message = 'Invalid confirmation code.';
  end if;

  if not public.is_manufacturing_organization_member(p_organization_id) then
    raise exception using errcode = '42501', message = 'You do not have access to this organization.';
  end if;

  if p_stage not in ('after-sharpening', 'after-coating') then
    raise exception using errcode = '22023', message = 'Invalid evidence stage.';
  end if;

  if not exists (
    select 1
    from public.mes_production_serials serial
    where serial.id = p_production_serial_id
      and serial.production_order_id = p_production_order_id
      and serial.organization_id = p_organization_id
  ) then
    raise exception using errcode = 'P0002', message = 'Production serial was not found.';
  end if;

  insert into public.mes_production_piece_evidence_skips (
    organization_id, production_order_id, production_serial_id, stage, skipped_by, skipped_at
  ) values (
    p_organization_id, p_production_order_id, p_production_serial_id, p_stage, auth.uid(), now()
  )
  on conflict (production_serial_id, stage) do update
  set skipped_by = auth.uid(), skipped_at = now()
  returning * into v_skip;

  return v_skip;
end;
$$;

revoke all on function public.skip_production_piece_evidence(uuid, uuid, uuid, text, text) from public;
grant execute on function public.skip_production_piece_evidence(uuid, uuid, uuid, text, text) to authenticated;
