import React from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Download,
  FileCheck2,
  Plus,
  ReceiptText,
  Search,
  SlidersHorizontal,
  WalletCards,
  X,
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

export type BalanceCustomer = {
  id: string;
  customerName: string;
  legalName: string;
  status: 'active' | 'inactive';
};

type BalanceAccount = {
  id: string;
  current_balance: number;
  total_charges: number;
  total_payments: number;
  uninvoiced_balance: number;
};

type MovementType = 'charge' | 'payment' | 'credit' | 'adjustment';
type BalanceView = 'statement' | 'open' | 'payments' | 'invoices';
type MovementFormMode = 'charge' | 'payment' | 'adjustment';

type BalanceMovement = {
  id: string;
  movement_date: string;
  movement_type: MovementType;
  adjustment_direction: 'increase' | 'decrease' | null;
  category: string | null;
  description: string;
  amount: number;
  charge_amount: number;
  payment_amount: number;
  previous_balance: number;
  new_balance: number;
  currency: string;
  payment_method: string | null;
  payment_reference: string | null;
  delivery_note_number: string | null;
  invoice_required: boolean;
  invoice_status: string;
  billing_name: string | null;
  invoice_uuid: string | null;
  status: string;
  notes: string;
  created_at: string;
};

type MovementForm = {
  date: string;
  category: string;
  description: string;
  amount: string;
  paymentMethod: string;
  paymentReference: string;
  deliveryNote: string;
  invoiceRequired: boolean;
  invoiceStatus: string;
  billingName: string;
  invoiceUuid: string;
  status: string;
  direction: 'increase' | 'decrease';
  notes: string;
};

type ClientBalancesWorkspaceProps = {
  organizationId: string;
  customers: BalanceCustomer[];
  loadingCustomers: boolean;
  customerError: string;
  onRetryCustomers: () => void;
};

type BalanceDateRange = { from: string; to: string };
type BalanceCalendarPosition = { top: number; left: number; width: number };

type ClientAccountMenuPosition = { top: number; left: number; width: number; maxHeight: number };

const customerSelectionKey = 'yvimo:mes:clients:balance-customer';

const categoryLabels: Record<string, string> = {
  purchase: 'Purchase',
  service: 'Service',
  repair: 'Repair',
  production_order: 'Production Order',
  installation: 'Installation',
  freight: 'Freight',
  other: 'Other',
};

const movementLabels: Record<MovementType, string> = {
  charge: 'Charge',
  payment: 'Payment',
  credit: 'Credit',
  adjustment: 'Adjustment',
};

const paymentMethodLabels: Record<string, string> = {
  bank_transfer: 'Bank Transfer',
  pos_terminal: 'POS Terminal (Terminal PV)',
  cash: 'Cash',
  credit_card: 'Credit Card (TDC)',
  debit_card: 'Debit Card (TDD)',
  check: 'Check',
  bank_deposit: 'Bank Deposit',
  payment_link: 'Payment Link',
  online: 'Online Payment',
  card: 'Card (Legacy)',
  other: 'Other',
};

const invoiceStatusLabels: Record<string, string> = {
  pending: 'Pending',
  issued: 'Issued',
  not_required: 'Not Required',
  cancelled: 'Cancelled',
};

const initialForm = (customer?: BalanceCustomer): MovementForm => ({
  date: new Date().toISOString().slice(0, 10),
  category: 'service',
  description: '',
  amount: '',
  paymentMethod: 'bank_transfer',
  paymentReference: '',
  deliveryNote: '',
  invoiceRequired: false,
  invoiceStatus: 'not_required',
  billingName: customer?.legalName || customer?.customerName || '',
  invoiceUuid: '',
  status: 'open',
  direction: 'increase',
  notes: '',
});

const moneyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 2,
});
function parseMoneyInput(value: string) {
  const parsed = Number(value.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoneyWhileTyping(value: string) {
  const cleanValue = value.replace(/,/g, '').replace(/[^\d.]/g, '');
  if (!cleanValue) return '';

  const decimalIndex = cleanValue.indexOf('.');
  const hasDecimalPoint = decimalIndex >= 0;
  const wholeInput = hasDecimalPoint ? cleanValue.slice(0, decimalIndex) : cleanValue;
  const decimalInput = hasDecimalPoint
    ? cleanValue.slice(decimalIndex + 1).replace(/\./g, '').slice(0, 2)
    : '';
  const normalizedWhole = wholeInput.replace(/^0+(?=\d)/, '') || '0';
  const groupedWhole = normalizedWhole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  return hasDecimalPoint ? `${groupedWhole}.${decimalInput}` : groupedWhole;
}

function formatMoneyOnBlur(value: string) {
  if (!value.trim()) return '';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parseMoneyInput(value));
}


function money(value: number | string | null | undefined) {
  return moneyFormatter.format(Number(value ?? 0));
}

function ledgerBalanceLabel(value: number | string | null | undefined) {
  const balance = Number(value ?? 0);
  return balance < 0 ? `${money(Math.abs(balance))} credit` : money(balance);
}

function dateLabel(value: string) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
    .format(new Date(`${value.slice(0, 10)}T12:00:00`));
}

