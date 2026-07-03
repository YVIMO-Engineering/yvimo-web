create table if not exists public.mes_client_balance_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  customer_id uuid not null references public.mes_customers(id) on delete cascade,
  currency text not null default 'MXN' check (currency = 'MXN'),
  current_balance numeric(18, 2) not null default 0,
  total_charges numeric(18, 2) not null default 0 check (total_charges >= 0),
  total_payments numeric(18, 2) not null default 0 check (total_payments >= 0),
  uninvoiced_balance numeric(18, 2) not null default 0 check (uninvoiced_balance >= 0),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, customer_id, currency)
);

create table if not exists public.mes_client_balance_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.manufacturing_organizations(id) on delete cascade,
  customer_id uuid not null references public.mes_customers(id) on delete restrict,
  account_id uuid not null references public.mes_client_balance_accounts(id) on delete restrict,
  movement_date date not null default current_date,
  movement_type text not null check (movement_type in ('charge', 'payment', 'credit', 'adjustment')),
  adjustment_direction text check (adjustment_direction in ('increase', 'decrease')),
  category text check (category in ('purchase', 'service', 'repair', 'production_order', 'installation', 'freight', 'other')),
  description text not null check (length(btrim(description)) > 0),
  amount numeric(18, 2) not null check (amount > 0),
  charge_amount numeric(18, 2) not null default 0 check (charge_amount >= 0),
  payment_amount numeric(18, 2) not null default 0 check (payment_amount >= 0),
  previous_balance numeric(18, 2) not null,
  new_balance numeric(18, 2) not null,
  currency text not null default 'MXN' check (currency = 'MXN'),
  payment_method text check (payment_method in (
    'bank_transfer', 'pos_terminal', 'cash', 'credit_card', 'debit_card',
    'check', 'bank_deposit', 'payment_link', 'online', 'card', 'other'
  )),
  payment_reference text,
  delivery_note_number text,
  invoice_required boolean not null default false,
  invoice_status text not null default 'not_required'
    check (invoice_status in ('pending', 'issued', 'not_required', 'cancelled')),
  billing_name text,
  invoice_uuid text,
  status text not null,
  notes text not null default '',
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint mes_client_balance_movement_status_check check (
    (movement_type = 'charge' and status in ('open', 'partially_paid', 'paid', 'cancelled', 'disputed', 'written_off'))
    or (movement_type = 'payment' and status in ('pending_confirmation', 'confirmed', 'cancelled', 'refunded'))
    or (movement_type in ('credit', 'adjustment') and status in ('confirmed', 'cancelled'))
  ),
  constraint mes_client_balance_adjustment_direction_check check (
    (movement_type = 'adjustment' and adjustment_direction is not null)
    or (movement_type <> 'adjustment' and adjustment_direction is null)
  )
);

create index if not exists mes_client_balance_accounts_customer_idx
  on public.mes_client_balance_accounts (organization_id, customer_id);

create index if not exists mes_client_balance_movements_customer_date_idx
  on public.mes_client_balance_movements (organization_id, customer_id, movement_date desc, created_at desc);

create index if not exists mes_client_balance_movements_open_charge_idx
  on public.mes_client_balance_movements (organization_id, customer_id, status)
  where movement_type = 'charge';

alter table public.mes_client_balance_accounts enable row level security;
alter table public.mes_client_balance_movements enable row level security;

grant select on public.mes_client_balance_accounts to authenticated;
grant select on public.mes_client_balance_movements to authenticated;

drop policy if exists "Members can read client balance accounts" on public.mes_client_balance_accounts;
create policy "Members can read client balance accounts"
  on public.mes_client_balance_accounts for select
  using (public.is_manufacturing_organization_member(organization_id));

drop policy if exists "Members can read client balance movements" on public.mes_client_balance_movements;
create policy "Members can read client balance movements"
  on public.mes_client_balance_movements for select
  using (public.is_manufacturing_organization_member(organization_id));

drop trigger if exists set_mes_client_balance_accounts_updated_at on public.mes_client_balance_accounts;
create trigger set_mes_client_balance_accounts_updated_at
before update on public.mes_client_balance_accounts
for each row execute function public.set_updated_at();

create or replace function public.mes_add_client_balance_movement(
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
  p_notes text default ''
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
begin
  if auth.uid() is null or not public.is_manufacturing_organization_member(p_organization_id) then
    raise exception 'You do not have access to this organization.';
  end if;

  if not exists (
    select 1
    from public.mes_customers customer
    where customer.id = p_customer_id
      and customer.organization_id = p_organization_id
  ) then
    raise exception 'The selected customer does not belong to this organization.';
  end if;

  if p_movement_type not in ('charge', 'payment', 'credit', 'adjustment') then
    raise exception 'Invalid movement type.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero.';
  end if;

  if nullif(btrim(p_description), '') is null then
    raise exception 'Description is required.';
  end if;

  if p_movement_type = 'adjustment' and p_adjustment_direction not in ('increase', 'decrease') then
    raise exception 'Adjustment direction is required.';
  end if;

  v_status := coalesce(
    p_status,
    case
      when p_movement_type = 'charge' then 'open'
      else 'confirmed'
    end
  );

  if p_movement_type = 'charge' or (p_movement_type = 'adjustment' and p_adjustment_direction = 'increase') then
    v_charge := round(p_amount, 2);
  else
    v_payment := round(p_amount, 2);
  end if;

  v_invoice_status := case
    when p_invoice_required then coalesce(nullif(p_invoice_status, 'not_required'), 'pending')
    else 'not_required'
  end;

  insert into public.mes_client_balance_accounts (organization_id, customer_id)
  values (p_organization_id, p_customer_id)
  on conflict (organization_id, customer_id, currency) do nothing;

  select *
    into v_account
  from public.mes_client_balance_accounts
  where organization_id = p_organization_id
    and customer_id = p_customer_id
    and currency = 'MXN'
  for update;

  v_previous := v_account.current_balance;
  v_new := v_previous + v_charge - v_payment;

  insert into public.mes_client_balance_movements (
    organization_id,
    customer_id,
    account_id,
    movement_date,
    movement_type,
    adjustment_direction,
    category,
    description,
    amount,
    charge_amount,
    payment_amount,
    previous_balance,
    new_balance,
    payment_method,
    payment_reference,
    delivery_note_number,
    invoice_required,
    invoice_status,
    billing_name,
    invoice_uuid,
    status,
    notes,
    created_by
  )
  values (
    p_organization_id,
    p_customer_id,
    v_account.id,
    coalesce(p_movement_date, current_date),
    p_movement_type,
    case when p_movement_type = 'adjustment' then p_adjustment_direction else null end,
    case when p_movement_type = 'charge' then p_category else null end,
    btrim(p_description),
    round(p_amount, 2),
    v_charge,
    v_payment,
    v_previous,
    v_new,
    p_payment_method,
    nullif(btrim(p_payment_reference), ''),
    nullif(btrim(p_delivery_note_number), ''),
    p_invoice_required,
    v_invoice_status,
    nullif(btrim(p_billing_name), ''),
    nullif(btrim(p_invoice_uuid), ''),
    v_status,
    coalesce(p_notes, ''),
    auth.uid()
  )
  returning * into v_movement;

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
  uuid, uuid, text, date, text, numeric, text, text, text, text, text, boolean, text, text, text, text, text
) from public;

grant execute on function public.mes_add_client_balance_movement(
  uuid, uuid, text, date, text, numeric, text, text, text, text, text, boolean, text, text, text, text, text
) to authenticated;
