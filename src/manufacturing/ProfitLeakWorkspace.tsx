import React from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, ArrowLeft, Boxes, ChevronDown, CircleX, Pencil, Plus, RefreshCw, Repeat2, ShieldCheck, Trash2, Truck, TriangleAlert } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useSupabaseRealtimeRefresh } from '../lib/useSupabaseRealtimeRefresh';
import { getWorkCenterHourlyRate } from './workCenterRates';
import './profitLeak.css';
import './profitLeakLayout.css';

type Props = { onNavigate: (path: string) => void; organizationId: string };
type RangePreset = 'current' | 'previous' | 'custom';
type LeakEvent = { id: string; event_type: string; quantity: number | null; reason: string | null; comment: string | null; payload: unknown; work_center_code: string | null; station_code: string | null; created_at: string; mes_production_orders: { client_name: string | null } | Array<{ client_name: string | null }> | null };
type TransferRow = { id: string; transfer_number: string; external_process: string; part_number: string; quantity_sent: number | null; quantity_rejected: number | null; created_at: string };
type DowntimeCycle = { id: string; work_center_code: string; station_code: string; started_at: string; ended_at: string | null };
type WorkCenterRow = { id: string; code: string; name: string };
type StationRow = { work_center_id: string; code: string; name: string };
type InventoryPriceRow = { id: string; title: string; unit_price: number | null; currency: string | null };
type LeakEntryCategory = 'external-supplier' | 'manufacturing-transfer' | 'warranty';
type LeakEntry = { id: string; category: LeakEntryCategory; title: string; party: string; description: string; reference: string; work_center_id: string | null; quantity: number; amount: number; currency: string; incurred_at: string };
type LeakTableRow = { id: string; date: string; category: string; detail: string; item: string; duration: string; workCenter: string; station: string; quantity: number; spent: number | null; currency: string; entry?: LeakEntry };

const EXTERNAL_SERVICES = [
  'Water supply service',
  'AC / HVAC maintenance',
  'General maintenance',
  'Coating service',
  'Waste disposal',
  'Calibration service',
  'Cleaning service',
  'Security service',
  'Utilities',
  'Logistics / freight',
  'External machining',
];
const TRANSFER_PROCESSES = [
  'Heat treatment',
  'Coating',
  'Grinding',
  'Plating',
  'Anodizing',
  'Sharpening',
  'Cleaning / degreasing',
  'External inspection',
];
const WARRANTY_REASONS = [
  'Manufacturing defect',
  'Premature wear',
  'Tool breakage',
  'Dimensional non-conformance',
  'Coating failure',
  'Material defect',
];
const ENTRY_CURRENCIES = ['USD', 'MXN', 'EUR'];

type CategoryConfig = {
  eyebrow: string;
  modalTitle: (editing: boolean) => string;
  primaryLabel: string;
  primaryOptions: string[];
  partyLabel: string;
  partyPlaceholder: string;
  referenceLabel: string;
  referencePlaceholder: string;
  showQuantity: boolean;
  quantityLabel: string;
  descriptionPlaceholder: string;
  submitLabel: string;
};

const CATEGORY_CONFIG: Record<LeakEntryCategory, CategoryConfig> = {
  'external-supplier': {
    eyebrow: 'OPS INTELLIGENCE / EXTERNAL SUPPLIERS',
    modalTitle: (editing) => editing ? 'Edit external supplier expense' : 'Log external supplier expense',
    primaryLabel: 'Service',
    primaryOptions: EXTERNAL_SERVICES,
    partyLabel: 'Supplier',
    partyPlaceholder: 'Supplier name',
    referenceLabel: 'Invoice / reference',
    referencePlaceholder: 'Invoice or purchase order number',
    showQuantity: false,
    quantityLabel: '',
    descriptionPlaceholder: 'Monthly water supply for the plant.',
    submitLabel: 'Log expense',
  },
  'manufacturing-transfer': {
    eyebrow: 'OPS INTELLIGENCE / MANUFACTURING TRANSFERS',
    modalTitle: (editing) => editing ? 'Edit manufacturing transfer' : 'Log manufacturing transfer',
    primaryLabel: 'External process',
    primaryOptions: TRANSFER_PROCESSES,
    partyLabel: 'Supplier',
    partyPlaceholder: 'External supplier name',
    referenceLabel: 'Transfer / PO number',
    referencePlaceholder: 'Transfer or purchase order number',
    showQuantity: true,
    quantityLabel: 'Pieces sent',
    descriptionPlaceholder: 'Parts sent out for heat treatment.',
    submitLabel: 'Log transfer',
  },
  warranty: {
    eyebrow: 'OPS INTELLIGENCE / WARRANTIES',
    modalTitle: (editing) => editing ? 'Edit warranty' : 'Log warranty',
    primaryLabel: 'Reason',
    primaryOptions: WARRANTY_REASONS,
    partyLabel: 'Client',
    partyPlaceholder: 'Client name',
    referenceLabel: 'Tool ID / serial number',
    referencePlaceholder: 'Tool ID or serial number',
    showQuantity: true,
    quantityLabel: 'Pieces under warranty',
    descriptionPlaceholder: 'Tool replaced under warranty due to premature wear.',
    submitLabel: 'Log warranty',
  },
};
const CATEGORY_LABEL: Record<LeakEntryCategory, string> = {
  'external-supplier': 'External Supplier',
  'manufacturing-transfer': 'Manufacturing Transfer',
  warranty: 'Warranty',
};

