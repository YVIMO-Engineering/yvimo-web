import React from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, BarChart3, CalendarDays, Check, ChevronDown, CircleDollarSign, ClipboardCheck, Clock3, FileText, PackageCheck, PaintBucket, Pencil, Plus, RotateCcw, Search, Send, ShieldAlert, TrendingDown, TrendingUp, Trash2, Truck, Users, X } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { MesOrderDatePicker } from './MesWorkspaces';
import { localizeClientsTree, translateClientsText, type ClientsLanguageCode } from './clientsI18n';
import { WeeklyReceptionsChart, type DailyReceptionStat } from './statistics/WeeklyReceptionsChart';
import './statisticsWorkspace.css';

type ReceptionStatus = 'reception' | 'assign-orders' | 'manufacturing' | 'quality-inspection' | 'coating' | 'waiting-delivery' | 'sent' | 'discrepancy';
type ReceptionRegistryFilter = 'all' | ReceptionStatus;
type ReceptionFormItem = { id?: string; customerId: string; quantity: string; productionOrderId?: string };

type ExistingProductionOrder = {
  id: string;
  orderNumber: string;
  customerId: string;
  clientName: string;
  partName: string;
  status: string;
  plannedQuantity: number;
};

type ReceptionItem = {
  id: string;
  customerId: string;
  customerName: string;
  quantity: number;
  productionOrderId: string;
  productionOrderNumber: string;
  productionStatus: string;
  completedQuantity: number;
  scrapQuantity: number;
  serialNumbers: string[];
  toolIds: string[];
  serials: ReceptionSerial[];
  coatingSentAt: string;
  coatingReturnedAt: string;
  sentAt: string;
};

type ReceptionSerial = {
  id: string;
  serialNumber: string;
  toolId: string;
  coatingSentAt: string;
  coatingReturnedAt: string;
  sentAt: string;
};

type ReceptionVoucher = {
  id: string;
  voucherNumber: string;
  customerId: string;
  customerName: string;
  productionOrderId: string;
  productionOrderNumber: string;
  customerReference: string;
  packingSlip: string;
  carrier: string;
  partNumber: string;
  description: string;
  lotSerial: string;
  quantityExpected: number;
  quantityReceived: number;
  status: ReceptionStatus;
  expectedDate: string;
  receivedAt: string;
  sentAt: string;
  notes: string;
  createdAt: string;
  items: ReceptionItem[];
};

type ReceptionRow = {
  id: string;
  voucher_number: string;
  customer_id: string;
  customer_reference: string;
  production_order_id: string | null;
  production_order_number: string;
  packing_slip: string;
  carrier: string;
  part_number: string;
  description: string;
  lot_serial: string;
  quantity_expected: number;
  quantity_received: number;
  status: ReceptionStatus;
  expected_date: string | null;
  received_at: string | null;
  updated_at: string | null;
  notes: string;
  created_at: string;
  mes_customers: { customer_name: string } | Array<{ customer_name: string }> | null;
};

type Props = {
  organizationId: string;
  onNavigate: (path: string) => void;
  customers: Array<{ id: string; customerName: string; status: 'active' | 'inactive' }>;
  languageCode: ClientsLanguageCode;
};

const steps = ['Reception', 'Assign Orders', 'Manufacturing', 'Quality Inspection', 'Coating', 'Waiting to Deliver', 'Sent'];
const statusStep: Record<ReceptionStatus, number> = {
  reception: 0,
  'assign-orders': 1,
  manufacturing: 2,
  'quality-inspection': 3,
  coating: 4,
  'waiting-delivery': 5,
  sent: 6,
  discrepancy: 3,
};

const emptyForm = {
  customerId: '',
  customerReference: '',
  packingSlip: '',
  carrier: '',
  quantityExpected: '1',
  expectedDate: new Date().toISOString().slice(0, 10),
  notes: '',
};

function labelStatus(status: ReceptionStatus) {
  const labels: Record<ReceptionStatus, string> = {
    reception: 'Reception',
    'assign-orders': 'Assign Orders',
    manufacturing: 'Manufacturing',
    'quality-inspection': 'Quality Inspection',
    coating: 'Coating',
    'waiting-delivery': 'Waiting to Deliver',
    sent: 'Sent',
    discrepancy: 'Discrepancy',
  };
  return labels[status];
}