function SelectField({
  value,
  onChange,
  children,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  ariaLabel?: string;
}) {
  return (
    <span className="client-balance-select">
      <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={ariaLabel}>
        {children}
      </select>
      <ChevronDown size={15} />
    </span>
  );
}

function toBalanceIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatBalanceDateInput(value: string) {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  return year && month && day ? `${month}/${day}/${year}` : value;
}

function getBalanceMonthDates(displayDate: Date) {
  const firstDay = new Date(displayDate.getFullYear(), displayDate.getMonth(), 1);
  const firstGridDate = new Date(displayDate.getFullYear(), displayDate.getMonth(), 1 - firstDay.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstGridDate);
    date.setDate(firstGridDate.getDate() + index);
    return date;
  });
}

function getBalanceQuickRange(value: 'today' | 'week' | 'month' | 'year'): BalanceDateRange {
  const today = new Date();
  const startDate = new Date(today);
  if (value === 'week') startDate.setDate(today.getDate() - today.getDay());
  if (value === 'month') startDate.setDate(1);
  if (value === 'year') startDate.setMonth(0, 1);
  return { from: toBalanceIsoDate(startDate), to: toBalanceIsoDate(today) };
}

function BalanceDatePicker({
  id,
  value,
  placeholder,
  onChange,
  onQuickRange,
}: {
  id: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onQuickRange?: (range: BalanceDateRange) => void;
}) {
  const selectedDate = React.useMemo(() => value ? new Date(`${value}T12:00:00`) : new Date(), [value]);
  const [open, setOpen] = React.useState(false);
  const [displayDate, setDisplayDate] = React.useState(selectedDate);
  const [position, setPosition] = React.useState<BalanceCalendarPosition | null>(null);
  const triggerRef = React.useRef<HTMLDivElement | null>(null);
  const calendarRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => setDisplayDate(selectedDate), [selectedDate]);

  const updatePosition = React.useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 16;
    const width = Math.min(Math.max(rect.width, 312), window.innerWidth - (viewportPadding * 2));
    const calendarHeight = onQuickRange ? 454 : 374;
    const availableBelow = window.innerHeight - rect.bottom - viewportPadding;
    const availableAbove = rect.top - viewportPadding;
    const openUp = availableBelow < calendarHeight && availableAbove > availableBelow;
    setPosition({
      top: openUp ? Math.max(viewportPadding, rect.top - calendarHeight) : rect.bottom + 6,
      left: Math.max(viewportPadding, Math.min(rect.left, window.innerWidth - width - viewportPadding)),
      width,
    });
  }, [onQuickRange]);

  React.useLayoutEffect(() => {
    if (open) updatePosition();
  }, [open, updatePosition]);

  React.useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !calendarRef.current?.contains(target)) setOpen(false);
    };
    const reposition = () => updatePosition();
    document.addEventListener('mousedown', closeOutside);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('mousedown', closeOutside);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, updatePosition]);

  const selectedIsoDate = value || '';
  const todayIsoDate = toBalanceIsoDate(new Date());
  const monthDates = getBalanceMonthDates(displayDate);
  const calendar = open && position
    ? createPortal(
      <div className="mes-order-calendar client-balance-calendar" id={`${id}-calendar`} ref={calendarRef} style={position}>
        <div className="mes-order-calendar-header">
          <button type="button" onClick={() => setDisplayDate((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))} aria-label="Previous month"><ChevronLeft size={16} /></button>
          <strong>{new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(displayDate)}</strong>
          <button type="button" onClick={() => setDisplayDate((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))} aria-label="Next month"><ChevronRight size={16} /></button>
        </div>
        <div className="mes-order-calendar-weekdays" aria-hidden="true">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day}>{day}</span>)}
        </div>
        <div className="mes-order-calendar-grid">
          {monthDates.map((date) => {
            const isoDate = toBalanceIsoDate(date);
            return (
              <button
                type="button"
                key={isoDate}
                className={[
                  date.getMonth() !== displayDate.getMonth() ? 'outside-month' : '',
                  isoDate === selectedIsoDate ? 'selected' : '',
                  isoDate === todayIsoDate ? 'today' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => { onChange(isoDate); setOpen(false); }}
              >
                {date.getDate()}
              </button>
            );
          })}
        </div>
        {onQuickRange ? <div className="mes-order-calendar-shortcuts">
          {([
            ['today', 'Today'],
            ['week', 'This week'],
            ['month', 'This month'],
            ['year', 'This year'],
          ] as const).map(([range, label]) => (
            <button type="button" key={range} onClick={() => { onQuickRange(getBalanceQuickRange(range)); setOpen(false); }}>{label}</button>
          ))}
        </div> : null}
      </div>,
      document.body,
    )
    : null;

  return (
    <div className={`mes-order-date-picker client-balance-date-picker${open ? ' open' : ''}`} ref={triggerRef}>
      <button type="button" className={!value ? 'placeholder' : ''} aria-expanded={open} aria-controls={`${id}-calendar`} onClick={() => setOpen((current) => !current)}>
        <span>{value ? formatBalanceDateInput(value) : placeholder}</span>
        <CalendarDays size={16} />
      </button>
      {calendar}
    </div>
  );
}

