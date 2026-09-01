alter table public.mes_production_piece_evidence
  drop constraint if exists mes_production_piece_evidence_stage_check;

alter table public.mes_production_piece_evidence
  add constraint mes_production_piece_evidence_stage_check
  check (stage in ('reception', 'after-sharpening', 'after-coating', 'after-delivery'));

alter table public.mes_production_piece_evidence_skips
  drop constraint if exists mes_production_piece_evidence_skips_stage_check;

alter table public.mes_production_piece_evidence_skips
  add constraint mes_production_piece_evidence_skips_stage_check
  check (stage in ('after-sharpening', 'after-coating', 'after-delivery'));

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
  if p_stage not in ('after-sharpening', 'after-coating', 'after-delivery') then
    raise exception using errcode = '22023', message = 'Invalid evidence stage.';
  end if;
  if not exists (
    select 1 from public.mes_production_serials serial
    where serial.id = p_production_serial_id
      and serial.production_order_id = p_production_order_id
      and serial.organization_id = p_organization_id
  ) then
    raise exception using errcode = 'P0002', message = 'Production serial was not found.';
  end if;
  insert into public.mes_production_piece_evidence_skips (
    organization_id, production_order_id, production_serial_id, stage, skipped_by, skipped_at
  ) values (p_organization_id, p_production_order_id, p_production_serial_id, p_stage, auth.uid(), now())
  on conflict (production_serial_id, stage) do update set skipped_by = auth.uid(), skipped_at = now()
  returning * into v_skip;
  return v_skip;
end;
$$;

drop policy if exists "Portal users can read assigned production evidence" on public.mes_production_piece_evidence;
create policy "Portal users can read assigned production evidence"
on public.mes_production_piece_evidence for select
using (
  public.customer_portal_has_permission(
    organization_id,
    (select production_order.customer_id from public.mes_production_orders production_order where production_order.id = production_order_id),
    'orders'
  )
);

drop policy if exists "Portal users can read assigned production evidence files" on storage.objects;
create policy "Portal users can read assigned production evidence files"
on storage.objects for select
using (
  bucket_id = 'mes-production-piece-evidence'
  and public.customer_portal_has_permission(
    ((storage.foldername(name))[1])::uuid,
    (select production_order.customer_id from public.mes_production_orders production_order where production_order.id = ((storage.foldername(name))[2])::uuid),
    'orders'
  )
);
