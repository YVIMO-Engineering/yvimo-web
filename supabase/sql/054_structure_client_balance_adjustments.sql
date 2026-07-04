alter table public.mes_client_balance_movements
  add column if not exists adjustment_type text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.mes_client_balance_movements
  drop constraint if exists mes_client_balance_movement_status_check,
  drop constraint if exists mes_client_balance_adjustment_type_check;

update public.mes_client_balance_movements
set status = 'void'
where movement_type = 'adjustment' and status = 'cancelled';

alter table public.mes_client_balance_movements
  add constraint mes_client_balance_movement_status_check check (
    (movement_type = 'charge' and status in ('open', 'partially_paid', 'paid', 'cancelled', 'disputed', 'written_off'))
    or (movement_type = 'payment' and status in ('pending_confirmation', 'confirmed', 'cancelled', 'refunded'))
    or (movement_type = 'credit' and status in ('confirmed', 'cancelled'))
    or (movement_type = 'adjustment' and status in ('draft', 'pending_approval', 'confirmed', 'void'))
  ),
  add constraint mes_client_balance_adjustment_type_check check (
    (movement_type = 'adjustment' and (adjustment_type is null or adjustment_type in (
      'opening_balance', 'billing_correction', 'late_fee', 'credit_reversal',
      'tax_fee_adjustment', 'other_increase', 'customer_credit', 'discount',
      'credit_note', 'write_off', 'refund_applied', 'other_decrease'
    )))
    or (movement_type <> 'adjustment' and adjustment_type is null)
  );

-- Rebuild historical running balances so legacy cancelled adjustments, now
-- represented as void, no longer contribute to the account balance.
with movement_balances as (
  select
    id,
    coalesce(sum(case
      when movement_type = 'adjustment' and status <> 'confirmed' then 0
      else charge_amount - payment_amount
    end) over (
      partition by account_id
      order by movement_date, created_at, id
      rows between unbounded preceding and 1 preceding
    ), 0) as recalculated_previous,
    sum(case
      when movement_type = 'adjustment' and status <> 'confirmed' then 0
      else charge_amount - payment_amount
    end) over (
      partition by account_id
      order by movement_date, created_at, id
      rows between unbounded preceding and current row
    ) as recalculated_new
  from public.mes_client_balance_movements
)
update public.mes_client_balance_movements movement
set
  previous_balance = balances.recalculated_previous,
  new_balance = balances.recalculated_new
from movement_balances balances
where balances.id = movement.id;

update public.mes_client_balance_accounts account
set current_balance = coalesce((
  select sum(case
    when movement.movement_type = 'adjustment' and movement.status <> 'confirmed' then 0
    else movement.charge_amount - movement.payment_amount
  end)
  from public.mes_client_balance_movements movement
  where movement.account_id = account.id
), 0);

drop trigger if exists set_mes_client_balance_movements_updated_at on public.mes_client_balance_movements;
create trigger set_mes_client_balance_movements_updated_at
before update on public.mes_client_balance_movements
for each row execute function public.set_updated_at();

drop function if exists public.mes_add_client_balance_movement(
  uuid, uuid, text, date, text, numeric, text, text, text, text, text, boolean, text, text, text, text, text
);

create function public.mes_add_client_balance_movement(
  p_organization_id uuid,
  p_customer_id uuid,
  p_movement_type text,
  p_movement_date date,
  p_description text,
  p_amount numeric,
  p_category text default null,
  p_adjustment_direction text default null,
  p_payment_method text default null,
  p_payment_reference text default null,
  p_delivery_note_number text default null,
  p_invoice_required boolean default false,
  p_invoice_status text default 'not_required',
  p_billing_name text default null,
  p_invoice_uuid text default null,
  p_status text default null,
  p_notes text default '',
  p_adjustment_type text default null
)
returns public.mes_client_balance_movements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.mes_client_balance_accounts%rowtype;
  v_movement public.mes_client_balance_movements%rowtype;
  v_charge numeric(18, 2) := 0;
  v_payment numeric(18, 2) := 0;
  v_previous numeric(18, 2);
  v_new numeric(18, 2);
  v_status text;
  v_invoice_status text;
  v_affects_balance boolean;