const dateInput = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
const monthRange = (offset = 0) => {
  const now = new Date();
  return { from: dateInput(new Date(now.getFullYear(), now.getMonth() + offset, 1)), to: dateInput(new Date(now.getFullYear(), now.getMonth() + offset + 1, 0)) };
};
const emptyEntryForm = { primary: '', customPrimary: '', party: '', description: '', reference: '', workCenterId: '', quantity: '1', amount: '', currency: 'USD', incurredOn: dateInput(new Date()) };
const eventText = (event: LeakEvent) => `${event.reason ?? ''} ${event.comment ?? ''} ${JSON.stringify(event.payload ?? {})}`.toLowerCase();
const isEndOfLife = (event: LeakEvent) => /end[\s_-]*of[\s_-]*life|\beol\b|fin de vida/.test(eventText(event));
const isWarranty = (event: LeakEvent) => /\bwarrant(?:y|ies)\b|garant[ií]a/.test(eventText(event));
const payloadRecord = (payload: unknown): Record<string, unknown> => payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
const eventSpend = (event: LeakEvent) => {
  const payload = payloadRecord(event.payload);
  for (const key of ['total_cost', 'expense_amount', 'amount', 'cost']) {
    const value = Number(payload[key]);
    if (Number.isFinite(value) && value >= 0) return value;
  }
  const unitCost = Number(payload.unit_cost);
  return Number.isFinite(unitCost) && unitCost >= 0 ? unitCost * Math.max(1, Number(event.quantity) || 1) : null;
};
const money = (value: number, currency = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
const categoryTone = (category: string) => category.includes('Scrap') ? 'scrap' : category === 'Manufacturing Transfer' ? 'transfer' : category === 'Supplies Used' ? 'supplies' : category === 'Warranty' ? 'warranty' : category === 'External Supplier' ? 'external' : 'downtime';
const SpendBox = ({ value }: { value: string | null }) => <span className="profit-leak-spend"><small>Money Spent</small><strong>{value ?? 'Not recorded'}</strong></span>;
const relation = <T,>(value: T | T[] | null) => Array.isArray(value) ? value[0] ?? null : value;
const durationLabel = (hours: number) => hours >= 1 ? `${hours.toFixed(2)} h` : hours >= (1 / 60) ? `${Math.max(1, Math.round(hours * 60))} min` : `${Math.max(1, Math.round(hours * 3600))} sec`;
const workCenterPalette = [
  { background: '#dbeafe', border: '#93c5fd', color: '#1d4ed8' },
  { background: '#dcfce7', border: '#86efac', color: '#15803d' },
  { background: '#fef3c7', border: '#fcd34d', color: '#a16207' },
  { background: '#f3e8ff', border: '#d8b4fe', color: '#7e22ce' },
  { background: '#cffafe', border: '#67e8f9', color: '#0e7490' },
  { background: '#ffe4e6', border: '#fda4af', color: '#be123c' },
];

type SelectOption = { value: string; label: string };

// A yvimo-style custom dropdown, matching the `.mes-order-dropdown` pattern
// already used across MesWorkspaces and OperatorTerminalWorkspace.
function ProfitLeakDropdown({ id, value, options, placeholder = 'Select option', onChange }: { id: string; value: string; options: SelectOption[]; placeholder?: string; onChange: (value: string) => void }) {
  const [open, setOpen] = React.useState(false);
  const [menuPosition, setMenuPosition] = React.useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const triggerRef = React.useRef<HTMLDivElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const selectedOption = options.find((option) => option.value === value);

  const updateMenuPosition = React.useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 16;
    const availableBelow = window.innerHeight - rect.bottom - viewportPadding;
    const availableAbove = rect.top - viewportPadding;
    const desiredHeight = Math.min(280, Math.max(88, (options.length * 38) + 12));
    const openUp = availableBelow < desiredHeight && availableAbove > availableBelow;
    const maxHeight = Math.max(88, Math.min(desiredHeight, openUp ? availableAbove - 7 : availableBelow - 7));
    const width = Math.min(rect.width, window.innerWidth - (viewportPadding * 2));
    const left = Math.max(viewportPadding, Math.min(rect.left, window.innerWidth - width - viewportPadding));
    setMenuPosition({ top: openUp ? Math.max(viewportPadding, rect.top - maxHeight - 7) : rect.bottom + 7, left, width, maxHeight });
  }, [options.length]);

  React.useLayoutEffect(() => { if (open) updateMenuPosition(); }, [open, updateMenuPosition]);

  React.useEffect(() => {
    if (!open) return undefined;
    const closeIfOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const reposition = () => updateMenuPosition();
    document.addEventListener('mousedown', closeIfOutside);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('mousedown', closeIfOutside);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, updateMenuPosition]);

  const dropdownMenu = open && menuPosition ? createPortal(
    <div className="mes-order-dropdown-menu" id={`${id}-listbox`} role="listbox" ref={menuRef} style={menuPosition}>
      {options.map((option) => (
        <button className={option.value === value ? 'selected' : ''} type="button" role="option" aria-selected={option.value === value} key={option.value} onClick={() => { onChange(option.value); setOpen(false); }}>
          {option.label}
        </button>
      ))}
    </div>,
    document.body,
  ) : null;

  return (
    <div className={['mes-order-dropdown', open ? 'open' : ''].filter(Boolean).join(' ')} ref={triggerRef}>
      <button className={!selectedOption ? 'placeholder' : ''} type="button" aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-listbox`} onClick={() => setOpen((current) => !current)}>
        <span>{selectedOption?.label ?? placeholder}</span>
        <ChevronDown size={16} />
      </button>
      {dropdownMenu}
    </div>
  );
}

export function ProfitLeakWorkspace({ onNavigate, organizationId }: Props) {
  const [preset, setPreset] = React.useState<RangePreset>('current');
  const [range, setRange] = React.useState(() => monthRange());
  const [events, setEvents] = React.useState<LeakEvent[]>([]);
  const [transfers, setTransfers] = React.useState<TransferRow[]>([]);
  const [downtimeCycles, setDowntimeCycles] = React.useState<DowntimeCycle[]>([]);
  const [workCenters, setWorkCenters] = React.useState<WorkCenterRow[]>([]);
  const [stations, setStations] = React.useState<StationRow[]>([]);
  const [inventoryPrices, setInventoryPrices] = React.useState<InventoryPriceRow[]>([]);
  const [entries, setEntries] = React.useState<LeakEntry[]>([]);
  const [entryCategory, setEntryCategory] = React.useState<LeakEntryCategory | null>(null);
  const [entryForm, setEntryForm] = React.useState(emptyEntryForm);
  const [editingEntry, setEditingEntry] = React.useState<LeakEntry | null>(null);
  const [entryDeleteCandidate, setEntryDeleteCandidate] = React.useState<LeakEntry | null>(null);
  const [entryError, setEntryError] = React.useState('');
  const [savingEntry, setSavingEntry] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [setupNotice, setSetupNotice] = React.useState('');
  const [updatedAt, setUpdatedAt] = React.useState('');

  const load = React.useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const from = `${range.from}T00:00:00`;
    const to = `${range.to}T23:59:59.999`;
    const [eventResult, transferResult, downtimeResult, centerResult, stationResult, inventoryResult, entryResult] = await Promise.all([
      supabase.from('mes_operator_terminal_events')
        .select('id, event_type, quantity, reason, comment, payload, work_center_code, station_code, created_at, mes_production_orders(client_name)')
        .eq('organization_id', organizationId)
        .in('event_type', ['production-scrap', 'inventory-consumed'])
        .gte('created_at', from).lte('created_at', to),
      supabase.from('mes_supplier_transfers')
        .select('id, transfer_number, external_process, part_number, quantity_sent, quantity_rejected, created_at')
        .eq('organization_id', organizationId)
        .gte('created_at', from).lte('created_at', to),
      supabase.from('mes_station_status_cycles')
        .select('id, work_center_code, station_code, started_at, ended_at')
        .eq('organization_id', organizationId).eq('status', 'down')
        .lt('started_at', to).or(`ended_at.is.null,ended_at.gt.${from}`),
      supabase.from('mes_work_centers').select('id, code, name').eq('organization_id', organizationId).order('name'),
      supabase.from('mes_work_center_stations').select('work_center_id, code, name').eq('organization_id', organizationId),
      supabase.from('mes_inventory_items').select('id, title, unit_price, currency').eq('organization_id', organizationId),
      supabase.from('mes_profit_leak_entries')
        .select('id, category, title, party, description, reference, work_center_id, quantity, amount, currency, incurred_at')
        .eq('organization_id', organizationId)
        .gte('incurred_at', from).lte('incurred_at', to)
        .order('incurred_at', { ascending: false }),
    ]);
    const loadError = eventResult.error ?? transferResult.error ?? downtimeResult.error ?? centerResult.error ?? stationResult.error;
    // Inventory pricing and manual Profit Leak entries ship with their own migrations; keep
    // the rest of the analysis usable while those tables and columns are still missing.
    const setupError = inventoryResult.error ?? entryResult.error;
    setSetupNotice(setupError ? `External suppliers, manufacturing transfer, and warranty logging are unavailable: ${setupError.message}` : '');
    if (loadError) {
      setError(loadError.message || 'Unable to load profit leak data.');
    } else {
      setEvents((eventResult.data ?? []) as LeakEvent[]);
      setTransfers((transferResult.data ?? []) as TransferRow[]);
      setDowntimeCycles((downtimeResult.data ?? []) as DowntimeCycle[]);
      setWorkCenters((centerResult.data ?? []) as WorkCenterRow[]);
      setStations((stationResult.data ?? []) as StationRow[]);
      setInventoryPrices((inventoryResult.data ?? []) as InventoryPriceRow[]);
      setEntries((entryResult.data ?? []) as LeakEntry[]);
      setError('');
      setUpdatedAt(new Date().toISOString());
    }
    setLoading(false);
  }, [organizationId, range.from, range.to]);

  React.useEffect(() => { void load(); }, [load]);
  useSupabaseRealtimeRefresh({
    channelName: `profit-leak:${organizationId}`,
    tables: [
      { table: 'mes_operator_terminal_events', filter: `organization_id=eq.${organizationId}` },
      { table: 'mes_supplier_transfers', filter: `organization_id=eq.${organizationId}` },
      { table: 'mes_station_status_cycles', filter: `organization_id=eq.${organizationId}` },
      { table: 'mes_profit_leak_entries', filter: `organization_id=eq.${organizationId}` },
      { table: 'mes_inventory_items', filter: `organization_id=eq.${organizationId}` },
    ],
    onRefresh: () => void load(true),
  });

  const validDowntimeCycles = React.useMemo(() => {
    const startMs = new Date(`${range.from}T00:00:00`).getTime();
    const rangeEnd = new Date(`${range.to}T00:00:00`); rangeEnd.setDate(rangeEnd.getDate() + 1);
    const endMs = Math.min(rangeEnd.getTime(), Date.now());
    return downtimeCycles.map((cycle) => {
      const durationMs = Math.max(0, Math.min(endMs, cycle.ended_at ? new Date(cycle.ended_at).getTime() : Date.now()) - Math.max(startMs, new Date(cycle.started_at).getTime()));
      return { cycle, hours: durationMs / 3_600_000 };
    }).filter(({ hours }) => hours >= (1 / 3600));
  }, [downtimeCycles, range.from, range.to]);

  const entriesByCategory = React.useMemo(() => {
    const groups: Record<LeakEntryCategory, LeakEntry[]> = { 'external-supplier': [], 'manufacturing-transfer': [], warranty: [] };
    entries.forEach((entry) => { groups[entry.category]?.push(entry); });
    return groups;
  }, [entries]);

  const summary = React.useMemo(() => {
    const scrap = events.filter((event) => event.event_type === 'production-scrap');
    const manualWarranties = entriesByCategory.warranty.reduce((sum, entry) => sum + Math.max(1, entry.quantity), 0);
    const warranties = scrap.filter(isWarranty).reduce((sum, event) => sum + Math.max(1, Number(event.quantity) || 1), 0) + manualWarranties;
    const eol = scrap.filter((event) => !isWarranty(event) && isEndOfLife(event)).reduce((sum, event) => sum + Math.max(1, Number(event.quantity) || 1), 0);
    const generated = scrap.filter((event) => !isWarranty(event) && !isEndOfLife(event)).reduce((sum, event) => sum + Math.max(1, Number(event.quantity) || 1), 0);
    const supplies = events.filter((event) => event.event_type === 'inventory-consumed').reduce((sum, event) => sum + Math.max(1, Number(event.quantity) || 1), 0);
    const downtime = validDowntimeCycles.length;
    const manualTransfers = entriesByCategory['manufacturing-transfer'].reduce((sum, entry) => sum + Math.max(1, entry.quantity), 0);
    const transfersCount = transfers.length + manualTransfers;
    const externalCount = entriesByCategory['external-supplier'].length;
    return { eol, generated, scraps: eol + generated, supplies, downtime, warranties, transfersCount, externalCount };
  }, [entriesByCategory, events, transfers, validDowntimeCycles]);

  // Inventory carries the reference unit price, so supplies consumed before a price
  // existed (or logged without cost keys) can still be valued from the item card.
  const priceByItem = React.useMemo(() => new Map(inventoryPrices.map((item) => [item.id, {
    price: Number(item.unit_price) || 0,
    currency: item.currency || 'USD',
  }])), [inventoryPrices]);

  const tableRows = React.useMemo<LeakTableRow[]>(() => {
    const locationFor = (workCenterCode: string | null, stationCode: string | null) => {
      const center = workCenters.find((item) => item.code === workCenterCode);
      const station = stations.find((item) => item.code === stationCode && (!center || item.work_center_id === center.id));
      return { workCenter: center?.name ?? workCenterCode ?? 'Unassigned', station: station?.name ?? stationCode ?? '—' };
    };
    const operationalRows = events.map((event) => {
      const payload = payloadRecord(event.payload);
      const category = event.event_type === 'production-scrap' ? (isWarranty(event) ? 'Warranty' : isEndOfLife(event) ? 'End of Life Scrap' : 'Generated Scrap') : 'Supplies Used';
      const detail = event.reason || String(payload.inventory_item_title || '') || event.comment || 'Operational event';
      const order = relation(event.mes_production_orders);
      const item = category === 'Supplies Used' ? String(payload.inventory_item_title || 'Not identified') : category === 'Generated Scrap' ? `Tool ID: ${String(payload.tool_id || 'Not identified')} · Client: ${order?.client_name || String(payload.client_name || 'Not identified')}` : String(payload.tool_id || '—');
      const quantity = Math.max(1, Number(event.quantity) || 1);
      const itemPrice = category === 'Supplies Used' ? priceByItem.get(String(payload.inventory_item_id ?? '')) : undefined;
      const spent = eventSpend(event) ?? (itemPrice && itemPrice.price > 0 ? itemPrice.price * quantity : null);
      return { id: event.id, date: event.created_at, category, detail, item, duration: '—', ...locationFor(event.work_center_code, event.station_code), quantity, spent, currency: String(payload.currency || itemPrice?.currency || 'USD') };
    });
    const transferRows = transfers.flatMap((transfer) => {
      const base: LeakTableRow = { id: `transfer-${transfer.id}`, date: transfer.created_at, category: 'Manufacturing Transfer', detail: `${transfer.transfer_number} · ${transfer.external_process}${transfer.part_number ? ` · ${transfer.part_number}` : ''}`, item: transfer.part_number || '—', duration: '—', workCenter: 'External operation', station: '—', quantity: Math.max(1, Number(transfer.quantity_sent) || 1), spent: null, currency: 'USD' };
      return [base];
    });
    const downtimeRows: LeakTableRow[] = validDowntimeCycles.map(({ cycle, hours }) => {
      const centerName = workCenters.find((center) => center.code === cycle.work_center_code)?.name ?? cycle.work_center_code;
      const rate = getWorkCenterHourlyRate(`${centerName} ${cycle.work_center_code}`);
      const location = locationFor(cycle.work_center_code, cycle.station_code);
      return { id: `downtime-${cycle.id}`, date: cycle.started_at, category: 'Downtime Incident', detail: `${durationLabel(hours)} × ${money(rate)}/hour`, item: '—', duration: durationLabel(hours), ...location, quantity: 1, spent: hours * rate, currency: 'USD' };
    });
    const entryRows: LeakTableRow[] = entries.map((entry) => ({
      id: `entry-${entry.id}`,
      date: entry.incurred_at,
      category: CATEGORY_LABEL[entry.category],
      detail: `${entry.title}${entry.party ? ` · ${entry.party}` : ''}`,
      item: entry.description || entry.reference || '—',
      duration: '—',
      workCenter: workCenters.find((center) => center.id === entry.work_center_id)?.name ?? 'Company wide',
      station: entry.reference || '—',
      quantity: Math.max(1, entry.quantity),
      spent: Number(entry.amount) || 0,
      currency: entry.currency || 'USD',
      entry,
    }));
    return [...operationalRows, ...transferRows, ...downtimeRows, ...entryRows].sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
  }, [entries, events, priceByItem, stations, transfers, validDowntimeCycles, workCenters]);
  const workCenterStyle = React.useCallback((name: string) => {
    const index = Math.max(0, workCenters.findIndex((center) => center.name === name));
    return workCenterPalette[index % workCenterPalette.length];
  }, [workCenters]);
  const spendTotals = React.useMemo(() => {
    // Amounts are never converted between currencies: each one keeps its own subtotal.
    const totalFor = (categories: string[]) => {
      const recorded = tableRows.filter((row) => categories.includes(row.category) && row.spent !== null);
      if (!recorded.length) return null;
      const byCurrency = new Map<string, number>();
      recorded.forEach((row) => byCurrency.set(row.currency, (byCurrency.get(row.currency) ?? 0) + (row.spent ?? 0)));
      return [...byCurrency.entries()].map(([currency, total]) => money(total, currency)).join(' + ');
    };
    return {
      scrap: totalFor(['End of Life Scrap', 'Generated Scrap']),
      transfers: totalFor(['Manufacturing Transfer']),
      supplies: totalFor(['Supplies Used']),
      warranties: totalFor(['Warranty']),
      downtime: totalFor(['Downtime Incident']),
      external: totalFor(['External Supplier']),
    };
  }, [tableRows]);

  const setPresetRange = (next: RangePreset) => {
    setPreset(next);
    if (next === 'current') setRange(monthRange());
    if (next === 'previous') setRange(monthRange(-1));
  };

  const openEntryModal = (category: LeakEntryCategory, entry: LeakEntry | null) => {
    const config = CATEGORY_CONFIG[category];
    setEntryCategory(category);
    setEditingEntry(entry);
    setEntryError('');
    setEntryForm(entry
      ? {
        primary: config.primaryOptions.includes(entry.title) ? entry.title : 'custom',
        customPrimary: config.primaryOptions.includes(entry.title) ? '' : entry.title,
        party: entry.party,
        description: entry.description,
        reference: entry.reference,
        workCenterId: entry.work_center_id ?? '',
        quantity: String(entry.quantity ?? 1),
        amount: String(entry.amount ?? ''),
        currency: entry.currency || 'USD',
        incurredOn: dateInput(new Date(entry.incurred_at)),
      }
      : { ...emptyEntryForm, incurredOn: dateInput(new Date()) });
  };

  const saveEntry = async (submitEvent: React.FormEvent) => {
    submitEvent.preventDefault();
    if (!entryCategory) return;
    const config = CATEGORY_CONFIG[entryCategory];
    const title = (entryForm.primary === 'custom' ? entryForm.customPrimary : entryForm.primary).trim();
    if (!title) return setEntryError(`Select or name the ${config.primaryLabel.toLowerCase()}.`);
    const amount = Number(entryForm.amount);
    if (!Number.isFinite(amount) || amount < 0) return setEntryError('Enter the amount for this entry.');
    const quantity = config.showQuantity ? Math.max(1, Math.round(Number(entryForm.quantity)) || 1) : 1;
    setSavingEntry(true);
    setEntryError('');
    const payload = {
      organization_id: organizationId,
      category: entryCategory,
      title,
      party: entryForm.party.trim(),
      description: entryForm.description.trim(),
      reference: entryForm.reference.trim(),
      work_center_id: entryForm.workCenterId || null,
      quantity,
      amount,
      currency: entryForm.currency || 'USD',
      incurred_at: new Date(`${entryForm.incurredOn}T12:00:00`).toISOString(),
    };
    const { error: saveError } = editingEntry
      ? await supabase.from('mes_profit_leak_entries').update(payload).eq('id', editingEntry.id).eq('organization_id', organizationId)
      : await supabase.from('mes_profit_leak_entries').insert(payload);
    setSavingEntry(false);
    if (saveError) return setEntryError(saveError.message);
    setEntryCategory(null);
    setEditingEntry(null);
    await load(true);
  };

  const deleteEntry = async () => {
    if (!entryDeleteCandidate) return;
    setSavingEntry(true);
    const { error: deleteError } = await supabase.from('mes_profit_leak_entries')
      .delete().eq('id', entryDeleteCandidate.id).eq('organization_id', organizationId);
    setSavingEntry(false);
    setEntryDeleteCandidate(null);
    if (deleteError) return setError(deleteError.message);
    await load(true);
  };

  const activeConfig = entryCategory ? CATEGORY_CONFIG[entryCategory] : null;
  const workCenterOptions: SelectOption[] = [{ value: '', label: 'Company wide' }, ...workCenters.map((center) => ({ value: center.id, label: `${center.code} · ${center.name}` }))];
  const currencyOptions: SelectOption[] = ENTRY_CURRENCIES.map((currency) => ({ value: currency, label: currency }));

  return <section className="profit-leak-workspace">
    <header className="profit-leak-header">
      <button className="academy-back-button engineering-back-button mes-workspace-back profit-leak-back" type="button" onClick={() => onNavigate('/workspace/manufacturing-ops/intelligence')}><ArrowLeft size={16} /> Ops Intelligence</button>
      <div className="profit-leak-heading"><span>OPS INTELLIGENCE / FINANCE</span><h1>Profit Leak</h1><p>Operational factors reducing company profit</p></div>
      <section className="profit-leak-controls">
        <div className="profit-leak-period-tabs">{(['current', 'previous', 'custom'] as const).map((item) => <button className={preset === item ? 'active' : ''} type="button" key={item} onClick={() => setPresetRange(item)}>{item === 'current' ? 'Current month' : item === 'previous' ? 'Previous month' : 'Custom'}</button>)}</div>
        <label><span>From</span><input type="date" value={range.from} onChange={(event) => { setPreset('custom'); setRange((current) => ({ ...current, from: event.target.value })); }} /></label>
        <label><span>To</span><input type="date" value={range.to} onChange={(event) => { setPreset('custom'); setRange((current) => ({ ...current, to: event.target.value })); }} /></label>
        <button className="profit-leak-refresh" type="button" disabled={loading} onClick={() => void load()}><RefreshCw size={15} className={loading ? 'spinning' : ''} /> Refresh</button>
      </section>
      <span className="profit-leak-live"><span><i /> Live analysis</span><small>{updatedAt ? new Date(updatedAt).toLocaleTimeString() : 'Connecting'}</small></span>
    </header>
    {error ? <div className="profit-leak-error"><AlertTriangle size={18} />{error}</div> : null}
    {setupNotice ? <div className="profit-leak-error profit-leak-setup-notice"><AlertTriangle size={18} />{setupNotice}</div> : null}
    <section className="profit-leak-kpis" aria-label="Profit leak KPIs">
      <article className="scrap-card"><small className="profit-kpi-title">Total Scrap</small><span className="profit-kpi-count"><Trash2 /><strong>{summary.scraps.toLocaleString()}</strong></span><span className="scrap-breakdown"><b><i />End of Life <strong>{summary.eol.toLocaleString()}</strong></b><b><i />Generated Scrap <strong>{summary.generated.toLocaleString()}</strong></b></span><SpendBox value={spendTotals.scrap} /></article>
      <article><button className="profit-leak-kpi-add" type="button" disabled={Boolean(setupNotice)} aria-label="Log manufacturing transfer" onClick={() => openEntryModal('manufacturing-transfer', null)}><Plus size={14} /></button><small className="profit-kpi-title">Manufacturing Transfers</small><span className="profit-kpi-count"><Repeat2 /><strong>{summary.transfersCount.toLocaleString()}</strong></span><SpendBox value={spendTotals.transfers} /></article>
      <article><small className="profit-kpi-title">Supplies Used</small><span className="profit-kpi-count"><Boxes /><strong>{summary.supplies.toLocaleString()}</strong></span><SpendBox value={spendTotals.supplies} /></article>
      <article><button className="profit-leak-kpi-add" type="button" disabled={Boolean(setupNotice)} aria-label="Log warranty" onClick={() => openEntryModal('warranty', null)}><Plus size={14} /></button><small className="profit-kpi-title">Warranties</small><span className="profit-kpi-count"><ShieldCheck /><strong>{summary.warranties.toLocaleString()}</strong></span><SpendBox value={spendTotals.warranties} /></article>
      <article><small className="profit-kpi-title">Downtime Incidents</small><span className="profit-kpi-count"><TriangleAlert /><strong>{summary.downtime.toLocaleString()}</strong></span><SpendBox value={spendTotals.downtime} /></article>
      <article className="external-card"><button className="profit-leak-kpi-add" type="button" disabled={Boolean(setupNotice)} aria-label="Log external supplier expense" onClick={() => openEntryModal('external-supplier', null)}><Plus size={14} /></button><small className="profit-kpi-title">External Suppliers</small><span className="profit-kpi-count"><Truck /><strong>{summary.externalCount.toLocaleString()}</strong></span><SpendBox value={spendTotals.external} /></article>
    </section>
    <section className="profit-leak-events">
      <header><span><small>Cost detail</small><h2>Profit Leak Events</h2></span><strong>{tableRows.length.toLocaleString()} events</strong></header>
      <div className="profit-leak-table-wrap"><table><thead><tr><th>Date</th><th>KPI</th><th>Event detail</th><th>Item / Tool & Client</th><th>Workcenter / Station</th><th>Downtime</th><th>Quantity</th><th>Money Spent</th><th>Actions</th></tr></thead><tbody>
        {tableRows.map((row) => { const tone = workCenterStyle(row.workCenter); return <tr key={row.id}><td>{new Date(row.date).toLocaleString()}</td><td><span className={`profit-leak-category ${categoryTone(row.category)}`}>{row.category}</span></td><td>{row.detail}</td><td>{row.item}</td><td><span className="profit-leak-location"><b className="workcenter-pill" style={{ background: tone.background, borderColor: tone.border, color: tone.color }}>{row.workCenter}</b><em>{row.station}</em></span></td><td>{row.duration}</td><td>{row.quantity.toLocaleString()}</td><td>{row.spent === null ? <em className="cost-missing">Not recorded</em> : <strong className="cost-value">{money(row.spent, row.currency)}</strong>}</td><td>{row.entry ? <span className="profit-leak-row-actions"><button type="button" aria-label={`Edit ${row.entry.title}`} onClick={() => openEntryModal(row.entry!.category, row.entry!)}><Pencil size={14} /></button><button className="danger" type="button" aria-label={`Delete ${row.entry.title}`} onClick={() => setEntryDeleteCandidate(row.entry!)}><Trash2 size={14} /></button></span> : <em className="cost-missing">—</em>}</td></tr>; })}
        {!tableRows.length ? <tr><td className="profit-leak-empty" colSpan={9}>{loading ? 'Loading profit leak events…' : 'No profit leak events were recorded in this period.'}</td></tr> : null}
      </tbody></table></div>
    </section>
    {entryCategory && activeConfig ? <div className="mes-modal-backdrop profit-leak-modal-backdrop" role="presentation">
      <section className="mes-order-modal profit-leak-expense-modal" role="dialog" aria-modal="true" aria-labelledby="profit-leak-entry-title">
        <div className="profit-leak-modal-heading">
          <div><p className="eyebrow">{activeConfig.eyebrow}</p><h3 id="profit-leak-entry-title">{activeConfig.modalTitle(Boolean(editingEntry))}</h3></div>
          <button type="button" aria-label="Close" onClick={() => setEntryCategory(null)}><CircleX size={19} /></button>
        </div>
        <form onSubmit={saveEntry}>
          <div className="profit-leak-expense-grid">
            <label>{activeConfig.primaryLabel}<ProfitLeakDropdown id="profit-leak-entry-primary" value={entryForm.primary} placeholder={`Select ${activeConfig.primaryLabel.toLowerCase()}`} options={[...activeConfig.primaryOptions.map((option) => ({ value: option, label: option })), { value: 'custom', label: 'Other…' }]} onChange={(value) => setEntryForm((current) => ({ ...current, primary: value }))} /></label>
            <label>{activeConfig.partyLabel}<input value={entryForm.party} onChange={(event) => setEntryForm((current) => ({ ...current, party: event.target.value }))} placeholder={activeConfig.partyPlaceholder} /></label>
            {entryForm.primary === 'custom'
              ? <label className="profit-leak-expense-wide">{activeConfig.primaryLabel} name<input value={entryForm.customPrimary} onChange={(event) => setEntryForm((current) => ({ ...current, customPrimary: event.target.value }))} placeholder={activeConfig.primaryLabel} required /></label>
              : null}
            {activeConfig.showQuantity
              ? <label>{activeConfig.quantityLabel}<input type="number" min="1" step="1" value={entryForm.quantity} onChange={(event) => setEntryForm((current) => ({ ...current, quantity: event.target.value }))} required /></label>
              : null}
            <label>Amount<input type="number" min="0" step="0.01" value={entryForm.amount} onChange={(event) => setEntryForm((current) => ({ ...current, amount: event.target.value }))} placeholder="0.00" required /></label>
            <label>Currency<ProfitLeakDropdown id="profit-leak-entry-currency" value={entryForm.currency} options={currencyOptions} onChange={(value) => setEntryForm((current) => ({ ...current, currency: value }))} /></label>
            <label>Date<input type="date" value={entryForm.incurredOn} onChange={(event) => setEntryForm((current) => ({ ...current, incurredOn: event.target.value }))} required /></label>
            <label>Work center<ProfitLeakDropdown id="profit-leak-entry-work-center" value={entryForm.workCenterId} options={workCenterOptions} onChange={(value) => setEntryForm((current) => ({ ...current, workCenterId: value }))} /></label>
            <label className="profit-leak-expense-wide">{activeConfig.referenceLabel}<input value={entryForm.reference} onChange={(event) => setEntryForm((current) => ({ ...current, reference: event.target.value }))} placeholder={activeConfig.referencePlaceholder} /></label>
            <label className="profit-leak-expense-wide">Description<textarea rows={3} value={entryForm.description} onChange={(event) => setEntryForm((current) => ({ ...current, description: event.target.value }))} placeholder={activeConfig.descriptionPlaceholder} /></label>
          </div>
          {entryError ? <div className="profit-leak-error" role="alert"><AlertTriangle size={16} />{entryError}</div> : null}
          <div className="profit-leak-modal-actions">
            <button type="button" onClick={() => setEntryCategory(null)}>Cancel</button>
            <button className="primary" type="submit" disabled={savingEntry}>{savingEntry ? 'Saving…' : editingEntry ? 'Save changes' : activeConfig.submitLabel}</button>
          </div>
        </form>
      </section>
    </div> : null}
    {entryDeleteCandidate ? <div className="mes-modal-backdrop profit-leak-modal-backdrop" role="presentation">
      <section className="mes-confirm-modal danger" role="dialog" aria-modal="true" aria-labelledby="profit-leak-delete-title">
        <span className="mes-confirm-mark"><AlertTriangle size={24} /></span>
        <div>
          <h3 id="profit-leak-delete-title">Delete {CATEGORY_LABEL[entryDeleteCandidate.category].toLowerCase()} entry?</h3>
          <p><strong>{entryDeleteCandidate.title}</strong>{entryDeleteCandidate.party ? ` · ${entryDeleteCandidate.party}` : ''} for {money(Number(entryDeleteCandidate.amount) || 0, entryDeleteCandidate.currency)} will be removed from Profit Leak.</p>
        </div>
        <div className="mes-confirm-actions">
          <button type="button" onClick={() => setEntryDeleteCandidate(null)}>Cancel</button>
          <button className="danger" type="button" disabled={savingEntry} onClick={() => { void deleteEntry(); }}>{savingEntry ? 'Deleting…' : 'Delete entry'}</button>
        </div>
      </section>
    </div> : null}
  </section>;
}