function labelProductionStatus(status: string) {
  if (!status) return 'Not Assigned';
  return status.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function formatDate(value: string, languageCode: ClientsLanguageCode) {
  if (!value) return 'Not specified';
  const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`)
    : new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return 'Not specified';
  return new Intl.DateTimeFormat(languageCode === 'es' ? 'es-MX' : 'en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(parsedDate);
}

function formatReceptionTimestamp(value: string, languageCode: ClientsLanguageCode) {
  if (!value) return '';
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return '';
  return new Intl.DateTimeFormat(languageCode === 'es' ? 'es-MX' : 'en-US', {
    month: 'short', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(parsedDate);
}

function ReceptionPortalDropdown({ open, onOpenChange, label, disabled = false, className = '', menuClassName = '', children }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: React.ReactNode;
  disabled?: boolean;
  className?: string;
  menuClassName?: string;
  children: React.ReactNode;
}) {
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const [position, setPosition] = React.useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null);

  React.useLayoutEffect(() => {
    if (!open) return undefined;
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;

      // `innerHeight` can describe the layout viewport instead of the actually
      // visible area on mobile Safari and when the browser is zoomed. Keeping
      // the portalled menu inside the visual viewport prevents it from opening
      // off-screen on short laptops and tablets.
      const visualViewport = window.visualViewport;
      const viewportTop = visualViewport?.offsetTop ?? 0;
      const viewportLeft = visualViewport?.offsetLeft ?? 0;
      const viewportHeight = visualViewport?.height ?? window.innerHeight;
      const viewportWidth = visualViewport?.width ?? window.innerWidth;
      const viewportBottom = viewportTop + viewportHeight;
      const viewportRight = viewportLeft + viewportWidth;
      const viewportMargin = 8;
      const menuGap = 6;
      const spaceBelow = Math.max(0, viewportBottom - rect.bottom - viewportMargin - menuGap);
      const spaceAbove = Math.max(0, rect.top - viewportTop - viewportMargin - menuGap);
      const openAbove = spaceBelow < 220 && spaceAbove > spaceBelow;
      const availableHeight = openAbove ? spaceAbove : spaceBelow;
      const maxHeight = Math.max(0, Math.min(360, availableHeight));
      const width = Math.min(rect.width, Math.max(0, viewportWidth - (viewportMargin * 2)));
      const left = Math.min(
        Math.max(rect.left, viewportLeft + viewportMargin),
        Math.max(viewportLeft + viewportMargin, viewportRight - viewportMargin - width),
      );
      const top = openAbove
        ? Math.max(viewportTop + viewportMargin, rect.top - menuGap - maxHeight)
        : Math.min(rect.bottom + menuGap, viewportBottom - viewportMargin - maxHeight);

      setPosition({
        left,
        top,
        width,
        maxHeight,
      });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    window.visualViewport?.addEventListener('resize', updatePosition);
    window.visualViewport?.addEventListener('scroll', updatePosition);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      window.visualViewport?.removeEventListener('resize', updatePosition);
      window.visualViewport?.removeEventListener('scroll', updatePosition);
    };
  }, [open]);

  return (
    <div className={`client-reception-existing-dropdown ${className}`.trim()}>
      <button ref={triggerRef} type="button" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} onClick={() => onOpenChange(!open)}><span>{label}</span><ChevronDown size={18} /></button>
      {open && position ? createPortal(
        <div className={`client-reception-existing-dropdown-menu portal ${menuClassName}`} role="listbox" style={position}>{children}</div>,
        document.body,
      ) : null}
    </div>
  );
}

export function ClientReceptionsWorkspace({ organizationId, onNavigate, customers, languageCode }: Props) {
  const [vouchers, setVouchers] = React.useState<ReceptionVoucher[]>([]);
  const [selectedId, setSelectedId] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [sendingItemId, setSendingItemId] = React.useState('');
  const [updatingCoatingItemId, setUpdatingCoatingItemId] = React.useState('');
  const [updatingSerialKey, setUpdatingSerialKey] = React.useState('');
  const [error, setError] = React.useState('');
  const [formOpen, setFormOpen] = React.useState(false);
  const [editingVoucherId, setEditingVoucherId] = React.useState('');
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [customerMenuOpen, setCustomerMenuOpen] = React.useState<number | null>(null);
  const [formItems, setFormItems] = React.useState<ReceptionFormItem[]>([]);
  const [generatedVoucherNumber, setGeneratedVoucherNumber] = React.useState('');
  const [overrideOpen, setOverrideOpen] = React.useState(false);
  const [overrideCode, setOverrideCode] = React.useState('');
  const [overrideError, setOverrideError] = React.useState('');
  const [registryFilter, setRegistryFilter] = React.useState<ReceptionRegistryFilter>('all');
  const [registryFilterOpen, setRegistryFilterOpen] = React.useState(false);
  const [registryExpanded, setRegistryExpanded] = React.useState(true);
  const [registryDateRange, setRegistryDateRange] = React.useState({ from: '', to: '' });
  const [registryOrderSearch, setRegistryOrderSearch] = React.useState('');
  const [analysisOpen, setAnalysisOpen] = React.useState(false);
  const [analysisCustomerId, setAnalysisCustomerId] = React.useState('');
  const [analysisSelectedDate, setAnalysisSelectedDate] = React.useState('');
  const [existingOrderItem, setExistingOrderItem] = React.useState<ReceptionItem | null>(null);
  const [existingOrders, setExistingOrders] = React.useState<ExistingProductionOrder[]>([]);
  const [existingOrdersLoading, setExistingOrdersLoading] = React.useState(false);
  const [existingOrderSearch, setExistingOrderSearch] = React.useState('');
  const [existingOrderCustomerId, setExistingOrderCustomerId] = React.useState('');
  const [existingOrderId, setExistingOrderId] = React.useState('');
  const [existingOrderError, setExistingOrderError] = React.useState('');
  const [existingOrderCustomerMenuOpen, setExistingOrderCustomerMenuOpen] = React.useState(false);
  const [existingOrderMenuOpen, setExistingOrderMenuOpen] = React.useState(false);
  const [form, setForm] = React.useState(emptyForm);
  const registryFilterRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!registryFilterOpen) return undefined;
    const closeFilter = (event: MouseEvent) => {
      if (!registryFilterRef.current?.contains(event.target as Node)) setRegistryFilterOpen(false);
    };
    document.addEventListener('mousedown', closeFilter);
    return () => document.removeEventListener('mousedown', closeFilter);
  }, [registryFilterOpen]);

  const loadVouchers = React.useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from('mes_customer_reception_vouchers')
      .select('*, mes_customers(customer_name)')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });
    if (loadError) {
      setError(loadError.message);
      setLoading(false);
      return;
    }
    const receptionRows = (data ?? []) as ReceptionRow[];
    const receptionIds = receptionRows.map((row) => row.id);
    const { data: itemData } = receptionIds.length
      ? await supabase.from('mes_customer_reception_items').select('id, reception_voucher_id, customer_id, quantity, production_order_id, production_order_number, coating_sent_at, coating_returned_at, sent_at, mes_customers(customer_name)').in('reception_voucher_id', receptionIds).order('created_at')
      : { data: [] };
    const itemRows = (itemData ?? []) as Array<{ id: string; reception_voucher_id: string; customer_id: string; quantity: number; production_order_id: string | null; production_order_number: string; coating_sent_at: string | null; coating_returned_at: string | null; sent_at: string | null; mes_customers: { customer_name: string } | Array<{ customer_name: string }> | null }>;
    const productionOrderIds = itemRows.map((row) => row.production_order_id).filter((id): id is string => Boolean(id));
    const productionStatusById = new Map<string, { status: string; completedQuantity: number; scrapQuantity: number }>();
    const productionIdentifiersById = new Map<string, { serialNumbers: string[]; toolIds: string[]; serials: Array<{ id: string; serialNumber: string; toolId: string }> }>();
    if (productionOrderIds.length) {
      const [{ data: productionOrders }, { data: productionSerials }] = await Promise.all([
        supabase.from('mes_production_orders').select('id, status, completed_quantity, scrap_quantity').in('id', productionOrderIds),
        supabase.from('mes_production_serials').select('id, production_order_id, serial_number, tool_id, result, piece_sequence').in('production_order_id', productionOrderIds).eq('result', 'good').order('piece_sequence'),
      ]);
      (productionOrders ?? []).forEach((order) => productionStatusById.set(order.id, {
        status: order.status,
        completedQuantity: Number(order.completed_quantity) || 0,
        scrapQuantity: Number(order.scrap_quantity) || 0,
      }));
      (productionSerials ?? []).forEach((serial) => {
        const identifiers = productionIdentifiersById.get(serial.production_order_id) ?? { serialNumbers: [], toolIds: [], serials: [] };
        const serialNumber = String(serial.serial_number ?? '').trim();
        const toolId = String(serial.tool_id ?? '').trim();
        if (serialNumber && !identifiers.serialNumbers.includes(serialNumber)) identifiers.serialNumbers.push(serialNumber);
        if (toolId && !identifiers.toolIds.includes(toolId)) identifiers.toolIds.push(toolId);
        identifiers.serials.push({ id: serial.id, serialNumber, toolId });
        productionIdentifiersById.set(serial.production_order_id, identifiers);
      });
    }
    const productionSerialIds = Array.from(productionIdentifiersById.values()).flatMap((entry) => entry.serials.map((serial) => serial.id));
    const { data: serialProgressData } = productionSerialIds.length
      ? await supabase.from('mes_customer_reception_serial_progress').select('reception_item_id, production_serial_id, coating_sent_at, coating_returned_at, sent_at').in('production_serial_id', productionSerialIds)
      : { data: [] };
    const serialProgressByKey = new Map((serialProgressData ?? []).map((progress) => [`${progress.reception_item_id}:${progress.production_serial_id}`, progress]));
    const mapped = receptionRows.map((row) => {
      const customerRelation = Array.isArray(row.mes_customers) ? row.mes_customers[0] : row.mes_customers;
      const receptionItems: ReceptionItem[] = itemRows.filter((item) => item.reception_voucher_id === row.id).map((item) => {
        const itemCustomer = Array.isArray(item.mes_customers) ? item.mes_customers[0] : item.mes_customers;
        const productionOrder = item.production_order_id ? productionStatusById.get(item.production_order_id) : null;
        const productionIdentifiers = item.production_order_id ? productionIdentifiersById.get(item.production_order_id) : null;
        const serials = (productionIdentifiers?.serials ?? []).map((serial) => {
          const progress = serialProgressByKey.get(`${item.id}:${serial.id}`);
          return { ...serial, coatingSentAt: progress?.coating_sent_at ?? '', coatingReturnedAt: progress?.coating_returned_at ?? '', sentAt: progress?.sent_at ?? '' };
        });
        return { id: item.id, customerId: item.customer_id, customerName: itemCustomer?.customer_name ?? 'Unknown customer', quantity: item.quantity, productionOrderId: item.production_order_id ?? '', productionOrderNumber: item.production_order_number, productionStatus: productionOrder?.status ?? '', completedQuantity: productionOrder?.completedQuantity ?? 0, scrapQuantity: productionOrder?.scrapQuantity ?? 0, serialNumbers: productionIdentifiers?.serialNumbers ?? [], toolIds: productionIdentifiers?.toolIds ?? [], serials, coatingSentAt: item.coating_sent_at ?? '', coatingReturnedAt: item.coating_returned_at ?? '', sentAt: item.sent_at ?? '' };
      });
      const assignedItems = receptionItems.filter((item) => item.productionOrderId);
      const productionStatuses = assignedItems.map((item) => item.productionStatus);
      const allOrdersCompleted = productionStatuses.length > 0
        && productionStatuses.every((status) => status === 'completed');
      const allCoatingReturned = receptionItems.length > 0
        && receptionItems.every((item) => Boolean(item.coatingReturnedAt));
      const allOrdersAtQualityOrLater = productionStatuses.length > 0
        && productionStatuses.every((status) => status === 'waiting-inspection' || status === 'completed');
      const synchronizedStatus: ReceptionStatus = row.status === 'sent' || row.status === 'discrepancy' || row.status === 'waiting-delivery'
        ? row.status
        : assignedItems.length < receptionItems.length
          ? 'assign-orders'
          : productionStatuses.some((status) => status === 'cancelled')
            ? 'discrepancy'
          : allOrdersCompleted
            ? allCoatingReturned ? 'waiting-delivery' : 'coating'
          : allOrdersAtQualityOrLater
            ? 'quality-inspection'
            : assignedItems.length
              ? 'manufacturing'
              : 'assign-orders';
      return {
        id: row.id,
        voucherNumber: row.voucher_number,
        customerId: row.customer_id,
        customerName: customerRelation?.customer_name ?? 'Unknown customer',
        productionOrderId: row.production_order_id ?? '',
        productionOrderNumber: row.production_order_number,
        customerReference: row.customer_reference,
        packingSlip: row.packing_slip,
        carrier: row.carrier,
        partNumber: row.part_number,
        description: row.description,
        lotSerial: row.lot_serial,
        quantityExpected: row.quantity_expected,
        quantityReceived: row.quantity_received,
        status: synchronizedStatus,
        expectedDate: row.expected_date ?? '',
        receivedAt: row.received_at ?? '',
        sentAt: row.status === 'sent' ? row.updated_at ?? '' : '',
        notes: row.notes,
        createdAt: row.created_at,
        items: receptionItems,
      };
    });
    setVouchers(mapped);
    const requestedReceptionId = window.sessionStorage.getItem('yvimo:clients:receptions:selected-id') ?? '';
    setSelectedId((current) => requestedReceptionId && mapped.some((voucher) => voucher.id === requestedReceptionId)
      ? requestedReceptionId
      : mapped.some((voucher) => voucher.id === current) ? current : mapped[0]?.id ?? '');
    if (requestedReceptionId) window.sessionStorage.removeItem('yvimo:clients:receptions:selected-id');
    setError('');
    setLoading(false);
  }, [organizationId]);

  React.useEffect(() => { void loadVouchers(); }, [loadVouchers]);

  const selected = vouchers.find((voucher) => voucher.id === selectedId) ?? null;
  const active = vouchers.filter((voucher) => voucher.status !== 'sent');
  const filteredVouchers = React.useMemo(() => vouchers.filter((voucher) => {
    const matchesStatus = registryFilter === 'all' || voucher.status === registryFilter;
    const arrivalDate = voucher.expectedDate.slice(0, 10);
    const matchesFrom = !registryDateRange.from || arrivalDate >= registryDateRange.from;
    const matchesTo = !registryDateRange.to || arrivalDate <= registryDateRange.to;
    const orderSearch = registryOrderSearch.trim().toLocaleLowerCase();
    const productionOrders = [voucher.productionOrderNumber, ...voucher.items.flatMap((item) => [item.productionOrderNumber, ...item.serialNumbers, ...item.toolIds])]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase();
    const matchesOrder = !orderSearch || productionOrders.includes(orderSearch);
    return matchesStatus && matchesFrom && matchesTo && matchesOrder;
  }), [registryDateRange.from, registryDateRange.to, registryFilter, registryOrderSearch, vouchers]);

  const analysisVouchers = React.useMemo(() => vouchers.filter((voucher) => {
    const arrivalDate = voucher.expectedDate.slice(0, 10);
    const matchesFrom = !registryDateRange.from || arrivalDate >= registryDateRange.from;
    const matchesTo = !registryDateRange.to || arrivalDate <= registryDateRange.to;
    const matchesCustomer = !analysisCustomerId || voucher.items.some((item) => item.customerId === analysisCustomerId);
    return matchesFrom && matchesTo && matchesCustomer;
  }), [analysisCustomerId, registryDateRange.from, registryDateRange.to, vouchers]);

  const analysis = React.useMemo(() => {
    const items = analysisVouchers.flatMap((voucher) => voucher.items.filter((item) => !analysisCustomerId || item.customerId === analysisCustomerId));
    const hoursBetween = (from: string, to: string) => from && to ? Math.max(0, (new Date(to).getTime() - new Date(from).getTime()) / 3_600_000) : null;
    const cycleTimes = analysisVouchers.map((voucher) => hoursBetween(voucher.receivedAt || voucher.createdAt, voucher.sentAt)).filter((value): value is number => value !== null);
    const coatingTimes = items.map((item) => hoursBetween(item.coatingSentAt, item.coatingReturnedAt)).filter((value): value is number => value !== null);
    const clientTotals = Array.from(items.reduce((totals, item) => {
      const client = totals.get(item.customerId) ?? { customerName: item.customerName, pieces: 0 };
      client.pieces += item.quantity;
      totals.set(item.customerId, client);
      return totals;
    }, new Map<string, { customerName: string; pieces: number }>()).values()).sort((a, b) => b.pieces - a.pieces || a.customerName.localeCompare(b.customerName));
    const dayMap = new Map<string, { pieces: number; vouchers: Set<string>; clients: Map<string, { name: string; quantity: number }> }>();
    analysisVouchers.forEach((voucher) => {
      const date = voucher.expectedDate.slice(0, 10) || voucher.createdAt.slice(0, 10);
      const day = dayMap.get(date) ?? { pieces: 0, vouchers: new Set<string>(), clients: new Map() };
      voucher.items.filter((item) => !analysisCustomerId || item.customerId === analysisCustomerId).forEach((item) => {
        day.pieces += item.quantity;
        const client = day.clients.get(item.customerId) ?? { name: item.customerName, quantity: 0 };
        client.quantity += item.quantity;
        day.clients.set(item.customerId, client);
      });
      day.vouchers.add(voucher.id);
      dayMap.set(date, day);
    });
    const days = Array.from(dayMap.entries()).sort(([a], [b]) => a.localeCompare(b));
    return {
      items,
      totalPieces: items.reduce((total, item) => total + item.quantity, 0),
      completed: analysisVouchers.filter((voucher) => voucher.status === 'sent').length,
      averageCycleHours: cycleTimes.length ? cycleTimes.reduce((sum, value) => sum + value, 0) / cycleTimes.length : null,
      averageCoatingHours: coatingTimes.length ? coatingTimes.reduce((sum, value) => sum + value, 0) / coatingTimes.length : null,
      highestVolumeClient: clientTotals[0] ?? null,
      lowestVolumeClient: clientTotals[clientTotals.length - 1] ?? null,
      days,
      maxDayPieces: Math.max(1, ...days.map(([, day]) => day.pieces)),
    };
  }, [analysisCustomerId, analysisVouchers]);

  const analysisChartStats = React.useMemo<DailyReceptionStat[]>(() => {
    const palette = ['#ff7a00', '#7c3aed', '#0284c7', '#10b981', '#eab308', '#ef4444', '#ec4899'];
    const customerColors = new Map<string, string>();
    analysis.days.forEach(([, day]) => day.clients.forEach((_client, customerId) => {
      if (!customerColors.has(customerId)) customerColors.set(customerId, palette[customerColors.size % palette.length]);
    }));
    const today = new Date().toISOString().slice(0, 10);
    const stats = analysis.days.map(([date, day]) => {
      const parsed = new Date(`${date}T12:00:00`);
      return {
        date,
        dayLabel: new Intl.DateTimeFormat(languageCode === 'es' ? 'es-MX' : 'en-US', { weekday: 'short' }).format(parsed),
        dateLabel: new Intl.DateTimeFormat(languageCode === 'es' ? 'es-MX' : 'en-US', { month: 'short', day: 'numeric' }).format(parsed),
        isToday: date === today,
        totalPieces: day.pieces,
        voucherCount: day.vouchers.size,
        segments: Array.from(day.clients.entries()).map(([customerId, client]) => ({ customerId, customerName: client.name, quantity: client.quantity, color: customerColors.get(customerId) ?? palette[0] })),
      };
    });
    if (stats.length) return stats;
    const emptyDate = registryDateRange.to || registryDateRange.from || today;
    const parsed = new Date(`${emptyDate}T12:00:00`);
    return [{ date: emptyDate, dayLabel: new Intl.DateTimeFormat(languageCode === 'es' ? 'es-MX' : 'en-US', { weekday: 'short' }).format(parsed), dateLabel: new Intl.DateTimeFormat(languageCode === 'es' ? 'es-MX' : 'en-US', { month: 'short', day: 'numeric' }).format(parsed), isToday: emptyDate === today, totalPieces: 0, voucherCount: 0, segments: [] }];
  }, [analysis.days, languageCode, registryDateRange.from, registryDateRange.to]);

  React.useEffect(() => {
    if (!analysisOpen || analysisChartStats.some((stat) => stat.date === analysisSelectedDate)) return;
    setAnalysisSelectedDate(analysisChartStats.find((stat) => stat.isToday)?.date ?? analysisChartStats[0]?.date ?? '');
  }, [analysisChartStats, analysisOpen, analysisSelectedDate]);

  React.useEffect(() => {
    if (filteredVouchers.some((voucher) => voucher.id === selectedId)) return;
    setSelectedId(filteredVouchers[0]?.id ?? '');
  }, [filteredVouchers, selectedId]);

  const openForm = () => {
    const firstCustomerId = customers.find((customer) => customer.status === 'active')?.id ?? customers[0]?.id ?? '';
    const dateCode = new Date().toISOString().slice(2, 10).replaceAll('-', '');
    setGeneratedVoucherNumber(`RV-${dateCode}-${String(Date.now()).slice(-4)}`);
    setEditingVoucherId('');
    setForm({ ...emptyForm, customerId: firstCustomerId });
    setFormItems([{ customerId: firstCustomerId, quantity: '1' }]);
    setError('');
    setFormOpen(true);
  };

  const openEditForm = () => {
    if (!selected) return;
    setEditingVoucherId(selected.id);
    setGeneratedVoucherNumber(selected.voucherNumber);
    setForm({
      ...emptyForm,
      customerId: selected.items[0]?.customerId ?? '',
      customerReference: selected.customerReference,
      packingSlip: selected.packingSlip,
      carrier: selected.carrier,
      quantityExpected: String(selected.quantityExpected),
      expectedDate: selected.expectedDate.slice(0, 10),
      notes: selected.notes,
    });
    setFormItems(selected.items.map((item) => ({ id: item.id, customerId: item.customerId, quantity: String(item.quantity), productionOrderId: item.productionOrderId })));
    setCustomerMenuOpen(null);
    setError('');
    setFormOpen(true);
  };

  const saveVoucher = async (event: React.FormEvent) => {
    event.preventDefault();
    const validItems = formItems.filter((item) => item.customerId && Number(item.quantity) > 0);
    if (!validItems.length) return;
    setSaving(true);
    const totalQuantity = validItems.reduce((total, item) => total + Number(item.quantity), 0);
    if (editingVoucherId) {
      const existingVoucher = vouchers.find((voucher) => voucher.id === editingVoucherId);
      const retainedIds = new Set(validItems.map((item) => item.id).filter(Boolean));
      const removedAssignedItem = existingVoucher?.items.some((item) => item.productionOrderId && !retainedIds.has(item.id));
      if (removedAssignedItem) {
        setError('Sub-receptions with an assigned Production Order cannot be removed.');
        setSaving(false);
        return;
      }
      const { error: voucherUpdateError } = await supabase.from('mes_customer_reception_vouchers').update({
        customer_id: validItems[0].customerId,
        customer_reference: form.customerReference.trim(),
        packing_slip: form.packingSlip.trim(),
        carrier: form.carrier.trim(),
        quantity_expected: totalQuantity,
        expected_date: form.expectedDate || null,
        notes: form.notes.trim(),
        updated_at: new Date().toISOString(),
      }).eq('id', editingVoucherId).eq('organization_id', organizationId);
      if (voucherUpdateError) {
        setError(voucherUpdateError.message);
        setSaving(false);
        return;
      }
      const removedIds = existingVoucher?.items.filter((item) => !item.productionOrderId && !retainedIds.has(item.id)).map((item) => item.id) ?? [];
      if (removedIds.length) {
        const { error: removeItemsError } = await supabase.from('mes_customer_reception_items').delete().in('id', removedIds);
        if (removeItemsError) {
          setError(removeItemsError.message);
          setSaving(false);
          return;
        }
      }
      for (const item of validItems.filter((entry) => entry.id && !entry.productionOrderId)) {
        const { error: itemUpdateError } = await supabase.from('mes_customer_reception_items').update({ customer_id: item.customerId, quantity: Number(item.quantity), updated_at: new Date().toISOString() }).eq('id', item.id as string);
        if (itemUpdateError) {
          setError(itemUpdateError.message);
          setSaving(false);
          return;
        }
      }
      const newItems = validItems.filter((item) => !item.id);
      if (newItems.length) {
        const { error: newItemsError } = await supabase.from('mes_customer_reception_items').insert(newItems.map((item) => ({
          organization_id: organizationId,
          reception_voucher_id: editingVoucherId,
          customer_id: item.customerId,
          quantity: Number(item.quantity),
        })));
        if (newItemsError) {
          setError(newItemsError.message);
          setSaving(false);
          return;
        }
      }
      setSaving(false);
      setFormOpen(false);
      await loadVouchers();
      setSelectedId(editingVoucherId);
      return;
    }
    const { data: voucherData, error: saveError } = await supabase.from('mes_customer_reception_vouchers').insert({
      organization_id: organizationId,
      customer_id: validItems[0].customerId,
      voucher_number: generatedVoucherNumber,
      customer_reference: form.customerReference.trim(),
      packing_slip: form.packingSlip.trim(),
      carrier: form.carrier.trim(),
      part_number: '',
      description: '',
      lot_serial: '',
      quantity_expected: totalQuantity,
      expected_date: form.expectedDate || null,
      notes: form.notes.trim(),
      status: 'assign-orders',
    }).select('id').single();
    setSaving(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    const { error: itemsError } = await supabase.from('mes_customer_reception_items').insert(validItems.map((item) => ({
      organization_id: organizationId,
      reception_voucher_id: voucherData.id,
      customer_id: item.customerId,
      quantity: Number(item.quantity),
    })));
    if (itemsError) {
      setError(itemsError.message);
      return;
    }
    setFormOpen(false);
    await loadVouchers();
    setSelectedId(voucherData.id);
  };

  const deleteVoucher = async () => {
    if (!selected) return;
    const deletedId = selected.id;
    setSaving(true);
    const { error: deleteError } = await supabase.from('mes_customer_reception_vouchers').delete().eq('id', deletedId).eq('organization_id', organizationId);
    setSaving(false);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setDeleteOpen(false);
    setSelectedId('');
    await loadVouchers();
  };

  const markReceptionItemSent = async (item: ReceptionItem) => {
    if (item.sentAt || sendingItemId) return;
    setSendingItemId(item.id);
    setError('');
    const { error: sentError } = await supabase.rpc('mark_customer_reception_item_sent', {
      p_item_id: item.id,
      p_organization_id: organizationId,
    });
    setSendingItemId('');
    if (sentError) {
      setError(sentError.message);
      return;
    }
    await loadVouchers();
  };

  const updateReceptionItemCoating = async (item: ReceptionItem, action: 'sent' | 'returned') => {
    if (updatingCoatingItemId) return;
    setUpdatingCoatingItemId(item.id);
    setError('');
    const { error: coatingError } = await supabase.rpc('update_customer_reception_item_coating', {
      p_item_id: item.id,
      p_organization_id: organizationId,
      p_action: action,
    });
    setUpdatingCoatingItemId('');
    if (coatingError) {
      setError(coatingError.message);
      return;
    }
    await loadVouchers();
  };

  const updateSerialProgress = async (item: ReceptionItem, action: 'coating-sent' | 'coating-returned' | 'sent', serialId?: string) => {
    if (updatingSerialKey) return;
    const operationKey = `${item.id}:${serialId ?? 'all'}:${action}`;
    setUpdatingSerialKey(operationKey);
    setError('');
    const { error: progressError } = await supabase.rpc('update_customer_reception_serial_progress', {
      p_item_id: item.id,
      p_organization_id: organizationId,
      p_action: action,
      p_production_serial_id: serialId ?? null,
    });
    setUpdatingSerialKey('');
    if (progressError) {
      setError(progressError.message);
      return;
    }
    await loadVouchers();
  };

  const forceWaitingDelivery = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    setOverrideError('');
    const { error: overrideRequestError } = await supabase.rpc('force_customer_reception_waiting_delivery', {
      p_reception_id: selected.id,
      p_confirmation_code: overrideCode,
    });
    setSaving(false);
    if (overrideRequestError) {
      setOverrideError(overrideRequestError.message.includes('Invalid confirmation code') ? 'The confirmation code is incorrect.' : overrideRequestError.message);
      return;
    }
    setOverrideOpen(false);
    setOverrideCode('');
    await loadVouchers();
  };

  const registerProductionOrder = (item: ReceptionItem) => {
    if (!selected) return;
    window.sessionStorage.setItem('yvimo:mes:production-order:reception-draft', JSON.stringify({
      receptionId: selected.id,
      receptionItemId: item.id,
      customerId: item.customerId,
      clientName: item.customerName,
      plannedQuantity: item.quantity,
      customerReference: selected.customerReference,
    }));
    onNavigate('/workspace/manufacturing-ops/mes/orders');
  };

  const openExistingOrderModal = async (item: ReceptionItem) => {
    setExistingOrderItem(item);
    setExistingOrderSearch('');
    setExistingOrderCustomerId(item.customerId);
    setExistingOrderId('');
    setExistingOrderError('');
    setExistingOrderCustomerMenuOpen(false);
    setExistingOrderMenuOpen(false);
    setExistingOrdersLoading(true);
    const { data, error: ordersError } = await supabase
      .from('mes_production_orders')
      .select('id, order_number, customer_id, client_name, part_name, status, planned_quantity')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });
    setExistingOrdersLoading(false);
    if (ordersError) {
      setExistingOrderError(ordersError.message);
      setExistingOrders([]);
      return;
    }
    setExistingOrders((data ?? []).map((order) => ({
      id: order.id,
      orderNumber: order.order_number,
      customerId: order.customer_id ?? '',
      clientName: order.client_name ?? 'Unknown client',
      partName: order.part_name ?? '',
      status: order.status ?? '',
      plannedQuantity: Number(order.planned_quantity) || 0,
    })));
  };

  const assignExistingOrder = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!existingOrderItem || !selected || !existingOrderId) return;
    const order = existingOrders.find((entry) => entry.id === existingOrderId);
    if (!order) return;
    setSaving(true);
    setExistingOrderError('');
    const { error: assignmentError } = await supabase
      .from('mes_customer_reception_items')
      .update({
        production_order_id: order.id,
        production_order_number: order.orderNumber,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingOrderItem.id)
      .eq('reception_voucher_id', selected.id)
      .eq('organization_id', organizationId)
      .is('production_order_id', null);
    setSaving(false);
    if (assignmentError) {
      setExistingOrderError(assignmentError.message);
      return;
    }
    setExistingOrderItem(null);
    await loadVouchers();
  };

  const assignedProductionOrderIds = React.useMemo(() => new Set(vouchers.flatMap((voucher) => voucher.items.map((item) => item.productionOrderId).filter(Boolean))), [vouchers]);
  const filteredExistingOrders = React.useMemo(() => {
    const search = existingOrderSearch.trim().toLocaleLowerCase();
    return existingOrders.filter((order) => {
      const matchesCustomer = !existingOrderCustomerId || order.customerId === existingOrderCustomerId;
      const matchesSearch = !search || `${order.orderNumber} ${order.partName} ${order.clientName} ${order.status}`.toLocaleLowerCase().includes(search);
      return matchesCustomer && matchesSearch;
    });
  }, [existingOrderCustomerId, existingOrderSearch, existingOrders]);

  const clearRegistryFilters = () => {
    const today = new Date().toISOString().slice(0, 10);
    setRegistryFilter('all');
    setRegistryFilterOpen(false);
    setRegistryOrderSearch('');
    setRegistryDateRange({ from: today, to: today });
  };

  return localizeClientsTree((
    <div className="client-receptions-workspace">
      <div className="client-receptions-toolbar">
        <span>{active.length} active reception vouchers</span>
        <button type="button" onClick={openForm} disabled={!customers.length}><Plus size={16} /> Add Reception Voucher</button>
      </div>
      {error ? <div className="clients-feedback error">{error}</div> : null}
      <div className="client-reception-registry-filters">
        <div className="client-reception-filter-dropdown" ref={registryFilterRef}>
          <button type="button" aria-haspopup="menu" aria-expanded={registryFilterOpen} onClick={() => setRegistryFilterOpen((open) => !open)}><span><BarChart3 size={16} /> Filters</span><strong>{registryFilter === 'all' ? 'All' : labelStatus(registryFilter)}</strong><ChevronDown size={17} /></button>
          {registryFilterOpen ? <div className="client-reception-filter-menu" role="menu" aria-label="Filter reception vouchers by progress">{([
            ['all', 'All'],
            ['reception', 'Reception'],
            ['assign-orders', 'Assign Orders'],
            ['manufacturing', 'Manufacturing'],
            ['quality-inspection', 'Quality Inspection'],
            ['coating', 'Coating'],
            ['waiting-delivery', 'Waiting to Deliver'],
            ['sent', 'Sent'],
            ['discrepancy', 'Discrepancy'],
          ] as Array<[ReceptionRegistryFilter, string]>).map(([value, label]) => (
            <button
              type="button"
              role="menuitemradio"
              className={registryFilter === value ? 'active' : ''}
              aria-checked={registryFilter === value}
              onClick={() => { setRegistryFilter(value); setRegistryFilterOpen(false); }}
              key={value}
            >
              <span>{label}</span>{registryFilter === value ? <Check size={15} /> : null}
            </button>
          ))}</div> : null}
        </div>
        <label className="client-reception-order-search">
          <span>Search Orders, Serials or Tool IDs</span>
          <span><Search size={17} /><input value={registryOrderSearch} onChange={(event) => setRegistryOrderSearch(event.target.value)} placeholder={translateClientsText(languageCode, 'Order, serial or Tool ID')} /></span>
        </label>
        <div className="client-reception-date-filters">
          <label>
            <span>From</span>
            <MesOrderDatePicker
              id="client-reception-registry-from"
              value={registryDateRange.from}
              placeholder={translateClientsText(languageCode, 'Select date')}
              onChange={(from) => setRegistryDateRange((current) => ({ ...current, from }))}
              onQuickRange={setRegistryDateRange}
            />
          </label>
          <label>
            <span>To</span>
            <MesOrderDatePicker
              id="client-reception-registry-to"
              value={registryDateRange.to}
              placeholder={translateClientsText(languageCode, 'Select date')}
              onChange={(to) => setRegistryDateRange((current) => ({ ...current, to }))}
              onQuickRange={setRegistryDateRange}
            />
          </label>
          <button className="client-reception-analysis-button" type="button" onClick={() => { setAnalysisCustomerId(''); setAnalysisSelectedDate(''); setAnalysisOpen(true); }}><BarChart3 size={17} /> Reception Analysis</button>
          <button className="client-reception-clear-filters" type="button" onClick={clearRegistryFilters}><RotateCcw size={16} /> Clear Filters</button>
        </div>
      </div>
      <div className="supplier-transfer-registry-layout client-receptions-layout">
        <section className={`supplier-active-transfers${registryExpanded ? '' : ' registry-collapsed'}`}>
          <div><span><ClipboardCheck size={16} /> Reception Registry</span><span className="client-reception-registry-heading-actions"><strong>{filteredVouchers.length} shown</strong><button type="button" aria-expanded={registryExpanded} onClick={() => setRegistryExpanded((expanded) => !expanded)}><ChevronDown size={17} /><span>{registryExpanded ? 'Collapse' : 'Show registry'}</span></button></span></div>
          <div className="supplier-active-transfer-list">
            {filteredVouchers.map((voucher) => (
              <article
                className={voucher.id === selectedId ? 'active' : ''}
                key={voucher.id}
                role="button"
                tabIndex={0}
                aria-pressed={voucher.id === selectedId}
                onClick={() => setSelectedId(voucher.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedId(voucher.id);
                  }
                }}
              >
                <button type="button" className="supplier-active-transfer-select" onClick={() => setSelectedId(voucher.id)}>
                  <span className="supplier-transfer-registry-icon"><PackageCheck size={18} /></span>
                  <span className="supplier-transfer-registry-copy">
                    <strong>{voucher.voucherNumber}</strong>
                    <em>{voucher.productionOrderNumber ? `Order ${voucher.productionOrderNumber}` : 'Production order not registered'}</em>
                    <small>{voucher.quantityExpected.toLocaleString()} expected parts</small>
                  </span>
                </button>
                <div className="supplier-transfer-registry-meta">
                  <span className="supplier-active-transfer-supplier">{voucher.items.length === 1 ? voucher.items[0].customerName : `${voucher.items.length} clients`}</span>
                  <span className={`client-reception-status ${voucher.status}`}>{labelStatus(voucher.status)}</span>
                </div>
                <div className="client-reception-registry-dates">
                  <span className="client-reception-registry-date">
                    <CalendarDays size={15} />
                    <span><small>Arrival date</small><strong>{formatDate(voucher.expectedDate, languageCode)}</strong></span>
                  </span>
                  {voucher.status === 'sent' && voucher.sentAt ? (
                    <span className="client-reception-registry-date sent">
                      <Truck size={15} />
                      <span><small>Sent date</small><strong>{formatDate(voucher.sentAt, languageCode)}</strong></span>
                    </span>
                  ) : null}
                </div>
              </article>
            ))}
            {!filteredVouchers.length && !loading ? <div className="supplier-empty-note">No reception vouchers match these filters.</div> : null}
          </div>
        </section>

        <section className="supplier-transfer-combined-panel">
          {selected ? (
            <div className="supplier-selected-transfer-summary">
              <div className="supplier-transfer-detail-hero">
                <span className="supplier-transfer-detail-icon"><PackageCheck size={24} /></span>
                <div><small>Customer reception voucher</small><h3>{selected.voucherNumber}</h3><p>{selected.items.length} client item{selected.items.length === 1 ? '' : 's'} · {selected.quantityExpected.toLocaleString()} pieces</p></div>
                <div className="client-reception-hero-controls">
                  <span className={`client-reception-status ${selected.status}`}>{labelStatus(selected.status)}</span>
                  <button type="button" className="client-reception-edit-button" onClick={openEditForm}><Pencil size={15} /> Edit</button>
                  <button type="button" className="client-reception-delete-button" onClick={() => setDeleteOpen(true)}><Trash2 size={15} /> Delete</button>
                </div>
              </div>
              <ol className={`supplier-transfer-progress client-reception-progress${selected.status === 'sent' ? ' completed' : ''}`}>
                {steps.map((step, index) => {
                  const currentStep = statusStep[selected.status];
                  const isCompleted = selected.status === 'sent' || index < currentStep;
                  return <li className={`${isCompleted ? 'complete' : ''} ${index === currentStep ? `current ${selected.status === 'discrepancy' ? 'exception' : ''}` : ''}`} key={step}><span>{isCompleted ? <Check size={15} /> : index + 1}</span><strong>{index === currentStep && selected.status === 'discrepancy' ? 'Discrepancy' : step}</strong></li>;
                })}
              </ol>
              <div className="supplier-selected-transfer-grid client-reception-identification">
                <span><b>Voucher ID</b>{selected.voucherNumber}</span>
                <span><b>Clients</b>{selected.items.length.toLocaleString()}</span>
                <span><b>Carrier</b>{selected.carrier || 'Not specified'}</span>
                <span><b>Arrival Date</b>{formatDate(selected.expectedDate, languageCode)}</span>
                <span className={`supplier-selected-transfer-status client-reception-status-box ${selected.status}`}><b>Status</b><strong>{labelStatus(selected.status)}</strong></span>
              </div>
              <div className="client-reception-actions">
                {!['waiting-delivery', 'sent'].includes(selected.status) ? <button className="client-reception-override-action" type="button" onClick={() => { setOverrideCode(''); setOverrideError(''); setOverrideOpen(true); }}><ShieldAlert size={16} /> Skip to Waiting to Deliver</button> : null}
                {selected.status === 'coating' ? <span className="client-reception-coating-guidance"><PaintBucket size={16} /> Confirm coating dispatch and return for each sub-reception below.</span> : null}
                {selected.status === 'waiting-delivery' ? <span className="client-reception-delivery-guidance"><Truck size={16} /> Mark each completed sub-reception as sent below.</span> : null}
                {selected.status === 'sent' ? <button type="button" disabled><Check size={16} /> All Sub-receptions Sent</button> : null}
              </div>
              <section className="client-reception-items">
                <header><div><strong>Sub-receptions by Client</strong><span>{selected.items.length} items · {selected.quantityExpected.toLocaleString()} total pieces</span></div></header>
                <div>
                  {selected.items.map((item, index) => (
                    <article key={item.id}>
                      <div className="client-reception-item-summary">
                        <span className="client-reception-item-number">{index + 1}</span>
                        <div><small>Client</small><strong>{item.customerName}</strong></div>
                        <div className="client-reception-item-quantity"><small>Quantity</small><strong>{item.quantity.toLocaleString()}</strong></div>
                        <div className="client-reception-item-produced"><small>Produced</small><strong>{item.completedQuantity.toLocaleString()}</strong></div>
                        <div className="client-reception-item-scrap"><small>Scrap</small><strong>{item.scrapQuantity.toLocaleString()}</strong></div>
                        <div className="client-reception-item-order"><small>Production Order</small>{item.productionOrderId ? <strong className="assigned-order">{item.productionOrderNumber}</strong> : <div className="client-reception-order-actions"><button type="button" onClick={() => registerProductionOrder(item)}><Plus size={15} /> Assign New Order</button><button type="button" className="existing" onClick={() => void openExistingOrderModal(item)}><Search size={15} /> Assign Existing Order</button></div>}</div>
                        <div className="client-reception-item-order-status"><small>Order Status</small><strong className={item.productionStatus || 'not-assigned'}>{labelProductionStatus(item.productionStatus)}</strong></div>
                        <div className="client-reception-item-bulk-action"><small>Process all pieces</small>
                          {!item.coatingSentAt ? <button type="button" onClick={() => void (item.serials.length ? updateSerialProgress(item, 'coating-sent') : updateReceptionItemCoating(item, 'sent'))} disabled={Boolean(updatingSerialKey || updatingCoatingItemId) || item.productionStatus !== 'completed'}><Send size={15} /> Send All to Coating</button> : !item.coatingReturnedAt ? <button className="return" type="button" onClick={() => void (item.serials.length ? updateSerialProgress(item, 'coating-returned') : updateReceptionItemCoating(item, 'returned'))} disabled={Boolean(updatingSerialKey || updatingCoatingItemId)}><RotateCcw size={15} /> Receive Coating All</button> : !item.sentAt ? <button className="deliver" type="button" onClick={() => void (item.serials.length ? updateSerialProgress(item, 'sent') : markReceptionItemSent(item))} disabled={Boolean(updatingSerialKey || sendingItemId)}><Truck size={15} /> Send All</button> : <span className="all-complete"><Check size={14} /> All Sent</span>}
                        </div>
                      </div>
                      {item.serials.length ? <div className="client-reception-serials"><header><strong>Serial numbers in this order</strong><span>{item.serials.length} pieces</span></header><div className="client-reception-serial-list">
                        {item.serials.map((serial) => <div className="client-reception-serial-row" key={serial.id}>
                          <span><small>Serial Number</small><strong>{serial.serialNumber}</strong></span>
                          <span><small>Tool ID</small><strong>{serial.toolId || 'Not specified'}</strong></span>
                          <span className={`piece-stage ${serial.coatingSentAt ? 'done' : ''}`}><small>Coating dispatch</small><button type="button" onClick={() => void updateSerialProgress(item, 'coating-sent', serial.id)} disabled={Boolean(updatingSerialKey) || Boolean(serial.coatingSentAt) || item.productionStatus !== 'completed'}>{serial.coatingSentAt ? <><Check size={14} /> Sent</> : <><Send size={14} /> Send to Coating</>}</button></span>
                          <span className={`piece-stage ${serial.coatingReturnedAt ? 'done' : ''}`}><small>Coating return</small><button type="button" onClick={() => void updateSerialProgress(item, 'coating-returned', serial.id)} disabled={Boolean(updatingSerialKey) || !serial.coatingSentAt || Boolean(serial.coatingReturnedAt)}>{serial.coatingReturnedAt ? <><Check size={14} /> Received</> : <><RotateCcw size={14} /> Receive Coating</>}</button></span>
                          <span className={`piece-stage delivery ${serial.sentAt ? 'done' : ''}`}><small>Delivery</small><button type="button" onClick={() => void updateSerialProgress(item, 'sent', serial.id)} disabled={Boolean(updatingSerialKey) || !serial.coatingReturnedAt || Boolean(serial.sentAt)}>{serial.sentAt ? <><Check size={14} /> Sent</> : <><Truck size={14} /> Send</>}</button></span>
                        </div>)}
                      </div></div> : item.productionOrderId ? <div className="client-reception-serials-empty">Serial numbers will appear when completed pieces are reported for this order.</div> : null}
                    </article>
                  ))}
                </div>
              </section>
              <div className="client-reception-detail-bottom">
                <section className="client-reception-notes-card">
                  <header><span><FileText size={18} /></span><div><strong>Description & Notes</strong><small>General receiving information</small></div></header>
                  <div>
                    <article><small>Description</small><p className={!selected.description ? 'empty' : ''}>{selected.description || 'No description provided.'}</p></article>
                    <article><small>Reception Notes</small><p className={!selected.notes ? 'empty' : ''}>{selected.notes || 'No reception notes yet.'}</p></article>
                  </div>
                </section>
              </div>
            </div>
          ) : <div className="clients-empty-state"><PackageCheck size={28} /><strong>Select a reception voucher</strong></div>}
        </section>
      </div>

      {formOpen ? (
        <div className="mes-modal-backdrop production-order-form-backdrop" role="presentation">
          <section className="mes-order-modal client-reception-modal" role="dialog" aria-modal="true">
            <button className="supplier-modal-close" type="button" onClick={() => setFormOpen(false)}><X size={18} /></button>
            <form className="mes-order-form" onSubmit={saveVoucher}>
              <div className="mes-order-form-wide"><p className="eyebrow">Customer Reception</p><h3>{editingVoucherId ? 'Edit Reception Voucher' : 'Add Reception Voucher'}</h3><p>{editingVoucherId ? 'Update receiving information and unassigned client items.' : 'Register parts expected from a client at the receiving area.'}</p></div>
              <label>Reception ID<input value={generatedVoucherNumber} readOnly /></label>
              <label>Arrival Date<MesOrderDatePicker id="client-reception-arrival-date" value={form.expectedDate} placeholder="Select arrival date" onChange={(expectedDate) => setForm((current) => ({ ...current, expectedDate }))} /></label>
              <label>Customer Reference <small>Optional</small><input value={form.customerReference} onChange={(event) => setForm((current) => ({ ...current, customerReference: event.target.value }))} /></label>
              <label>Sender Contact Name <small>Optional</small><input value={form.packingSlip} onChange={(event) => setForm((current) => ({ ...current, packingSlip: event.target.value }))} /></label>
              <label>Carrier <small>Optional</small><input value={form.carrier} onChange={(event) => setForm((current) => ({ ...current, carrier: event.target.value }))} /></label>
              <label className="mes-order-form-wide client-reception-notes">Notes <small>Optional</small><textarea value={form.notes} placeholder="Add receiving notes, package condition, or special handling details." onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></label>
              <fieldset className="mes-order-form-wide client-reception-form-items">
                <legend>Sub-receptions by Client</legend>
                {formItems.map((item, index) => (
                  <div className={item.productionOrderId ? 'order-assigned' : ''} key={item.id ?? `reception-item-${index}`}>
                    <label>Client<ReceptionPortalDropdown open={customerMenuOpen === index} onOpenChange={(open) => setCustomerMenuOpen(open ? index : null)} disabled={Boolean(item.productionOrderId)} className="client-reception-customer-dropdown" menuClassName="form-customer" label={customers.find((customer) => customer.id === item.customerId)?.customerName || 'Select customer'}>{customers.filter((customer) => customer.status === 'active').map((customer) => <button type="button" className={customer.id === item.customerId ? 'selected' : ''} onClick={() => { setFormItems((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, customerId: customer.id } : entry)); setCustomerMenuOpen(null); }} key={customer.id}>{customer.customerName}{customer.id === item.customerId ? <Check size={15} /> : null}</button>)}</ReceptionPortalDropdown>{item.productionOrderId ? <small>Locked · Production Order assigned</small> : null}</label>
                    <label>Quantity<input type="number" min="1" disabled={Boolean(item.productionOrderId)} value={item.quantity} onChange={(event) => setFormItems((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, quantity: event.target.value } : entry))} /></label>
                    <button type="button" onClick={() => setFormItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} disabled={formItems.length === 1 || Boolean(item.productionOrderId)} aria-label="Remove client item"><X size={16} /></button>
                  </div>
                ))}
                <button type="button" onClick={() => setFormItems((current) => [...current, { customerId: customers.find((customer) => customer.status === 'active')?.id ?? '', quantity: '1' }])}><Plus size={16} /> Add Client Item</button>
              </fieldset>
              <div className="mes-order-form-actions mes-order-form-wide"><button type="button" className="secondary" onClick={() => setFormOpen(false)}>Cancel</button><button type="submit" disabled={saving}>{saving ? 'Saving...' : editingVoucherId ? 'Save Changes' : 'Create Voucher'}</button></div>
            </form>
          </section>
        </div>
      ) : null}

      {analysisOpen ? createPortal((
        <div className="mes-modal-backdrop client-reception-analysis-backdrop" role="presentation">
          <section className="client-reception-analysis-modal" role="dialog" aria-modal="true" aria-labelledby="reception-analysis-title">
            <header>
              <div><p className="eyebrow">Reception Intelligence</p><h3 id="reception-analysis-title">Reception Analysis</h3><p>{registryDateRange.from || 'All dates'} — {registryDateRange.to || 'Today'}</p></div>
              <button type="button" aria-label="Close reception analysis" onClick={() => setAnalysisOpen(false)}><X size={20} /></button>
            </header>
            <div className="client-reception-analysis-overview">
              <div className="client-reception-analysis-secondary-kpis">
                <article><span><TrendingUp size={18} /></span><small>Most Pieces Received</small><strong>{analysis.highestVolumeClient?.customerName ?? '—'}</strong><em>{analysis.highestVolumeClient ? `${analysis.highestVolumeClient.pieces.toLocaleString()} pieces` : 'No data'}</em></article>
                <article><span><TrendingDown size={18} /></span><small>Fewest Pieces Received</small><strong>{analysis.lowestVolumeClient?.customerName ?? '—'}</strong><em>{analysis.lowestVolumeClient ? `${analysis.lowestVolumeClient.pieces.toLocaleString()} pieces` : 'No data'}</em></article>
                <article className="value"><span><CircleDollarSign size={18} /></span><small>Total Received Value</small><strong>—</strong><em>Pending valuation formula</em></article>
              </div>
              <div className="client-reception-analysis-filter">
                <label>Client<select value={analysisCustomerId} onChange={(event) => setAnalysisCustomerId(event.target.value)}><option value="">All clients</option>{customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.customerName}</option>)}</select></label>
              </div>
            </div>
            <div className="client-reception-analysis-kpis">
              <article><span><ClipboardCheck size={18} /></span><small>Receptions</small><strong>{analysisVouchers.length}</strong></article>
              <article><span><Users size={18} /></span><small>Sub-receptions</small><strong>{analysis.items.length}</strong></article>
              <article><span><PackageCheck size={18} /></span><small>Received Pieces</small><strong>{analysis.totalPieces.toLocaleString()}</strong></article>
              <article><span><Check size={18} /></span><small>Completion Rate</small><strong>{analysisVouchers.length ? Math.round(analysis.completed / analysisVouchers.length * 100) : 0}%</strong></article>
              <article><span><Clock3 size={18} /></span><small>Avg. Reception Cycle</small><strong>{analysis.averageCycleHours === null ? '—' : `${analysis.averageCycleHours.toFixed(1)} h`}</strong></article>
              <article><span><PaintBucket size={18} /></span><small>Avg. Coating Time</small><strong>{analysis.averageCoatingHours === null ? '—' : `${analysis.averageCoatingHours.toFixed(1)} h`}</strong></article>
            </div>
            <section className="client-reception-analysis-chart">
              <header><div><strong>Receptions by Day and Client</strong><small>Received pieces · segmented by client</small></div></header>
              <WeeklyReceptionsChart stats={analysisChartStats} selectedDate={analysisSelectedDate} onSelectDate={setAnalysisSelectedDate} />
            </section>
            <section className="client-reception-analysis-list">
              <header><strong>Reception and Sub-reception Detail</strong><span>{analysisVouchers.length} receptions</span></header>
              <div>{analysisVouchers.map((voucher) => {
                const currentStep = statusStep[voucher.status];
                return <article key={voucher.id}>
                  <div className="client-reception-analysis-voucher-header"><div><strong>{voucher.voucherNumber}</strong><small>{formatDate(voucher.expectedDate, languageCode)} · {voucher.quantityExpected.toLocaleString()} pieces · {voucher.items.length} sub-reception{voucher.items.length === 1 ? '' : 's'}</small></div><span className={`client-reception-status ${voucher.status}`}>{labelStatus(voucher.status)}</span></div>
                  <ol className={`supplier-transfer-progress client-reception-progress${voucher.status === 'sent' ? ' completed' : ''}`}>{steps.map((step, index) => { const isCompleted = voucher.status === 'sent' || index < currentStep; return <li className={`${isCompleted ? 'complete' : ''} ${index === currentStep ? `current ${voucher.status === 'discrepancy' ? 'exception' : ''}` : ''}`} key={step}><span>{isCompleted ? <Check size={12} /> : index + 1}</span><strong>{index === currentStep && voucher.status === 'discrepancy' ? 'Discrepancy' : step}</strong></li>; })}</ol>
                  <div className="client-reception-analysis-subreceptions">{voucher.items.filter((item) => !analysisCustomerId || item.customerId === analysisCustomerId).map((item, index) => <div className="client-reception-analysis-subrow" key={item.id}>
                    <span className="client-reception-item-number">{index + 1}</span>
                    <div className="client"><small>Client</small><strong>{item.customerName}</strong></div>
                    <div className="client-reception-item-quantity"><small>Quantity</small><strong>{item.quantity.toLocaleString()}</strong></div>
                    <div className="client-reception-item-produced"><small>Produced</small><strong>{item.completedQuantity.toLocaleString()}</strong></div>
                    <div className="client-reception-item-scrap"><small>Scrap</small><strong>{item.scrapQuantity.toLocaleString()}</strong></div>
                    <div className="order"><small>Production Order</small><strong>{item.productionOrderNumber || 'No production order'}</strong></div>
                    <div className="client-reception-item-order-status"><small>Order Status</small><strong className={item.productionStatus || 'not-assigned'}>{labelProductionStatus(item.productionStatus)}</strong></div>
                    <div className="process"><small>Coating</small><strong className={item.coatingReturnedAt ? 'done' : item.coatingSentAt ? 'active' : 'pending'}>{item.coatingReturnedAt ? 'Returned' : item.coatingSentAt ? 'At supplier' : 'Pending'}</strong></div>
                    <div className="process"><small>Delivery</small><strong className={item.sentAt ? 'done' : 'pending'}>{item.sentAt ? 'Sent' : 'Pending'}</strong></div>
                  </div>)}</div>
                </article>;
              })}</div>
            </section>
          </section>
        </div>
      ), document.body) : null}

      {deleteOpen && selected ? (
        <div className="mes-modal-backdrop production-order-form-backdrop client-reception-delete-backdrop" role="presentation">
          <section className="mes-order-modal client-reception-delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="reception-delete-title">
            <button className="supplier-modal-close" type="button" onClick={() => setDeleteOpen(false)} disabled={saving}><X size={18} /></button>
            <span className="client-reception-delete-icon"><AlertTriangle size={26} /></span>
            <p className="eyebrow">Delete Reception Voucher</p>
            <h3 id="reception-delete-title">Delete {selected.voucherNumber}?</h3>
            <p>This permanently removes the voucher and its <strong>{selected.items.length} sub-reception{selected.items.length === 1 ? '' : 's'}</strong>. Production Orders already created will remain, but their link to this reception will be removed.</p>
            <div className="client-reception-delete-summary"><span>Received pieces</span><strong>{selected.quantityExpected.toLocaleString()}</strong></div>
            <div className="client-reception-delete-actions">
              <button type="button" className="secondary" onClick={() => setDeleteOpen(false)} disabled={saving}>Cancel</button>
              <button type="button" onClick={() => void deleteVoucher()} disabled={saving}><Trash2 size={16} /> {saving ? 'Deleting...' : 'Delete Voucher'}</button>
            </div>
          </section>
        </div>
      ) : null}

      {overrideOpen && selected ? (
        <div className="mes-modal-backdrop production-order-form-backdrop client-reception-override-backdrop" role="presentation">
          <section className="mes-order-modal client-reception-override-modal" role="dialog" aria-modal="true" aria-labelledby="reception-override-title">
            <button className="supplier-modal-close" type="button" onClick={() => setOverrideOpen(false)} disabled={saving}><X size={18} /></button>
            <form onSubmit={forceWaitingDelivery}>
              <span className="client-reception-override-icon"><ShieldAlert size={25} /></span>
              <p className="eyebrow">Administrative Override</p>
              <h3 id="reception-override-title">Skip to Waiting to Deliver?</h3>
              <p>This bypasses Assign Orders, Manufacturing, Quality Inspection, and Coating for <strong>{selected.voucherNumber}</strong>. This action should only be used for an authorized exception.</p>
              <label>
                Confirmation Code
                <input type="password" inputMode="numeric" autoComplete="off" value={overrideCode} onChange={(event) => setOverrideCode(event.target.value)} placeholder="Enter authorization code" autoFocus required />
              </label>
              {overrideError ? <div className="clients-feedback error" role="alert">{overrideError}</div> : null}
              <div>
                <button type="button" className="secondary" onClick={() => setOverrideOpen(false)} disabled={saving}>Cancel</button>
                <button type="submit" disabled={saving || overrideCode.length !== 4}>{saving ? 'Applying...' : 'Confirm Override'}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {existingOrderItem && selected ? (
        <div className="mes-modal-backdrop production-order-form-backdrop client-reception-existing-order-backdrop" role="presentation">
          <section className="mes-order-modal client-reception-existing-order-modal" role="dialog" aria-modal="true" aria-labelledby="existing-order-title">
            <button className="supplier-modal-close" type="button" onClick={() => setExistingOrderItem(null)} disabled={saving}><X size={18} /></button>
            <form onSubmit={assignExistingOrder}>
              <p className="eyebrow">Customer Reception</p>
              <h3 id="existing-order-title">Assign Existing Order</h3>
              <p>Link an existing Production Order to the <strong>{existingOrderItem.customerName}</strong> sub-reception with {existingOrderItem.quantity.toLocaleString()} pieces.</p>
              <div className="client-reception-existing-order-filters">
                <label>Search Production Orders<div className="client-reception-existing-order-search"><Search size={18} /><input value={existingOrderSearch} onChange={(event) => setExistingOrderSearch(event.target.value)} placeholder="Order number, part, client, or status..." autoFocus /></div></label>
                <label>Client<ReceptionPortalDropdown open={existingOrderCustomerMenuOpen} onOpenChange={(open) => { setExistingOrderCustomerMenuOpen(open); setExistingOrderMenuOpen(false); }} label={customers.find((customer) => customer.id === existingOrderCustomerId)?.customerName ?? 'All clients'}><button type="button" className={!existingOrderCustomerId ? 'selected' : ''} onClick={() => { setExistingOrderCustomerId(''); setExistingOrderId(''); setExistingOrderCustomerMenuOpen(false); }}>All clients{!existingOrderCustomerId ? <Check size={16} /> : null}</button>{customers.map((customer) => <button type="button" className={customer.id === existingOrderCustomerId ? 'selected' : ''} onClick={() => { setExistingOrderCustomerId(customer.id); setExistingOrderId(''); setExistingOrderCustomerMenuOpen(false); }} key={customer.id}>{customer.customerName}{customer.id === existingOrderCustomerId ? <Check size={16} /> : null}</button>)}</ReceptionPortalDropdown></label>
              </div>
              <label className="client-reception-existing-order-select">Production Order<ReceptionPortalDropdown open={existingOrderMenuOpen} onOpenChange={(open) => { setExistingOrderMenuOpen(open); setExistingOrderCustomerMenuOpen(false); }} disabled={existingOrdersLoading} menuClassName="order" label={existingOrdersLoading ? 'Loading Production Orders...' : existingOrderId ? (() => { const order = existingOrders.find((entry) => entry.id === existingOrderId); return order ? `${order.orderNumber} · ${order.clientName} · ${order.partName || 'Part not specified'}` : 'Select a Production Order'; })() : 'Select a Production Order'}>{filteredExistingOrders.length ? filteredExistingOrders.map((order) => { const assigned = assignedProductionOrderIds.has(order.id); return <button type="button" className={order.id === existingOrderId ? 'selected' : ''} disabled={assigned} onClick={() => { setExistingOrderId(order.id); setExistingOrderMenuOpen(false); }} key={order.id}><span><strong>{order.orderNumber}</strong><small>{order.clientName} · {order.partName || 'Part not specified'} · Qty. {order.plannedQuantity} · {labelProductionStatus(order.status)}</small></span>{assigned ? <em>Already assigned</em> : order.id === existingOrderId ? <Check size={17} /> : null}</button>; }) : <div className="empty">No Production Orders match these filters.</div>}</ReceptionPortalDropdown><small>{filteredExistingOrders.length} matching order{filteredExistingOrders.length === 1 ? '' : 's'}</small></label>
              {existingOrderError ? <div className="clients-feedback error" role="alert">{existingOrderError}</div> : null}
              <div className="client-reception-existing-order-actions"><button type="button" className="secondary" onClick={() => setExistingOrderItem(null)} disabled={saving}>Cancel</button><button type="submit" disabled={saving || !existingOrderId}>{saving ? 'Assigning...' : 'Assign Existing Order'}</button></div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  ), languageCode);
}