function ClientAccountDropdown({
  value,
  customers,
  onChange,
}: {
  value: string;
  customers: BalanceCustomer[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [position, setPosition] = React.useState<ClientAccountMenuPosition | null>(null);
  const triggerRef = React.useRef<HTMLDivElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const selectedCustomer = customers.find((customer) => customer.id === value);

  const updatePosition = React.useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 16;
    const availableBelow = window.innerHeight - rect.bottom - viewportPadding;
    const availableAbove = rect.top - viewportPadding;
    const desiredHeight = Math.min(240, Math.max(48, (customers.length * 40) + 12));
    const openUp = availableBelow < desiredHeight && availableAbove > availableBelow;
    const maxHeight = Math.max(48, Math.min(desiredHeight, openUp ? availableAbove - 6 : availableBelow - 6));
    const width = Math.min(rect.width, window.innerWidth - (viewportPadding * 2));

    setPosition({
      top: openUp ? Math.max(viewportPadding, rect.top - maxHeight - 6) : rect.bottom + 6,
      left: Math.max(viewportPadding, Math.min(rect.left, window.innerWidth - width - viewportPadding)),
      width,
      maxHeight,
    });
  }, [customers.length]);

  React.useLayoutEffect(() => {
    if (open) updatePosition();
  }, [open, updatePosition]);

  React.useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const reposition = () => updatePosition();
    document.addEventListener('mousedown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('mousedown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, updatePosition]);

  const menu = open && position
    ? createPortal(
      <div
        className="mes-order-dropdown-menu client-balance-account-menu"
        id="client-balance-account-listbox"
        role="listbox"
        ref={menuRef}
        style={position}
      >
        {customers.map((customer) => (
          <button
            type="button"
            role="option"
            aria-selected={customer.id === value}
            className={customer.id === value ? 'selected' : ''}
            key={customer.id}
            onClick={() => {
              onChange(customer.id);
              setOpen(false);
            }}
          >
            <span>{customer.customerName}</span>
            {customer.status === 'inactive' ? <small>Inactive</small> : null}
          </button>
        ))}
      </div>,
      document.body,
    )
    : null;

  return (
    <div className={`mes-order-dropdown client-balance-account-dropdown${open ? ' open' : ''}`} ref={triggerRef}>
      <button type="button" aria-haspopup="listbox" aria-expanded={open} aria-controls="client-balance-account-listbox" onClick={() => setOpen((current) => !current)}>
        <span>{selectedCustomer?.customerName ?? 'Select client'}</span>
        <ChevronDown size={16} />
      </button>
      {menu}
    </div>
  );
}

