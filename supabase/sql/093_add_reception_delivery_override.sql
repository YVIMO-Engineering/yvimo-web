create or replace function public.force_customer_reception_waiting_delivery(
  p_reception_id uuid,
  p_confirmation_code text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_organization_id uuid;
begin
  if p_confirmation_code is distinct from '1590' then
    raise exception 'Invalid confirmation code';
  end if;

  select organization_id
  into v_organization_id
  from public.mes_customer_reception_vouchers
  where id = p_reception_id;

  if v_organization_id is null
    or not public.is_manufacturing_organization_member(v_organization_id) then
    raise exception 'Reception voucher not found or access denied';
  end if;

  update public.mes_customer_reception_vouchers
  set
    status = 'waiting-delivery',
    updated_at = now()
  where id = p_reception_id;
end;
$$;

grant execute on function public.force_customer_reception_waiting_delivery(uuid, text) to authenticated;

