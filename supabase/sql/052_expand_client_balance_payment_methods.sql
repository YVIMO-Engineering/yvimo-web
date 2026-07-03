alter table public.mes_client_balance_movements
  drop constraint if exists mes_client_balance_movements_payment_method_check;

alter table public.mes_client_balance_movements
  add constraint mes_client_balance_movements_payment_method_check
  check (
    payment_method is null
    or payment_method in (
      'bank_transfer',
      'pos_terminal',
      'cash',
      'credit_card',
      'debit_card',
      'check',
      'bank_deposit',
      'payment_link',
      'online',
      'card',
      'other'
    )
  );