function BalanceFormDropdown({
  id,
  value,
  options,
  onChange,
}: {
  id: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [position, setPosition] = React.useState<ClientAccountMenuPosition | null>(null);
  const triggerRef = React.useRef<HTMLDivElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const selectedOption = options.find((option) => option.value === value);

  const updatePosition = React.useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 16;
    const availableBelow = window.innerHeight - rect.bottom - viewportPadding;
    const availableAbove = rect.top - viewportPadding;
    const desiredHeight = Math.min(250, Math.max(48, (options.length * 38) + 12));
    const openUp = availableBelow < desiredHeight && availableAbove > availableBelow;
    const maxHeight = Math.max(48, Math.min(desiredHeight, openUp ? availableAbove - 6 : availableBelow - 6));
    const width = Math.min(rect.width, window.innerWidth - (viewportPadding * 2));
    setPosition({
      top: openUp ? Math.max(viewportPadding, rect.top - maxHeight - 6) : rect.bottom + 6,
      left: Math.max(viewportPadding, Math.min(rect.left, window.innerWidth - width - viewportPadding)),
      width,
      maxHeight,
    });
  }, [options.length]);

  React.useLayoutEffect(() => {
    if (open) updatePosition();
  }, [open, updatePosition]);

  React.useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const reposition = () => updatePosition();
    document.addEventListener('mousedown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('mousedown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, updatePosition]);

  const menu = open && position
    ? createPortal(
      <div className="mes-order-dropdown-menu client-balance-form-dropdown-menu" id={`${id}-listbox`} role="listbox" ref={menuRef} style={position}>
        {options.map((option) => (
          <button
            type="button"
            role="option"
            aria-selected={option.value === value}
            className={option.value === value ? 'selected' : ''}
            key={option.value}
            onClick={() => {
              onChange(option.value);
              setOpen(false);
            }}
          >
            {option.label}
          </button>
        ))}
      </div>,
      document.body,
    )
    : null;

  return (
    <div className={`mes-order-dropdown client-balance-form-dropdown${open ? ' open' : ''}`} ref={triggerRef}>
      <button type="button" aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-listbox`} onClick={() => setOpen((current) => !current)}>
        <span>{selectedOption?.label ?? 'Select option'}</span>
        <ChevronDown size={16} />
      </button>
      {menu}
    </div>
  );
}

export function ClientBalancesWorkspace({
  organizationId,
  customers,
  loadingCustomers,
  customerError,
  onRetryCustomers,
}: ClientBalancesWorkspaceProps) {
  const [customerId, setCustomerId] = React.useState(() => sessionStorage.getItem(customerSelectionKey) ?? '');
  const [account, setAccount] = React.useState<BalanceAccount | null>(null);
  const [movements, setMovements] = React.useState<BalanceMovement[]>([]);
  const [loadingLedger, setLoadingLedger] = React.useState(false);
  const [ledgerError, setLedgerError] = React.useState('');
  const [view, setView] = React.useState<BalanceView>('statement');
  const [search, setSearch] = React.useState('');
  const [fromDate, setFromDate] = React.useState('');
  const [toDate, setToDate] = React.useState('');
  const [typeFilter, setTypeFilter] = React.useState('all');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [invoiceFilter, setInvoiceFilter] = React.useState('all');
  const [paymentFilter, setPaymentFilter] = React.useState('all');
  const [formMode, setFormMode] = React.useState<MovementFormMode | null>(null);
  const [form, setForm] = React.useState<MovementForm>(() => initialForm());
  const [saving, setSaving] = React.useState(false);
  const [formError, setFormError] = React.useState('');
  const [expandedMovementId, setExpandedMovementId] = React.useState<string | null>(null);

  const selectedCustomer = customers.find((customer) => customer.id === customerId) ?? null;

  React.useEffect(() => {
    if (customerId && customers.some((customer) => customer.id === customerId)) return;
    const firstCustomer = customers.find((customer) => customer.status === 'active') ?? customers[0];
    setCustomerId(firstCustomer?.id ?? '');
  }, [customerId, customers]);

  React.useEffect(() => {
    if (customerId) sessionStorage.setItem(customerSelectionKey, customerId);
  }, [customerId]);

  const loadLedger = React.useCallback(async () => {
    if (!organizationId || !customerId) {
      setAccount(null);
      setMovements([]);
      return;
    }

    setLoadingLedger(true);
    setLedgerError('');
    const [accountResponse, movementResponse] = await Promise.all([
      supabase
        .from('mes_client_balance_accounts')
        .select('id, current_balance, total_charges, total_payments, uninvoiced_balance')
        .eq('organization_id', organizationId)
        .eq('customer_id', customerId)
        .eq('currency', 'MXN')
        .maybeSingle(),
      supabase
        .from('mes_client_balance_movements')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('customer_id', customerId)
        .order('movement_date', { ascending: false })
        .order('created_at', { ascending: false }),
    ]);

    const error = accountResponse.error || movementResponse.error;
    if (error) {
      setLedgerError(error.message);
      setAccount(null);
      setMovements([]);
    } else {
      setAccount(accountResponse.data as BalanceAccount | null);
      setMovements((movementResponse.data ?? []) as BalanceMovement[]);
    }
    setLoadingLedger(false);
  }, [customerId, organizationId]);

  React.useEffect(() => {
    void loadLedger();
  }, [loadLedger]);

  React.useEffect(() => {
    if (!formMode) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) setFormMode(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [formMode, saving]);

  const openForm = (mode: MovementFormMode) => {
    const next = initialForm(selectedCustomer ?? undefined);
    next.status = mode === 'charge' ? 'open' : 'confirmed';
    next.description = mode === 'payment' ? 'Customer payment' : '';
    setForm(next);
    setFormError('');
    setFormMode(mode);
  };

  const submitMovement = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!formMode || !selectedCustomer) return;
    const amount = parseMoneyInput(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError('Enter an amount greater than zero.');
      return;
    }

    setSaving(true);
    setFormError('');
    const movementType = formMode === 'adjustment' ? 'adjustment' : formMode;
    const description = form.description.trim()
      || (formMode === 'adjustment' ? `${form.direction === 'increase' ? 'Increase' : 'Decrease'} adjustment` : '');
    const { error } = await supabase.rpc('mes_add_client_balance_movement', {
      p_organization_id: organizationId,
      p_customer_id: selectedCustomer.id,
      p_movement_type: movementType,
      p_movement_date: form.date,
      p_description: description,
      p_amount: amount,
      p_category: formMode === 'charge' ? form.category : null,
      p_adjustment_direction: formMode === 'adjustment' ? form.direction : null,
      p_payment_method: formMode !== 'adjustment' ? form.paymentMethod : null,
      p_payment_reference: formMode === 'payment' ? form.paymentReference.trim() || null : null,
      p_delivery_note_number: formMode === 'charge' ? form.deliveryNote.trim() || null : null,
      p_invoice_required: formMode === 'charge' && form.invoiceRequired,
      p_invoice_status: formMode === 'charge' ? form.invoiceStatus : 'not_required',
      p_billing_name: formMode === 'charge' ? form.billingName.trim() || null : null,
      p_invoice_uuid: form.invoiceUuid.trim() || null,
      p_status: form.status,
      p_notes: form.notes.trim(),
    });

    if (error) {
      setFormError(error.message);
    } else {
      setFormMode(null);
      await loadLedger();
    }
    setSaving(false);
  };

  const filteredMovements = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    return movements.filter((movement) => {
      if (view === 'open' && !(movement.movement_type === 'charge' && ['open', 'partially_paid', 'disputed'].includes(movement.status))) return false;
      if (view === 'payments' && movement.movement_type !== 'payment') return false;
      if (view === 'invoices' && !movement.invoice_required && !movement.invoice_uuid) return false;
      if (fromDate && movement.movement_date < fromDate) return false;
      if (toDate && movement.movement_date > toDate) return false;
      if (typeFilter !== 'all' && movement.movement_type !== typeFilter) return false;
      if (statusFilter !== 'all' && movement.status !== statusFilter) return false;
      if (invoiceFilter !== 'all' && movement.invoice_status !== invoiceFilter) return false;
      if (paymentFilter !== 'all' && movement.payment_method !== paymentFilter) return false;
      if (!query) return true;
      return [
        movement.description,
        movement.category,
        movement.payment_reference,
        movement.delivery_note_number,
        movement.invoice_uuid,
        movement.billing_name,
        movement.status,
      ].some((value) => value?.toLowerCase().includes(query));
    });
  }, [fromDate, invoiceFilter, movements, paymentFilter, search, statusFilter, toDate, typeFilter, view]);

  const openCharges = movements.filter((movement) => movement.movement_type === 'charge'
    && ['open', 'partially_paid', 'disputed'].includes(movement.status));
  const lastPayment = movements.find((movement) => movement.movement_type === 'payment' && movement.status === 'confirmed');
  const currentBalance = Number(account?.current_balance ?? 0);
  const amountDue = Math.max(currentBalance, 0);
  const customerCredit = Math.abs(Math.min(currentBalance, 0));

  const exportStatement = () => {
    if (!selectedCustomer) return;
    const headers = [
      'Date', 'Movement Type', 'Category', 'Description', 'Charge', 'Payment', 'Previous Balance',
      'New Balance', 'Payment Method', 'Reference', 'Delivery Note', 'Invoice Status', 'Billing Name',
      'Invoice UUID', 'Status', 'Notes',
    ];
    const rows = filteredMovements.map((movement) => [
      movement.movement_date,
      movementLabels[movement.movement_type],
      movement.category ? categoryLabels[movement.category] ?? movement.category : '',
      movement.description,
      movement.charge_amount,
      movement.payment_amount,
      movement.previous_balance,
      movement.new_balance,
      movement.payment_method ? paymentMethodLabels[movement.payment_method] ?? movement.payment_method : '',
      movement.payment_reference ?? '',
      movement.delivery_note_number ?? '',
      invoiceStatusLabels[movement.invoice_status] ?? movement.invoice_status,
      movement.billing_name ?? '',
      movement.invoice_uuid ?? '',
      movement.status,
      movement.notes,
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selectedCustomer.customerName.replace(/[^a-z0-9]+/gi, '-')}-statement.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loadingCustomers) return <div className="clients-feedback">Loading clients...</div>;

  if (customerError) {
    return (
      <div className="clients-feedback error" role="alert">
        <span>{customerError}</span>
        <button type="button" onClick={onRetryCustomers}>Retry</button>
      </div>
    );
  }

  if (!customers.length) {
    return (
      <div className="clients-empty-state client-balances-no-customer">
        <span><WalletCards size={27} /></span>
        <strong>Create a client before opening a balance</strong>
        <p>Every account statement is linked to a customer record.</p>
      </div>
    );
  }

  return (
    <div className="client-balances">
      <section className="client-balance-toolbar">
        <label>
          <span>Client Account</span>
          <ClientAccountDropdown value={customerId} customers={customers} onChange={setCustomerId} />
        </label>
        <div className="client-balance-actions">
          <button type="button" className="charge" onClick={() => openForm('charge')}>
            <span className="client-balance-action-icon"><ArrowUpRight size={20} /></span>
            <span className="client-balance-action-copy">
              <strong>Add Charge</strong>
              <small>Increase receivable</small>
            </span>
          </button>
          <button type="button" className="payment" onClick={() => openForm('payment')}>
            <span className="client-balance-action-icon"><ArrowDownLeft size={20} /></span>
            <span className="client-balance-action-copy">
              <strong>Register Payment</strong>
              <small>Record money received</small>
            </span>
          </button>
          <button type="button" className="adjustment" onClick={() => openForm('adjustment')}>
            <span className="client-balance-action-icon"><SlidersHorizontal size={20} /></span>
            <span className="client-balance-action-copy">
              <strong>Add Adjustment</strong>
              <small>Correct the account</small>
            </span>
          </button>
          <button type="button" className="export" onClick={exportStatement} disabled={!movements.length}>
            <span className="client-balance-action-icon"><Download size={20} /></span>
            <span className="client-balance-action-copy">
              <strong>Export Statement</strong>
              <small>Download filtered CSV</small>
            </span>
          </button>
        </div>
      </section>

      {ledgerError ? (
        <div className="clients-feedback error" role="alert">
          <span>{ledgerError}</span>
          <button type="button" onClick={() => void loadLedger()}>Retry</button>
        </div>
      ) : null}

      <section className="client-balance-summary" aria-label="Client balance summary">
        <article className={`featured ${amountDue > 0 ? 'primary due' : ''}`}>
          <span><WalletCards size={19} /> {currentBalance === 0 ? 'Current Balance' : 'Amount Due'}</span>
          <strong>{money(amountDue)}</strong>
          <small>{currentBalance > 0 ? 'Customer owes this amount' : currentBalance === 0 ? 'Account settled' : 'No outstanding amount'}</small>
        </article>
        <article className={`featured ${customerCredit > 0 ? 'credit' : ''}`}>
          <span><Banknote size={19} /> Customer Credit</span>
          <strong>{money(customerCredit)}</strong>
          <small>{customerCredit > 0
            ? 'Credit available from advance payment or overpayment'
            : 'No customer credit available'}</small>
        </article>
        <div className="client-balance-secondary-kpis">
          <article>
            <span><ArrowUpRight size={16} /> Total Charges</span>
            <strong>{money(account?.total_charges)}</strong>
            <small>All registered charges</small>
          </article>
          <article>
            <span><ArrowDownLeft size={16} /> Total Payments</span>
            <strong>{money(account?.total_payments)}</strong>
            <small>Confirmed and registered</small>
          </article>
          <article className={Number(account?.uninvoiced_balance ?? 0) > 0 ? 'warning' : ''}>
            <span><ReceiptText size={16} /> Uninvoiced Balance</span>
            <strong>{money(account?.uninvoiced_balance)}</strong>
            <small>Charges pending invoice</small>
          </article>
          <article>
            <span><CalendarDays size={16} /> Last Payment</span>
            <strong>{lastPayment ? money(lastPayment.payment_amount) : '—'}</strong>
            <small>{lastPayment ? dateLabel(lastPayment.movement_date) : 'No payments yet'}</small>
          </article>
          <article className={openCharges.length ? 'warning' : ''}>
            <span><FileCheck2 size={16} /> Open Charges</span>
            <strong>{openCharges.length}</strong>
            <small>{money(openCharges.reduce((sum, movement) => sum + Number(movement.charge_amount), 0))} registered</small>
          </article>
        </div>
      </section>

      <section className="client-balance-ledger">
        <div className="client-balance-view-tabs" role="tablist" aria-label="Balance views">
          {([
            ['statement', 'Account Statement'],
            ['open', 'Open Charges'],
            ['payments', 'Payments'],
            ['invoices', 'Invoice References'],
          ] as Array<[BalanceView, string]>).map(([value, label]) => (
            <button type="button" role="tab" aria-selected={view === value} className={view === value ? 'active' : ''} onClick={() => setView(value)} key={value}>
              {label}
            </button>
          ))}
        </div>

        <div className="client-balance-filters">
          <label className="client-balance-search">
            <Search size={16} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search description, reference, invoice UUID" />
          </label>
          <div className="client-balance-date-range" aria-label="Statement date range">
            <label>
              <span>From</span>
              <BalanceDatePicker id="client-balance-from-date" value={fromDate} placeholder="Start date" onChange={setFromDate} onQuickRange={(range) => {
                setFromDate(range.from);
                setToDate(range.to);
              }} />
            </label>
            <label>
              <span>To</span>
              <BalanceDatePicker id="client-balance-to-date" value={toDate} placeholder="End date" onChange={setToDate} onQuickRange={(range) => {
                setFromDate(range.from);
                setToDate(range.to);
              }} />
            </label>
          </div>
          <SelectField value={typeFilter} onChange={setTypeFilter} ariaLabel="Movement type filter">
            <option value="all">All movements</option>
            <option value="charge">Charges</option>
            <option value="payment">Payments</option>
            <option value="credit">Credits</option>
            <option value="adjustment">Adjustments</option>
          </SelectField>
          <SelectField value={statusFilter} onChange={setStatusFilter} ariaLabel="Movement status filter">
            <option value="all">All statuses</option>
            <option value="open">Open</option>
            <option value="partially_paid">Partially Paid</option>
            <option value="paid">Paid</option>
            <option value="confirmed">Confirmed</option>
            <option value="pending_confirmation">Pending Confirmation</option>
            <option value="disputed">Disputed</option>
            <option value="cancelled">Cancelled</option>
          </SelectField>
          <SelectField value={invoiceFilter} onChange={setInvoiceFilter} ariaLabel="Invoice status filter">
            <option value="all">All invoice statuses</option>
            <option value="pending">Invoice Pending</option>
            <option value="issued">Invoice Issued</option>
            <option value="not_required">Not Required</option>
            <option value="cancelled">Invoice Cancelled</option>
          </SelectField>
          <SelectField value={paymentFilter} onChange={setPaymentFilter} ariaLabel="Payment method filter">
            <option value="all">All payment methods</option>
            {Object.entries(paymentMethodLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </SelectField>
        </div>

        <div className="client-balance-table-wrap">
          {loadingLedger ? <div className="client-balance-loading">Loading account statement...</div> : null}
          {!loadingLedger && !filteredMovements.length ? (
            <div className="client-balance-empty">
              <CircleDollarSign size={28} />
              <strong>No movements in this view</strong>
              <p>Add a charge, payment, or adjustment to begin the client ledger.</p>
            </div>
          ) : null}
          {filteredMovements.length ? (
            <table>
              <thead>
                <tr>
                  <th>Date</th><th>Movement</th><th>Description</th><th>Charge</th><th>Payment</th>
                  <th>Balance</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredMovements.map((movement) => (
                  <React.Fragment key={movement.id}>
                    <tr>
                      <td>{dateLabel(movement.movement_date)}</td>
                      <td><span className={`client-movement-pill ${movement.movement_type}`}>{movementLabels[movement.movement_type]}</span></td>
                      <td className="description">{movement.description}</td>
                      <td className="money charge">{movement.charge_amount ? money(movement.charge_amount) : '—'}</td>
                      <td className="money payment">{movement.payment_amount ? money(movement.payment_amount) : '—'}</td>
                      <td className="money strong">
                        <span className={`client-ledger-balance ${Number(movement.new_balance) < 0 ? 'credit' : Number(movement.new_balance) > 0 ? 'due' : 'settled'}`}>
                          {ledgerBalanceLabel(movement.new_balance)}
                        </span>
                      </td>
                      <td><span className={`client-movement-status ${movement.status}`}>{movement.status.replaceAll('_', ' ')}</span></td>
                      <td><button type="button" className="client-balance-detail-button" onClick={() => setExpandedMovementId((current) => current === movement.id ? null : movement.id)}>
                        {expandedMovementId === movement.id ? 'Hide' : 'Details'}
                      </button></td>
                    </tr>
                    {expandedMovementId === movement.id ? (
                      <tr className="client-balance-detail-row">
                        <td colSpan={8}>
                          <div className="client-balance-detail-grid">
                            <span><b>Category</b>{movement.category ? categoryLabels[movement.category] ?? movement.category : '—'}</span>
                            <span><b>Previous Balance</b>{ledgerBalanceLabel(movement.previous_balance)}</span>
                            <span><b>Payment Method</b>{movement.payment_method ? paymentMethodLabels[movement.payment_method] ?? movement.payment_method : '—'}</span>
                            <span><b>Reference</b>{movement.payment_reference || '—'}</span>
                            <span><b>Delivery Note</b>{movement.delivery_note_number || '—'}</span>
                            <span><b>Invoice Status</b><em className={`client-invoice-pill ${movement.invoice_status}`}>{invoiceStatusLabels[movement.invoice_status] ?? movement.invoice_status}</em></span>
                            <span><b>Billing Name</b>{movement.billing_name || '—'}</span>
                            <span><b>Invoice UUID</b>{movement.invoice_uuid || '—'}</span>
                            <span><b>Currency</b>{movement.currency}</span>
                            <span><b>Invoice required</b>{movement.invoice_required ? 'Yes' : 'No'}</span>
                            <span className="wide"><b>Notes</b>{movement.notes || 'No notes recorded.'}</span>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
        <footer>{filteredMovements.length} movements shown · Newest first</footer>
      </section>

      {formMode ? (
        <div className="supplier-modal-backdrop client-balance-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !saving) setFormMode(null);
        }}>
          <div className="supplier-modal client-balance-modal" role="dialog" aria-modal="true" aria-labelledby="client-balance-form-title">
            <button type="button" className="supplier-modal-close" onClick={() => setFormMode(null)} disabled={saving} aria-label="Close dialog"><X size={18} /></button>
            <div className="supplier-modal-header">
              <span>Client Balance · {selectedCustomer?.customerName}</span>
              <strong id="client-balance-form-title">
                {formMode === 'charge' ? 'Add Charge' : formMode === 'payment' ? 'Register Payment' : 'Add Adjustment'}
              </strong>
            </div>
            <form onSubmit={(event) => void submitMovement(event)}>
              <div className="client-balance-form-grid">
                <label>
                  Date
                  <BalanceDatePicker
                    id="client-balance-movement-date"
                    value={form.date}
                    placeholder="Select date"
                    onChange={(date) => setForm((current) => ({ ...current, date }))}
                  />
                </label>
                <label>
                  Amount (MXN)
                  <input
                    className="client-balance-amount-input"
                    required
                    inputMode="decimal"
                    value={form.amount}
                    onChange={(event) => setForm((current) => ({ ...current, amount: formatMoneyWhileTyping(event.target.value) }))}
                    onBlur={() => setForm((current) => ({ ...current, amount: formatMoneyOnBlur(current.amount) }))}
                    placeholder="0.00"
                  />
                </label>

                {formMode === 'charge' ? (
                  <>
                    <label>Category<BalanceFormDropdown
                      id="client-balance-charge-category"
                      value={form.category}
                      options={Object.entries(categoryLabels).map(([value, label]) => ({ value, label }))}
                      onChange={(category) => setForm((current) => ({ ...current, category }))}
                    /></label>
                    <label>Status<BalanceFormDropdown
                      id="client-balance-charge-status"
                      value={form.status}
                      options={[
                        { value: 'open', label: 'Open' },
                        { value: 'partially_paid', label: 'Partially Paid' },
                        { value: 'paid', label: 'Paid' },
                        { value: 'disputed', label: 'Disputed' },
                        { value: 'written_off', label: 'Written Off' },
                      ]}
                      onChange={(status) => setForm((current) => ({ ...current, status }))}
                    /></label>
                    <label className="wide">Description<input required value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Service, order, repair, or charge detail" /></label>
                    <label>Delivery Note<input value={form.deliveryNote} onChange={(event) => setForm((current) => ({ ...current, deliveryNote: event.target.value }))} placeholder="Optional" /></label>
                    <label>Billing Name<input value={form.billingName} onChange={(event) => setForm((current) => ({ ...current, billingName: event.target.value }))} /></label>
                    <label className="wide">Payment Method<BalanceFormDropdown
                      id="client-balance-charge-payment-method"
                      value={form.paymentMethod}
                      options={Object.entries(paymentMethodLabels).map(([value, label]) => ({ value, label }))}
                      onChange={(paymentMethod) => setForm((current) => ({ ...current, paymentMethod }))}
                    /></label>
                    <label className={`client-balance-checkbox wide${form.invoiceRequired ? ' checked' : ''}`}>
                      <input type="checkbox" checked={form.invoiceRequired} onChange={(event) => setForm((current) => ({
                        ...current,
                        invoiceRequired: event.target.checked,
                        invoiceStatus: event.target.checked ? 'pending' : 'not_required',
                      }))} />
                      <span className="client-balance-checkbox-control"><Check size={14} /></span>
                      <span className="client-balance-checkbox-copy">
                        <strong>Invoice required for this charge</strong>
                        <small>Enable invoice tracking and fiscal references</small>
                      </span>
                    </label>
                    {form.invoiceRequired ? (
                      <>
                        <label>Invoice Status<BalanceFormDropdown
                          id="client-balance-invoice-status"
                          value={form.invoiceStatus}
                          options={[{ value: 'pending', label: 'Pending' }, { value: 'issued', label: 'Issued' }, { value: 'cancelled', label: 'Cancelled' }]}
                          onChange={(invoiceStatus) => setForm((current) => ({ ...current, invoiceStatus }))}
                        /></label>
                        <label>Invoice UUID<input value={form.invoiceUuid} onChange={(event) => setForm((current) => ({ ...current, invoiceUuid: event.target.value }))} placeholder="Optional" /></label>
                      </>
                    ) : null}
                  </>
                ) : null}

                {formMode === 'payment' ? (
                  <>
                    <label>Payment Method<BalanceFormDropdown
                      id="client-balance-payment-method"
                      value={form.paymentMethod}
                      options={Object.entries(paymentMethodLabels).map(([value, label]) => ({ value, label }))}
                      onChange={(paymentMethod) => setForm((current) => ({ ...current, paymentMethod }))}
                    /></label>
                    <label>Status<BalanceFormDropdown
                      id="client-balance-payment-status"
                      value={form.status}
                      options={[{ value: 'confirmed', label: 'Confirmed' }, { value: 'pending_confirmation', label: 'Pending Confirmation' }]}
                      onChange={(status) => setForm((current) => ({ ...current, status }))}
                    /></label>
                    <label className="wide">Payment Reference<input value={form.paymentReference} onChange={(event) => setForm((current) => ({ ...current, paymentReference: event.target.value }))} placeholder="Transfer, check, or operation reference" /></label>
                    <label className="wide">Related Invoice UUID<input value={form.invoiceUuid} onChange={(event) => setForm((current) => ({ ...current, invoiceUuid: event.target.value }))} placeholder="Optional" /></label>
                  </>
                ) : null}

                {formMode === 'adjustment' ? (
                  <>
                    <label>Direction<BalanceFormDropdown
                      id="client-balance-adjustment-direction"
                      value={form.direction}
                      options={[{ value: 'increase', label: 'Increase balance' }, { value: 'decrease', label: 'Decrease balance' }]}
                      onChange={(direction) => setForm((current) => ({ ...current, direction: direction as 'increase' | 'decrease' }))}
                    /></label>
                    <label>Status<BalanceFormDropdown
                      id="client-balance-adjustment-status"
                      value={form.status}
                      options={[{ value: 'confirmed', label: 'Confirmed' }]}
                      onChange={(status) => setForm((current) => ({ ...current, status }))}
                    /></label>
                    <label className="wide">Reason<input required value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Reason for adjustment" /></label>
                  </>
                ) : null}

                <label className="wide">Notes<textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Optional internal notes" /></label>
              </div>
              {formError ? <div className="clients-modal-error" role="alert">{formError}</div> : null}
              <div className="supplier-modal-actions">
                <button type="button" onClick={() => setFormMode(null)} disabled={saving}>Cancel</button>
                <button type="submit" disabled={saving}><Plus size={16} /> {saving ? 'Saving...' : 'Save Movement'}</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