begin
  if auth.uid() is null or not public.is_manufacturing_organization_member(p_organization_id) then
    raise exception 'You do not have access to this organization.';
  end if;

  if not exists (
    select 1 from public.mes_customers customer
    where customer.id = p_customer_id and customer.organization_id = p_organization_id
  ) then
    raise exception 'The selected customer does not belong to this organization.';
  end if;

  if p_movement_type not in ('charge', 'payment', 'credit', 'adjustment') then
    raise exception 'Invalid movement type.';
  end if;
  if p_movement_date is null then raise exception 'Date is required.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be greater than zero.'; end if;
  if nullif(btrim(p_description), '') is null then raise exception 'Description is required.'; end if;

  if p_movement_type = 'adjustment' then
    if p_adjustment_direction not in ('increase', 'decrease') then
      raise exception 'Adjustment direction is required.';
    end if;
    if p_adjustment_type is null then
      raise exception 'Adjustment type is required.';
    end if;
    if p_adjustment_direction = 'increase' and p_adjustment_type not in (
      'opening_balance', 'billing_correction', 'late_fee', 'credit_reversal',
      'tax_fee_adjustment', 'other_increase'
    ) then
      raise exception 'The selected adjustment type cannot increase the balance.';
    end if;
    if p_adjustment_direction = 'decrease' and p_adjustment_type not in (
      'customer_credit', 'discount', 'credit_note', 'write_off',
      'billing_correction', 'refund_applied', 'other_decrease'
    ) then
      raise exception 'The selected adjustment type cannot decrease the balance.';
    end if;
  end if;

  v_status := coalesce(p_status, case when p_movement_type = 'charge' then 'open' else 'confirmed' end);
  if p_movement_type = 'adjustment' and v_status not in ('draft', 'pending_approval', 'confirmed', 'void') then
    raise exception 'Invalid adjustment status.';
  end if;

  if p_movement_type = 'charge'
    or (p_movement_type = 'adjustment' and p_adjustment_direction = 'increase') then
    v_charge := round(p_amount, 2);
  else
    v_payment := round(p_amount, 2);
  end if;

  -- Non-confirmed adjustments remain visible but carry a zero accounting delta.
  v_affects_balance := p_movement_type <> 'adjustment' or v_status = 'confirmed';
  v_invoice_status := case
    when p_invoice_required then coalesce(nullif(p_invoice_status, 'not_required'), 'pending')
    else 'not_required'
  end;

  insert into public.mes_client_balance_accounts (organization_id, customer_id)
  values (p_organization_id, p_customer_id)
  on conflict (organization_id, customer_id, currency) do nothing;

  select * into v_account
  from public.mes_client_balance_accounts
  where organization_id = p_organization_id and customer_id = p_customer_id and currency = 'MXN'
  for update;

  v_previous := v_account.current_balance;
  v_new := v_previous + case when v_affects_balance then v_charge - v_payment else 0 end;

  insert into public.mes_client_balance_movements (
    organization_id, customer_id, account_id, movement_date, movement_type,
    adjustment_direction, adjustment_type, category, description, amount,
    charge_amount, payment_amount, previous_balance, new_balance, payment_method,
    payment_reference, delivery_note_number, invoice_required, invoice_status,
    billing_name, invoice_uuid, status, notes, created_by
  ) values (
    p_organization_id, p_customer_id, v_account.id, p_movement_date, p_movement_type,
    case when p_movement_type = 'adjustment' then p_adjustment_direction else null end,
    case when p_movement_type = 'adjustment' then p_adjustment_type else null end,
    case when p_movement_type = 'charge' then p_category else null end,
    btrim(p_description), round(p_amount, 2), v_charge, v_payment, v_previous, v_new,
    p_payment_method, nullif(btrim(p_payment_reference), ''),
    nullif(btrim(p_delivery_note_number), ''), p_invoice_required, v_invoice_status,
    nullif(btrim(p_billing_name), ''), nullif(btrim(p_invoice_uuid), ''),
    v_status, coalesce(p_notes, ''), auth.uid()
  ) returning * into v_movement;

  update public.mes_client_balance_accounts
  set
    current_balance = v_new,
    total_charges = total_charges + case when p_movement_type = 'charge' then v_charge else 0 end,
    total_payments = total_payments + case when p_movement_type = 'payment' then v_payment else 0 end,
    uninvoiced_balance = uninvoiced_balance + case
      when p_movement_type = 'charge' and p_invoice_required and v_invoice_status = 'pending' then v_charge
      else 0
    end
  where id = v_account.id;

  return v_movement;
end;
$$;

revoke all on function public.mes_add_client_balance_movement(
  uuid, uuid, text, date, text, numeric, text, text, text, text, text, boolean, text, text, text, text, text, text
) from public;
grant execute on function public.mes_add_client_balance_movement(
  uuid, uuid, text, date, text, numeric, text, text, text, text, text, boolean, text, text, text, text, text, text
) to authenticated;
