import React from 'react';
import { createPortal } from 'react-dom';
import { Activity, AlertTriangle, ArrowLeft, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleHelp, CircleX, Database, Eye, Factory, Frown, FileText, ImagePlus, Maximize2, Meh, Minimize2, Minus, Pencil, Plus, RadioTower, Ruler, Search, Smile, Timer, X } from 'lucide-react';
import { GoogleWorkCentersMap } from '../components/maps/GoogleWorkCentersMap';
import { resolveGooglePlacesAddressMatch, searchGooglePlacesAddressMatches, type GooglePlacesAddressMatch } from '../lib/maps/googlePlacesAddressLookup';
import { supabase } from '../lib/supabaseClient';
import { useSupabaseRealtimeRefresh } from '../lib/useSupabaseRealtimeRefresh';
import type { ProductionOrder, ProductionOrderManufacturingType, ProductionOrderPriority, ProductionOrderStatus, QualityCheckLimit, QualityMeasurementUnit, QualityPieceType, WorkCenterStatus } from './mesTypes';
import { qualityInspectionsByPieceType, qualityPieceTypeLabels, qualityPieceTypes } from './qualityInspectionConfig';
import './productionOrders.css';
import './productionOrdersDateFilter.css';
import './productionOrdersDateFilterResponsive.css';
import './productionOrdersClientFilter.css';
import './productionOrdersContrast.css';
import './productionOrderSaveFeedback.css';

type WorkspaceProps = {
  onNavigate: (path: string) => void;
  organizationId: string;
};

const productionOrderDeepLinkKey = 'yvimo:mes:selectedProductionOrderNumber';
const productionOrdersViewStateKeyPrefix = 'yvimo:mes:production-orders:view';

type ProductionOrdersViewState = {
  selectedOrderNumber: string;
  page: number;
  searchTerm: string;
  orderView: 'all' | 'in-progress' | 'completed';
  sortByPriority: boolean;
  clientFilter: string;
};

const defaultProductionOrdersViewState: ProductionOrdersViewState = {
  selectedOrderNumber: '',
  page: 1,
  searchTerm: '',
  orderView: 'all',
  sortByPriority: false,
  clientFilter: 'all',
};

function getProductionOrdersViewStateKey(organizationId: string) {
  return `${productionOrdersViewStateKeyPrefix}:${organizationId}`;
}

function loadProductionOrdersViewState(organizationId: string): ProductionOrdersViewState {
  if (typeof window === 'undefined') return defaultProductionOrdersViewState;
  try {
    const savedState = JSON.parse(window.sessionStorage.getItem(getProductionOrdersViewStateKey(organizationId)) ?? '{}') as Partial<ProductionOrdersViewState>;
    return {
      selectedOrderNumber: typeof savedState.selectedOrderNumber === 'string' ? savedState.selectedOrderNumber : '',
      page: typeof savedState.page === 'number' && savedState.page > 0 ? Math.floor(savedState.page) : 1,
      searchTerm: typeof savedState.searchTerm === 'string' ? savedState.searchTerm : '',
      orderView: ['all', 'in-progress', 'completed'].includes(savedState.orderView ?? '') ? savedState.orderView as ProductionOrdersViewState['orderView'] : 'all',
      sortByPriority: savedState.sortByPriority === true,
      clientFilter: typeof savedState.clientFilter === 'string' ? savedState.clientFilter : 'all',
    };
  } catch {
    return defaultProductionOrdersViewState;
  }
}

type StatusBadgeProps = {
  value: string;
  tone?: 'status' | 'priority' | 'event';
};

type ProductionOrderAction = {
  label: string;
  action?: string;
  tone: 'success' | 'danger' | 'info' | 'warning';
  traceability?: boolean;
};

type ProductionOrderDetailPreview = {
  title: string;
  subtitle: string;
  url: string;
  type: 'pdf' | 'image';
};

type ProductionOrderFormState = {
  orderNumber: string;
  partNumber: string;
  partName: string;
  clientName: string;
  customerId: string;
  plannedQuantity: string;
  completedQuantity: string;
  scrapQuantity: string;
  status: ProductionOrderStatus;
  priority: ProductionOrderPriority;
  dueDate: string;
  assignedWorkCenter: string;
  plannedShifts: string[];
  manufacturingType: ProductionOrderManufacturingType;
  productionFlow: string;
  assignedStation: string;
  pieceType: QualityPieceType;
  qualityChecksEnabled: boolean;
  qualityChecks: string[];
  qualityCheckLimits: Record<string, QualityCheckLimit>;
  qualityMeasurementUnit: QualityMeasurementUnit;
};

type ProductionOrderPartNameOption = '' | 'hobs' | 'shaper' | 'shaver' | 'skiving' | 'other';

type ProductionSerialAssignmentDraft = {
  pieceSequence: number;
  toolId: string;
  serialNumber: string;
};

const productionOrderPartNameOptions: Array<{ value: ProductionOrderPartNameOption; label: string; pieceType?: QualityPieceType }> = [
  { value: 'hobs', label: 'Hobs', pieceType: 'hobs' },
  { value: 'shaper', label: 'Shaper', pieceType: 'shaper' },
  { value: 'shaver', label: 'Shaver', pieceType: 'shavers' },
  { value: 'skiving', label: 'Skiving', pieceType: 'skiving' },
  { value: 'other', label: 'Other' },
];

const productionOrderQualityDocumentsBucket = 'mes-quality-inspection-documents';

type ProductionOrderRow = {
  id: string;
  order_number: string;
  part_number: string;
  part_name: string;
  client_name?: string | null;
  customer_id?: string | null;
  planned_quantity: number;
  completed_quantity: number;
  scrap_quantity: number;
  status: ProductionOrderStatus;
  priority: ProductionOrderPriority;
  due_date: string;
  assigned_work_center: string;
  planned_shifts?: string[] | null;
  manufacturing_type?: ProductionOrderManufacturingType | null;
  production_flow?: string | null;
  assigned_station?: string | null;
  piece_type?: QualityPieceType | null;
  quality_checks_enabled?: boolean | null;
  quality_checks?: string[] | null;
  quality_check_limits?: Record<string, QualityCheckLimit> | null;
  quality_measurement_unit?: QualityMeasurementUnit | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ProductionOrderWorkCenterOptionRow = {
  id: string;
  code: string;
  name: string;
};

type ProductionOrderStationOptionRow = {
  work_center_id: string;
  code: string;
  name: string;
};

type ProductionOrderCustomerOptionRow = {
  id: string;
  customer_name: string;
  legal_name: string;
  status: 'active' | 'inactive';
};

type ProductionSerialInsertRow = {
  organization_id: string;
  production_order_id: string;
  piece_sequence: number;
  tool_id: string;
  serial_number: string;
  result: null;
  ready_for_quality: false;
  reported_at: null;
};

type TraceabilityCaptureRow = {
  id: string;
  production_order_id: string | null;
  work_center_code: string;
  station_code: string;
  template_id: string;
  part_label: string | null;
  tool_id: string | null;
  serial_number: string | null;
  dimensions_unit: string;
  before_notch: number | null;
  before_tooth_length: number | null;
  damage_codes: string[] | null;
  damage_image_url: string | null;
  stock_to_remove: number | null;
  after_tooth_length: number | null;
  payload: Record<string, unknown> | null;
  created_at: string;
  mes_production_orders?: {
    order_number: string;
    part_number: string;
    part_name: string;
    customer_id?: string | null;
    client_name?: string | null;
    planned_quantity: number;
    completed_quantity: number;
    scrap_quantity: number;
    status: ProductionOrderStatus;
  } | null;
};

type TraceabilityCapture = {
  id: string;
  productionOrderId: string;
  timestamp: string;
  productionOrder: string;
  partNumber: string;
  partName: string;
  clientName: string;
  workCenter: string;
  station: string;
  stationName: string;
  templateId: string;
  partLabel: string;
  toolId: string;
  serialNumber: string;
  dimensionsUnit: string;
  beforeNotch: number | null;
  beforeToothLength: number | null;
  damageCodes: string[];
  damageImageUrl: string;
  stockToRemove: number | null;
  afterToothLength: number | null;
  beforeHeight: number | null;
  afterHeight: number | null;
  shaverSharpeningNumber: string;
  shaverDiameter: number | null;
  shaverSpan: number | null;
  shaverTeeth: number | null;
  shaverDamage: boolean | null;
  orderStatus: ProductionOrderStatus | '';
  statusAtCapture: ProductionOrderStatus | '';
  pieceSequence: number | null;
  plannedQuantity: number;
  completionPercent: number;
  shift: string;
};

type TraceabilityOperatorEventRow = {
  id: string;
  production_order_id: string | null;
  work_center_code: string;
  station_code: string;
  event_type: string;
  quantity: number;
  reason: string | null;
  comment: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
  mes_production_orders?: {
    order_number: string;
    part_number: string;
    part_name: string;
    customer_id?: string | null;
    client_name?: string | null;
    planned_quantity: number;
    completed_quantity: number;
    scrap_quantity: number;
    status: ProductionOrderStatus;
  } | null;
};

type TraceabilityOrderOption = {
  id: string;
  orderNumber: string;
  partNumber: string;
  partName: string;
  customerId: string;
  clientName: string;
  assignedWorkCenter: string;
  assignedStation: string;
  status: ProductionOrderStatus;
};

type TraceabilityOrderRow = {
  id: string;
  order_number: string;
  part_number: string;
  part_name: string;
  customer_id: string | null;
  client_name: string | null;
  assigned_work_center: string;
  assigned_station: string | null;
  status: ProductionOrderStatus;
};

function getTraceabilityClientKey(order: Pick<TraceabilityOrderOption, 'customerId' | 'clientName'>) {
  return order.customerId || (order.clientName ? `name:${order.clientName}` : '');
}

type TraceabilityWorkCenterOption = {
  id: string;
  code: string;
  name: string;
};

type TraceabilityStationOption = {
  id: string;
  workCenterId: string;
  workCenterCode: string;
  code: string;
  name: string;
};

export type ProductionOrderDetailSerialRow = {
  id: string;
  production_order_id: string;
  piece_sequence: number;
  tool_id: string | null;
  serial_number: string;
  result: 'good' | 'scrap' | null;
  ready_for_quality: boolean;
  traceability_id: string | null;
  reported_at: string | null;
};

export type ProductionOrderDetailTraceabilityRow = {
  id: string;
  production_order_id: string | null;
  template_id: string;
  part_label: string | null;
  tool_id: string | null;
  serial_number: string | null;
  dimensions_unit: string;
  before_notch: number | null;
  before_tooth_length: number | null;
  damage_codes: string[] | null;
  stock_to_remove: number | null;
  after_tooth_length: number | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

type ProductionOrderDetailQualityResult = 'ok' | 'approach' | 'nok' | 'skipped';

export type ProductionOrderDetailQualityInspectionRow = {
  id: string;
  production_order_id: string;
  serial_number: string;
  result: ProductionOrderDetailQualityResult;
  inspected_at: string;
};

export type ProductionOrderDetailQualityMeasurementRow = {
  id: string;
  production_order_id: string;
  serial_number: string;
  inspection_name: string;
  measured_value: number;
  lower_limit: number | null;
  upper_limit: number | null;
  result: Exclude<ProductionOrderDetailQualityResult, 'skipped'>;
  measured_at: string;
};

export type ProductionOrderDetailQualityDocumentRow = {
  id: string;
  production_order_id: string;
  serial_number: string;
  inspection_name: string | null;
  file_name: string;
  file_path: string;
  file_type: string;
  uploaded_at: string;
};

export type ProductionOrderDetailPiece = {
  pieceSequence: number;
  toolId: string;
  serialNumber: string;
  status: 'not-started' | 'good' | 'scrap';
  reportedAt: string;
  traceability: ProductionOrderDetailTraceabilityRow | null;
  qualityInspection: ProductionOrderDetailQualityInspectionRow | null;
  qualityMeasurements: ProductionOrderDetailQualityMeasurementRow[];
  qualityDocuments: ProductionOrderDetailQualityDocumentRow[];
};

export type ProductionOrderDetailsState = {
  loading: boolean;
  error: string;
  pieces: ProductionOrderDetailPiece[];
};

type ConfirmationState = {
  title: string;
  message: string;
  confirmLabel: string;
  tone: 'primary' | 'danger';
  onConfirm: () => Promise<void> | void;
};

export type JobQueueMachine = {
  workCenterCode: string;
  stationCode: string;
  stationName: string;
};

export type JobQueueItem = {
  order: ProductionOrder;
  position: number;
};

export type JobQueueSummary = {
  machine: JobQueueMachine;
  currentJob: ProductionOrder | null;
  queuedJobs: JobQueueItem[];
  totalQuantity: number;
};

type MachineLoad = 'none' | 'low' | 'normal' | 'medium' | 'high' | 'overloaded';
type StationDueRisk = 'low' | 'medium' | 'high' | 'critical';

type MesOrderDropdownOption = {
  value: string;
  label: string;
};

type MesOrderDropdownProps = {
  id: string;
  value: string;
  options: MesOrderDropdownOption[];
  placeholder?: string;
  disabled?: boolean;
  placement?: 'auto' | 'bottom';
  onChange: (value: string) => void;
};

type MesOrderDropdownMenuPosition = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

type MesOrderCalendarPosition = {
  top: number;
  left: number;
  width: number;
};

type MesOrderDateRange = {
  from: string;
  to: string;
};
type MesOrderQuickRangeValue = 'today' | 'week' | 'month' | 'year';

const formatLabel = (value: string) => value.replace(/-/g, ' ');
const formatTitleLabel = (value: string) => {
  const label = formatLabel(value);
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(new Date(`${value}T12:00:00`));

const formatDateInputLabel = (value: string) =>
  new Intl.DateTimeFormat('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }).format(new Date(`${value}T12:00:00`));

const formatTimestamp = (value: string) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));

function toLocalIsoDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return typeof value === 'string' ? value.slice(0, 10) : '';
  const localDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60_000));
  return localDate.toISOString().slice(0, 10);
}

export function MesStatusBadge({ value, tone = 'status' }: StatusBadgeProps) {
  return <span className={`mes-status-badge ${tone}-${value}`}>{formatLabel(value)}</span>;
}

const productionOrderStatuses: ProductionOrderStatus[] = ['planned', 'released', 'running', 'paused', 'waiting-inspection', 'completed', 'cancelled'];
const productionOrderPriorities: ProductionOrderPriority[] = ['low', 'normal', 'high', 'expedite'];
const plannedShiftOptions = [
  { value: 'shift_1', label: 'Shift 1' },
  { value: 'shift_2', label: 'Shift 2' },
  { value: 'shift_3', label: 'Shift 3' },
];
const totalAvailableStationShifts = plannedShiftOptions.length;
const productionOrderManufacturingTypes: Array<{ value: ProductionOrderManufacturingType; label: string; description: string }> = [
  { value: 'multi-step', label: 'Multi-step', description: 'Route this order through a production flow.' },
  { value: 'single-operation', label: 'Single Operation', description: 'Run this order on one station.' },
];
const productionFlowOptions = [
  { id: 'standard-assembly-flow', name: 'Standard assembly flow' },
  { id: 'machining-inspection-flow', name: 'Machining + inspection flow' },
  { id: 'rush-production-flow', name: 'Rush production flow' },
];
const emptyProductionOrdersMessage = 'You do not have any Production Orders registered yet. Add new orders using the control panel on the right.';
const unavailableProductionOrdersMessage = 'Production Orders are not available right now. Add a new order from the control panel on the right or try again in a moment.';

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getMesOrderQuickRange(range: MesOrderQuickRangeValue): MesOrderDateRange {
  const today = new Date();
  const startDate = new Date(today);
  const endDate = new Date(today);

  if (range === 'week') {
    startDate.setDate(today.getDate() - today.getDay());
    endDate.setDate(startDate.getDate() + 6);
  }

  if (range === 'month') {
    startDate.setDate(1);
    endDate.setFullYear(today.getFullYear(), today.getMonth() + 1, 0);
  }

  if (range === 'year') {
    startDate.setFullYear(today.getFullYear(), 0, 1);
    endDate.setFullYear(today.getFullYear(), 11, 31);
  }

  return {
    from: toIsoDate(startDate),
    to: toIsoDate(endDate),
  };
}

function getMonthDates(displayDate: Date) {
  const year = displayDate.getFullYear();
  const month = displayDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const firstGridDate = new Date(year, month, 1 - firstDay.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstGridDate);
    date.setDate(firstGridDate.getDate() + index);
    return date;
  });
}

function MesOrderDatePicker({
  id,
  value,
  placeholder = 'Select date',
  onChange,
  onQuickRange,
}: {
  id: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  onQuickRange?: (range: MesOrderDateRange) => void;
}) {
  const selectedDate = React.useMemo(() => value ? new Date(`${value}T12:00:00`) : new Date(), [value]);
  const [open, setOpen] = React.useState(false);
  const [displayDate, setDisplayDate] = React.useState(selectedDate);
  const [calendarPosition, setCalendarPosition] = React.useState<MesOrderCalendarPosition | null>(null);
  const triggerRef = React.useRef<HTMLDivElement | null>(null);
  const calendarRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    setDisplayDate(selectedDate);
  }, [selectedDate]);

  const updateCalendarPosition = React.useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 16;
    const calendarWidth = Math.min(Math.max(rect.width, 312), window.innerWidth - (viewportPadding * 2));
    const availableBelow = window.innerHeight - rect.bottom - viewportPadding;
    const availableAbove = rect.top - viewportPadding;
    const calendarHeight = onQuickRange ? 454 : 374;
    const openUp = availableBelow < calendarHeight && availableAbove > availableBelow;
    const left = Math.max(viewportPadding, Math.min(rect.left, window.innerWidth - calendarWidth - viewportPadding));

    setCalendarPosition({
      top: openUp ? Math.max(viewportPadding, rect.top - calendarHeight) : rect.bottom + 6,
      left,
      width: calendarWidth,
    });
  }, [onQuickRange]);

  React.useLayoutEffect(() => {
    if (!open) return;
    updateCalendarPosition();
  }, [open, updateCalendarPosition]);

  React.useEffect(() => {
    if (!open) return undefined;

    const closeIfOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || calendarRef.current?.contains(target)) return;
      setOpen(false);
    };
    const reposition = () => updateCalendarPosition();

    document.addEventListener('mousedown', closeIfOutside);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);

    return () => {
      document.removeEventListener('mousedown', closeIfOutside);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, updateCalendarPosition]);

  const calendarDates = getMonthDates(displayDate);
  const selectedIsoDate = value ? toIsoDate(selectedDate) : '';
  const todayIsoDate = toIsoDate(new Date());
  const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(displayDate);
  const calendar = open && calendarPosition
    ? createPortal(
      <div
        className="mes-order-calendar"
        id={`${id}-calendar`}
        ref={calendarRef}
        style={{
          top: calendarPosition.top,
          left: calendarPosition.left,
          width: calendarPosition.width,
        }}
      >
        <div className="mes-order-calendar-header">
          <button type="button" onClick={() => setDisplayDate((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))} aria-label="Previous month">
            <ChevronLeft size={16} />
          </button>
          <strong>{monthLabel}</strong>
          <button type="button" onClick={() => setDisplayDate((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))} aria-label="Next month">
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="mes-order-calendar-weekdays" aria-hidden="true">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day}>{day}</span>)}
        </div>
        <div className="mes-order-calendar-grid">
          {calendarDates.map((date) => {
            const isoDate = toIsoDate(date);
            const outsideMonth = date.getMonth() !== displayDate.getMonth();
            return (
              <button
                className={[
                  outsideMonth ? 'outside-month' : '',
                  isoDate === selectedIsoDate ? 'selected' : '',
                  isoDate === todayIsoDate ? 'today' : '',
                ].filter(Boolean).join(' ')}
                type="button"
                key={isoDate}
                onClick={() => {
                  onChange(isoDate);
                  setOpen(false);
                }}
              >
                {date.getDate()}
              </button>
            );
          })}
        </div>
        <div className="mes-order-calendar-shortcuts">
          {([
            { value: 'today', label: 'Today' },
            ...(onQuickRange ? [
              { value: 'week', label: 'This week' },
              { value: 'month', label: 'This month' },
              { value: 'year', label: 'This year' },
            ] as const : []),
          ] as Array<{ value: MesOrderQuickRangeValue; label: string }>).map((shortcut) => (
            <button
              type="button"
              key={shortcut.value}
              onClick={() => {
                const range = getMesOrderQuickRange(shortcut.value);
                setDisplayDate(new Date(`${range.from}T12:00:00`));
                if (onQuickRange) {
                  onQuickRange(range);
                } else {
                  onChange(range.from);
                }
                setOpen(false);
              }}
            >
              {shortcut.label}
            </button>
          ))}
        </div>
      </div>,
      document.body,
    )
    : null;

  return (
    <div
      className={['mes-order-date-picker', open ? 'open' : ''].filter(Boolean).join(' ')}
      ref={triggerRef}
      onBlur={(event) => {
        const nextFocusedElement = event.relatedTarget as Node | null;
        if (!event.currentTarget.contains(nextFocusedElement) && !calendarRef.current?.contains(nextFocusedElement)) {
          setOpen(false);
        }
      }}
    >
      <button className={!value ? 'placeholder' : ''} type="button" aria-expanded={open} aria-controls={`${id}-calendar`} onClick={() => setOpen((current) => !current)}>
        <span>{value ? formatDateInputLabel(value) : placeholder}</span>
        <CalendarDays size={16} />
      </button>
      {calendar}
    </div>
  );
}

function MesOrderDropdown({ id, value, options, placeholder = 'Select option', disabled = false, placement = 'auto', onChange }: MesOrderDropdownProps) {
  const [open, setOpen] = React.useState(false);
  const [menuPosition, setMenuPosition] = React.useState<MesOrderDropdownMenuPosition | null>(null);
  const triggerRef = React.useRef<HTMLDivElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const selectedOption = options.find((option) => option.value === value);

  const updateMenuPosition = React.useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger || disabled) return;
    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 16;
    const availableBelow = window.innerHeight - rect.bottom - viewportPadding;
    const availableAbove = rect.top - viewportPadding;
    const desiredMenuHeight = Math.min(280, Math.max(88, (options.length * 38) + 12));
    const minimumUsefulHeight = Math.min(desiredMenuHeight, 140);
    const openUp = availableBelow < minimumUsefulHeight && availableAbove > availableBelow
      ? true
      : placement === 'auto' && availableBelow < desiredMenuHeight && availableAbove > availableBelow;
    const availableHeight = Math.max(52, openUp ? availableAbove - 6 : availableBelow - 6);
    const maxHeight = Math.max(88, Math.min(desiredMenuHeight, availableHeight));
    const menuWidth = Math.min(rect.width, window.innerWidth - (viewportPadding * 2));
    const menuLeft = Math.max(viewportPadding, Math.min(rect.left, window.innerWidth - menuWidth - viewportPadding));

    setMenuPosition({
      top: openUp ? Math.max(viewportPadding, rect.top - maxHeight - 6) : rect.bottom + 6,
      left: menuLeft,
      width: menuWidth,
      maxHeight,
    });
  }, [disabled, options.length, placement]);

  React.useLayoutEffect(() => {
    if (!open || disabled) return;
    updateMenuPosition();
  }, [disabled, open, updateMenuPosition]);

  React.useEffect(() => {
    if (!open || disabled) return undefined;

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
  }, [disabled, open, updateMenuPosition]);

  const dropdownMenu = open && !disabled && menuPosition
    ? createPortal(
      <div
        className="mes-order-dropdown-menu"
        id={`${id}-listbox`}
        role="listbox"
        ref={menuRef}
        style={{
          top: menuPosition.top,
          left: menuPosition.left,
          width: menuPosition.width,
          maxHeight: menuPosition.maxHeight,
        }}
      >
        {options.map((option) => (
          <button
            className={option.value === value ? 'selected' : ''}
            type="button"
            role="option"
            aria-selected={option.value === value}
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
    <div
      className={['mes-order-dropdown', open ? 'open' : ''].filter(Boolean).join(' ')}
      ref={triggerRef}
      onBlur={(event) => {
        const nextFocusedElement = event.relatedTarget as Node | null;
        if (!event.currentTarget.contains(nextFocusedElement) && !menuRef.current?.contains(nextFocusedElement)) {
          setOpen(false);
        }
      }}
    >
      <button
        className={!selectedOption ? 'placeholder' : ''}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={disabled ? false : open}
        aria-controls={`${id}-listbox`}
        onClick={() => {
          if (disabled) return;
          setOpen((current) => !current);
        }}
      >
        <span>{selectedOption?.label ?? placeholder}</span>
        <ChevronDown size={16} />
      </button>
      {dropdownMenu}
    </div>
  );
}

function mapProductionOrderRow(row: ProductionOrderRow): ProductionOrder {
  return {
    id: row.id,
    orderNumber: row.order_number,
    partNumber: row.part_number,
    partName: row.part_name,
    clientName: row.client_name ?? '',
    customerId: row.customer_id ?? '',
    plannedQuantity: row.planned_quantity,
    completedQuantity: row.completed_quantity,
    scrapQuantity: row.scrap_quantity,
    status: row.status,
    priority: row.priority,
    dueDate: row.due_date,
    assignedWorkCenter: row.assigned_work_center,
    plannedShifts: row.planned_shifts ?? [],
    manufacturingType: row.manufacturing_type ?? 'multi-step',
    productionFlow: row.production_flow ?? productionFlowOptions[0]?.id ?? '',
    assignedStation: row.assigned_station ?? '',
    pieceType: row.piece_type ?? 'hobs',
    qualityChecksEnabled: row.quality_checks_enabled ?? false,
    qualityChecks: row.quality_checks ?? [],
    qualityCheckLimits: row.quality_check_limits ?? {},
    qualityMeasurementUnit: row.quality_measurement_unit ?? 'microns',
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
  };
}

function toProductionOrderPayload(order: ProductionOrder | Omit<ProductionOrder, 'id'>, organizationId: string) {
  return {
    organization_id: organizationId,
    order_number: order.orderNumber,
    part_number: order.partNumber,
    part_name: order.partName,
    client_name: order.clientName?.trim() ?? '',
    customer_id: order.customerId || null,
    planned_quantity: order.plannedQuantity,
    completed_quantity: order.completedQuantity,
    scrap_quantity: order.scrapQuantity,
    status: order.status,
    priority: order.priority,
    due_date: order.dueDate,
    assigned_work_center: order.assignedWorkCenter,
    planned_shifts: order.plannedShifts,
    manufacturing_type: order.manufacturingType,
    production_flow: order.manufacturingType === 'multi-step' ? order.productionFlow : '',
    assigned_station: order.manufacturingType === 'single-operation' ? order.assignedStation : '',
    piece_type: order.pieceType ?? 'hobs',
    quality_checks_enabled: order.qualityChecksEnabled ?? false,
    quality_checks: order.qualityChecksEnabled ? order.qualityChecks ?? [] : [],
    quality_check_limits: order.qualityChecksEnabled ? order.qualityCheckLimits ?? {} : {},
    quality_measurement_unit: order.qualityMeasurementUnit ?? 'microns',
  };
}

function toFormState(order?: ProductionOrder): ProductionOrderFormState {
  return {
    orderNumber: order?.orderNumber ?? '',
    partNumber: order?.partNumber ?? '',
    partName: order?.partName ?? '',
    clientName: order?.clientName ?? '',
    customerId: order?.customerId ?? '',
    plannedQuantity: String(order?.plannedQuantity ?? 0),
    completedQuantity: String(order?.completedQuantity ?? 0),
    scrapQuantity: String(order?.scrapQuantity ?? 0),
    status: order?.status ?? 'planned',
    priority: order?.priority ?? 'normal',
    dueDate: order?.dueDate ?? new Date().toISOString().slice(0, 10),
    assignedWorkCenter: order?.assignedWorkCenter ?? '',
    plannedShifts: order?.plannedShifts ?? [],
    manufacturingType: order?.manufacturingType ?? 'multi-step',
    productionFlow: order?.productionFlow ?? productionFlowOptions[0]?.id ?? '',
    assignedStation: order?.assignedStation ?? '',
    pieceType: order?.pieceType ?? 'hobs',
    qualityChecksEnabled: order?.qualityChecksEnabled ?? false,
    qualityChecks: order?.qualityChecks ?? [],
    qualityCheckLimits: order?.qualityCheckLimits ?? {},
    qualityMeasurementUnit: order?.qualityMeasurementUnit ?? 'microns',
  };
}

function formStateToProductionOrder(formState: ProductionOrderFormState, id?: string): ProductionOrder {
  return {
    id: id ?? `po-${Date.now()}`,
    orderNumber: formState.orderNumber.trim(),
    partNumber: formState.partNumber.trim(),
    partName: formState.partName.trim(),
    clientName: formState.clientName.trim(),
    customerId: formState.customerId,
    plannedQuantity: Number(formState.plannedQuantity) || 0,
    completedQuantity: Number(formState.completedQuantity) || 0,
    scrapQuantity: Number(formState.scrapQuantity) || 0,
    status: formState.status,
    priority: formState.priority,
    dueDate: formState.dueDate,
    assignedWorkCenter: formState.assignedWorkCenter.trim(),
    plannedShifts: formState.plannedShifts,
    manufacturingType: formState.manufacturingType,
    productionFlow: formState.manufacturingType === 'multi-step' ? formState.productionFlow : '',
    assignedStation: formState.manufacturingType === 'single-operation' ? formState.assignedStation : '',
    pieceType: formState.pieceType,
    qualityChecksEnabled: formState.qualityChecksEnabled,
    qualityChecks: formState.qualityChecksEnabled ? formState.qualityChecks : [],
    qualityCheckLimits: formState.qualityChecksEnabled ? formState.qualityCheckLimits : {},
    qualityMeasurementUnit: formState.qualityMeasurementUnit,
  };
}

function createSerialAssignmentDrafts(quantity: number, currentDrafts: ProductionSerialAssignmentDraft[] = []) {
  const nextQuantity = Math.max(0, Math.floor(quantity));
  return Array.from({ length: nextQuantity }, (_, index) => {
    const pieceSequence = index + 1;
    const currentDraft = currentDrafts.find((draft) => draft.pieceSequence === pieceSequence);
    return currentDraft ?? { pieceSequence, toolId: '', serialNumber: '' };
  });
}

function validateSerialAssignmentDrafts(drafts: ProductionSerialAssignmentDraft[]) {
  if (drafts.some((draft) => !draft.toolId.trim() || !draft.serialNumber.trim())) {
    return 'Complete every Tool ID and Serial Number before saving assigned pieces.';
  }
  const serials = drafts.map((draft) => draft.serialNumber.trim().toLowerCase());
  if (new Set(serials).size !== serials.length) {
    return 'Serial Numbers must be unique within this Production Order.';
  }
  return '';
}

function getPartNameOptionValue(partName: string): ProductionOrderPartNameOption {
  const normalizedPartName = partName.trim().toLowerCase();
  if (!normalizedPartName) return '';
  const standardOption = productionOrderPartNameOptions.find((option) => (
    option.value !== 'other'
    && option.label.toLowerCase() === normalizedPartName
  ));
  return standardOption?.value ?? 'other';
}

function getProductionOrderStationLabel(stationOptionsByWorkCenter: Record<string, MesOrderDropdownOption[]>, workCenterCode: string, stationCode: string) {
  const stationOption = stationOptionsByWorkCenter[workCenterCode]?.find((option) => option.value === stationCode);
  return stationOption?.label.replace(`${stationCode} - `, '') ?? stationCode;
}

function getJobQueueSummary(
  orders: ProductionOrder[],
  machine: JobQueueMachine | null,
  focusOrderId?: string,
): JobQueueSummary | null {
  if (!machine?.workCenterCode || !machine.stationCode) return null;

  const stationOrders = orders
    .filter((order) => (
      order.manufacturingType === 'single-operation'
      && order.assignedWorkCenter === machine.workCenterCode
      && order.assignedStation === machine.stationCode
      && ['released', 'running', 'paused'].includes(order.status)
    ))
    .sort((firstOrder, secondOrder) => {
      if (firstOrder.status === 'running' && secondOrder.status !== 'running') return -1;
      if (firstOrder.status !== 'running' && secondOrder.status === 'running') return 1;
      if (firstOrder.id === focusOrderId) return 1;
      if (secondOrder.id === focusOrderId) return -1;
      return new Date(firstOrder.dueDate).getTime() - new Date(secondOrder.dueDate).getTime();
    });
  const currentJob = stationOrders.find((order) => order.status === 'running') ?? null;
  const queuedJobs = stationOrders
    .filter((order) => order.status !== 'running')
    .map((order, index) => ({ order, position: index + 1 }));

  return {
    machine,
    currentJob,
    queuedJobs,
    totalQuantity: stationOrders.reduce((total, order) => total + Math.max(0, order.plannedQuantity - order.completedQuantity), 0),
  };
}

function shouldStartSingleOperationOrder(order: ProductionOrder, orders: ProductionOrder[]) {
  if (order.manufacturingType !== 'single-operation' || !order.assignedStation) return true;
  const machineOrders = orders.filter((candidate) => (
    candidate.id !== order.id
    && candidate.manufacturingType === 'single-operation'
    && candidate.assignedWorkCenter === order.assignedWorkCenter
    && candidate.assignedStation === order.assignedStation
    && ['released', 'running', 'paused'].includes(candidate.status)
  ));
  const hasQueue = machineOrders.some((candidate) => ['released', 'paused'].includes(candidate.status));
  const hasActiveProduction = machineOrders.some((candidate) => candidate.status === 'running');
  return !hasQueue && !hasActiveProduction;
}

export function JobQueueModal({ summary, onClose }: { summary: JobQueueSummary; onClose: () => void }) {
  const currentRemaining = summary.currentJob
    ? Math.max(0, summary.currentJob.plannedQuantity - summary.currentJob.completedQuantity)
    : 0;
  const currentProgress = summary.currentJob && summary.currentJob.plannedQuantity > 0
    ? Math.min(100, Math.round((summary.currentJob.completedQuantity / summary.currentJob.plannedQuantity) * 100))
    : 0;
  const queuedJobRows = Array.from(
    { length: Math.ceil(summary.queuedJobs.length / 4) },
    (_, rowIndex) => summary.queuedJobs.slice(rowIndex * 4, (rowIndex * 4) + 4),
  );

  return (
    <div className="mes-modal-backdrop job-queue-backdrop" role="presentation">
      <section className="job-queue-modal" role="dialog" aria-modal="true" aria-labelledby="job-queue-title">
        <div className="job-queue-modal-header">
          <div>
            <p className="eyebrow">Manufacturing Queue</p>
            <h3 id="job-queue-title">{summary.machine.stationName}</h3>
            <span>{summary.machine.stationCode} / {summary.machine.workCenterCode}</span>
          </div>
          <button type="button" onClick={onClose}>Close</button>
        </div>
        <div className="job-queue-status-grid">
          <article>
            <span>Current job</span>
            <strong>{summary.currentJob?.orderNumber ?? 'Unassigned'}</strong>
            <em>{summary.currentJob?.partName ?? 'Machine is available'}</em>
          </article>
          <article>
            <span>Queue</span>
            <strong>{summary.queuedJobs.length}</strong>
            <em>{summary.queuedJobs.length === 1 ? 'job waiting' : 'jobs waiting'}</em>
          </article>
          <article>
            <span>Open quantity</span>
            <strong>{summary.totalQuantity.toLocaleString()}</strong>
            <em>parts remaining</em>
          </article>
        </div>
        <section className="job-queue-current">
          <div className="job-queue-section-title">
            <Activity size={16} />
            <h4>Now Running</h4>
          </div>
          {summary.currentJob ? (
            <article className="job-queue-current-card">
              <div className="job-queue-current-details">
                <dl>
                  <div><dt>Order number:</dt><dd>{summary.currentJob.orderNumber}</dd></div>
                  <div><dt>Part name:</dt><dd>{summary.currentJob.partName}</dd></div>
                  <div><dt>Part number:</dt><dd>{summary.currentJob.partNumber}</dd></div>
                  <div><dt>Due date:</dt><dd>{formatDate(summary.currentJob.dueDate)}</dd></div>
                </dl>
              </div>
              <div className="job-queue-current-progress">
                <div>
                  <span><i className="job-queue-progress-spinner" aria-hidden="true" />Progress</span>
                  <strong>{currentProgress}%</strong>
                </div>
                <div className="job-queue-progress-track" aria-hidden="true">
                  <span style={{ width: `${currentProgress}%` }} />
                </div>
                <em>{currentRemaining.toLocaleString()} parts remaining</em>
              </div>
              <div className="job-queue-current-count">
                <strong>{summary.currentJob.completedQuantity.toLocaleString()}</strong>
                <span>of {summary.currentJob.plannedQuantity.toLocaleString()}</span>
              </div>
            </article>
          ) : (
            <div className="job-queue-empty-state">No active production on this machine.</div>
          )}
        </section>
        <section className="job-queue-lineup">
          <div className="job-queue-section-title">
            <Timer size={16} />
            <h4>Production Queue</h4>
          </div>
          {summary.queuedJobs.length > 0 ? (
            <div className="job-queue-track">
              {queuedJobRows.map((row, rowIndex) => (
                <React.Fragment key={`queue-row-${rowIndex}`}>
                  {rowIndex > 0 ? (
                    <div className="job-queue-row-bridge" aria-hidden="true">
                      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                        <polyline points="0,100 0,36 100,36 100,0" />
                      </svg>
                      <span className="job-queue-bridge-run job-queue-bridge-run-start-up">
                        <ChevronUp size={22} />
                        <ChevronUp size={22} />
                        <ChevronUp size={22} />
                      </span>
                      <span className="job-queue-bridge-run job-queue-bridge-run-main">
                        <ChevronRight size={22} />
                        <ChevronRight size={22} />
                        <ChevronRight size={22} />
                        <ChevronRight size={22} />
                        <ChevronRight size={22} />
                        <ChevronRight size={22} />
                        <ChevronRight size={22} />
                        <ChevronRight size={22} />
                        <ChevronRight size={22} />
                        <ChevronRight size={22} />
                        <ChevronRight size={22} />
                        <ChevronRight size={22} />
                      </span>
                      <span className="job-queue-bridge-run job-queue-bridge-run-end-up">
                        <ChevronUp size={22} />
                        <ChevronUp size={22} />
                        <ChevronUp size={22} />
                      </span>
                    </div>
                  ) : null}
                  <div className="job-queue-row">
                    {row.map(({ order, position }, index) => {
                      const remainingQuantity = Math.max(0, order.plannedQuantity - order.completedQuantity);
                      return (
                        <div className="job-queue-step" key={order.id}>
                          {index > 0 ? (
                            <span className="job-queue-flow-arrow" aria-hidden="true">
                              <ChevronLeft size={24} />
                              <ChevronLeft size={24} />
                              <ChevronLeft size={24} />
                            </span>
                          ) : null}
                          <article className="job-queue-ticket">
                            <span className="job-queue-position">{position}</span>
                            <div className="job-queue-quantity-ring">
                              <strong>{remainingQuantity.toLocaleString()}</strong>
                              <span>Parts</span>
                            </div>
                            <div>
                              <strong>{order.orderNumber}</strong>
                              <span>{order.partName}</span>
                              <em>{formatLabel(order.priority)} / {formatDate(order.dueDate)}</em>
                            </div>
                          </article>
                        </div>
                      );
                    })}
                  </div>
                </React.Fragment>
              ))}
            </div>
          ) : (
            <div className="job-queue-empty-state">No queued jobs for this machine.</div>
          )}
        </section>
      </section>
    </div>
  );
}

function MesWorkspaceShell({ title, eyebrow, description, onBack, className = '', children }: React.PropsWithChildren<{
  title: string;
  eyebrow: string;
  description: string;
  onBack?: () => void;
  className?: string;
}>) {
  return (
    <section className={['mes-workspace-panel', className].filter(Boolean).join(' ')}>
      <div className="mes-screen-header">
        {onBack ? (
          <button className="academy-back-button engineering-back-button mes-workspace-back" type="button" onClick={onBack}>
          <ArrowLeft size={16} />
          MES Applications
        </button>
        ) : <span />}
        <div className="mes-workspace-heading">
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function actionStatus(currentStatus: ProductionOrderStatus, action: string): ProductionOrderStatus {
  if (action === 'release' && currentStatus === 'planned') return 'released';
  if (action === 'start' && ['released', 'paused'].includes(currentStatus)) return 'running';
  if (action === 'pause' && currentStatus === 'running') return 'paused';
  if (action === 'complete') return 'completed';
  return currentStatus;
}

function getProductionOrderActions(status: ProductionOrderStatus): ProductionOrderAction[] {
  const traceabilityAction: ProductionOrderAction = { label: 'Traceability', tone: 'info', traceability: true };
  if (status === 'planned') {
    return [
      { label: 'Release', action: 'release', tone: 'success' },
      traceabilityAction,
    ];
  }
  if (status === 'released') {
    return [
      { label: 'Start', action: 'start', tone: 'success' },
      traceabilityAction,
    ];
  }
  if (status === 'running') {
    return [
      { label: 'Pause', action: 'pause', tone: 'info' },
      { label: 'Report production', action: 'production', tone: 'warning' },
      { label: 'Report scrap', action: 'scrap', tone: 'danger' },
      { label: 'Complete', action: 'complete', tone: 'success' },
      traceabilityAction,
    ];
  }
  if (status === 'paused') {
    return [
      { label: 'Resume', action: 'start', tone: 'success' },
      { label: 'Report scrap', action: 'scrap', tone: 'danger' },
      { label: 'Complete', action: 'complete', tone: 'success' },
      traceabilityAction,
    ];
  }
  return [traceabilityAction];
}

export function getProductionOrderDetailPayloadNumber(payload: Record<string, unknown> | null, key: string) {
  if (!payload) return null;
  const value = payload[key];
  if (value === null || value === undefined || value === '') return null;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

export function getProductionOrderDetailPayloadString(payload: Record<string, unknown> | null, key: string) {
  const value = payload?.[key];
  return typeof value === 'string' ? value : '';
}

export function formatProductionOrderDetailMeasurementValue(value: string | number | boolean | null | undefined, unit = '') {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (value === null || value === undefined || value === '') return 'N/A';
  return `${value}${unit ? ` ${unit}` : ''}`;
}

function normalizeProductionOrderDetailSerial(serial: string) {
  return serial.trim().toLowerCase();
}

function getProductionOrderDetailPieceKey(piece: Pick<ProductionOrderDetailPiece, 'pieceSequence' | 'serialNumber'>) {
  return normalizeProductionOrderDetailSerial(piece.serialNumber) || `piece:${piece.pieceSequence}`;
}

function getProductionOrderDetailQualityLabel(result?: ProductionOrderDetailQualityResult | null) {
  if (!result) return 'Pending';
  if (result === 'ok') return 'OK';
  if (result === 'nok') return 'NOK';
  if (result === 'approach') return 'Approach';
  return 'Skipped';
}

function getProductionOrderDetailDamageCodes(traceability: ProductionOrderDetailTraceabilityRow | null) {
  if (!traceability) return [];
  const payloadDamage = traceability.payload?.shaver_damage === true ? ['damage:yes'] : [];
  return Array.from(new Set([...(traceability.damage_codes ?? []), ...payloadDamage]));
}

function hasProductionOrderDetailDamage(piece: ProductionOrderDetailPiece) {
  return getProductionOrderDetailDamageCodes(piece.traceability).length > 0 || Boolean(piece.traceability?.damage_image_url);
}

function getProductionOrderDetailQualityInspection(piece: ProductionOrderDetailPiece) {
  return piece.qualityInspection ?? null;
}

function getProductionOrderDetailQualityMeasurements(piece: ProductionOrderDetailPiece) {
  return piece.qualityMeasurements ?? [];
}

function getProductionOrderDetailQualityDocuments(piece: ProductionOrderDetailPiece) {
  return piece.qualityDocuments ?? [];
}

export function getProductionOrderDetailMeasurements(traceability: ProductionOrderDetailTraceabilityRow | null) {
  if (!traceability) return [];
  const payload = traceability.payload ?? {};
  const templateId = traceability.template_id || (typeof payload.traceability_template === 'string' ? payload.traceability_template : '');
  const unit = traceability.dimensions_unit || 'in';
  if (templateId === 'shaver-sharpening' || templateId === 'shavers') {
    return [
      { label: 'No. Afilado', value: formatProductionOrderDetailMeasurementValue(getProductionOrderDetailPayloadString(payload, 'shaver_sharpening_number')) },
      { label: 'Diameter', value: formatProductionOrderDetailMeasurementValue(getProductionOrderDetailPayloadNumber(payload, 'shaver_diameter'), unit) },
      { label: 'Span', value: formatProductionOrderDetailMeasurementValue(getProductionOrderDetailPayloadNumber(payload, 'shaver_span'), unit) },
      { label: 'Teeth', value: formatProductionOrderDetailMeasurementValue(getProductionOrderDetailPayloadNumber(payload, 'shaver_teeth')) },
      { label: 'Damage', value: formatProductionOrderDetailMeasurementValue(typeof payload.shaver_damage === 'boolean' ? payload.shaver_damage : null) },
    ];
  }
  if (templateId === 'shaper-sharpening' || templateId === 'shapers') {
    return [
      { label: 'Before height', value: formatProductionOrderDetailMeasurementValue(getProductionOrderDetailPayloadNumber(payload, 'before_height'), unit) },
      { label: 'Stock remove', value: formatProductionOrderDetailMeasurementValue(traceability.stock_to_remove, unit) },
      { label: 'After height', value: formatProductionOrderDetailMeasurementValue(getProductionOrderDetailPayloadNumber(payload, 'after_height'), unit) },
    ];
  }
  return [
    { label: 'Before notch', value: formatProductionOrderDetailMeasurementValue(traceability.before_notch, unit) },
    { label: 'Before tooth', value: formatProductionOrderDetailMeasurementValue(traceability.before_tooth_length, unit) },
    { label: 'Stock remove', value: formatProductionOrderDetailMeasurementValue(traceability.stock_to_remove, unit) },
    { label: 'After tooth', value: formatProductionOrderDetailMeasurementValue(traceability.after_tooth_length, unit) },
  ];
}

export function ProductionOrderDetailsModal({
  order,
  details,
  onClose,
}: {
  order: ProductionOrder;
  details: ProductionOrderDetailsState;
  onClose: () => void;
}) {
  const [activeView, setActiveView] = React.useState<'production' | 'quality' | 'damage'>('production');
  const [preview, setPreview] = React.useState<ProductionOrderDetailPreview | null>(null);
  const [previewError, setPreviewError] = React.useState('');
  const qualityPieces = details.pieces.filter((piece) => getProductionOrderDetailQualityInspection(piece) || getProductionOrderDetailQualityMeasurements(piece).length > 0 || getProductionOrderDetailQualityDocuments(piece).length > 0);
  const damagePieces = details.pieces.filter(hasProductionOrderDetailDamage);
  const openQualityDocumentPreview = async (document: ProductionOrderDetailQualityDocumentRow) => {
    setPreviewError('');
    try {
      const isPdf = document.file_type === 'application/pdf' || document.file_name.toLowerCase().endsWith('.pdf');
      let fileUrl = document.file_path;
      if (!fileUrl.startsWith('blob:') && !/^https?:\/\//i.test(fileUrl)) {
        const { data, error } = await supabase.storage.from(productionOrderQualityDocumentsBucket).createSignedUrl(fileUrl, 60 * 10);
        if (error || !data?.signedUrl) throw error ?? new Error('Unable to open document.');
        fileUrl = data.signedUrl;
      }
      setPreview({
        title: document.file_name,
        subtitle: 'Inspection Document',
        url: fileUrl,
        type: isPdf ? 'pdf' : 'image',
      });
    } catch (error) {
      console.error('Unable to open production order quality document', error);
      setPreviewError(error instanceof Error && error.message ? error.message : 'Unable to open document.');
    }
  };

  return (
    <div className="mes-modal-backdrop production-order-details-backdrop" role="presentation">
      <section className="production-order-details-modal" role="dialog" aria-modal="true" aria-labelledby="production-order-details-title">
        <div className="production-order-details-header">
          <div>
            <p className="eyebrow">Production Order Details</p>
            <h3 id="production-order-details-title">{order.orderNumber}</h3>
            <span>{order.partNumber} / {order.partName} / {order.clientName?.trim() || 'Unassigned client'}</span>
          </div>
          <button type="button" aria-label="Close order details" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="production-order-details-summary">
          <article><span>Status</span><strong>{formatTitleLabel(order.status)}</strong></article>
          <article><span>Priority</span><strong>{formatTitleLabel(order.priority)}</strong></article>
          <article><span>Planned</span><strong>{order.plannedQuantity.toLocaleString()}</strong></article>
          <article><span>Completed</span><strong>{order.completedQuantity.toLocaleString()}</strong></article>
          <article><span>Scrap</span><strong>{order.scrapQuantity.toLocaleString()}</strong></article>
          <article><span>Work Center</span><strong>{order.assignedWorkCenter || 'Not assigned'}</strong></article>
          <article><span>Station</span><strong>{order.assignedStation || 'Not assigned'}</strong></article>
          <article><span>Due</span><strong>{formatDate(order.dueDate)}</strong></article>
        </div>
        <div className="production-order-details-view-switch" role="tablist" aria-label="Production order detail views">
          <button type="button" className={activeView === 'production' ? 'active' : ''} onClick={() => setActiveView('production')} role="tab" aria-selected={activeView === 'production'}>
            <Database size={16} />Production
          </button>
          <button type="button" className={activeView === 'quality' ? 'active' : ''} onClick={() => setActiveView('quality')} role="tab" aria-selected={activeView === 'quality'}>
            <CheckCircle2 size={16} />Quality
            {qualityPieces.length ? <b>{qualityPieces.length}</b> : null}
          </button>
          <button type="button" className={activeView === 'damage' ? 'active' : ''} onClick={() => setActiveView('damage')} role="tab" aria-selected={activeView === 'damage'}>
            <ImagePlus size={16} />Damage & Evidence
            {damagePieces.length ? <b>{damagePieces.length}</b> : null}
          </button>
        </div>
        {activeView === 'production' ? <div className="production-order-details-table-wrap">
          {details.loading ? (
            <div className="production-order-details-empty">Loading order pieces...</div>
          ) : details.error ? (
            <div className="production-order-details-empty error">{details.error}</div>
          ) : (
            <table className="production-order-details-table">
              <thead>
                <tr>
                  <th>Piece</th>
                  <th>Status</th>
                  <th>Serial</th>
                  <th>Tool ID</th>
                  <th>Measurements</th>
                  <th>Reported</th>
                </tr>
              </thead>
              <tbody>
                {details.pieces.map((piece) => {
                  const measurements = getProductionOrderDetailMeasurements(piece.traceability);
                  return (
                    <tr key={`${piece.pieceSequence}-${piece.serialNumber || 'pending'}`}>
                      <td><strong>{piece.pieceSequence}</strong></td>
                      <td><span className={`production-order-details-status ${piece.status}`}>{piece.status === 'not-started' ? 'Not started' : piece.status}</span></td>
                      <td>{piece.serialNumber || '-'}</td>
                      <td>{piece.toolId || '-'}</td>
                      <td>
                        {measurements.length ? (
                          <div className="production-order-details-measures">
                            {measurements.map((measurement) => (
                              <span key={measurement.label}><b>{measurement.label}</b>{measurement.value}</span>
                            ))}
                          </div>
                        ) : (
                          <span className="production-order-details-no-measurement">Not captured</span>
                        )}
                      </td>
                      <td>{piece.reportedAt ? formatDate(toLocalIsoDate(piece.reportedAt)) : '-'}</td>
                    </tr>
                  );
                })}
                {!details.pieces.length ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="production-order-details-empty">No pieces found for this order.</div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          )}
        </div> : null}
        {activeView === 'quality' ? (
          <div className="production-order-details-table-wrap">
            {details.loading ? (
              <div className="production-order-details-empty">Loading quality records...</div>
            ) : details.error ? (
              <div className="production-order-details-empty error">{details.error}</div>
            ) : qualityPieces.length ? (
              <table className="production-order-details-table production-order-quality-table">
                <thead>
                  <tr>
                    <th>Piece</th>
                    <th>Result</th>
                    <th>Serial</th>
                    <th>Tool ID</th>
                    <th>Quality Records</th>
                    <th>Documents</th>
                  </tr>
                </thead>
                <tbody>
                  {qualityPieces.map((piece) => {
                    const qualityInspection = getProductionOrderDetailQualityInspection(piece);
                    const qualityMeasurements = getProductionOrderDetailQualityMeasurements(piece);
                    const qualityDocuments = getProductionOrderDetailQualityDocuments(piece);
                    const qualityResult = qualityInspection?.result ?? null;
                    return (
                      <tr key={getProductionOrderDetailPieceKey(piece)}>
                        <td><strong>{piece.pieceSequence}</strong></td>
                        <td><span className={`production-order-quality-result ${qualityResult ?? 'pending'}`}>{getProductionOrderDetailQualityLabel(qualityResult)}</span></td>
                        <td>{piece.serialNumber || '-'}</td>
                        <td>{piece.toolId || '-'}</td>
                        <td>
                          {qualityMeasurements.length ? (
                            <div className="production-order-details-measures production-order-quality-measures">
                              {qualityMeasurements.map((measurement) => (
                                <span className={measurement.result} key={measurement.id}><b>{measurement.inspection_name}</b>{measurement.measured_value}</span>
                              ))}
                            </div>
                          ) : <span className="production-order-details-no-measurement">No measurements</span>}
                        </td>
                        <td>
                          {qualityDocuments.length ? (
                            <div className="production-order-detail-actions">
                              {qualityDocuments.map((document) => (
                                <button type="button" key={document.id} onClick={() => void openQualityDocumentPreview(document)}>
                                  <FileText size={15} />{document.file_name}
                                </button>
                              ))}
                            </div>
                          ) : <span className="production-order-details-no-measurement">No documents</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="production-order-details-empty">No quality records have been saved for this order yet.</div>
            )}
            {previewError ? <div className="production-order-details-empty error">{previewError}</div> : null}
          </div>
        ) : null}
        {activeView === 'damage' ? (
          <div className="production-order-details-table-wrap">
            {details.loading ? (
              <div className="production-order-details-empty">Loading damage records...</div>
            ) : details.error ? (
              <div className="production-order-details-empty error">{details.error}</div>
            ) : damagePieces.length ? (
              <table className="production-order-details-table production-order-damage-table">
                <thead>
                  <tr>
                    <th>Piece</th>
                    <th>Serial</th>
                    <th>Tool ID</th>
                    <th>Damage Codes</th>
                    <th>Evidence</th>
                    <th>Reported</th>
                  </tr>
                </thead>
                <tbody>
                  {damagePieces.map((piece) => {
                    const damageCodes = getProductionOrderDetailDamageCodes(piece.traceability);
                    const imageUrl = piece.traceability?.damage_image_url ?? '';
                    return (
                      <tr key={getProductionOrderDetailPieceKey(piece)}>
                        <td><strong>{piece.pieceSequence}</strong></td>
                        <td>{piece.serialNumber || '-'}</td>
                        <td>{piece.toolId || '-'}</td>
                        <td>
                          <div className="production-order-damage-tags">
                            {damageCodes.map((code) => <b key={code}>{formatTitleLabel(code.replace(/^damage:/, 'damage '))}</b>)}
                          </div>
                        </td>
                        <td>
                          {imageUrl ? (
                            <div className="production-order-detail-actions">
                              <button type="button" onClick={() => setPreview({ title: `Piece ${piece.pieceSequence} evidence`, subtitle: piece.serialNumber || 'Damage image', url: imageUrl, type: 'image' })}>
                                <ImagePlus size={15} />Preview image
                              </button>
                            </div>
                          ) : <span className="production-order-details-no-measurement">No image</span>}
                        </td>
                        <td>{piece.reportedAt ? formatDate(toLocalIsoDate(piece.reportedAt)) : '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="production-order-details-empty">No damage or evidence images were reported for this order.</div>
            )}
          </div>
        ) : null}
      </section>
      {preview ? (
        <div className="supplier-modal-backdrop production-order-preview-backdrop" role="presentation">
          <div className="supplier-modal production-order-preview-modal" role="dialog" aria-modal="true" aria-labelledby="production-order-preview-title">
            <button className="supplier-modal-close" type="button" onClick={() => setPreview(null)} aria-label="Close preview">
              <X size={18} />
            </button>
            <div>
              <div className="supplier-modal-header">
                <span>{preview.subtitle}</span>
                <strong id="production-order-preview-title">{preview.title}</strong>
              </div>
              <div className={`supplier-document-preview production-order-preview-frame ${preview.type}`}>
                {preview.type === 'pdf'
                  ? <iframe src={`${preview.url}#toolbar=1&navpanes=0&scrollbar=1&view=FitH`} title={`Preview ${preview.title}`} />
                  : <img src={preview.url} alt={preview.title} />}
              </div>
              <div className="supplier-modal-actions">
                <button type="button" onClick={() => setPreview(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ProductionOrdersWorkspace({ onNavigate, organizationId }: WorkspaceProps) {
  const restoredViewState = React.useMemo(() => loadProductionOrdersViewState(organizationId), [organizationId]);
  const [orders, setOrders] = React.useState<ProductionOrder[]>([]);
  const [selectedOrderNumber, setSelectedOrderNumber] = React.useState(restoredViewState.selectedOrderNumber);
  const [searchTerm, setSearchTerm] = React.useState(restoredViewState.searchTerm);
  const [orderView, setOrderView] = React.useState<'all' | 'in-progress' | 'completed'>(restoredViewState.orderView);
  const [sortByPriority, setSortByPriority] = React.useState(restoredViewState.sortByPriority);
  const [orderDateColumn, setOrderDateColumn] = React.useState<'due' | 'created'>('due');
  const [clientFilter, setClientFilter] = React.useState(restoredViewState.clientFilter);
  const [kpiDateRange, setKpiDateRange] = React.useState<MesOrderDateRange>(() => getMesOrderQuickRange('today'));
  const [workCenterOptions, setWorkCenterOptions] = React.useState<MesOrderDropdownOption[]>([]);
  const [stationOptionsByWorkCenter, setStationOptionsByWorkCenter] = React.useState<Record<string, MesOrderDropdownOption[]>>({});
  const [customerOptions, setCustomerOptions] = React.useState<ProductionOrderCustomerOptionRow[]>([]);
  const [customerOptionsMessage, setCustomerOptionsMessage] = React.useState('');
  const [workCenterOptionsMessage, setWorkCenterOptionsMessage] = React.useState('');
  const [page, setPage] = React.useState(restoredViewState.page);
  const [formMode, setFormMode] = React.useState<'create' | 'edit' | null>(null);
  const [formState, setFormState] = React.useState<ProductionOrderFormState>(() => toFormState());
  const [partNameOption, setPartNameOption] = React.useState<ProductionOrderPartNameOption>('');
  const [assignSerialsEnabled, setAssignSerialsEnabled] = React.useState(false);
  const [serialAssignmentDrafts, setSerialAssignmentDrafts] = React.useState<ProductionSerialAssignmentDraft[]>([]);
  const [serialAssignmentModalOpen, setSerialAssignmentModalOpen] = React.useState(false);
  const [tableMessage, setTableMessage] = React.useState<string | null>('Loading production orders...');
  const [ordersLoaded, setOrdersLoaded] = React.useState(false);
  const [savingOrder, setSavingOrder] = React.useState(false);
  const [orderFormError, setOrderFormError] = React.useState('');
  const [confirmation, setConfirmation] = React.useState<ConfirmationState | null>(null);
  const [jobQueueSummary, setJobQueueSummary] = React.useState<JobQueueSummary | null>(null);
  const [orderDetailsOpen, setOrderDetailsOpen] = React.useState(false);
  const [orderDetails, setOrderDetails] = React.useState<ProductionOrderDetailsState>({
    loading: false,
    error: '',
    pieces: [],
  });
  const orderRowRefs = React.useRef<Record<string, HTMLTableRowElement | null>>({});
  const pendingScrollOrderNumberRef = React.useRef('');
  const skipNextPageResetRef = React.useRef(restoredViewState.page > 1);
  const restoredSelectedOrderNumberRef = React.useRef(restoredViewState.selectedOrderNumber);
  const productionOrdersLoadRequestRef = React.useRef(0);

  const selectedOrder = orders.find((order) => order.orderNumber === selectedOrderNumber) ?? null;
  const selectedWorkCenterStationOptions = stationOptionsByWorkCenter[formState.assignedWorkCenter] ?? [];
  const activeCustomerFormOptions = React.useMemo<MesOrderDropdownOption[]>(() => {
    const options = customerOptions
      .filter((customer) => customer.status === 'active' || customer.id === formState.customerId)
      .map((customer) => ({
        value: customer.id,
        label: customer.status === 'inactive' ? `${customer.customer_name} (Inactive)` : customer.customer_name,
      }));
    if (formState.customerId && !options.some((option) => option.value === formState.customerId) && formState.clientName) {
      options.push({ value: formState.customerId, label: `${formState.clientName} (Unavailable)` });
    }
    return options;
  }, [customerOptions, formState.clientName, formState.customerId]);
  const clientFilterOptions = React.useMemo<MesOrderDropdownOption[]>(() => [
    { value: 'all', label: 'All clients' },
    ...customerOptions.map((customer) => ({
      value: customer.id,
      label: customer.status === 'inactive' ? `${customer.customer_name} (Inactive)` : customer.customer_name,
    })),
  ], [customerOptions]);
  const filteredOrders = orders.filter((order) => {
    const haystack = [
      order.orderNumber,
      order.partNumber,
      order.partName,
      order.clientName ?? '',
      order.status,
      order.priority,
      order.assignedWorkCenter,
    ].join(' ').toLowerCase();
    const matchesSearch = haystack.includes(searchTerm.trim().toLowerCase());
    const matchesView = orderView === 'all'
      || (orderView === 'in-progress' && ['released', 'running', 'paused', 'waiting-inspection'].includes(order.status))
      || (orderView === 'completed' && order.status === 'completed');
    const selectedFilterCustomer = customerOptions.find((customer) => customer.id === clientFilter);
    const matchesClient = clientFilter === 'all'
      || order.customerId === clientFilter
      || (!order.customerId && order.clientName?.trim() === selectedFilterCustomer?.customer_name);
    return matchesSearch && matchesView && matchesClient;
  });
  const priorityRank = {
    expedite: 0,
    high: 1,
    normal: 2,
    low: 3,
  };
  const visibleOrders = sortByPriority
    ? [...filteredOrders].sort((firstOrder, secondOrder) => {
      const priorityDifference = priorityRank[firstOrder.priority] - priorityRank[secondOrder.priority];
      if (priorityDifference !== 0) return priorityDifference;
      return new Date(firstOrder.dueDate).getTime() - new Date(secondOrder.dueDate).getTime();
    })
    : filteredOrders;
  const tableEmptyMessage = visibleOrders.length === 0
    ? tableMessage ?? (orders.length > 0 ? 'No Production Orders match the current filters.' : null)
    : null;
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(visibleOrders.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const paginatedOrders = visibleOrders.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const currentOrders = orders.filter((order) => ['released', 'running', 'paused', 'waiting-inspection'].includes(order.status)).length;
  const kpiOrders = orders.filter((order) => {
    const activityDate = toLocalIsoDate(order.updatedAt ?? order.createdAt ?? order.dueDate);
    return (!kpiDateRange.from || activityDate >= kpiDateRange.from) && (!kpiDateRange.to || activityDate <= kpiDateRange.to);
  });
  const completedOrders = kpiOrders.filter((order) => order.status === 'completed').length;
  const todayTotalProduction = kpiOrders.reduce((total, order) => total + order.completedQuantity, 0);
  const selectedOrderProgress = selectedOrder && selectedOrder.plannedQuantity > 0
    ? Math.min(100, Math.round((selectedOrder.completedQuantity / selectedOrder.plannedQuantity) * 100))
    : 0;
  const updateKpiDateRange = (nextRange: MesOrderDateRange) =>
    setKpiDateRange(nextRange.from > nextRange.to ? { from: nextRange.to, to: nextRange.from } : nextRange);
  const selectedOrderProgressTone = selectedOrderProgress >= 100
    ? 'complete'
    : selectedOrderProgress >= 67
      ? 'high'
      : selectedOrderProgress >= 34
        ? 'mid'
        : 'low';
  const productionOrdersRealtimeTables = React.useMemo(() => ([
    { table: 'mes_production_orders', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_work_centers', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_work_center_stations', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_customers', filter: `organization_id=eq.${organizationId}` },
  ]), [organizationId]);

  const loadProductionOrders = React.useCallback(async (silent = false) => {
    const requestId = productionOrdersLoadRequestRef.current + 1;
    productionOrdersLoadRequestRef.current = requestId;
    if (!silent) setOrdersLoaded(false);
    const [{ data, error }, { data: workCenterData, error: workCenterError }, { data: stationData, error: stationError }, { data: customerData, error: customerError }] = await Promise.all([
      supabase
        .from('mes_production_orders')
        .select('*')
        .eq('organization_id', organizationId)
        .order('due_date', { ascending: true }),
      supabase
        .from('mes_work_centers')
        .select('id, code, name')
        .eq('organization_id', organizationId)
        .order('name', { ascending: true }),
      supabase
        .from('mes_work_center_stations')
        .select('work_center_id, code, name')
        .eq('organization_id', organizationId)
        .order('name', { ascending: true }),
      supabase
        .from('mes_customers')
        .select('id, customer_name, legal_name, status')
        .eq('organization_id', organizationId)
        .order('customer_name', { ascending: true }),
    ]);

    if (requestId !== productionOrdersLoadRequestRef.current) return;
    if (customerError) {
      setCustomerOptions([]);
      setCustomerOptionsMessage(customerError.message);
    } else {
      const nextCustomerOptions = (customerData ?? []) as ProductionOrderCustomerOptionRow[];
      setCustomerOptions(nextCustomerOptions);
      setCustomerOptionsMessage(nextCustomerOptions.some((customer) => customer.status === 'active')
        ? ''
        : 'No active customers configured yet. Add a customer from the Clients app.');
    }
    if (workCenterError || stationError) {
      setWorkCenterOptions([]);
      setStationOptionsByWorkCenter({});
      setWorkCenterOptionsMessage(workCenterError?.message ?? stationError?.message ?? 'Unable to load Work Centers.');
    } else {
      const nextWorkCenterOptions = ((workCenterData ?? []) as ProductionOrderWorkCenterOptionRow[]).map((workCenter) => ({
        value: workCenter.code,
        label: `${workCenter.code} - ${workCenter.name}`,
      }));
      const workCenterCodeById = new Map(((workCenterData ?? []) as ProductionOrderWorkCenterOptionRow[]).map((workCenter) => [workCenter.id, workCenter.code]));
      const nextStationOptionsByWorkCenter = ((stationData ?? []) as ProductionOrderStationOptionRow[]).reduce<Record<string, MesOrderDropdownOption[]>>((groups, station) => {
        const workCenterCode = workCenterCodeById.get(station.work_center_id);
        if (!workCenterCode) return groups;
        groups[workCenterCode] = [...(groups[workCenterCode] ?? []), { value: station.code, label: `${station.code} - ${station.name}` }];
        return groups;
      }, {});
      setWorkCenterOptions(nextWorkCenterOptions);
      setStationOptionsByWorkCenter(nextStationOptionsByWorkCenter);
      setWorkCenterOptionsMessage(nextWorkCenterOptions.length ? '' : 'No Work Centers configured yet.');
    }
    if (error) {
      console.error('Unable to load MES production orders', error);
      setOrders([]);
      setSelectedOrderNumber('');
      setTableMessage(unavailableProductionOrdersMessage);
      setOrdersLoaded(true);
      return;
    }
    const nextOrders = ((data ?? []) as ProductionOrderRow[]).map(mapProductionOrderRow);
    setOrders(nextOrders);
    setSelectedOrderNumber((currentOrderNumber) => {
      const rememberedOrderNumber = restoredSelectedOrderNumberRef.current;
      const preferredOrderNumber = rememberedOrderNumber || currentOrderNumber;
      restoredSelectedOrderNumberRef.current = '';
      return preferredOrderNumber && nextOrders.some((order) => order.orderNumber === preferredOrderNumber)
        ? preferredOrderNumber
        : nextOrders[0]?.orderNumber ?? '';
    });
    setTableMessage(nextOrders.length === 0 ? emptyProductionOrdersMessage : null);
    setOrdersLoaded(true);
  }, [organizationId]);

  React.useEffect(() => {
    if (!ordersLoaded) return;
    try {
      const viewState: ProductionOrdersViewState = {
        selectedOrderNumber,
        page: currentPage,
        searchTerm,
        orderView,
        sortByPriority,
        clientFilter,
      };
      window.sessionStorage.setItem(getProductionOrdersViewStateKey(organizationId), JSON.stringify(viewState));
    } catch (error) {
      console.warn('Unable to preserve Production Orders view state', error);
    }
  }, [clientFilter, currentPage, orderView, ordersLoaded, organizationId, searchTerm, selectedOrderNumber, sortByPriority]);

  React.useEffect(() => {
    if (ordersLoaded && page > pageCount) setPage(pageCount);
  }, [ordersLoaded, page, pageCount]);

  React.useEffect(() => {
    const pendingOrderNumber = window.sessionStorage.getItem(productionOrderDeepLinkKey);
    if (!pendingOrderNumber || orders.length === 0) return;

    const targetOrderIndex = orders.findIndex((order) => order.orderNumber === pendingOrderNumber);
    window.sessionStorage.removeItem(productionOrderDeepLinkKey);
    if (targetOrderIndex === -1) return;

    if (searchTerm || orderView !== 'all') skipNextPageResetRef.current = true;
    setSearchTerm('');
    setOrderView('all');
    setSortByPriority(false);
    setPage(Math.floor(targetOrderIndex / pageSize) + 1);
    setSelectedOrderNumber(pendingOrderNumber);
    pendingScrollOrderNumberRef.current = pendingOrderNumber;
  }, [orders, orderView, searchTerm]);

  React.useEffect(() => {
    if (!selectedOrderNumber || pendingScrollOrderNumberRef.current !== selectedOrderNumber) return undefined;

    const scrollTimer = window.setTimeout(() => {
      const selectedRow = orderRowRefs.current[selectedOrderNumber];
      if (!selectedRow) return;
      selectedRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
      selectedRow.focus({ preventScroll: true });
      pendingScrollOrderNumberRef.current = '';
    }, 80);

    return () => window.clearTimeout(scrollTimer);
  }, [selectedOrderNumber, currentPage, paginatedOrders]);

  React.useEffect(() => {
    if (skipNextPageResetRef.current) {
      skipNextPageResetRef.current = false;
      return;
    }
    setPage(1);
  }, [clientFilter, searchTerm, orderView]);

  React.useEffect(() => {
    void loadProductionOrders();
  }, [loadProductionOrders]);

  useSupabaseRealtimeRefresh({
    channelName: `mes-production-orders-live:${organizationId}`,
    tables: productionOrdersRealtimeTables,
    onRefresh: () => loadProductionOrders(true),
  });

  const persistOrder = async (order: ProductionOrder) => {
    const { error } = await supabase
      .from('mes_production_orders')
      .update(toProductionOrderPayload(order, organizationId))
      .eq('id', order.id);
    if (error) {
      console.error('Unable to sync MES production order', error);
      setTableMessage('This Production Order could not be synced right now. Try again in a moment.');
    }
  };

  const openSelectedOrderJobQueue = () => {
    const activityTimestamp = new Date().toISOString();
    if (!selectedOrder || selectedOrder.manufacturingType !== 'single-operation' || !selectedOrder.assignedStation) return;
    setJobQueueSummary(getJobQueueSummary(orders, {
      workCenterCode: selectedOrder.assignedWorkCenter,
      stationCode: selectedOrder.assignedStation,
      stationName: getProductionOrderStationLabel(stationOptionsByWorkCenter, selectedOrder.assignedWorkCenter, selectedOrder.assignedStation),
    }, selectedOrder.id));
  };

  const updateOrder = (orderNumber: string, action: string) => {
    let updatedOrder: ProductionOrder | null = null;
    const activityTimestamp = new Date().toISOString();
    setOrders((currentOrders) =>
      currentOrders.map((order) => {
        if (order.orderNumber !== orderNumber) return order;
        if (action === 'production') {
          const nextCompleted = Math.min(order.plannedQuantity, order.completedQuantity + 24);
          updatedOrder = {
            ...order,
            completedQuantity: nextCompleted,
            status: nextCompleted >= order.plannedQuantity
              ? (order.qualityChecksEnabled ? 'waiting-inspection' : 'completed')
              : order.status,
            updatedAt: activityTimestamp,
          };
          return updatedOrder;
        }
        if (action === 'scrap') {
          updatedOrder = { ...order, scrapQuantity: order.scrapQuantity + 2, updatedAt: activityTimestamp };
          return updatedOrder;
        }
        const nextStatus = action === 'start' && ['released', 'paused'].includes(order.status)
          ? (shouldStartSingleOperationOrder(order, currentOrders) ? 'running' : 'released')
          : action === 'complete' && order.qualityChecksEnabled
            ? 'waiting-inspection'
            : actionStatus(order.status, action);
        updatedOrder = { ...order, status: nextStatus, updatedAt: activityTimestamp };
        return updatedOrder;
      }),
    );
    window.setTimeout(() => {
      if (updatedOrder) void persistOrder(updatedOrder);
    }, 0);
  };

  const openCreateOrderForm = () => {
    setOrderFormError('');
    setFormState(toFormState());
    setPartNameOption('');
    setAssignSerialsEnabled(false);
    setSerialAssignmentDrafts([]);
    setSerialAssignmentModalOpen(false);
    setFormMode('create');
  };

  const openEditOrderForm = () => {
    if (!selectedOrder) return;
    setOrderFormError('');
    const linkedCustomer = customerOptions.find((customer) =>
      customer.id === selectedOrder.customerId
      || (!selectedOrder.customerId && customer.customer_name === selectedOrder.clientName)
    );
    setFormState({
      ...toFormState(selectedOrder),
      customerId: linkedCustomer?.id ?? selectedOrder.customerId ?? '',
      clientName: linkedCustomer?.customer_name ?? selectedOrder.clientName ?? '',
    });
    setPartNameOption(getPartNameOptionValue(selectedOrder.partName));
    setAssignSerialsEnabled(false);
    setSerialAssignmentDrafts([]);
    setSerialAssignmentModalOpen(false);
    setFormMode('edit');
  };

  const closeOrderForm = () => {
    setFormMode(null);
    setSavingOrder(false);
    setOrderFormError('');
    setPartNameOption('');
    setAssignSerialsEnabled(false);
    setSerialAssignmentDrafts([]);
    setSerialAssignmentModalOpen(false);
  };

  const setProductionOrderPartNameOption = (nextOptionValue: ProductionOrderPartNameOption) => {
    setPartNameOption(nextOptionValue);
    const selectedPartNameOption = productionOrderPartNameOptions.find((option) => option.value === nextOptionValue);
    if (!selectedPartNameOption) {
      setFormState((current) => ({ ...current, partName: '' }));
      return;
    }
    if (selectedPartNameOption.value === 'other') {
      setFormState((current) => ({
        ...current,
        partName: getPartNameOptionValue(current.partName) === 'other' ? current.partName : '',
      }));
      return;
    }
    setFormState((current) => ({
      ...current,
      partName: selectedPartNameOption.label,
      pieceType: selectedPartNameOption.pieceType ?? current.pieceType,
    }));
  };

  const setSerialAssignmentField = (pieceSequence: number, field: 'toolId' | 'serialNumber', value: string) => {
    setSerialAssignmentDrafts((currentDrafts) => createSerialAssignmentDrafts(Number(formState.plannedQuantity) || 0, currentDrafts)
      .map((draft) => draft.pieceSequence === pieceSequence ? { ...draft, [field]: value } : draft));
  };

  const toggleSerialAssignments = () => {
    setAssignSerialsEnabled((enabled) => {
      const nextEnabled = !enabled;
      if (nextEnabled) {
        setSerialAssignmentDrafts((currentDrafts) => createSerialAssignmentDrafts(Number(formState.plannedQuantity) || 0, currentDrafts));
        setSerialAssignmentModalOpen(true);
      } else {
        setSerialAssignmentModalOpen(false);
      }
      return nextEnabled;
    });
  };

  React.useEffect(() => {
    if (!assignSerialsEnabled) return;
    setSerialAssignmentDrafts((currentDrafts) => createSerialAssignmentDrafts(Number(formState.plannedQuantity) || 0, currentDrafts));
  }, [assignSerialsEnabled, formState.plannedQuantity]);

  const saveOrderForm = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setOrderFormError('');
    if (!formState.orderNumber.trim() || !formState.customerId || !formState.clientName.trim() || !formState.partNumber.trim() || !formState.partName.trim() || !formState.assignedWorkCenter.trim()) {
      setOrderFormError('Complete Order Number, Client, Part Number, Part Name, and Work Center before saving.');
      return;
    }
    if (formState.manufacturingType === 'single-operation' && !formState.assignedStation.trim()) {
      setOrderFormError('Select a Station for this Single Operation order.');
      return;
    }
    const normalizedSerialDrafts = createSerialAssignmentDrafts(Number(formState.plannedQuantity) || 0, serialAssignmentDrafts);
    if (assignSerialsEnabled) {
      if (!normalizedSerialDrafts.length) {
        setOrderFormError('Set a Planned Quantity greater than zero before assigning Tool IDs and Serial Numbers.');
        return;
      }
      const serialAssignmentError = validateSerialAssignmentDrafts(normalizedSerialDrafts);
      if (serialAssignmentError) {
        setOrderFormError(serialAssignmentError);
        setSerialAssignmentModalOpen(true);
        return;
      }
    }
    const shouldCompleteAfterQualityDisable = formMode === 'edit'
      && selectedOrder?.status === 'waiting-inspection'
      && selectedOrder.qualityChecksEnabled
      && !formState.qualityChecksEnabled;
    const orderFromForm = {
      ...formStateToProductionOrder(formState, formMode === 'edit' ? selectedOrder?.id : undefined),
      status: shouldCompleteAfterQualityDisable ? ('completed' as ProductionOrderStatus) : formState.status,
      createdAt: selectedOrder?.createdAt,
      updatedAt: new Date().toISOString(),
    };

    if (formMode === 'edit' && selectedOrder) {
      setConfirmation({
        title: 'Save production order changes?',
        message: `This will update ${selectedOrder.orderNumber} with the values currently entered in the form.`,
        confirmLabel: 'Save changes',
        tone: 'primary',
        onConfirm: async () => {
          setSavingOrder(true);
          setOrderFormError('');
          const controller = new AbortController();
          const timeout = window.setTimeout(() => controller.abort(), 15000);
          try {
            const { error } = await supabase
              .from('mes_production_orders')
              .update(toProductionOrderPayload(orderFromForm, organizationId))
              .eq('id', selectedOrder.id)
              .abortSignal(controller.signal);
            if (error) throw error;
            setOrders((currentOrders) => currentOrders.map((order) => (order.id === selectedOrder.id ? orderFromForm : order)));
            setSelectedOrderNumber(orderFromForm.orderNumber);
            setTableMessage(null);
            closeOrderForm();
          } catch (error) {
            console.error('Unable to update MES production order', error);
            const message = controller.signal.aborted
              ? 'Supabase did not respond within 15 seconds. Check the connection and try again.'
              : (error as { message?: string }).message || 'This Production Order could not be updated right now.';
            setOrderFormError(message);
            setSavingOrder(false);
          } finally {
            window.clearTimeout(timeout);
          }
        },
      });
      return;
    }

    setConfirmation({
      title: 'Create production order?',
      message: `This will create ${orderFromForm.orderNumber} and add it to the Production Orders workspace.`,
      confirmLabel: 'Create order',
      tone: 'primary',
      onConfirm: async () => {
        setSavingOrder(true);
        setOrderFormError('');
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 15000);
        try {
          const { data, error } = await supabase
            .from('mes_production_orders')
            .insert(toProductionOrderPayload(orderFromForm, organizationId))
            .select('*')
            .single()
            .abortSignal(controller.signal);
          if (error) throw error;
          const nextOrder = mapProductionOrderRow(data as ProductionOrderRow);
          if (assignSerialsEnabled) {
            const serialRows: ProductionSerialInsertRow[] = normalizedSerialDrafts.map((draft) => ({
              organization_id: organizationId,
              production_order_id: nextOrder.id,
              piece_sequence: draft.pieceSequence,
              tool_id: draft.toolId.trim(),
              serial_number: draft.serialNumber.trim(),
              result: null,
              ready_for_quality: false,
              reported_at: null,
            }));
            const { error: serialsError } = await supabase
              .from('mes_production_serials')
              .insert(serialRows)
              .abortSignal(controller.signal);
            if (serialsError) throw serialsError;
          }
          setTableMessage(null);
          setOrders((currentOrders) => [nextOrder, ...currentOrders]);
          setSelectedOrderNumber(nextOrder.orderNumber);
          closeOrderForm();
        } catch (error) {
          console.error('Unable to create MES production order', error);
          const message = controller.signal.aborted
            ? 'Supabase did not respond within 15 seconds. Check the connection and try again.'
            : (error as { message?: string }).message || 'This Production Order could not be created right now.';
          setOrderFormError(message);
          setSavingOrder(false);
        } finally {
          window.clearTimeout(timeout);
        }
      },
    });
  };

  const deleteSelectedOrder = async () => {
    if (!selectedOrder) return;
    setConfirmation({
      title: 'Delete production order?',
      message: `This will delete ${selectedOrder.orderNumber}. This action cannot be undone.`,
      confirmLabel: 'Delete order',
      tone: 'danger',
      onConfirm: async () => {
        const nextOrders = orders.filter((order) => order.id !== selectedOrder.id);
        const { error } = await supabase.from('mes_production_orders').delete().eq('id', selectedOrder.id);
        if (error) {
          console.error('Unable to delete MES production order', error);
          setTableMessage('This Production Order could not be deleted right now. Try again in a moment.');
          return;
        }
        setOrders(nextOrders);
        setSelectedOrderNumber(nextOrders[0]?.orderNumber ?? '');
        setTableMessage(nextOrders.length === 0 ? emptyProductionOrdersMessage : null);
      },
    });
  };

  const openOrderDetails = async () => {
    if (!selectedOrder) return;
    setOrderDetailsOpen(true);
    setOrderDetails({ loading: true, error: '', pieces: [] });
    try {
      const [
        { data: serialData, error: serialError },
        { data: traceabilityData, error: traceabilityError },
        { data: qualityInspectionData, error: qualityInspectionError },
        { data: qualityMeasurementData, error: qualityMeasurementError },
        { data: qualityDocumentData, error: qualityDocumentError },
      ] = await Promise.all([
        supabase
          .from('mes_production_serials')
          .select('id, production_order_id, piece_sequence, tool_id, serial_number, result, ready_for_quality, traceability_id, reported_at')
          .eq('organization_id', organizationId)
          .eq('production_order_id', selectedOrder.id)
          .order('piece_sequence', { ascending: true }),
        supabase
          .from('mes_operator_terminal_traceability')
          .select('id, production_order_id, template_id, part_label, tool_id, serial_number, dimensions_unit, before_notch, before_tooth_length, damage_codes, stock_to_remove, after_tooth_length, payload, created_at')
          .eq('organization_id', organizationId)
          .eq('production_order_id', selectedOrder.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('mes_quality_serial_inspections')
          .select('id, production_order_id, serial_number, result, inspected_at')
          .eq('organization_id', organizationId)
          .eq('production_order_id', selectedOrder.id)
          .order('inspected_at', { ascending: false }),
        supabase
          .from('mes_quality_measurements')
          .select('id, production_order_id, serial_number, inspection_name, measured_value, lower_limit, upper_limit, result, measured_at')
          .eq('organization_id', organizationId)
          .eq('production_order_id', selectedOrder.id)
          .order('measured_at', { ascending: false }),
        supabase
          .from('mes_quality_inspection_documents')
          .select('id, production_order_id, serial_number, inspection_name, file_name, file_path, file_type, uploaded_at')
          .eq('organization_id', organizationId)
          .eq('production_order_id', selectedOrder.id)
          .order('uploaded_at', { ascending: false }),
      ]);

      if (serialError) throw serialError;
      if (traceabilityError) throw traceabilityError;
      if (qualityInspectionError) throw qualityInspectionError;
      if (qualityMeasurementError) throw qualityMeasurementError;
      if (qualityDocumentError) throw qualityDocumentError;

      const serialRows = (serialData ?? []) as ProductionOrderDetailSerialRow[];
      const traceabilityRows = (traceabilityData ?? []) as ProductionOrderDetailTraceabilityRow[];
      const qualityInspectionRows = (qualityInspectionData ?? []) as ProductionOrderDetailQualityInspectionRow[];
      const qualityMeasurementRows = (qualityMeasurementData ?? []) as ProductionOrderDetailQualityMeasurementRow[];
      const qualityDocumentRows = (qualityDocumentData ?? []) as ProductionOrderDetailQualityDocumentRow[];
      const traceabilityById = new Map(traceabilityRows.map((traceability) => [traceability.id, traceability]));
      const traceabilityBySerial = new Map<string, ProductionOrderDetailTraceabilityRow>();
      const traceabilityBySequence = new Map<number, ProductionOrderDetailTraceabilityRow>();
      const serialBySequence = new Map(serialRows.map((serial) => [serial.piece_sequence, serial]));
      const qualityInspectionBySerial = new Map<string, ProductionOrderDetailQualityInspectionRow>();
      const qualityMeasurementsBySerial = new Map<string, ProductionOrderDetailQualityMeasurementRow[]>();
      const qualityDocumentsBySerial = new Map<string, ProductionOrderDetailQualityDocumentRow[]>();

      traceabilityRows.forEach((traceability) => {
        const serialNumber = traceability.serial_number?.trim().toLowerCase();
        if (serialNumber && !traceabilityBySerial.has(serialNumber)) traceabilityBySerial.set(serialNumber, traceability);
        const pieceSequence = getProductionOrderDetailPayloadNumber(traceability.payload, 'piece_sequence');
        if (pieceSequence && !traceabilityBySequence.has(pieceSequence)) traceabilityBySequence.set(pieceSequence, traceability);
      });
      qualityInspectionRows.forEach((inspection) => {
        const serialNumber = normalizeProductionOrderDetailSerial(inspection.serial_number);
        if (serialNumber && !qualityInspectionBySerial.has(serialNumber)) qualityInspectionBySerial.set(serialNumber, inspection);
      });
      qualityMeasurementRows.forEach((measurement) => {
        const serialNumber = normalizeProductionOrderDetailSerial(measurement.serial_number);
        if (!serialNumber) return;
        qualityMeasurementsBySerial.set(serialNumber, [...(qualityMeasurementsBySerial.get(serialNumber) ?? []), measurement]);
      });
      qualityDocumentRows.forEach((document) => {
        const serialNumber = normalizeProductionOrderDetailSerial(document.serial_number);
        if (!serialNumber) return;
        qualityDocumentsBySerial.set(serialNumber, [...(qualityDocumentsBySerial.get(serialNumber) ?? []), document]);
      });

      const lastKnownSequence = Math.max(
        selectedOrder.plannedQuantity,
        ...serialRows.map((serial) => serial.piece_sequence),
        ...Array.from(traceabilityBySequence.keys()),
      );
      const pieces: ProductionOrderDetailPiece[] = Array.from({ length: lastKnownSequence }, (_, index) => {
        const pieceSequence = index + 1;
        const serial = serialBySequence.get(pieceSequence) ?? null;
        const serialKey = serial?.serial_number.trim().toLowerCase() ?? '';
        const traceability = (serial?.traceability_id ? traceabilityById.get(serial.traceability_id) : null)
          ?? (serialKey ? traceabilityBySerial.get(serialKey) : null)
          ?? traceabilityBySequence.get(pieceSequence)
          ?? null;
        const resolvedSerialKey = normalizeProductionOrderDetailSerial(serial?.serial_number || traceability?.serial_number || '');
        return {
          pieceSequence,
          toolId: serial?.tool_id ?? traceability?.tool_id ?? '',
          serialNumber: serial?.serial_number || traceability?.serial_number || '',
          status: serial?.result ?? (traceability ? 'good' : 'not-started'),
          reportedAt: serial?.reported_at ?? traceability?.created_at ?? '',
          traceability,
          qualityInspection: resolvedSerialKey ? qualityInspectionBySerial.get(resolvedSerialKey) ?? null : null,
          qualityMeasurements: resolvedSerialKey ? qualityMeasurementsBySerial.get(resolvedSerialKey) ?? [] : [],
          qualityDocuments: resolvedSerialKey ? qualityDocumentsBySerial.get(resolvedSerialKey) ?? [] : [],
        };
      });

      setOrderDetails({ loading: false, error: '', pieces });
    } catch (error) {
      console.error('Unable to load production order details', error);
      setOrderDetails({ loading: false, error: 'Unable to load order details.', pieces: [] });
    }
  };

  const confirmPendingAction = async () => {
    if (!confirmation) return;
    const pendingConfirmation = confirmation;
    setConfirmation(null);
    await pendingConfirmation.onConfirm();
  };

  React.useEffect(() => {
    if (!formMode && !confirmation && !jobQueueSummary && !orderDetailsOpen) return undefined;
    const previousBodyOverflow = document.body.style.overflow;
    const previousDocumentOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousDocumentOverflow;
    };
  }, [formMode, confirmation, jobQueueSummary, orderDetailsOpen]);

  return (
    <section className="mes-workspace-panel production-orders-workspace">
      <div className="mes-screen-header production-orders-heading">
        <button className="academy-back-button engineering-back-button mes-workspace-back" type="button" onClick={() => onNavigate('/workspace/manufacturing-ops/mes')}>
          <ArrowLeft size={16} />
          MES Applications
        </button>
        <div className="mes-workspace-heading">
          <p className="eyebrow">MES / Production Orders</p>
          <h2>Production Orders</h2>
          <p>Create, release, execute, and close orders with live quantities and shop-floor actions.</p>
        </div>
        <div className="production-orders-header-controls">
          <div className="production-orders-date-filters" aria-label="Production KPI date filters">
            <label>
              <span>From</span>
              <MesOrderDatePicker id="production-orders-kpi-from" value={kpiDateRange.from} onChange={(from) => updateKpiDateRange({ ...kpiDateRange, from })} onQuickRange={updateKpiDateRange} />
            </label>
            <label>
              <span>To</span>
              <MesOrderDatePicker id="production-orders-kpi-to" value={kpiDateRange.to} onChange={(to) => updateKpiDateRange({ ...kpiDateRange, to })} onQuickRange={updateKpiDateRange} />
            </label>
          </div>
          <button className="mes-primary-action production-orders-create" type="button" onClick={openCreateOrderForm}>
            <Plus size={16} /> Add Production Order
          </button>
        </div>
      </div>

      <section className="production-orders-overview" aria-label="Production order overview">
        <article className="production-orders-overview-card current">
          <span><Activity size={18} /></span>
          <div><em>Active orders</em><strong>{currentOrders}</strong><small>released, running, or paused</small></div>
        </article>
        <article className="production-orders-overview-card completed">
          <span><CheckCircle2 size={18} /></span>
          <div><em>Completed</em><strong>{completedOrders}</strong><small>closed in selected range</small></div>
        </article>
        <article className="production-orders-overview-card output">
          <span><Factory size={18} /></span>
          <div><em>Reported production</em><strong>{todayTotalProduction.toLocaleString()}</strong><small>units in selected range</small></div>
        </article>
        <label className="production-orders-search production-orders-overview-search">
          <span>Search orders</span>
          <div><Search size={17} /><input type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Order, part, client, status" /></div>
        </label>
      </section>
      <div className="production-orders-layout">
        <div className="production-orders-main-panel">
          <div className="production-orders-panel-title">
            <div className="production-orders-panel-copy">
              <span>Order register</span>
              <strong>Production order queue</strong>
            </div>
            <div className="production-orders-client-filter">
              <span>Client</span>
              <MesOrderDropdown id="production-orders-client-filter" value={clientFilter} options={clientFilterOptions} onChange={setClientFilter} />
            </div>
            <div className="production-orders-view-toggle" aria-label="Production order view">
              <button className={orderView === 'all' ? 'active' : ''} type="button" onClick={() => setOrderView('all')}>
                All
              </button>
              <button className={orderView === 'in-progress' ? 'active' : ''} type="button" onClick={() => setOrderView('in-progress')}>
                In progress
              </button>
              <button className={orderView === 'completed' ? 'active' : ''} type="button" onClick={() => setOrderView('completed')}>
                Completed
              </button>
              <button className={sortByPriority ? 'active' : ''} type="button" onClick={() => setSortByPriority((value) => !value)}>
                Priority
              </button>
            </div>
            <span>{paginatedOrders.length} showing / {visibleOrders.length} visible / {orders.length} total</span>
          </div>
          <div className="mes-table-wrap production-orders-table-wrap">
            <table className="mes-table production-orders-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Part</th>
                  <th>Planned</th>
                  <th>Completed</th>
                  <th>Scrap</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th className="production-orders-date-column-header">
                    <button
                      className="production-orders-date-column-toggle"
                      type="button"
                      aria-label={`Showing ${orderDateColumn === 'due' ? 'due date' : 'created date'}. Switch date column.`}
                      onClick={() => setOrderDateColumn((current) => (current === 'due' ? 'created' : 'due'))}
                    >
                      <span>{orderDateColumn === 'due' ? 'Due' : 'Created'}</span>
                      <CalendarDays size={13} />
                    </button>
                  </th>
                  <th>Client</th>
                </tr>
              </thead>
              <tbody>
                {tableEmptyMessage ? (
                  <tr>
                    <td className="production-orders-table-empty" colSpan={9}>
                      <div>
                        <span>{tableMessage === 'Loading production orders...' ? 'Loading' : 'Production Orders'}</span>
                        <strong>{tableEmptyMessage}</strong>
                      </div>
                    </td>
                  </tr>
                ) : paginatedOrders.map((order) => {
                  const selected = order.orderNumber === selectedOrderNumber;
                  return (
                    <tr
                      className={selected ? 'selected' : ''}
                      key={order.id}
                      ref={(node) => {
                        orderRowRefs.current[order.orderNumber] = node;
                      }}
                      tabIndex={0}
                      onClick={() => setSelectedOrderNumber(order.orderNumber)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedOrderNumber(order.orderNumber);
                        }
                      }}
                    >
                      <td><strong>{order.orderNumber}</strong></td>
                      <td>
                        <strong>{order.partNumber}</strong>
                        <span>{order.partName}</span>
                      </td>
                      <td className="production-order-number-cell">{order.plannedQuantity.toLocaleString()}</td>
                      <td className="production-order-number-cell">{order.completedQuantity.toLocaleString()}</td>
                      <td className="production-order-number-cell">{order.scrapQuantity.toLocaleString()}</td>
                      <td><MesStatusBadge value={order.status} /></td>
                      <td><MesStatusBadge value={order.priority} tone="priority" /></td>
                      <td>{orderDateColumn === 'due' ? formatDate(order.dueDate) : order.createdAt ? formatDate(toLocalIsoDate(order.createdAt)) : '-'}</td>
                      <td><strong>{order.clientName?.trim() || 'Unassigned'}</strong></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {visibleOrders.length > 0 ? (
            <div className="production-orders-pagination">
              <span>Page {currentPage} of {pageCount}</span>
              <div>
                <button type="button" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                  Previous
                </button>
                {Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => (
                  <button
                    className={pageNumber === currentPage ? 'active' : ''}
                    type="button"
                    key={pageNumber}
                    onClick={() => setPage(pageNumber)}
                  >
                    {pageNumber}
                  </button>
                ))}
                <button type="button" disabled={currentPage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <aside className="production-orders-side-panel" aria-label="Production order controls">
          <div className="production-orders-side-heading"><span>Selected order</span><strong>Order controls</strong></div>
          <div className="production-orders-manage-actions">
            <button className="production-orders-details-action" type="button" onClick={() => void openOrderDetails()} disabled={!selectedOrder}>
              Order Details
            </button>
            <button type="button" onClick={openEditOrderForm} disabled={!selectedOrder}>
              Edit
            </button>
            <button type="button" onClick={deleteSelectedOrder} disabled={!selectedOrder}>
              Delete
            </button>
          </div>
          {selectedOrder ? (
            <div className="production-orders-selection-card">
              <div>
                <div className="production-orders-selection-heading">
                  <span>Selected order</span>
                  <MesStatusBadge value={selectedOrder.priority} tone="priority" />
                </div>
                <strong>{selectedOrder.orderNumber}</strong>
                <em>{selectedOrder.partNumber} / {selectedOrder.clientName?.trim() || 'Unassigned client'}</em>
              </div>
              <div className="production-order-work-center-card">
                <Factory size={17} />
                <div><span>Work center</span><strong>{selectedOrder.assignedWorkCenter || 'Not assigned'}</strong></div>
              </div>
              <div className="production-order-created-card">
                <CalendarDays size={17} />
                <div>
                  <span>Created</span>
                  <time>{selectedOrder.createdAt ? formatDate(toLocalIsoDate(selectedOrder.createdAt)) : 'Not available'}</time>
                </div>
              </div>
              <div className="production-order-progress">
                <p>
                  <strong>{selectedOrder.completedQuantity.toLocaleString()}</strong>
                  {' / '}
                  {selectedOrder.plannedQuantity.toLocaleString()} completed
                </p>
                <p>{selectedOrder.scrapQuantity.toLocaleString()} scrap</p>
                <div>
                  <span>Progress</span>
                  <strong>{selectedOrderProgress}%</strong>
                </div>
                <div className={`production-order-progress-track progress-${selectedOrderProgressTone}`} aria-hidden="true">
                  <span style={{ width: `${selectedOrderProgress}%` }} />
                </div>
                <p>Due {formatDate(selectedOrder.dueDate)}</p>
              </div>
              <div className="mes-action-grid">
                {selectedOrder.manufacturingType === 'single-operation' && selectedOrder.assignedStation ? (
                  <button className="mes-action-info job-queue-action" type="button" onClick={openSelectedOrderJobQueue}>
                    Job Queue
                  </button>
                ) : null}
                {getProductionOrderActions(selectedOrder.status).map((orderAction) => (
                  <button
                    className={`mes-action-${orderAction.tone}`}
                    type="button"
                    key={orderAction.label}
                    onClick={() => {
                      if (orderAction.traceability) {
                        onNavigate('/workspace/manufacturing-ops/mes/traceability');
                        return;
                      }
                      if (orderAction.action) {
                        updateOrder(selectedOrder.orderNumber, orderAction.action);
                      }
                    }}
                  >
                    {orderAction.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="production-orders-empty-state">Select a production order to enable actions.</div>
          )}
        </aside>
      </div>
      {orderDetailsOpen && selectedOrder ? (
        <ProductionOrderDetailsModal
          order={selectedOrder}
          details={orderDetails}
          onClose={() => setOrderDetailsOpen(false)}
        />
      ) : null}
      {formMode ? (
        <div className="mes-modal-backdrop production-order-form-backdrop" role="presentation">
          <section className="mes-order-modal" role="dialog" aria-modal="true" aria-labelledby="production-order-form-title">
            <div>
              <p className="eyebrow">Production Order</p>
              <h3 id="production-order-form-title">{formMode === 'create' ? 'Add new production order' : 'Edit production order'}</h3>
            </div>
            <form className="mes-order-form" onSubmit={saveOrderForm}>
              <label>
                Order number
                <input value={formState.orderNumber} onChange={(event) => setFormState((current) => ({ ...current, orderNumber: event.target.value }))} placeholder="PO-0000" required />
              </label>
              <label>
                Client
                <MesOrderDropdown
                  id="production-order-customer"
                  value={formState.customerId}
                  options={activeCustomerFormOptions}
                  placeholder={customerOptionsMessage || 'Select customer'}
                  disabled={!activeCustomerFormOptions.length}
                  onChange={(customerId) => {
                    const customer = customerOptions.find((option) => option.id === customerId);
                    setFormState((current) => ({
                      ...current,
                      customerId,
                      clientName: customer?.customer_name ?? current.clientName,
                    }));
                  }}
                />
                {customerOptionsMessage ? <small className="production-order-customer-message">{customerOptionsMessage}</small> : null}
              </label>
              <label>
                Part number
                <input value={formState.partNumber} onChange={(event) => setFormState((current) => ({ ...current, partNumber: event.target.value }))} required />
              </label>
              <label className={partNameOption === 'other' ? 'production-order-part-name-field with-custom-part-name' : 'production-order-part-name-field'}>
                Part name
                <MesOrderDropdown
                  id="production-order-part-name"
                  value={partNameOption}
                  options={productionOrderPartNameOptions.map((option) => ({ value: option.value, label: option.label }))}
                  placeholder="Select part type"
                  onChange={(value) => setProductionOrderPartNameOption(value as ProductionOrderPartNameOption)}
                />
                {partNameOption === 'other' ? (
                  <input
                    className="production-order-custom-part-name"
                    value={formState.partName}
                    onChange={(event) => setFormState((current) => ({ ...current, partName: event.target.value }))}
                    placeholder="Enter custom part name"
                    required
                  />
                ) : null}
              </label>
              <label>
                Planned quantity
                <input type="number" min="0" value={formState.plannedQuantity} onChange={(event) => setFormState((current) => ({ ...current, plannedQuantity: event.target.value }))} required />
              </label>
              {formMode === 'create' ? (
                <fieldset className="production-order-serial-assignment mes-order-form-wide">
                  <div className="production-order-quality-heading">
                    <div>
                      <span className="production-order-quality-title">Assign Tool IDs and Serial Numbers</span>
                      <small>Preload each planned piece so Operator Terminal can pick from the available list.</small>
                    </div>
                    <button
                      className={assignSerialsEnabled ? 'active' : ''}
                      type="button"
                      role="switch"
                      aria-checked={assignSerialsEnabled}
                      onClick={toggleSerialAssignments}
                    >
                      <span>{assignSerialsEnabled ? 'Enabled' : 'Disabled'}</span>
                      <i aria-hidden="true" />
                    </button>
                  </div>
                  {assignSerialsEnabled ? (
                    <div className="production-order-serial-summary">
                      <span>{serialAssignmentDrafts.filter((draft) => draft.toolId.trim() && draft.serialNumber.trim()).length} of {serialAssignmentDrafts.length} pieces assigned</span>
                      <button type="button" onClick={() => setSerialAssignmentModalOpen(true)}>Edit assignments</button>
                    </div>
                  ) : null}
                </fieldset>
              ) : null}
              <label>
                Completed quantity
                <input type="number" min="0" value={formState.completedQuantity} onChange={(event) => setFormState((current) => ({ ...current, completedQuantity: event.target.value }))} required />
              </label>
              {formMode === 'edit' ? (
                <label>
                  Scrap quantity
                  <input type="number" min="0" value={formState.scrapQuantity} onChange={(event) => setFormState((current) => ({ ...current, scrapQuantity: event.target.value }))} required />
                </label>
              ) : null}
              <label className={formMode === 'create' ? 'production-order-status-field-create' : ''}>
                Status
                <MesOrderDropdown
                  id="production-order-status"
                  value={formState.status}
                  options={productionOrderStatuses.map((status) => ({ value: status, label: formatTitleLabel(status) }))}
                  onChange={(status) => setFormState((current) => ({ ...current, status: status as ProductionOrderStatus }))}
                />
              </label>
              <fieldset className="mes-order-priority-field">
                <legend>Priority</legend>
                <div className="mes-priority-switch" role="radiogroup" aria-label="Production order priority">
                  {productionOrderPriorities.map((priority) => (
                    <button
                      className={[
                        'mes-priority-switch-option',
                        `priority-${priority}`,
                        formState.priority === priority ? 'active' : '',
                      ].filter(Boolean).join(' ')}
                      type="button"
                      role="radio"
                      aria-checked={formState.priority === priority}
                      key={priority}
                      onClick={() => setFormState((current) => ({ ...current, priority }))}
                    >
                      {formatLabel(priority)}
                    </button>
                  ))}
                </div>
              </fieldset>
              <label>
                Due date
                <MesOrderDatePicker
                  id="production-order-due-date"
                  value={formState.dueDate}
                  onChange={(dueDate) => setFormState((current) => ({ ...current, dueDate }))}
                />
              </label>
              <label className="production-order-work-center-field">
                Assigned work center
                <MesOrderDropdown
                  id="production-order-work-center"
                  value={formState.assignedWorkCenter}
                  placeholder="Select work center"
                  options={workCenterOptions}
                  onChange={(assignedWorkCenter) => setFormState((current) => ({ ...current, assignedWorkCenter, assignedStation: '' }))}
                />
                {workCenterOptionsMessage ? <small className="mes-form-field-note">{workCenterOptionsMessage}</small> : null}
              </label>
              <fieldset className="production-order-planned-shifts mes-order-form-wide">
                <legend>Planned Shifts</legend>
                <div className="planned-shift-toggle-grid" aria-label="Planned shifts">
                  {plannedShiftOptions.map((shift) => {
                    const selected = formState.plannedShifts.includes(shift.value);
                    return (
                      <button
                        className={selected ? 'active' : ''}
                        type="button"
                        key={shift.value}
                        aria-pressed={selected}
                        onClick={() => setFormState((current) => ({
                          ...current,
                          plannedShifts: selected
                            ? current.plannedShifts.filter((plannedShift) => plannedShift !== shift.value)
                            : [...current.plannedShifts, shift.value],
                        }))}
                      >
                        <Check size={15} />
                        {shift.label}
                      </button>
                    );
                  })}
                </div>
                <small className="mes-form-field-note">Used to calculate scheduled utilization and machine load.</small>
              </fieldset>
              <fieldset className="production-order-quality-checks mes-order-form-wide">
                <div className="production-order-quality-heading">
                  <div>
                    <span className="production-order-quality-title">Quality Check</span>
                    <small>Configure the inspections required for every serialized piece in this order.</small>
                  </div>
                  <button
                    className={formState.qualityChecksEnabled ? 'active' : ''}
                    type="button"
                    role="switch"
                    aria-checked={formState.qualityChecksEnabled}
                    onClick={() => setFormState((current) => ({
                      ...current,
                      qualityChecksEnabled: !current.qualityChecksEnabled,
                      qualityChecks: current.qualityChecksEnabled ? [] : current.qualityChecks,
                      qualityCheckLimits: current.qualityChecksEnabled ? {} : current.qualityCheckLimits,
                    }))}
                  >
                    <span>{formState.qualityChecksEnabled ? 'Enabled' : 'Disabled'}</span>
                    <i aria-hidden="true" />
                  </button>
                </div>
                {formState.qualityChecksEnabled ? (
                  <div className="production-order-quality-body">
                    <div>
                      <span className="production-order-quality-label">Piece Type</span>
                      <div className="production-order-piece-types" role="radiogroup" aria-label="Piece type">
                        {qualityPieceTypes.map((pieceType) => (
                          <button
                            className={formState.pieceType === pieceType ? 'active' : ''}
                            type="button"
                            role="radio"
                            aria-checked={formState.pieceType === pieceType}
                            key={pieceType}
                            onClick={() => setFormState((current) => ({ ...current, pieceType, qualityChecks: [], qualityCheckLimits: {} }))}
                          >
                            {qualityPieceTypeLabels[pieceType]}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span className="production-order-quality-label">Required Inspections</span>
                      <div className="production-order-quality-options">
                        {qualityInspectionsByPieceType[formState.pieceType].map((inspection) => {
                          const selected = formState.qualityChecks.includes(inspection);
                          return (
                            <button
                              className={selected ? 'active' : ''}
                              type="button"
                              aria-pressed={selected}
                              key={inspection}
                              onClick={() => setFormState((current) => ({
                                ...current,
                                qualityChecks: selected
                                  ? current.qualityChecks.filter((check) => check !== inspection)
                                  : [...current.qualityChecks, inspection],
                              }))}
                            >
                              <Check size={15} />
                              {inspection}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : null}
              </fieldset>
              <fieldset className="production-order-manufacturing-type mes-order-form-wide">
                <legend>Manufacturing Type</legend>
                <div role="radiogroup" aria-label="Production order manufacturing type">
                  {productionOrderManufacturingTypes.map((type) => (
                    <button
                      className={formState.manufacturingType === type.value ? 'active' : ''}
                      type="button"
                      key={type.value}
                      role="radio"
                      aria-checked={formState.manufacturingType === type.value}
                      onClick={() => setFormState((current) => ({
                        ...current,
                        manufacturingType: type.value,
                        assignedStation: type.value === 'multi-step' ? '' : current.assignedStation,
                        productionFlow: type.value === 'single-operation' ? '' : current.productionFlow || productionFlowOptions[0]?.id || '',
                      }))}
                    >
                      {type.value === 'multi-step' ? <Factory size={18} /> : <RadioTower size={18} />}
                      <span>{type.label}</span>
                      <small>{type.description}</small>
                    </button>
                  ))}
                </div>
              </fieldset>
              <label className="mes-order-form-wide">
                {formState.manufacturingType === 'multi-step' ? 'Production Flow' : 'Station'}
                {formState.manufacturingType === 'multi-step' ? (
                  <MesOrderDropdown
                    id="production-order-flow"
                    value={formState.productionFlow}
                    options={productionFlowOptions.map((flow) => ({ value: flow.id, label: flow.name }))}
                    placement="bottom"
                    onChange={(productionFlow) => setFormState((current) => ({ ...current, productionFlow }))}
                  />
                ) : (
                  <>
                    <MesOrderDropdown
                      id="production-order-station"
                      value={formState.assignedStation}
                      placeholder={formState.assignedWorkCenter ? 'Select station' : 'Select work center first'}
                      options={selectedWorkCenterStationOptions}
                      disabled={!formState.assignedWorkCenter}
                      placement="bottom"
                      onChange={(assignedStation) => setFormState((current) => ({ ...current, assignedStation }))}
                    />
                    {formState.assignedWorkCenter && selectedWorkCenterStationOptions.length === 0 ? <small className="mes-form-field-note">No stations configured for this Work Center yet.</small> : null}
                  </>
                )}
              </label>
              {orderFormError ? <div className="mes-order-form-error mes-order-form-wide" role="alert"><AlertTriangle size={16} />{orderFormError}</div> : null}
              <div className="mes-order-form-actions">
                <button type="button" onClick={closeOrderForm}>Cancel</button>
                <button type="submit" disabled={savingOrder}>{savingOrder ? 'Saving...' : 'Save order'}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
      {formMode === 'create' && serialAssignmentModalOpen ? (
        <div className="mes-modal-backdrop production-order-serial-backdrop" role="presentation">
          <section className="mes-order-modal production-order-serial-modal" role="dialog" aria-modal="true" aria-labelledby="production-order-serial-title">
            <div className="production-order-serial-modal-heading">
              <div>
                <p className="eyebrow">Production Order</p>
                <h3 id="production-order-serial-title">Assign Tool IDs and Serial Numbers</h3>
              </div>
              <button type="button" aria-label="Close assignments" onClick={() => setSerialAssignmentModalOpen(false)}><CircleX size={18} /></button>
            </div>
            <div className="production-order-serial-table-wrap">
              <table className="production-order-serial-table">
                <thead>
                  <tr>
                    <th>Part</th>
                    <th>Tool ID</th>
                    <th>Serial Number</th>
                  </tr>
                </thead>
                <tbody>
                  {serialAssignmentDrafts.map((draft) => (
                    <tr key={draft.pieceSequence}>
                      <td>{draft.pieceSequence}</td>
                      <td>
                        <input value={draft.toolId} onChange={(event) => setSerialAssignmentField(draft.pieceSequence, 'toolId', event.target.value)} placeholder={`TOOL-${String(draft.pieceSequence).padStart(4, '0')}`} />
                      </td>
                      <td>
                        <input value={draft.serialNumber} onChange={(event) => setSerialAssignmentField(draft.pieceSequence, 'serialNumber', event.target.value)} placeholder={`${formState.partNumber || 'PART'}-SN-${String(draft.pieceSequence).padStart(4, '0')}`} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!serialAssignmentDrafts.length ? <div className="production-order-serial-empty">Set a Planned Quantity greater than zero to assign pieces.</div> : null}
            </div>
            <div className="mes-order-form-actions">
              <button type="button" onClick={() => setSerialAssignmentModalOpen(false)}>Done</button>
            </div>
          </section>
        </div>
      ) : null}
      {confirmation ? (
        <div className="mes-modal-backdrop production-order-confirm-backdrop" role="presentation">
          <section
            className={['mes-confirm-modal', confirmation.tone === 'danger' ? 'danger' : ''].filter(Boolean).join(' ')}
            role="dialog"
            aria-modal="true"
            aria-labelledby="production-order-confirm-title"
          >
            <div className="mes-confirm-mark" aria-hidden="true">
              {confirmation.tone === 'danger' ? <AlertTriangle size={24} /> : <Check size={24} />}
            </div>
            <div>
              <p className="eyebrow">Production Order</p>
              <h3 id="production-order-confirm-title">{confirmation.title}</h3>
              <p>{confirmation.message}</p>
            </div>
            <div className="mes-confirm-actions">
              <button type="button" onClick={() => setConfirmation(null)}>
                Cancel
              </button>
              <button type="button" onClick={() => void confirmPendingAction()}>
                {confirmation.confirmLabel}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {jobQueueSummary ? <JobQueueModal summary={jobQueueSummary} onClose={() => setJobQueueSummary(null)} /> : null}
    </section>
  );
}

type WorkCenterQueueJob = {
  orderId: string;
  product: string;
  priority: ProductionOrderPriority;
  dueDate: string;
  estimatedMinutes: number;
  status: string;
};

type WorkCenterEvent = {
  timestamp: string;
  eventType: string;
  relatedOrder: string;
  operator: string;
  notes: string;
};

type MesWorkCenter = {
  id: string;
  code: string;
  name: string;
  type: string;
  plant: string;
  area: string;
  address: string;
  latitude: number;
  longitude: number;
  status: WorkCenterStatus;
  description: string;
  currentJob: string | null;
  currentOperator: string;
  currentStep: string;
  queueCount: number;
  wipCount: number;
  utilization: number;
  lastEvent: string;
  activeDowntime: boolean;
  downtimeTodayMinutes: number;
  nextAvailable: string;
  capacityMode: string;
  defaultCycleTime: string;
  unitOfMeasure: string;
  queueCapacity: number;
  wipCapacity: number;
  requiresOperator: boolean;
  bottleneckCandidate: boolean;
  maintenanceStatus: string;
  maintenanceInterval: string;
  lastMaintenanceDate: string;
  nextMaintenanceDate: string;
  maintenanceNotes: string;
  capabilities: string[];
  queue: WorkCenterQueueJob[];
  events: WorkCenterEvent[];
  stations: WorkCenterStation[];
};

type WorkCenterStation = {
  id: string;
  workCenterId: string;
  code: string;
  name: string;
  type: string;
  imageUrl?: string;
  capabilityColor?: string;
  status: WorkCenterStatus;
  currentJob: string | null;
  operator: string;
  processStep: string;
  queueCount: number;
  wipCount: number;
  utilization: number;
  dueRisk: StationDueRisk;
  maintenanceStatus: string;
  capabilities: string[];
  lastEvent: string;
};

type WorkCenterFormState = {
  name: string;
  code: string;
  type: string;
  plant: string;
  area: string;
  address: string;
  latitude: string;
  longitude: string;
  description: string;
  status: WorkCenterStatus;
  capacityMode: string;
  defaultCycleTime: string;
  unitOfMeasure: string;
  queueCapacity: string;
  wipCapacity: string;
  requiresOperator: boolean;
  bottleneckCandidate: boolean;
  capabilities: string;
  maintenanceStatus: string;
  maintenanceInterval: string;
  lastMaintenanceDate: string;
  maintenanceNotes: string;
};

type StationFormState = {
  workCenterId: string;
  name: string;
  code: string;
  type: string;
  operator: string;
  capability: string;
  newCapabilityName: string;
  newCapabilityColor: string;
};

type WorkCenterKpiHelpKey = 'stationAvailability' | 'wipLoad' | 'dueRisk' | 'stationRunning' | 'stationIdle' | 'stationDown' | 'stationMaintenance';
type WorkCenterKpiFilter = 'availability' | 'wip' | 'risk';
type StationKpiFilter = 'running' | 'idle' | 'down' | 'maintenance';
type RiskBreakdown = {
  overdue: number;
  dueSoon: number;
  blocked: number;
  constrained: number;
};
type WorkCenterPlanningSummary = {
  activeJobCount: number;
  dueRisk: Exclude<StationDueRisk, 'critical'>;
  riskBreakdown: RiskBreakdown;
  riskyJobCount: number;
  wipCount: number;
};
type KpiThreshold = {
  label: string;
  tone: 'good' | 'info' | 'warning' | 'critical';
};
type AddressLookupState = {
  status: 'idle' | 'loading' | 'success' | 'error';
  message: string;
};
type AddressLookupMatch = GooglePlacesAddressMatch;
type AddressSuggestionMenuPosition = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};
type CapabilityColorPickerPosition = {
  top: number;
  left: number;
  width: number;
};

type MesWorkCenterRow = {
  id: string;
  code: string;
  name: string;
  type: string;
  plant: string;
  area: string;
  address: string;
  latitude: number;
  longitude: number;
  status: WorkCenterStatus;
  description: string;
  current_job: string | null;
  current_operator: string;
  current_step: string;
  queue_count: number;
  wip_count: number;
  utilization: number;
  last_event: string;
  active_downtime: boolean;
  downtime_today_minutes: number;
  next_available: string;
  capacity_mode: string;
  default_cycle_time: string;
  unit_of_measure: string;
  queue_capacity: number;
  wip_capacity: number;
  requires_operator: boolean;
  bottleneck_candidate: boolean;
  maintenance_status: string;
  maintenance_interval: string;
  last_maintenance_date: string;
  next_maintenance_date: string;
  maintenance_notes: string;
  capabilities: string[];
  queue: WorkCenterQueueJob[];
  events: WorkCenterEvent[];
};

type MesWorkCenterStationRow = {
  id: string;
  work_center_id: string;
  code: string;
  name: string;
  type: string;
  image_url: string | null;
  capability_color: string | null;
  status: WorkCenterStatus;
  current_job: string | null;
  operator: string;
  process_step: string;
  queue_count: number;
  wip_count: number;
  utilization: number;
  due_risk: StationDueRisk;
  maintenance_status: string;
  capabilities: string[];
  last_event: string;
};

const workCenterTypes = ['Manufacturing Site', 'Production Area', 'Grinding Cell', 'Quality Area', 'Receiving / Shipping Center', 'External Branch'];
const stationFormTypes = ['Manual Station', 'Semi-automatic Station', 'Automatic Station'];
const workCenterStatuses: WorkCenterStatus[] = ['running', 'idle', 'setup', 'down', 'maintenance', 'offline'];
const workCenterCapabilityTags = ['Hob Grinding', 'Skiving Grinding', 'Incoming Inspection', 'Final QC', 'Assembly', 'Packaging', 'Rework', 'CNC', 'Deburr'];
const registerNewCapabilityValue = '__register_new_capability__';
const capabilityColorOptions = ['#ff8a1f', '#1d4ed8', '#00a676', '#dc2626', '#8b5cf6', '#f59e0b', '#14b8a6', '#ec4899'];
const stationImageBucket = 'station-images';
const maintenanceStatuses = ['Healthy', 'Due soon', 'Maintenance required', 'In maintenance'];

function getProductionOrderRemainingQuantity(order: ProductionOrder) {
  return Math.max(0, order.plannedQuantity - order.completedQuantity - order.scrapQuantity);
}

function getActiveStationOrders(orders: ProductionOrder[], workCenter: MesWorkCenter | null, station: WorkCenterStation | null) {
  if (!workCenter || !station) return [];

  return orders.filter((order) => (
    order.manufacturingType === 'single-operation'
    && order.assignedWorkCenter === workCenter.code
    && order.assignedStation === station.code
    && ['planned', 'released', 'running', 'paused'].includes(order.status)
    && getProductionOrderRemainingQuantity(order) > 0
  ));
}

function getStationShiftBreakdown(orders: ProductionOrder[]) {
  return plannedShiftOptions.map((shift) => ({
    ...shift,
    orders: orders.filter((order) => order.plannedShifts.includes(shift.value)),
  }));
}

function getMachineLoad(orders: ProductionOrder[], shiftBreakdown = getStationShiftBreakdown(orders)): MachineLoad {
  if (orders.length === 0) return 'none';
  if (orders.length === 1) return 'low';

  const maxOrdersInShift = Math.max(...shiftBreakdown.map((shift) => shift.orders.length));
  const occupiedShiftCount = shiftBreakdown.filter((shift) => shift.orders.length > 0).length;
  const unscheduledOrderCount = orders.filter((order) => order.plannedShifts.length === 0).length;

  if ((occupiedShiftCount === totalAvailableStationShifts && maxOrdersInShift >= 3) || unscheduledOrderCount > 0) return 'overloaded';
  if (maxOrdersInShift >= 3) return 'high';
  if (maxOrdersInShift === 2) return 'medium';
  return 'normal';
}

function getStationScheduledUtilization(shiftBreakdown: ReturnType<typeof getStationShiftBreakdown>) {
  const occupiedShiftCount = shiftBreakdown.filter((shift) => shift.orders.length > 0).length;
  return Math.round((occupiedShiftCount / totalAvailableStationShifts) * 100);
}

function getDaysUntilDue(dueDate: string, todayIsoDate = getTodayIsoDate()) {
  const due = new Date(`${dueDate}T00:00:00`).getTime();
  const today = new Date(`${todayIsoDate}T00:00:00`).getTime();
  return Math.round((due - today) / 86400000);
}

function getStationDueRisk(orders: ProductionOrder[], machineLoad: MachineLoad, todayIsoDate = getTodayIsoDate()): StationDueRisk {
  if (orders.some((order) => getDaysUntilDue(order.dueDate, todayIsoDate) < 0 && order.status !== 'completed')) return 'critical';

  const loadHigh = machineLoad === 'high' || machineLoad === 'overloaded';
  const loadMedium = machineLoad === 'medium';

  if (orders.some((order) => {
    const daysUntilDue = getDaysUntilDue(order.dueDate, todayIsoDate);
    return (
      (daysUntilDue >= 0 && daysUntilDue <= 1 && order.status !== 'completed' && loadHigh)
      || (order.priority === 'expedite' && order.plannedShifts.length === 0)
      || (order.priority === 'expedite' && loadHigh)
    );
  })) return 'high';

  if (orders.some((order) => {
    const daysUntilDue = getDaysUntilDue(order.dueDate, todayIsoDate);
    return (
      (daysUntilDue === 0 && order.status !== 'completed')
      || (daysUntilDue >= 0 && daysUntilDue <= 2 && loadMedium)
      || (order.plannedShifts.length === 0 && Boolean(order.assignedStation))
    );
  })) return 'medium';

  return 'low';
}

function getStationPlanningMetrics(orders: ProductionOrder[], todayIsoDate = getTodayIsoDate()) {
  const shiftBreakdown = getStationShiftBreakdown(orders);
  const machineLoad = getMachineLoad(orders, shiftBreakdown);
  const scheduledUtilization = getStationScheduledUtilization(shiftBreakdown);
  const dueRisk = getStationDueRisk(orders, machineLoad, todayIsoDate);
  const hasPlannedShifts = shiftBreakdown.some((shift) => shift.orders.length > 0);

  return {
    dueRisk,
    hasPlannedShifts,
    machineLoad,
    scheduledUtilization,
    shiftBreakdown,
    wipCount: orders.filter((order) => order.status === 'running').length,
  };
}

function getActiveWorkCenterOrders(orders: ProductionOrder[], workCenter: MesWorkCenter | null) {
  if (!workCenter) return [];

  return orders.filter((order) => (
    order.manufacturingType === 'single-operation'
    && order.assignedWorkCenter === workCenter.code
    && ['planned', 'released', 'running', 'paused'].includes(order.status)
    && getProductionOrderRemainingQuantity(order) > 0
  ));
}

function getPlanningRiskBreakdown(orders: ProductionOrder[], machineLoad: MachineLoad, todayIsoDate = getTodayIsoDate()): RiskBreakdown {
  return orders.reduce<RiskBreakdown>((breakdown, order) => {
    const daysUntilDue = getDaysUntilDue(order.dueDate, todayIsoDate);
    if (daysUntilDue < 0) breakdown.overdue += 1;
    if (daysUntilDue >= 0 && daysUntilDue <= 1) breakdown.dueSoon += 1;
    if (order.priority === 'expedite') breakdown.blocked += 1;
    if (order.plannedShifts.length === 0 || machineLoad === 'overloaded') breakdown.constrained += 1;
    return breakdown;
  }, { overdue: 0, dueSoon: 0, blocked: 0, constrained: 0 });
}

function getStationRiskScore(risk: StationDueRisk) {
  if (risk === 'critical' || risk === 'high') return 3;
  if (risk === 'medium') return 1;
  return 0;
}

function getWorkCenterPlanningSummary(workCenter: MesWorkCenter, orders: ProductionOrder[], todayIsoDate = getTodayIsoDate()): WorkCenterPlanningSummary {
  const stations = getWorkCenterStations(workCenter);
  const stationSummaries = stations.map((station) => {
    const stationOrders = getActiveStationOrders(orders, workCenter, station);
    const metrics = getStationPlanningMetrics(stationOrders, todayIsoDate);
    return { metrics, stationOrders };
  });
  const activeOrderIds = new Set(getActiveWorkCenterOrders(orders, workCenter).map((order) => order.id));
  const riskyOrderIds = new Set<string>();
  const aggregateBreakdown = stationSummaries.reduce<RiskBreakdown>((breakdown, stationSummary) => {
    if (stationSummary.metrics.dueRisk !== 'low') {
      stationSummary.stationOrders.forEach((order) => riskyOrderIds.add(order.id));
    }
    const stationBreakdown = getPlanningRiskBreakdown(stationSummary.stationOrders, stationSummary.metrics.machineLoad, todayIsoDate);
    return {
      overdue: breakdown.overdue + stationBreakdown.overdue,
      dueSoon: breakdown.dueSoon + stationBreakdown.dueSoon,
      blocked: breakdown.blocked + stationBreakdown.blocked,
      constrained: breakdown.constrained + stationBreakdown.constrained,
    };
  }, { overdue: 0, dueSoon: 0, blocked: 0, constrained: 0 });

  const riskScore = stations.length
    ? stationSummaries.reduce((total, stationSummary) => total + getStationRiskScore(stationSummary.metrics.dueRisk), 0) / stations.length
    : 0;
  const severeStationCount = stationSummaries.filter((stationSummary) => ['critical', 'high'].includes(stationSummary.metrics.dueRisk)).length;
  const riskRatio = stations.length ? severeStationCount / stations.length : 0;
  const dueRisk: WorkCenterPlanningSummary['dueRisk'] = riskScore > 1.5 || riskRatio > 0.5
    ? 'high'
    : riskScore > 0
      ? 'medium'
      : 'low';

  return {
    activeJobCount: activeOrderIds.size,
    dueRisk,
    riskBreakdown: aggregateBreakdown,
    riskyJobCount: riskyOrderIds.size,
    wipCount: stationSummaries.reduce((total, stationSummary) => total + stationSummary.metrics.wipCount, 0),
  };
}

async function searchAddressMatches(query: string, limit = 5, signal?: AbortSignal): Promise<AddressLookupMatch[]> {
  return searchGooglePlacesAddressMatches(query, limit, signal);
}

async function resolveAddressMatch(match: AddressLookupMatch, signal?: AbortSignal): Promise<AddressLookupMatch | null> {
  return resolveGooglePlacesAddressMatch(match, signal);
}

// Future integration: Work Center capabilities should drive Production Flow allowed resources,
// Production Orders should assign queued jobs, Operator Terminal should publish live operations,
// Downtime and Production Events should update status and logs, while Traceability should consume
// queue, WIP, utilization, bottleneck, serial, lot, and event data from this model.
const mockMesWorkCenters = [
  {
    id: 'wc-receiving-dock',
    code: 'WC-RCV-DOCK',
    name: 'Receiving Dock',
    type: 'Receiving / Shipping Center',
    plant: 'Main Plant',
    area: 'Receiving',
    address: '500 Woodward Ave, Detroit, MI 48226',
    latitude: 42.3299,
    longitude: -83.0398,
    status: 'idle',
    description: 'Inbound material and tooling receiving point for production intake.',
    currentJob: null,
    currentOperator: 'Unassigned',
    currentStep: 'Dock intake',
    queueCount: 3,
    wipCount: 0,
    utilization: 38,
    lastEvent: '12 min ago',
    activeDowntime: false,
    downtimeTodayMinutes: 0,
    nextAvailable: 'Available now',
    capacityMode: 'Queue based',
    defaultCycleTime: '12 min / receipt',
    unitOfMeasure: 'Receipt',
    queueCapacity: 12,
    wipCapacity: 4,
    requiresOperator: true,
    bottleneckCandidate: false,
    maintenanceStatus: 'Healthy',
    maintenanceInterval: 'Weekly 5S audit',
    lastMaintenanceDate: '2026-05-28',
    nextMaintenanceDate: '2026-06-05',
    maintenanceNotes: 'Dock scale calibrated and clear.',
    capabilities: ['Receiving', 'Packaging'],
    queue: [
      { orderId: 'PO-10491', product: 'Carbide hob blanks', priority: 'normal', dueDate: '2026-06-03', estimatedMinutes: 18, status: 'Waiting receipt' },
      { orderId: 'PO-10477', product: 'Rework return tote', priority: 'high', dueDate: '2026-06-02', estimatedMinutes: 10, status: 'Queued' },
    ],
    events: [
      { timestamp: '12 min ago', eventType: 'JOB_ASSIGNED', relatedOrder: 'PO-10491', operator: 'A. Rivera', notes: 'Inbound tote staged.' },
      { timestamp: '47 min ago', eventType: 'OPERATION_COMPLETED', relatedOrder: 'PO-10473', operator: 'A. Rivera', notes: 'Receipt closed.' },
    ],
  },
  {
    id: 'wc-incoming-inspection-01',
    code: 'WC-INSP-IN-01',
    name: 'Incoming Inspection Area',
    type: 'Quality Area',
    plant: 'Main Plant',
    area: 'Inspection',
    address: '505 Woodward Ave, Detroit, MI 48226',
    latitude: 42.3315,
    longitude: -83.0412,
    status: 'running',
    description: 'Bench inspection for inbound tooling, blanks, gauges, and customer returns.',
    currentJob: 'PO-10482',
    currentOperator: 'M. Chen',
    currentStep: 'Incoming dimensional check',
    queueCount: 4,
    wipCount: 1,
    utilization: 76,
    lastEvent: '42 sec ago',
    activeDowntime: false,
    downtimeTodayMinutes: 0,
    nextAvailable: '24 min',
    capacityMode: 'Operator paced',
    defaultCycleTime: '8 min / lot',
    unitOfMeasure: 'Lot',
    queueCapacity: 10,
    wipCapacity: 2,
    requiresOperator: true,
    bottleneckCandidate: false,
    maintenanceStatus: 'Healthy',
    maintenanceInterval: 'Monthly gauge review',
    lastMaintenanceDate: '2026-05-17',
    nextMaintenanceDate: '2026-06-17',
    maintenanceNotes: 'Gauge blocks verified.',
    capabilities: ['Incoming Inspection', 'Final QC'],
    queue: [
      { orderId: 'PO-10473', product: 'Skiving cutter inspection', priority: 'high', dueDate: '2026-06-02', estimatedMinutes: 22, status: 'Waiting inspection' },
      { orderId: 'PO-10491', product: 'Hob blank hardness check', priority: 'normal', dueDate: '2026-06-03', estimatedMinutes: 16, status: 'Queued' },
    ],
    events: [
      { timestamp: '42 sec ago', eventType: 'OPERATION_STARTED', relatedOrder: 'PO-10482', operator: 'M. Chen', notes: 'Inspection started.' },
      { timestamp: '19 min ago', eventType: 'JOB_ASSIGNED', relatedOrder: 'PO-10482', operator: 'M. Chen', notes: 'Priority moved from queue.' },
    ],
  },
  {
    id: 'wc-hob-grinder-01',
    code: 'WC-GR-HOB-01',
    name: 'Hob Grinding Cell 01',
    type: 'Grinding Cell',
    plant: 'Tooling Shop',
    area: 'Grinding',
    address: '461 Burroughs St, Detroit, MI 48202',
    latitude: 42.3678,
    longitude: -83.0736,
    status: 'setup',
    description: 'Primary hob grinding machine for standard profile and resharpen work.',
    currentJob: 'PO-10473',
    currentOperator: 'J. Patel',
    currentStep: 'Wheel dress and fixture setup',
    queueCount: 5,
    wipCount: 1,
    utilization: 64,
    lastEvent: '6 min ago',
    activeDowntime: false,
    downtimeTodayMinutes: 18,
    nextAvailable: '52 min',
    capacityMode: 'Cycle time',
    defaultCycleTime: '34 min / tool',
    unitOfMeasure: 'Tool',
    queueCapacity: 8,
    wipCapacity: 1,
    requiresOperator: true,
    bottleneckCandidate: true,
    maintenanceStatus: 'Due soon',
    maintenanceInterval: 'Every 120 spindle hours',
    lastMaintenanceDate: '2026-05-22',
    nextMaintenanceDate: '2026-06-06',
    maintenanceNotes: 'Check coolant concentration before next shift.',
    capabilities: ['Hob Grinding', 'Rework', 'CNC'],
    queue: [
      { orderId: 'PO-10482', product: 'PM hob resharpen', priority: 'expedite', dueDate: '2026-06-02', estimatedMinutes: 38, status: 'Queued' },
      { orderId: 'PO-10491', product: 'New hob grind', priority: 'normal', dueDate: '2026-06-04', estimatedMinutes: 42, status: 'Queued' },
    ],
    events: [
      { timestamp: '6 min ago', eventType: 'SETUP_STARTED', relatedOrder: 'PO-10473', operator: 'J. Patel', notes: 'Setup started for hob fixture.' },
      { timestamp: '38 min ago', eventType: 'DOWNTIME_ENDED', relatedOrder: 'PO-10473', operator: 'J. Patel', notes: 'Coolant alarm cleared.' },
    ],
  },
  {
    id: 'wc-hob-grinder-02',
    code: 'WC-GR-HOB-02',
    name: 'Hob Grinding Cell 02',
    type: 'Grinding Cell',
    plant: 'Tooling Shop',
    area: 'Grinding',
    address: '5919 Second Ave, Detroit, MI 48202',
    latitude: 42.3664,
    longitude: -83.0758,
    status: 'running',
    description: 'High-volume hob grinder used for CNC rework and standard finishing.',
    currentJob: 'PO-10482',
    currentOperator: 'S. Moreno',
    currentStep: 'Hob grinding pass 2',
    queueCount: 5,
    wipCount: 1,
    utilization: 82,
    lastEvent: '42 sec ago',
    activeDowntime: false,
    downtimeTodayMinutes: 0,
    nextAvailable: '31 min',
    capacityMode: 'Cycle time',
    defaultCycleTime: '29 min / tool',
    unitOfMeasure: 'Tool',
    queueCapacity: 8,
    wipCapacity: 1,
    requiresOperator: true,
    bottleneckCandidate: true,
    maintenanceStatus: 'Healthy',
    maintenanceInterval: 'Every 120 spindle hours',
    lastMaintenanceDate: '2026-05-26',
    nextMaintenanceDate: '2026-06-10',
    maintenanceNotes: 'Running clean after wheel change.',
    capabilities: ['Hob Grinding', 'Rework', 'CNC'],
    queue: [
      { orderId: 'PO-10491', product: 'Hob finishing', priority: 'normal', dueDate: '2026-06-03', estimatedMinutes: 31, status: 'Queued' },
      { orderId: 'PO-10477', product: 'Rework grind', priority: 'high', dueDate: '2026-06-02', estimatedMinutes: 26, status: 'Queued' },
    ],
    events: [
      { timestamp: '42 sec ago', eventType: 'OPERATION_STARTED', relatedOrder: 'PO-10482', operator: 'S. Moreno', notes: 'Second pass started.' },
      { timestamp: '21 min ago', eventType: 'SETUP_COMPLETED', relatedOrder: 'PO-10482', operator: 'S. Moreno', notes: 'Wheel offset accepted.' },
    ],
  },
  {
    id: 'wc-skiving-grinder-01',
    code: 'WC-GR-SKV-01',
    name: 'Skiving Grinding Cell',
    type: 'Grinding Cell',
    plant: 'Tooling Shop',
    area: 'Grinding',
    address: '6130 Cass Ave, Detroit, MI 48202',
    latitude: 42.3669,
    longitude: -83.0699,
    status: 'down',
    description: 'Dedicated skiving cutter grinder for profile correction and production support.',
    currentJob: 'PO-10477',
    currentOperator: 'D. Nguyen',
    currentStep: 'Troubleshooting spindle alarm',
    queueCount: 3,
    wipCount: 1,
    utilization: 18,
    lastEvent: '14 min ago',
    activeDowntime: true,
    downtimeTodayMinutes: 74,
    nextAvailable: 'Maintenance review',
    capacityMode: 'Cycle time',
    defaultCycleTime: '41 min / tool',
    unitOfMeasure: 'Tool',
    queueCapacity: 6,
    wipCapacity: 1,
    requiresOperator: true,
    bottleneckCandidate: true,
    maintenanceStatus: 'Maintenance required',
    maintenanceInterval: 'Every 90 spindle hours',
    lastMaintenanceDate: '2026-05-18',
    nextMaintenanceDate: '2026-06-02',
    maintenanceNotes: 'Spindle vibration alarm open.',
    capabilities: ['Skiving Grinding', 'Rework', 'CNC'],
    queue: [
      { orderId: 'PO-10473', product: 'Skiving cutter finish', priority: 'expedite', dueDate: '2026-06-02', estimatedMinutes: 45, status: 'Blocked' },
    ],
    events: [
      { timestamp: '14 min ago', eventType: 'DOWNTIME_STARTED', relatedOrder: 'PO-10477', operator: 'D. Nguyen', notes: 'Spindle vibration alarm.' },
      { timestamp: '53 min ago', eventType: 'OPERATION_STARTED', relatedOrder: 'PO-10477', operator: 'D. Nguyen', notes: 'Grinding operation started.' },
    ],
  },
  {
    id: 'wc-universal-grinder-01',
    code: 'WC-GR-UNI-01',
    name: 'Universal Grinding Cell',
    type: 'Grinding Cell',
    plant: 'Tooling Shop',
    area: 'Grinding',
    address: '3011 W Grand Blvd, Detroit, MI 48202',
    latitude: 42.3692,
    longitude: -83.0772,
    status: 'maintenance',
    description: 'Universal grinder for special tooling, repair work, and low-volume jobs.',
    currentJob: null,
    currentOperator: 'Maintenance',
    currentStep: 'Preventive maintenance',
    queueCount: 2,
    wipCount: 0,
    utilization: 0,
    lastEvent: '31 min ago',
    activeDowntime: true,
    downtimeTodayMinutes: 96,
    nextAvailable: 'Today 2:30 PM',
    capacityMode: 'Manual estimate',
    defaultCycleTime: '55 min / tool',
    unitOfMeasure: 'Tool',
    queueCapacity: 5,
    wipCapacity: 1,
    requiresOperator: true,
    bottleneckCandidate: false,
    maintenanceStatus: 'In maintenance',
    maintenanceInterval: 'Biweekly inspection',
    lastMaintenanceDate: '2026-06-02',
    nextMaintenanceDate: '2026-06-16',
    maintenanceNotes: 'Preventive inspection in progress.',
    capabilities: ['Rework', 'CNC'],
    queue: [
      { orderId: 'PO-10491', product: 'Special relief grind', priority: 'normal', dueDate: '2026-06-04', estimatedMinutes: 62, status: 'Waiting maintenance' },
    ],
    events: [
      { timestamp: '31 min ago', eventType: 'MAINTENANCE_REQUIRED', relatedOrder: 'N/A', operator: 'R. Stone', notes: 'Preventive maintenance started.' },
    ],
  },
  {
    id: 'wc-deburr-01',
    code: 'WC-FIN-DBR-01',
    name: 'Finishing Cell',
    type: 'Production Area',
    plant: 'Main Plant',
    area: 'Finishing',
    address: '1001 Woodward Ave, Detroit, MI 48226',
    latitude: 42.3337,
    longitude: -83.0479,
    status: 'running',
    description: 'Manual deburr and edge finishing station before profile inspection.',
    currentJob: 'PO-10491',
    currentOperator: 'L. Walker',
    currentStep: 'Manual deburr',
    queueCount: 4,
    wipCount: 2,
    utilization: 71,
    lastEvent: '4 min ago',
    activeDowntime: false,
    downtimeTodayMinutes: 0,
    nextAvailable: '18 min',
    capacityMode: 'Operator paced',
    defaultCycleTime: '14 min / tool',
    unitOfMeasure: 'Tool',
    queueCapacity: 10,
    wipCapacity: 3,
    requiresOperator: true,
    bottleneckCandidate: false,
    maintenanceStatus: 'Healthy',
    maintenanceInterval: 'Weekly bench audit',
    lastMaintenanceDate: '2026-05-29',
    nextMaintenanceDate: '2026-06-05',
    maintenanceNotes: 'Burr tools stocked.',
    capabilities: ['Deburr', 'Rework'],
    queue: [
      { orderId: 'PO-10482', product: 'Hob edge cleanup', priority: 'high', dueDate: '2026-06-02', estimatedMinutes: 18, status: 'Queued' },
    ],
    events: [
      { timestamp: '4 min ago', eventType: 'OPERATION_STARTED', relatedOrder: 'PO-10491', operator: 'L. Walker', notes: 'Deburr started.' },
    ],
  },
  {
    id: 'wc-profile-inspection',
    code: 'WC-QA-PROFILE',
    name: 'Profile Inspection Area',
    type: 'Quality Area',
    plant: 'Main Plant',
    area: 'Quality',
    address: '1 Campus Martius, Detroit, MI 48226',
    latitude: 42.3291,
    longitude: -83.0467,
    status: 'idle',
    description: 'Profile verification station for finished tooling and rework lots.',
    currentJob: null,
    currentOperator: 'Unassigned',
    currentStep: 'Ready for next inspection',
    queueCount: 1,
    wipCount: 0,
    utilization: 44,
    lastEvent: '22 min ago',
    activeDowntime: false,
    downtimeTodayMinutes: 0,
    nextAvailable: 'Available now',
    capacityMode: 'Inspection time',
    defaultCycleTime: '24 min / tool',
    unitOfMeasure: 'Tool',
    queueCapacity: 6,
    wipCapacity: 1,
    requiresOperator: true,
    bottleneckCandidate: false,
    maintenanceStatus: 'Healthy',
    maintenanceInterval: 'Monthly calibration',
    lastMaintenanceDate: '2026-05-20',
    nextMaintenanceDate: '2026-06-20',
    maintenanceNotes: 'Probe calibration current.',
    capabilities: ['Final QC', 'Incoming Inspection'],
    queue: [
      { orderId: 'PO-10473', product: 'Profile verification', priority: 'high', dueDate: '2026-06-02', estimatedMinutes: 26, status: 'Queued' },
    ],
    events: [
      { timestamp: '22 min ago', eventType: 'OPERATION_COMPLETED', relatedOrder: 'PO-10482', operator: 'M. Chen', notes: 'Profile accepted.' },
    ],
  },
  {
    id: 'wc-final-qc',
    code: 'WC-QA-FINAL',
    name: 'Final QC Area',
    type: 'Quality Area',
    plant: 'Main Plant',
    area: 'Quality',
    address: '150 W Jefferson Ave, Detroit, MI 48226',
    latitude: 42.3284,
    longitude: -83.0480,
    status: 'running',
    description: 'Final release inspection and documentation station.',
    currentJob: 'PO-10473',
    currentOperator: 'T. Brooks',
    currentStep: 'Final QC signoff',
    queueCount: 2,
    wipCount: 1,
    utilization: 69,
    lastEvent: '9 min ago',
    activeDowntime: false,
    downtimeTodayMinutes: 0,
    nextAvailable: '20 min',
    capacityMode: 'Inspection time',
    defaultCycleTime: '19 min / order',
    unitOfMeasure: 'Order',
    queueCapacity: 8,
    wipCapacity: 2,
    requiresOperator: true,
    bottleneckCandidate: false,
    maintenanceStatus: 'Healthy',
    maintenanceInterval: 'Monthly document audit',
    lastMaintenanceDate: '2026-05-21',
    nextMaintenanceDate: '2026-06-21',
    maintenanceNotes: 'Release checklist updated.',
    capabilities: ['Final QC', 'Packaging'],
    queue: [
      { orderId: 'PO-10482', product: 'Final dimensional signoff', priority: 'expedite', dueDate: '2026-06-02', estimatedMinutes: 20, status: 'Queued' },
    ],
    events: [
      { timestamp: '9 min ago', eventType: 'OPERATION_STARTED', relatedOrder: 'PO-10473', operator: 'T. Brooks', notes: 'Final QC started.' },
    ],
  },
  {
    id: 'wc-shipping-area',
    code: 'WC-SHP-AREA',
    name: 'Shipping Area',
    type: 'Receiving / Shipping Center',
    plant: 'Distribution Dock',
    area: 'Shipping',
    address: '3400 E Lafayette St, Detroit, MI 48207',
    latitude: 42.3428,
    longitude: -83.0174,
    status: 'offline',
    description: 'Packout, documentation, and customer shipment staging.',
    currentJob: null,
    currentOperator: 'Unassigned',
    currentStep: 'Shift closed',
    queueCount: 0,
    wipCount: 0,
    utilization: 0,
    lastEvent: '1 hr ago',
    activeDowntime: false,
    downtimeTodayMinutes: 0,
    nextAvailable: 'Next shift',
    capacityMode: 'Queue based',
    defaultCycleTime: '16 min / shipment',
    unitOfMeasure: 'Shipment',
    queueCapacity: 12,
    wipCapacity: 4,
    requiresOperator: true,
    bottleneckCandidate: false,
    maintenanceStatus: 'Healthy',
    maintenanceInterval: 'Weekly packing audit',
    lastMaintenanceDate: '2026-05-30',
    nextMaintenanceDate: '2026-06-06',
    maintenanceNotes: 'Packaging labels stocked.',
    capabilities: ['Packaging'],
    queue: [],
    events: [
      { timestamp: '1 hr ago', eventType: 'WORK_CENTER_STATUS_CHANGED', relatedOrder: 'N/A', operator: 'L. Walker', notes: 'Marked offline after shift close.' },
    ],
  },
];

function createWorkCenterFormState(): WorkCenterFormState {
  return {
    name: '',
    code: '',
    type: workCenterTypes[0],
    plant: '',
    area: '',
    address: '',
    latitude: '',
    longitude: '',
    description: '',
    status: 'idle',
    capacityMode: 'Cycle time',
    defaultCycleTime: '',
    unitOfMeasure: 'Tool',
    queueCapacity: '6',
    wipCapacity: '1',
    requiresOperator: true,
    bottleneckCandidate: false,
    capabilities: '',
    maintenanceStatus: maintenanceStatuses[0],
    maintenanceInterval: '',
    lastMaintenanceDate: new Date().toISOString().slice(0, 10),
    maintenanceNotes: '',
  };
}

function workCenterToFormState(workCenter: MesWorkCenter): WorkCenterFormState {
  return {
    name: workCenter.name,
    code: workCenter.code,
    type: workCenter.type,
    plant: workCenter.plant,
    area: workCenter.area,
    address: workCenter.address,
    latitude: String(workCenter.latitude),
    longitude: String(workCenter.longitude),
    description: workCenter.description,
    status: workCenter.status,
    capacityMode: workCenter.capacityMode,
    defaultCycleTime: workCenter.defaultCycleTime,
    unitOfMeasure: workCenter.unitOfMeasure,
    queueCapacity: String(workCenter.queueCapacity),
    wipCapacity: String(workCenter.wipCapacity),
    requiresOperator: workCenter.requiresOperator,
    bottleneckCandidate: workCenter.bottleneckCandidate,
    capabilities: workCenter.capabilities.join(', '),
    maintenanceStatus: workCenter.maintenanceStatus,
    maintenanceInterval: workCenter.maintenanceInterval,
    lastMaintenanceDate: workCenter.lastMaintenanceDate,
    maintenanceNotes: workCenter.maintenanceNotes,
  };
}

function createStationFormState(workCenterId: string): StationFormState {
  return {
    workCenterId,
    name: '',
    code: '',
    type: stationFormTypes[0],
    operator: 'Unassigned',
    capability: '',
    newCapabilityName: '',
    newCapabilityColor: capabilityColorOptions[0],
  };
}

function stationToFormState(station: WorkCenterStation): StationFormState {
  return {
    workCenterId: station.workCenterId,
    name: station.name,
    code: station.code,
    type: station.type,
    operator: station.operator,
    capability: station.capabilities[0] ?? station.processStep,
    newCapabilityName: '',
    newCapabilityColor: station.capabilityColor ?? capabilityColorOptions[0],
  };
}

function revokePreviewObjectUrl(url: string) {
  if (url.startsWith('blob:')) URL.revokeObjectURL(url);
}

function normalizeHexColor(color: string) {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : capabilityColorOptions[0];
}

function hexToRgb(color: string) {
  const normalizedColor = normalizeHexColor(color).replace('#', '');
  return {
    red: parseInt(normalizedColor.slice(0, 2), 16),
    green: parseInt(normalizedColor.slice(2, 4), 16),
    blue: parseInt(normalizedColor.slice(4, 6), 16),
  };
}

function rgbToHex(red: number, green: number, blue: number) {
  const clampChannel = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
  return `#${[clampChannel(red), clampChannel(green), clampChannel(blue)].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function rgbToHsv(red: number, green: number, blue: number) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;

  if (delta) {
    if (max === r) hue = 60 * (((g - b) / delta) % 6);
    if (max === g) hue = 60 * ((b - r) / delta + 2);
    if (max === b) hue = 60 * ((r - g) / delta + 4);
  }

  return {
    hue: Math.round((hue + 360) % 360),
    saturation: max ? Math.round((delta / max) * 100) : 0,
    value: Math.round(max * 100),
  };
}

function hsvToHex(hue: number, saturation: number, value: number) {
  const h = ((hue % 360) + 360) % 360;
  const s = Math.max(0, Math.min(100, saturation)) / 100;
  const v = Math.max(0, Math.min(100, value)) / 100;
  const chroma = v * s;
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const match = v - chroma;
  const [r1, g1, b1] = h < 60 ? [chroma, x, 0]
    : h < 120 ? [x, chroma, 0]
      : h < 180 ? [0, chroma, x]
        : h < 240 ? [0, x, chroma]
          : h < 300 ? [x, 0, chroma]
            : [chroma, 0, x];

  return rgbToHex((r1 + match) * 255, (g1 + match) * 255, (b1 + match) * 255);
}

function hexToHsv(color: string) {
  const rgb = hexToRgb(color);
  return rgbToHsv(rgb.red, rgb.green, rgb.blue);
}

function getStationInitials(station: Pick<WorkCenterStation, 'type'>) {
  return station.type.split(' ').map((word) => word[0]).join('').slice(0, 2);
}

function mapWorkCenterStationRow(row: MesWorkCenterStationRow): WorkCenterStation {
  return {
    id: row.id,
    workCenterId: row.work_center_id,
    code: row.code,
    name: row.name,
    type: row.type,
    imageUrl: row.image_url ?? undefined,
    capabilityColor: row.capability_color ?? undefined,
    status: row.status,
    currentJob: row.current_job,
    operator: row.operator,
    processStep: row.process_step,
    queueCount: row.queue_count,
    wipCount: row.wip_count,
    utilization: row.utilization,
    dueRisk: row.due_risk,
    maintenanceStatus: row.maintenance_status,
    capabilities: row.capabilities ?? [],
    lastEvent: row.last_event,
  };
}

function mapWorkCenterRow(row: MesWorkCenterRow, stations: WorkCenterStation[] = []): MesWorkCenter {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type,
    plant: row.plant,
    area: row.area,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    status: row.status,
    description: row.description,
    currentJob: row.current_job,
    currentOperator: row.current_operator,
    currentStep: row.current_step,
    queueCount: row.queue_count,
    wipCount: row.wip_count,
    utilization: row.utilization,
    lastEvent: row.last_event,
    activeDowntime: row.active_downtime,
    downtimeTodayMinutes: row.downtime_today_minutes,
    nextAvailable: row.next_available,
    capacityMode: row.capacity_mode,
    defaultCycleTime: row.default_cycle_time,
    unitOfMeasure: row.unit_of_measure,
    queueCapacity: row.queue_capacity,
    wipCapacity: row.wip_capacity,
    requiresOperator: row.requires_operator,
    bottleneckCandidate: row.bottleneck_candidate,
    maintenanceStatus: row.maintenance_status,
    maintenanceInterval: row.maintenance_interval,
    lastMaintenanceDate: row.last_maintenance_date,
    nextMaintenanceDate: row.next_maintenance_date,
    maintenanceNotes: row.maintenance_notes,
    capabilities: row.capabilities ?? [],
    queue: row.queue ?? [],
    events: row.events ?? [],
    stations,
  };
}

function toWorkCenterPayload(workCenter: MesWorkCenter, organizationId: string) {
  return {
    id: workCenter.id,
    organization_id: organizationId,
    code: workCenter.code,
    name: workCenter.name,
    type: workCenter.type,
    plant: workCenter.plant,
    area: workCenter.area,
    address: workCenter.address,
    latitude: workCenter.latitude,
    longitude: workCenter.longitude,
    status: workCenter.status,
    description: workCenter.description,
    current_job: workCenter.currentJob,
    current_operator: workCenter.currentOperator,
    current_step: workCenter.currentStep,
    queue_count: workCenter.queueCount,
    wip_count: workCenter.wipCount,
    utilization: workCenter.utilization,
    last_event: workCenter.lastEvent,
    active_downtime: workCenter.activeDowntime,
    downtime_today_minutes: workCenter.downtimeTodayMinutes,
    next_available: workCenter.nextAvailable,
    capacity_mode: workCenter.capacityMode,
    default_cycle_time: workCenter.defaultCycleTime,
    unit_of_measure: workCenter.unitOfMeasure,
    queue_capacity: workCenter.queueCapacity,
    wip_capacity: workCenter.wipCapacity,
    requires_operator: workCenter.requiresOperator,
    bottleneck_candidate: workCenter.bottleneckCandidate,
    maintenance_status: workCenter.maintenanceStatus,
    maintenance_interval: workCenter.maintenanceInterval,
    last_maintenance_date: workCenter.lastMaintenanceDate,
    next_maintenance_date: workCenter.nextMaintenanceDate,
    maintenance_notes: workCenter.maintenanceNotes,
    capabilities: workCenter.capabilities,
    queue: workCenter.queue,
    events: workCenter.events,
  };
}

function toStationPayload(station: WorkCenterStation, organizationId: string) {
  return {
    id: station.id,
    organization_id: organizationId,
    work_center_id: station.workCenterId,
    code: station.code,
    name: station.name,
    type: station.type,
    image_url: station.imageUrl ?? null,
    capability_color: station.capabilityColor ?? null,
    status: station.status,
    current_job: station.currentJob,
    operator: station.operator,
    process_step: station.processStep,
    queue_count: station.queueCount,
    wip_count: station.wipCount,
    utilization: station.utilization,
    due_risk: station.dueRisk,
    maintenance_status: station.maintenanceStatus,
    capabilities: station.capabilities,
    last_event: station.lastEvent,
  };
}

function getWorkCenterStations(workCenter: MesWorkCenter): WorkCenterStation[] {
  return workCenter.stations;
}

function formatRiskLabel(risk: WorkCenterStation['dueRisk']) {
  return risk.charAt(0).toUpperCase() + risk.slice(1);
}

function formatMachineLoadLabel(load: MachineLoad) {
  if (load === 'none') return 'No Load';
  return load.charAt(0).toUpperCase() + load.slice(1);
}

function renderShiftOrderChips(orders: ProductionOrder[], onSelectOrder?: (order: ProductionOrder) => void, maxVisible?: number) {
  if (orders.length === 0) return <em>Available</em>;

  const visibleOrders = typeof maxVisible === 'number' ? orders.slice(0, maxVisible) : orders;
  const hiddenCount = orders.length - visibleOrders.length;

  return (
    <em className="station-shift-orders">
      {visibleOrders.map((order) => (
        <button
          type="button"
          key={order.id}
          onClick={(event) => {
            event.stopPropagation();
            onSelectOrder?.(order);
          }}
          aria-label={`Open production order ${order.orderNumber}`}
        >
          {order.orderNumber}
        </button>
      ))}
      {hiddenCount > 0 ? <b className="more">+MORE</b> : null}
    </em>
  );
}

function getCapabilityTone(capability: string) {
  const capabilityToneByName: Record<string, string> = {
    Receiving: 'receiving',
    Packaging: 'packaging',
    'Incoming Inspection': 'incoming-inspection',
    'Final QC': 'final-qc',
    'Hob Grinding': 'hob-grinding',
    Rework: 'rework',
    CNC: 'cnc',
    'Skiving Grinding': 'skiving-grinding',
    Deburr: 'deburr',
    Assembly: 'assembly',
  };

  return capabilityToneByName[capability] ?? 'default';
}

function WorkCenterRiskIcon({ risk }: { risk: WorkCenterStation['dueRisk'] }) {
  if (risk === 'critical') return <AlertTriangle size={22} strokeWidth={2.35} aria-hidden="true" />;
  if (risk === 'high') return <Frown size={22} strokeWidth={2.35} aria-hidden="true" />;
  if (risk === 'medium') return <Meh size={22} strokeWidth={2.35} aria-hidden="true" />;
  return <Smile size={22} strokeWidth={2.35} aria-hidden="true" />;
}

function getTodayIsoDate() {
  const now = new Date();
  const localDate = new Date(now.getTime() - (now.getTimezoneOffset() * 60_000));
  return localDate.toISOString().slice(0, 10);
}

function getWorkCenterRiskBreakdown(workCenter: MesWorkCenter, todayIsoDate: string): RiskBreakdown {
  return workCenter.queue.reduce<RiskBreakdown>((breakdown, job) => {
    const normalizedStatus = job.status.trim().toLowerCase().replace(/[\s_-]+/g, '');
    if (normalizedStatus.includes('blocked')) breakdown.blocked += 1;
    if (normalizedStatus.includes('maintenance') || workCenter.activeDowntime) breakdown.constrained += 1;
    if (job.dueDate < todayIsoDate) breakdown.overdue += 1;
    if (job.dueDate === todayIsoDate || normalizedStatus.includes('duesoon')) breakdown.dueSoon += 1;
    return breakdown;
  }, { overdue: 0, dueSoon: 0, blocked: 0, constrained: 0 });
}

function getRiskBreakdownTotal(breakdown: RiskBreakdown) {
  return breakdown.overdue + breakdown.dueSoon + breakdown.blocked + breakdown.constrained;
}

function isRiskyWorkCenterJob(workCenter: MesWorkCenter, todayIsoDate: string) {
  if (!workCenter.currentJob) return false;
  if (workCenter.activeDowntime) return true;
  return getRiskBreakdownTotal(getWorkCenterRiskBreakdown(workCenter, todayIsoDate)) > 0;
}

function getWorkCenterRisk(workCenter: MesWorkCenter, todayIsoDate = getTodayIsoDate()): WorkCenterStation['dueRisk'] {
  const stations = getWorkCenterStations(workCenter);
  const availableStations = stations.filter((station) => ['idle', 'running'].includes(station.status)).length;
  const availabilityRatio = stations.length ? availableStations / stations.length : 1;
  const wipCapacity = stations.length * 2;
  const wipRatio = wipCapacity ? workCenter.wipCount / wipCapacity : 0;
  const breakdown = getWorkCenterRiskBreakdown(workCenter, todayIsoDate);

  // Future live MES data should connect due-date risk, blocked operations, and station dependency criticality here.
  if (
    breakdown.overdue > 0
    || breakdown.blocked > 0
    || (workCenter.activeDowntime && Boolean(workCenter.currentJob))
    || (availabilityRatio < 0.7 && Boolean(workCenter.currentJob))
  ) {
    return 'high';
  }

  if (breakdown.dueSoon > 0 || breakdown.constrained > 0 || wipRatio > 0.6 || workCenter.queueCount > 2) return 'medium';
  return 'low';
}

function getAvailabilityStatus(availabilityRatio: number) {
  if (availabilityRatio >= 0.85) return 'healthy';
  if (availabilityRatio >= 0.7) return 'limited';
  return 'critical';
}

function getLoadStatus(loadRatio: number) {
  if (loadRatio <= 0.6) return 'low';
  if (loadRatio <= 0.85) return 'medium';
  return 'high';
}

function getRiskStatus(riskRatio: number) {
  if (riskRatio <= 0.2) return 'low';
  if (riskRatio <= 0.5) return 'medium';
  return 'high';
}

function getStationRunningStatus(totalStations: number, runningStations: number) {
  if (!totalStations) return 'neutral';
  const runningRatio = runningStations / totalStations;
  if (runningRatio >= 0.7) return 'high-activity';
  if (runningRatio >= 0.3) return 'moderate-activity';
  return 'low-activity';
}

function getStationUtilizationStatus(utilization: number) {
  const utilizationRatio = utilization / 100;
  if (utilizationRatio >= 0.7) return 'high-activity';
  if (utilizationRatio >= 0.3) return 'moderate-activity';
  return 'low-activity';
}

function getStationIdleStatus(totalStations: number, idleStations: number) {
  if (!totalStations) return 'neutral';
  const idleRatio = idleStations / totalStations;
  if (idleRatio <= 0.2) return 'fully-loaded';
  if (idleRatio <= 0.6) return 'available-capacity';
  return 'underutilized';
}

function getStationDownStatus(totalStations: number, downStations: number) {
  if (!totalStations) return 'neutral';
  const downRatio = downStations / totalStations;
  if (downStations === 0) return 'healthy';
  if (totalStations <= 3 && downStations >= 1) return 'critical';
  if (downRatio <= 0.25) return 'degraded';
  return 'critical';
}

function getStationMaintenanceStatus(totalStations: number, maintenanceStations: number) {
  if (!totalStations) return 'neutral';
  const maintenanceRatio = maintenanceStations / totalStations;
  if (maintenanceStations === 0) return 'clear';
  if (totalStations <= 2 && maintenanceStations >= 1) return 'constrained';
  if (maintenanceRatio <= 0.3) return 'limited';
  return 'constrained';
}

function formatKpiStatusLabel(status: string) {
  return status.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function getMaintenanceTone(maintenanceStatus: string) {
  const normalizedStatus = maintenanceStatus.toLowerCase();
  if (normalizedStatus.includes('healthy')) return 'low';
  if (normalizedStatus.includes('due')) return 'medium';
  if (normalizedStatus.includes('required') || normalizedStatus.includes('maintenance')) return 'high';
  return 'medium';
}

function formatPercent(ratio: number) {
  return `${Math.round(ratio * 100)}%`;
}

function getWorkCenterOperationalSummary(workCenter: MesWorkCenter | null, stations: WorkCenterStation[], planningSummary?: WorkCenterPlanningSummary) {
  if (!workCenter) return { tone: 'info', items: ['Select a Work Center to review station execution, availability, and operational constraints.'] };

  const runningStations = stations.filter((station) => station.status === 'running').length;
  const idleStations = stations.filter((station) => ['idle', 'available'].includes(station.status)).length;
  const downStations = stations.filter((station) => station.status === 'down').length;
  const maintenanceStations = stations.filter((station) => station.status === 'maintenance').length;
  const unavailableStations = downStations + maintenanceStations;
  const availabilityRatio = stations.length ? (runningStations + idleStations) / stations.length : 1;
  const risk = planningSummary?.dueRisk ?? getWorkCenterRisk(workCenter);
  const activeWip = planningSummary?.wipCount ?? workCenter.wipCount;
  const activeJobs = planningSummary?.activeJobCount ?? workCenter.queueCount;

  if (risk === 'high' || availabilityRatio < 0.7 || unavailableStations > 0) {
    return {
      tone: 'critical',
      items: [
        `${workCenter.name} requires attention.`,
        `${unavailableStations} station${unavailableStations === 1 ? '' : 's'} unavailable.`,
        `${activeWip} WIP active and ${activeJobs} job${activeJobs === 1 ? '' : 's'} waiting in queue.`,
      ],
    };
  }

  if (activeWip > stations.length || activeJobs > 2 || risk === 'medium') {
    return {
      tone: 'warning',
      items: [
        `${workCenter.name} is operating with constraints.`,
        `${runningStations} of ${stations.length} station${stations.length === 1 ? '' : 's'} running; ${idleStations} idle.`,
        `${activeJobs} job${activeJobs === 1 ? '' : 's'} queued for execution.`,
      ],
    };
  }

  if (runningStations > 0) {
    return {
      tone: 'healthy',
      items: [
        `${workCenter.name} is actively running.`,
        `${runningStations} of ${stations.length} station${stations.length === 1 ? '' : 's'} are running.`,
        'WIP is controlled and no downtime is active.',
      ],
    };
  }

  return {
    tone: 'info',
    items: [
      `${workCenter.name} is healthy but underutilized.`,
      `${idleStations} station${idleStations === 1 ? '' : 's'} idle and no downtime is active.`,
      `${workCenter.queueCount} job${workCenter.queueCount === 1 ? '' : 's'} waiting in queue.`,
    ],
  };
}

export function WorkCentersWorkspace({ onNavigate, organizationId }: WorkspaceProps) {
  const [workCenters, setWorkCenters] = React.useState<MesWorkCenter[]>([]);
  const [productionOrders, setProductionOrders] = React.useState<ProductionOrder[]>([]);
  const [selectedWorkCenterId, setSelectedWorkCenterId] = React.useState('');
  const [selectedStationId, setSelectedStationId] = React.useState('');
  const [customCapabilityColors, setCustomCapabilityColors] = React.useState<Record<string, string>>({});
  const [workCentersLoading, setWorkCentersLoading] = React.useState(true);
  const [workCentersError, setWorkCentersError] = React.useState('');
  const [filters, setFilters] = React.useState({
    search: '',
    capability: '',
    risk: '',
  });
  const [stationFilters, setStationFilters] = React.useState({
    search: '',
    status: '',
    capability: '',
  });
  const [editingWorkCenterId, setEditingWorkCenterId] = React.useState<string | null>(null);
  const [workCenterConfirmation, setWorkCenterConfirmation] = React.useState<ConfirmationState | null>(null);
  const [workCenterMapOpacityMode, setWorkCenterMapOpacityMode] = React.useState(false);
  const [workCenterMapExpanded, setWorkCenterMapExpanded] = React.useState(false);
  const [showAddForm, setShowAddForm] = React.useState(false);
  const [showStationForm, setShowStationForm] = React.useState(false);
  const [showDetailModal, setShowDetailModal] = React.useState(false);
  const [jobQueueSummary, setJobQueueSummary] = React.useState<JobQueueSummary | null>(null);
  const [openKpiHelp, setOpenKpiHelp] = React.useState<WorkCenterKpiHelpKey | null>(null);
  const [activeWorkCenterKpiFilter, setActiveWorkCenterKpiFilter] = React.useState<WorkCenterKpiFilter | null>(null);
  const [activeStationKpiFilter, setActiveStationKpiFilter] = React.useState<StationKpiFilter | null>(null);
  const [editingStationId, setEditingStationId] = React.useState<string | null>(null);
  const [formState, setFormState] = React.useState<WorkCenterFormState>(() => createWorkCenterFormState());
  const [stationFormState, setStationFormState] = React.useState<StationFormState>(() => createStationFormState(''));
  const [stationImageFile, setStationImageFile] = React.useState<File | null>(null);
  const [stationImagePreviewUrl, setStationImagePreviewUrl] = React.useState('');
  const [stationImageUploadError, setStationImageUploadError] = React.useState('');
  const [stationImageUploading, setStationImageUploading] = React.useState(false);
  const [showCapabilityColorPicker, setShowCapabilityColorPicker] = React.useState(false);
  const [addressLookup, setAddressLookup] = React.useState<AddressLookupState>({ status: 'idle', message: '' });
  const [addressSuggestions, setAddressSuggestions] = React.useState<AddressLookupMatch[]>([]);
  const [showAddressSuggestions, setShowAddressSuggestions] = React.useState(false);
  const [addressSuggestionsLoading, setAddressSuggestionsLoading] = React.useState(false);
  const [addressSuggestionPosition, setAddressSuggestionPosition] = React.useState<AddressSuggestionMenuPosition | null>(null);
  const [capabilityColorPickerPosition, setCapabilityColorPickerPosition] = React.useState<CapabilityColorPickerPosition | null>(null);
  const addressLookupControlRef = React.useRef<HTMLDivElement | null>(null);
  const addressSuggestionMenuRef = React.useRef<HTMLDivElement | null>(null);
  const capabilityColorTriggerRef = React.useRef<HTMLSpanElement | null>(null);
  const capabilityColorPickerRef = React.useRef<HTMLDivElement | null>(null);

  const loadWorkCenters = React.useCallback(async () => {
    setWorkCentersLoading(true);
    setWorkCentersError('');

    const [{ data: workCenterRows, error: workCenterError }, { data: stationRows, error: stationError }, { data: productionOrderRows, error: productionOrderError }] = await Promise.all([
      supabase.from('mes_work_centers').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }),
      supabase.from('mes_work_center_stations').select('*').eq('organization_id', organizationId).order('created_at', { ascending: true }),
      supabase.from('mes_production_orders').select('*').eq('organization_id', organizationId).order('due_date', { ascending: true }),
    ]);

    if (workCenterError || stationError || productionOrderError) {
      setWorkCentersError(workCenterError?.message ?? stationError?.message ?? productionOrderError?.message ?? 'Could not load Work Centers.');
      setWorkCenters([]);
      setProductionOrders([]);
      setWorkCentersLoading(false);
      return;
    }

    const stationsByWorkCenter = (stationRows as MesWorkCenterStationRow[] | null ?? []).reduce<Record<string, WorkCenterStation[]>>((groups, row) => {
      const station = mapWorkCenterStationRow(row);
      groups[station.workCenterId] = [...(groups[station.workCenterId] ?? []), station];
      return groups;
    }, {});
    const nextWorkCenters = (workCenterRows as MesWorkCenterRow[] | null ?? []).map((row) => mapWorkCenterRow(row, stationsByWorkCenter[row.id] ?? []));
    const capabilityColors = Object.fromEntries(
      nextWorkCenters.flatMap((workCenter) => workCenter.stations)
        .filter((station) => station.capabilityColor)
        .flatMap((station) => station.capabilities.map((capability) => [capability, station.capabilityColor as string])),
    );

    setCustomCapabilityColors(capabilityColors);
    setWorkCenters(nextWorkCenters);
    setProductionOrders((productionOrderRows as ProductionOrderRow[] | null ?? []).map(mapProductionOrderRow));
    setSelectedWorkCenterId((currentId) => (nextWorkCenters.some((workCenter) => workCenter.id === currentId) ? currentId : nextWorkCenters[0]?.id ?? ''));
    setSelectedStationId((currentId) => (nextWorkCenters.some((workCenter) => workCenter.stations.some((station) => station.id === currentId)) ? currentId : ''));
    setWorkCentersLoading(false);
  }, [organizationId]);
  const workCentersRealtimeTables = React.useMemo(() => ([
    { table: 'mes_work_centers', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_work_center_stations', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_production_orders', filter: `organization_id=eq.${organizationId}` },
  ]), [organizationId]);

  React.useEffect(() => {
    void loadWorkCenters();
  }, [loadWorkCenters]);

  useSupabaseRealtimeRefresh({
    channelName: `mes-work-centers-live:${organizationId}`,
    tables: workCentersRealtimeTables,
    onRefresh: loadWorkCenters,
  });

  React.useEffect(() => {
    document.body.classList.toggle('work-center-map-expanded', workCenterMapExpanded);

    return () => {
      document.body.classList.remove('work-center-map-expanded');
    };
  }, [workCenterMapExpanded]);

  const getStationsForWorkCenter = React.useCallback((workCenter: MesWorkCenter) => getWorkCenterStations(workCenter), []);
  const getStationCapabilitiesForWorkCenter = React.useCallback((workCenter: MesWorkCenter) => (
    Array.from(new Set(getStationsForWorkCenter(workCenter).flatMap((station) => station.capabilities)))
  ), [getStationsForWorkCenter]);
  const selectedWorkCenter = workCenters.find((workCenter) => workCenter.id === selectedWorkCenterId) ?? workCenters[0] ?? null;
  const selectedStations = selectedWorkCenter ? getStationsForWorkCenter(selectedWorkCenter) : [];
  const selectedStation = selectedStations.find((station) => station.id === selectedStationId) ?? selectedStations[0] ?? null;
  const getStationJobQueueSummary = React.useCallback((workCenter: MesWorkCenter | null, station: WorkCenterStation | null) => (
    getJobQueueSummary(productionOrders, workCenter && station ? {
      workCenterCode: workCenter.code,
      stationCode: station.code,
      stationName: station.name,
    } : null)
  ), [productionOrders]);
  const selectedStationQueueSummary = getStationJobQueueSummary(selectedWorkCenter, selectedStation);
  const selectedStationCurrentJob = selectedStationQueueSummary?.currentJob?.orderNumber ?? selectedStation?.currentJob ?? null;
  const selectedStationQueueCount = selectedStationQueueSummary?.queuedJobs.length ?? selectedStation?.queueCount ?? 0;
  const todayIsoDate = getTodayIsoDate();
  const selectedStationPlanningMetrics = getStationPlanningMetrics(
    getActiveStationOrders(productionOrders, selectedWorkCenter, selectedStation),
    todayIsoDate,
  );
  const workCenterPlanningSummaries = React.useMemo(() => new Map(workCenters.map((workCenter) => [
    workCenter.id,
    getWorkCenterPlanningSummary(workCenter, productionOrders, todayIsoDate),
  ])), [productionOrders, todayIsoDate, workCenters]);
  const getPlanningSummaryForWorkCenter = React.useCallback((workCenter: MesWorkCenter) => (
    workCenterPlanningSummaries.get(workCenter.id) ?? getWorkCenterPlanningSummary(workCenter, productionOrders, todayIsoDate)
  ), [productionOrders, todayIsoDate, workCenterPlanningSummaries]);
  const filteredStations = selectedStations.filter((station) => {
    const stationHaystack = [
      station.name,
      station.code,
      station.type,
      station.currentJob ?? '',
      station.processStep,
      station.capabilities.join(' '),
    ].join(' ').toLowerCase();

    return (!stationFilters.search || stationHaystack.includes(stationFilters.search.trim().toLowerCase()))
      && (!stationFilters.status || station.status === stationFilters.status)
      && (!stationFilters.capability || station.capabilities.includes(stationFilters.capability));
  });
  const allCapabilityTags = React.useMemo(() => Array.from(new Set([
    ...workCenterCapabilityTags,
    ...workCenters.flatMap((workCenter) => workCenter.capabilities),
    ...workCenters.flatMap((workCenter) => getStationCapabilitiesForWorkCenter(workCenter)),
    ...Object.keys(customCapabilityColors),
  ])), [customCapabilityColors, getStationCapabilitiesForWorkCenter, workCenters]);
  const registeredOperatorOptions = React.useMemo(() => Array.from(new Set([
    'Unassigned',
    ...workCenters.flatMap((workCenter) => [workCenter.currentOperator, ...getStationsForWorkCenter(workCenter).map((station) => station.operator)]),
  ].filter((operator) => operator && !['Automatic', 'MES Admin'].includes(operator)))), [getStationsForWorkCenter, workCenters]);
  const filteredWorkCenters = workCenters.filter((workCenter) => {
    const stationCapabilities = getStationCapabilitiesForWorkCenter(workCenter);
    const stations = getStationsForWorkCenter(workCenter);
    const availableStationCount = stations.filter((station) => ['idle', 'running'].includes(station.status)).length;
    const availabilityStatus = getAvailabilityStatus(stations.length ? availableStationCount / stations.length : 1);
    const planningSummary = getPlanningSummaryForWorkCenter(workCenter);
    const wipStatus = getLoadStatus(stations.length ? planningSummary.wipCount / (stations.length * 2) : 0);
    const riskStatus = planningSummary.dueRisk;
    const risk = formatRiskLabel(riskStatus);
    const searchHaystack = [
      workCenter.name,
      workCenter.code,
      stationCapabilities.join(' '),
      `${risk} risk`,
    ].join(' ').toLowerCase();

    return (!filters.search || searchHaystack.includes(filters.search.trim().toLowerCase()))
      && (!filters.capability || stationCapabilities.includes(filters.capability))
      && (!filters.risk || riskStatus === filters.risk)
      && (!activeWorkCenterKpiFilter
        || (activeWorkCenterKpiFilter === 'availability' && ['limited', 'critical'].includes(availabilityStatus))
        || (activeWorkCenterKpiFilter === 'wip' && ['medium', 'high'].includes(wipStatus))
        || (activeWorkCenterKpiFilter === 'risk' && ['medium', 'high'].includes(riskStatus)));
  });

  const allWorkCenterStations = workCenters.flatMap((workCenter) => getStationsForWorkCenter(workCenter));
  const totalWorkCenters = workCenters.length;
  const totalStations = allWorkCenterStations.length;
  const availableStations = allWorkCenterStations.filter((station) => ['idle', 'running'].includes(station.status)).length;
  const stationAvailabilityRatio = totalStations ? availableStations / totalStations : 1;
  const stationAvailabilityPercent = Math.round(stationAvailabilityRatio * 100);
  const stationAvailabilityStatus = getAvailabilityStatus(stationAvailabilityRatio);
  const planningSummaries = workCenters.map((workCenter) => getPlanningSummaryForWorkCenter(workCenter));
  const activeJobOrders = planningSummaries.reduce((total, summary) => total + summary.activeJobCount, 0);
  const activeWip = planningSummaries.reduce((total, summary) => total + summary.wipCount, 0);
  const wipCapacity = totalStations * 2;
  const wipLoadRatio = wipCapacity ? activeWip / wipCapacity : 0;
  const wipLoadStatus = getLoadStatus(wipLoadRatio);
  const riskyJobOrders = planningSummaries.reduce((total, summary) => total + summary.riskyJobCount, 0);
  const atRiskWorkCenters = planningSummaries.filter((summary) => summary.dueRisk !== 'low').length;
  const dueRiskRatio = totalWorkCenters ? atRiskWorkCenters / totalWorkCenters : 0;
  const dueRiskStatus = getRiskStatus(dueRiskRatio);
  const dueRiskBreakdown = planningSummaries.reduce<RiskBreakdown>((breakdown, summary) => {
    const workCenterBreakdown = summary.riskBreakdown;
    return {
      overdue: breakdown.overdue + workCenterBreakdown.overdue,
      dueSoon: breakdown.dueSoon + workCenterBreakdown.dueSoon,
      blocked: breakdown.blocked + workCenterBreakdown.blocked,
      constrained: breakdown.constrained + workCenterBreakdown.constrained,
    };
  }, { overdue: 0, dueSoon: 0, blocked: 0, constrained: 0 });
  const stationTotal = selectedStations.length;
  const stationRunning = selectedStations.filter((station) => station.status === 'running').length;
  const stationIdle = selectedStations.filter((station) => ['idle', 'available'].includes(station.status)).length;
  const stationDown = selectedStations.filter((station) => station.status === 'down').length;
  const stationMaintenance = selectedStations.filter((station) => station.status === 'maintenance').length;
  const stationRunningStatus = getStationRunningStatus(stationTotal, stationRunning);
  const stationIdleStatus = getStationIdleStatus(stationTotal, stationIdle);
  const stationDownStatus = getStationDownStatus(stationTotal, stationDown);
  const stationMaintenanceStatus = getStationMaintenanceStatus(stationTotal, stationMaintenance);
  const selectedWorkCenterPlanningSummary = selectedWorkCenter ? getPlanningSummaryForWorkCenter(selectedWorkCenter) : undefined;
  const operationalSummary = getWorkCenterOperationalSummary(selectedWorkCenter, selectedStations, selectedWorkCenterPlanningSummary);

  const setFilter = (key: keyof typeof filters, value: string) => {
    setFilters((currentFilters) => ({ ...currentFilters, [key]: value }));
  };

  const setStationFilter = (key: keyof typeof stationFilters, value: string) => {
    setStationFilters((currentFilters) => ({ ...currentFilters, [key]: value }));
    if (key === 'status') setActiveStationKpiFilter(null);
  };

  const selectWorkCenter = (workCenterId: string) => {
    setSelectedWorkCenterId(workCenterId);
    setSelectedStationId('');
  };

  const openStationJobQueue = () => {
    const summary = getStationJobQueueSummary(selectedWorkCenter, selectedStation);
    if (summary) setJobQueueSummary(summary);
  };

  const openProductionOrderFromShiftChip = React.useCallback((order: ProductionOrder) => {
    window.sessionStorage.setItem(productionOrderDeepLinkKey, order.orderNumber);
    onNavigate('/workspace/manufacturing-ops/mes/orders');
  }, [onNavigate]);

  const toggleWorkCenterKpiFilter = (filter: WorkCenterKpiFilter) => {
    setActiveWorkCenterKpiFilter((current) => (current === filter ? null : filter));
  };

  const toggleStationKpiFilter = (filter: StationKpiFilter) => {
    const nextFilter = activeStationKpiFilter === filter ? null : filter;
    setActiveStationKpiFilter(nextFilter);
    const statusByFilter: Record<StationKpiFilter, WorkCenterStatus> = {
      running: 'running',
      idle: 'idle',
      down: 'down',
      maintenance: 'maintenance',
    };
    setStationFilters((currentFilters) => ({ ...currentFilters, status: nextFilter ? statusByFilter[nextFilter] : '' }));
  };

  const openAddWorkCenterForm = () => {
    setFormState(createWorkCenterFormState());
    setEditingWorkCenterId(null);
    setAddressLookup({ status: 'idle', message: '' });
    setAddressSuggestions([]);
    setShowAddressSuggestions(false);
    setShowAddForm(true);
  };

  const openEditWorkCenterForm = () => {
    if (!selectedWorkCenter) return;
    setFormState(workCenterToFormState(selectedWorkCenter));
    setEditingWorkCenterId(selectedWorkCenter.id);
    setAddressLookup({
      status: 'success',
      message: `Location found: ${selectedWorkCenter.latitude.toFixed(5)}, ${selectedWorkCenter.longitude.toFixed(5)}`,
    });
    setAddressSuggestions([]);
    setShowAddressSuggestions(false);
    setShowAddForm(true);
  };

  const openAddStationForm = () => {
    if (!selectedWorkCenter) return;
    setStationFormState(createStationFormState(selectedWorkCenter.id));
    setEditingStationId(null);
    setStationImageFile(null);
    setStationImagePreviewUrl((currentPreviewUrl) => {
      revokePreviewObjectUrl(currentPreviewUrl);
      return '';
    });
    setStationImageUploadError('');
    setStationImageUploading(false);
    setShowCapabilityColorPicker(false);
    setShowStationForm(true);
  };

  const openEditStationForm = (station: WorkCenterStation) => {
    setStationFormState(stationToFormState(station));
    setEditingStationId(station.id);
    setStationImageFile(null);
    setStationImagePreviewUrl((currentPreviewUrl) => {
      revokePreviewObjectUrl(currentPreviewUrl);
      return station.imageUrl ?? '';
    });
    setStationImageUploadError('');
    setStationImageUploading(false);
    setShowCapabilityColorPicker(false);
    setShowStationForm(true);
  };

  const closeStationForm = () => {
    setShowCapabilityColorPicker(false);
    setEditingStationId(null);
    setStationImageFile(null);
    setStationImageUploadError('');
    setStationImagePreviewUrl((currentPreviewUrl) => {
      revokePreviewObjectUrl(currentPreviewUrl);
      return '';
    });
    setShowStationForm(false);
  };

  const selectStationImageFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setStationImageUploadError('');
    if (file && !file.type.startsWith('image/')) {
      setStationImageUploadError('Please upload an image file.');
      event.target.value = '';
      return;
    }
    if (file && file.size > 10485760) {
      setStationImageUploadError('Station photos must be 10 MB or smaller.');
      event.target.value = '';
      return;
    }
    setStationImageFile(file);
    setStationImagePreviewUrl((currentPreviewUrl) => {
      revokePreviewObjectUrl(currentPreviewUrl);
      if (file) return URL.createObjectURL(file);
      if (!editingStationId) return '';
      const existingStation = allWorkCenterStations.find((station) => station.id === editingStationId);
      return existingStation?.imageUrl ?? '';
    });
  };

  const clearStationImageFile = () => {
    setStationImageFile(null);
    setStationImageUploadError('');
    setStationImagePreviewUrl((currentPreviewUrl) => {
      revokePreviewObjectUrl(currentPreviewUrl);
      if (!editingStationId) return '';
      const existingStation = allWorkCenterStations.find((station) => station.id === editingStationId);
      return existingStation?.imageUrl ?? '';
    });
  };

  const uploadStationImage = async (stationId: string) => {
    if (!stationImageFile) return '';
    const extension = stationImageFile.name.split('.').pop()?.toLowerCase() || 'jpg';
    const filePath = `${stationId}/${Date.now()}.${extension}`;
    const { error } = await supabase.storage.from(stationImageBucket).upload(filePath, stationImageFile, {
      cacheControl: '3600',
      contentType: stationImageFile.type,
      upsert: true,
    });

    if (error) throw error;
    const { data } = supabase.storage.from(stationImageBucket).getPublicUrl(filePath);
    return data.publicUrl;
  };

  const saveStationForm = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const targetWorkCenter = workCenters.find((workCenter) => workCenter.id === stationFormState.workCenterId);
    if (!targetWorkCenter || !stationFormState.name.trim() || !stationFormState.code.trim()) return;

    const selectedCapability = stationFormState.capability === registerNewCapabilityValue
      ? stationFormState.newCapabilityName.trim()
      : stationFormState.capability;
    if (!selectedCapability) return;

    if (stationFormState.capability === registerNewCapabilityValue) {
      setCustomCapabilityColors((currentColors) => ({
        ...currentColors,
        [selectedCapability]: stationFormState.newCapabilityColor,
      }));
    }

    const existingStation = editingStationId ? allWorkCenterStations.find((station) => station.id === editingStationId) ?? null : null;
    const stationId = existingStation?.id ?? crypto.randomUUID();
    let imageUrl = existingStation?.imageUrl ?? '';
    if (stationImageFile) {
      setStationImageUploading(true);
      setStationImageUploadError('');
      try {
        imageUrl = await uploadStationImage(stationId);
      } catch (error) {
        setStationImageUploadError(error instanceof Error ? error.message : 'Unable to upload station image.');
        setStationImageUploading(false);
        return;
      }
    }

    const nextStation: WorkCenterStation = {
      id: stationId,
      workCenterId: targetWorkCenter.id,
      code: stationFormState.code.trim(),
      name: stationFormState.name.trim(),
      type: stationFormState.type,
      imageUrl: imageUrl || undefined,
      capabilityColor: stationFormState.capability === registerNewCapabilityValue ? stationFormState.newCapabilityColor : existingStation?.capabilityColor,
      status: existingStation?.status ?? 'idle',
      currentJob: existingStation?.currentJob ?? null,
      operator: stationFormState.operator,
      processStep: selectedCapability,
      queueCount: existingStation?.queueCount ?? 0,
      wipCount: existingStation?.wipCount ?? 0,
      utilization: existingStation?.utilization ?? 0,
      dueRisk: existingStation?.dueRisk ?? 'low',
      maintenanceStatus: existingStation?.maintenanceStatus ?? 'Healthy',
      capabilities: [selectedCapability],
      lastEvent: existingStation?.lastEvent ?? 'No recent activity',
    };

    const { data: stationRow, error: stationError } = existingStation
      ? await supabase
        .from('mes_work_center_stations')
        .update(toStationPayload(nextStation, organizationId))
        .eq('id', stationId)
        .eq('organization_id', organizationId)
        .select('*')
        .single()
      : await supabase
        .from('mes_work_center_stations')
        .insert(toStationPayload(nextStation, organizationId))
        .select('*')
        .single();

    if (stationError) {
      setStationImageUploadError(stationError.message);
      setStationImageUploading(false);
      return;
    }

    const savedStation = mapWorkCenterStationRow(stationRow as MesWorkCenterStationRow);
    setWorkCenters((currentWorkCenters) => currentWorkCenters.map((workCenter) => {
      const stationsWithoutEdited = workCenter.stations.filter((station) => station.id !== savedStation.id);
      return workCenter.id === targetWorkCenter.id
        ? { ...workCenter, stations: [...stationsWithoutEdited, savedStation] }
        : { ...workCenter, stations: stationsWithoutEdited };
    }));
    setSelectedWorkCenterId(targetWorkCenter.id);
    setSelectedStationId(savedStation.id);
    setEditingStationId(null);
    setStationImageFile(null);
    setStationImagePreviewUrl((currentPreviewUrl) => {
      revokePreviewObjectUrl(currentPreviewUrl);
      return '';
    });
    setStationImageUploading(false);
    setShowCapabilityColorPicker(false);
    setShowStationForm(false);
  };

  const deleteSelectedWorkCenter = async () => {
    if (!selectedWorkCenter) return;
    const deletingWorkCenterId = selectedWorkCenter.id;
    const { error } = await supabase.from('mes_work_centers').delete().eq('id', deletingWorkCenterId);
    if (error) {
      setWorkCentersError(error.message);
      return;
    }
    setWorkCenters((currentWorkCenters) => {
      const nextWorkCenters = currentWorkCenters.filter((workCenter) => workCenter.id !== deletingWorkCenterId);
      const nextSelectedWorkCenter = nextWorkCenters[0] ?? null;
      setSelectedWorkCenterId(nextSelectedWorkCenter?.id ?? '');
      setSelectedStationId('');
      return nextWorkCenters;
    });
  };

  const confirmDeleteSelectedWorkCenter = () => {
    if (!selectedWorkCenter) return;
    setWorkCenterConfirmation({
      title: 'Delete Work Center?',
      message: 'Estas seguro que quieres eliminar el workcenter? Esto eliminara las stations de la workcenter tambien.',
      confirmLabel: 'Delete Work Center',
      tone: 'danger',
      onConfirm: deleteSelectedWorkCenter,
    });
  };

  const confirmPendingWorkCenterAction = async () => {
    if (!workCenterConfirmation) return;
    const pendingConfirmation = workCenterConfirmation;
    setWorkCenterConfirmation(null);
    await pendingConfirmation.onConfirm();
  };

  React.useEffect(() => {
    if (!showAddForm && !showStationForm && !showDetailModal && !jobQueueSummary && !workCenterConfirmation) return undefined;
    const previousBodyOverflow = document.body.style.overflow;
    const previousDocumentOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousDocumentOverflow;
    };
  }, [showAddForm, showStationForm, showDetailModal, jobQueueSummary, workCenterConfirmation]);

  React.useEffect(() => () => {
    revokePreviewObjectUrl(stationImagePreviewUrl);
  }, [stationImagePreviewUrl]);

  const renderCapabilityPill = (capability: string) => {
    const customColor = customCapabilityColors[capability];
    return (
      <span
        className={`capability-pill capability-${getCapabilityTone(capability)}`}
        key={capability}
        style={customColor ? {
          borderColor: customColor,
          backgroundColor: `${customColor}1a`,
          color: customColor,
        } : undefined}
      >
        {capability}
      </span>
    );
  };

  const renderStationVisual = (station: WorkCenterStation, className = 'station-card-visual') => (
    <div className={className} aria-hidden="true">
      {station.imageUrl ? (
        <img src={station.imageUrl} alt="" />
      ) : (
        <span>{getStationInitials(station)}</span>
      )}
    </div>
  );

  const updateNewCapabilityColor = (color: string) => {
    setStationFormState((current) => ({ ...current, newCapabilityColor: normalizeHexColor(color) }));
  };

  const newCapabilityHsv = hexToHsv(stationFormState.newCapabilityColor);
  const presetCapabilityColorOptions = capabilityColorOptions.slice(0, 6);
  const usesCustomCapabilityColor = !presetCapabilityColorOptions.includes(stationFormState.newCapabilityColor.toLowerCase());

  const updateNewCapabilityHue = (value: string) => {
    updateNewCapabilityColor(hsvToHex(Number(value) || 0, newCapabilityHsv.saturation, newCapabilityHsv.value));
  };

  const updateNewCapabilityColorField = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
    updateNewCapabilityColor(hsvToHex(newCapabilityHsv.hue, (x / rect.width) * 100, 100 - ((y / rect.height) * 100)));
  };

  const startNewCapabilityColorFieldDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    updateNewCapabilityColorField(event);
  };

  const moveNewCapabilityColorField = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const colorStep = event.shiftKey ? 10 : 2;
    const nextHsv = { ...newCapabilityHsv };
    if (event.key === 'ArrowLeft') nextHsv.saturation -= colorStep;
    else if (event.key === 'ArrowRight') nextHsv.saturation += colorStep;
    else if (event.key === 'ArrowUp') nextHsv.value += colorStep;
    else if (event.key === 'ArrowDown') nextHsv.value -= colorStep;
    else return;
    event.preventDefault();
    updateNewCapabilityColor(hsvToHex(nextHsv.hue, nextHsv.saturation, nextHsv.value));
  };

  const updateCapabilityColorPickerPosition = React.useCallback(() => {
    const trigger = capabilityColorTriggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 16;
    const width = Math.min(246, window.innerWidth - (viewportPadding * 2));
    const left = Math.max(viewportPadding, Math.min(rect.right - width, window.innerWidth - width - viewportPadding));
    const availableBelow = window.innerHeight - rect.bottom - viewportPadding;
    const pickerHeight = 286;
    const openUp = availableBelow < pickerHeight && rect.top > availableBelow;

    setCapabilityColorPickerPosition({
      top: openUp ? Math.max(viewportPadding, rect.top - pickerHeight - 8) : rect.bottom + 8,
      left,
      width,
    });
  }, []);

  React.useLayoutEffect(() => {
    if (!showCapabilityColorPicker) return;
    updateCapabilityColorPickerPosition();
  }, [showCapabilityColorPicker, updateCapabilityColorPickerPosition]);

  React.useEffect(() => {
    if (!showCapabilityColorPicker) return undefined;

    const closeIfOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (capabilityColorTriggerRef.current?.contains(target) || capabilityColorPickerRef.current?.contains(target)) return;
      setShowCapabilityColorPicker(false);
    };
    const reposition = () => updateCapabilityColorPickerPosition();

    document.addEventListener('mousedown', closeIfOutside);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);

    return () => {
      document.removeEventListener('mousedown', closeIfOutside);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [showCapabilityColorPicker, updateCapabilityColorPickerPosition]);

  const updateAddressSuggestionPosition = React.useCallback(() => {
    const control = addressLookupControlRef.current;
    if (!control) return;
    const rect = control.getBoundingClientRect();
    const viewportPadding = 16;
    const availableBelow = window.innerHeight - rect.bottom - viewportPadding;
    const availableAbove = rect.top - viewportPadding;
    const maxHeight = Math.max(132, Math.min(246, availableBelow >= 150 ? availableBelow - 8 : availableAbove - 8));
    const openUp = availableBelow < 150 && availableAbove > availableBelow;
    const width = Math.min(rect.width, window.innerWidth - (viewportPadding * 2));
    const left = Math.max(viewportPadding, Math.min(rect.left, window.innerWidth - width - viewportPadding));

    setAddressSuggestionPosition({
      top: openUp ? Math.max(viewportPadding, rect.top - maxHeight - 7) : rect.bottom + 7,
      left,
      width,
      maxHeight,
    });
  }, []);

  React.useLayoutEffect(() => {
    if (!(showAddressSuggestions || addressSuggestionsLoading)) return;
    if (addressSuggestions.length === 0 && !addressSuggestionsLoading) return;
    updateAddressSuggestionPosition();
  }, [addressSuggestions.length, addressSuggestionsLoading, showAddressSuggestions, updateAddressSuggestionPosition]);

  React.useEffect(() => {
    const menuOpen = (showAddressSuggestions || addressSuggestionsLoading) && (addressSuggestions.length > 0 || addressSuggestionsLoading);
    if (!menuOpen) return undefined;

    const closeIfOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (addressLookupControlRef.current?.contains(target) || addressSuggestionMenuRef.current?.contains(target)) return;
      setShowAddressSuggestions(false);
    };
    const reposition = () => updateAddressSuggestionPosition();

    document.addEventListener('mousedown', closeIfOutside);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);

    return () => {
      document.removeEventListener('mousedown', closeIfOutside);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [addressSuggestions.length, addressSuggestionsLoading, showAddressSuggestions, updateAddressSuggestionPosition]);

  React.useEffect(() => {
    const query = formState.address.trim();
    if (!showAddForm || formState.latitude || query.length < 3) {
      setAddressSuggestions([]);
      setShowAddressSuggestions(false);
      setAddressSuggestionsLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setAddressSuggestionsLoading(true);
      searchAddressMatches(query, 5, controller.signal)
        .then((matches) => {
          if (controller.signal.aborted) return;
          setAddressSuggestions(matches);
          setShowAddressSuggestions(matches.length > 0);
        })
        .catch((error) => {
          if ((error as Error).name !== 'AbortError') {
            setAddressSuggestions([]);
            setShowAddressSuggestions(false);
            setAddressLookup({ status: 'error', message: 'Unable to load Google address suggestions.' });
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setAddressSuggestionsLoading(false);
        });
    }, 350);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [formState.address, formState.latitude, showAddForm]);

  const lookupWorkCenterAddress = async (): Promise<AddressLookupMatch | null> => {
    const address = formState.address.trim();
    if (!address) {
      setAddressLookup({ status: 'error', message: 'Enter an address before searching.' });
      return null;
    }

    setAddressLookup({ status: 'loading', message: 'Searching address...' });
    try {
      const match = (await searchAddressMatches(address, 1))[0];
      const resolvedMatch = match ? await resolveAddressMatch(match) : null;
      if (!resolvedMatch) {
        setAddressLookup({ status: 'error', message: 'No match found. Try street, neighborhood, city, full state, and country. Example: Tercera 156, La Aurora, Saltillo, Coahuila, Mexico.' });
        return null;
      }

      setFormState((current) => ({
        ...current,
        address: resolvedMatch.address,
        latitude: resolvedMatch.latitude,
        longitude: resolvedMatch.longitude,
      }));
      setAddressSuggestions([]);
      setShowAddressSuggestions(false);
      setAddressLookup({ status: 'success', message: `Location found: ${Number(resolvedMatch.latitude).toFixed(5)}, ${Number(resolvedMatch.longitude).toFixed(5)}` });
      return resolvedMatch;
    } catch {
      setAddressLookup({ status: 'error', message: 'Could not reach the address lookup service. Try again in a moment.' });
      return null;
    }
  };

  const selectAddressSuggestion = async (match: AddressLookupMatch) => {
    setAddressLookup({ status: 'loading', message: 'Loading selected address...' });
    try {
      const resolvedMatch = await resolveAddressMatch(match);
      if (!resolvedMatch) {
        setAddressLookup({ status: 'error', message: 'Could not load the selected address details.' });
        return;
      }

      setFormState((current) => ({
        ...current,
        address: resolvedMatch.address,
        latitude: resolvedMatch.latitude,
        longitude: resolvedMatch.longitude,
      }));
      setAddressSuggestions([]);
      setShowAddressSuggestions(false);
      setAddressLookup({ status: 'success', message: `Location found: ${Number(resolvedMatch.latitude).toFixed(5)}, ${Number(resolvedMatch.longitude).toFixed(5)}` });
    } catch {
      setAddressLookup({ status: 'error', message: 'Could not load the selected address details.' });
    }
  };

  const saveWorkCenterForm = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formState.name.trim() || !formState.code.trim() || !formState.address.trim()) return;
    let resolvedAddress = formState.address.trim();
    let resolvedLatitude = formState.latitude;
    let resolvedLongitude = formState.longitude;
    if (!formState.latitude || !formState.longitude) {
      const addressFound = await lookupWorkCenterAddress();
      if (!addressFound) return;
      resolvedAddress = addressFound.address;
      resolvedLatitude = addressFound.latitude;
      resolvedLongitude = addressFound.longitude;
    }

    // Future integration: persist Work Centers to Supabase and expose capabilities to Production Flows.
    const capabilities = formState.capabilities
      .split(',')
      .map((capability) => capability.trim())
      .filter(Boolean);
    const currentEditingWorkCenter = editingWorkCenterId ? workCenters.find((workCenter) => workCenter.id === editingWorkCenterId) : null;
    const nextWorkCenter: MesWorkCenter = {
      ...(currentEditingWorkCenter ?? {}),
      id: currentEditingWorkCenter?.id ?? crypto.randomUUID(),
      code: formState.code.trim(),
      name: formState.name.trim(),
      type: formState.type,
      plant: formState.plant,
      area: formState.area,
      address: resolvedAddress,
      latitude: Number(resolvedLatitude),
      longitude: Number(resolvedLongitude),
      status: formState.status,
      description: formState.description.trim() || 'New Work Center ready for MES configuration.',
      currentJob: currentEditingWorkCenter?.currentJob ?? null,
      currentOperator: currentEditingWorkCenter?.currentOperator ?? (formState.requiresOperator ? 'Unassigned' : 'Automatic'),
      currentStep: currentEditingWorkCenter?.currentStep ?? 'Ready for assignment',
      queueCount: currentEditingWorkCenter?.queueCount ?? 0,
      wipCount: currentEditingWorkCenter?.wipCount ?? 0,
      utilization: currentEditingWorkCenter?.utilization ?? 0,
      lastEvent: 'Just now',
      activeDowntime: currentEditingWorkCenter?.activeDowntime ?? ['down', 'maintenance'].includes(formState.status),
      downtimeTodayMinutes: currentEditingWorkCenter?.downtimeTodayMinutes ?? 0,
      nextAvailable: currentEditingWorkCenter?.nextAvailable ?? (formState.status === 'idle' ? 'Available now' : 'Pending status review'),
      capacityMode: formState.capacityMode,
      defaultCycleTime: formState.defaultCycleTime.trim() || 'Not configured',
      unitOfMeasure: formState.unitOfMeasure.trim() || 'Unit',
      queueCapacity: Number(formState.queueCapacity) || 0,
      wipCapacity: Number(formState.wipCapacity) || 0,
      requiresOperator: formState.requiresOperator,
      bottleneckCandidate: formState.bottleneckCandidate,
      maintenanceStatus: formState.maintenanceStatus,
      maintenanceInterval: formState.maintenanceInterval.trim() || 'Not configured',
      lastMaintenanceDate: formState.lastMaintenanceDate,
      nextMaintenanceDate: formState.lastMaintenanceDate,
      maintenanceNotes: formState.maintenanceNotes.trim() || 'No maintenance notes yet.',
      capabilities,
      queue: currentEditingWorkCenter?.queue ?? [],
      events: currentEditingWorkCenter
        ? [
          {
            timestamp: 'Just now',
            eventType: 'WORK_CENTER_UPDATED',
            relatedOrder: 'N/A',
            operator: 'MES Admin',
            notes: 'Work Center details updated.',
          },
          ...currentEditingWorkCenter.events,
        ]
        : [
        {
          timestamp: 'Just now',
          eventType: 'WORK_CENTER_CREATED',
          relatedOrder: 'N/A',
          operator: 'MES Admin',
          notes: 'Work Center created from local draft form.',
        },
      ],
      stations: currentEditingWorkCenter?.stations ?? [],
    };

    const { data: savedWorkCenterRow, error } = await supabase
      .from('mes_work_centers')
      .upsert(toWorkCenterPayload(nextWorkCenter, organizationId))
      .select('*')
      .single();

    if (error) {
      setWorkCentersError(error.message);
      return;
    }

    const savedWorkCenter = mapWorkCenterRow(savedWorkCenterRow as MesWorkCenterRow, nextWorkCenter.stations);

    if (currentEditingWorkCenter) {
      setWorkCenters((currentWorkCenters) => currentWorkCenters.map((workCenter) => (workCenter.id === currentEditingWorkCenter.id ? savedWorkCenter : workCenter)));
    } else {
      setWorkCenters((currentWorkCenters) => [savedWorkCenter, ...currentWorkCenters]);
    }
    selectWorkCenter(savedWorkCenter.id);
    setEditingWorkCenterId(null);
    setShowAddressSuggestions(false);
    setShowAddForm(false);
  };

  const updateSelectedStationStatus = async (status: WorkCenterStatus) => {
    if (!selectedStation || !selectedWorkCenter) return;
    const { data, error } = await supabase
      .from('mes_work_center_stations')
      .update({ status, last_event: 'Just now' })
      .eq('id', selectedStation.id)
      .select('*')
      .single();
    if (error) {
      setWorkCentersError(error.message);
      return;
    }

    const updatedStation = mapWorkCenterStationRow(data as MesWorkCenterStationRow);
    setSelectedStationId(updatedStation.id);
    setWorkCenters((currentWorkCenters) => currentWorkCenters.map((workCenter) => (
      workCenter.id === selectedWorkCenter.id
        ? { ...workCenter, stations: workCenter.stations.map((station) => (station.id === updatedStation.id ? updatedStation : station)) }
        : workCenter
    )));
  };

  const renderKpiHelp = (
    key: WorkCenterKpiHelpKey,
    title: string,
    description: string,
    formula: string,
    thresholds: KpiThreshold[],
    currentReason: string,
    breakdown?: RiskBreakdown,
  ) => (
    <span className={['kpi-help-wrap', openKpiHelp === key ? 'open' : ''].filter(Boolean).join(' ')}>
      <button
        className="kpi-help-button"
        type="button"
        aria-label={`Explain ${title} KPI`}
        aria-expanded={openKpiHelp === key}
        onClick={(event) => {
          event.stopPropagation();
          setOpenKpiHelp((current) => (current === key ? null : key));
        }}
      >
        <CircleHelp size={14} strokeWidth={2.4} />
      </button>
      <div className="kpi-help-popover" role="dialog" aria-label={`${title} calculation`} onClick={(event) => event.stopPropagation()}>
        <div>
          <span>KPI Logic</span>
          <strong>{title}</strong>
        </div>
        <p>{description}</p>
        <dl>
          <div><dt>Formula</dt><dd>{formula}</dd></div>
          <div><dt>Current reason</dt><dd>{currentReason}</dd></div>
        </dl>
        {breakdown ? (
          <div className="kpi-risk-breakdown">
            <span>Risk breakdown</span>
            <ul>
              <li>Overdue: {breakdown.overdue}</li>
              <li>Due soon: {breakdown.dueSoon}</li>
              <li>Blocked: {breakdown.blocked}</li>
              <li>Constrained: {breakdown.constrained}</li>
            </ul>
          </div>
        ) : null}
        <ul>
          {thresholds.map((threshold) => <li className={`threshold-${threshold.tone}`} key={threshold.label}>{threshold.label}</li>)}
        </ul>
        <button type="button" onClick={(event) => { event.stopPropagation(); setOpenKpiHelp(null); }}>Close</button>
      </div>
    </span>
  );

  const addressSuggestionMenu = (showAddressSuggestions || addressSuggestionsLoading) && (addressSuggestions.length > 0 || addressSuggestionsLoading) && addressSuggestionPosition
    ? createPortal(
      <div
        className="address-suggestion-menu"
        role="listbox"
        aria-label="Address suggestions"
        ref={addressSuggestionMenuRef}
        style={{
          top: addressSuggestionPosition.top,
          left: addressSuggestionPosition.left,
          width: addressSuggestionPosition.width,
          maxHeight: addressSuggestionPosition.maxHeight,
        }}
      >
        {addressSuggestionsLoading ? <span className="address-suggestion-loading">Searching locations...</span> : null}
        {addressSuggestions.map((suggestion) => (
          <button type="button" role="option" key={suggestion.placeId ?? suggestion.address} onClick={() => { void selectAddressSuggestion(suggestion); }}>
            <strong>{suggestion.address.split(',')[0]}</strong>
            <span>{suggestion.address.split(',').slice(1).join(',').trim()}</span>
          </button>
        ))}
      </div>,
      document.body,
    )
    : null;

  const capabilityColorPicker = showCapabilityColorPicker && capabilityColorPickerPosition
    ? createPortal(
      <div
        className="capability-color-popover"
        ref={capabilityColorPickerRef}
        role="dialog"
        aria-label="Custom capability color"
        style={{
          top: capabilityColorPickerPosition.top,
          left: capabilityColorPickerPosition.left,
          width: capabilityColorPickerPosition.width,
        }}
      >
        <div className="capability-color-preview" aria-live="polite">
          <span style={{ backgroundColor: stationFormState.newCapabilityColor }} />
          <strong>{stationFormState.newCapabilityColor.toUpperCase()}</strong>
        </div>
        <div className="capability-visual-picker">
          <div
            className="capability-color-field"
            role="slider"
            tabIndex={0}
            aria-label="Capability color saturation and brightness"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(newCapabilityHsv.value)}
            aria-valuetext={`${Math.round(newCapabilityHsv.saturation)} percent saturation, ${Math.round(newCapabilityHsv.value)} percent brightness`}
            style={{ backgroundColor: hsvToHex(newCapabilityHsv.hue, 100, 100) }}
            onPointerDown={startNewCapabilityColorFieldDrag}
            onPointerMove={(event) => { if (event.buttons || event.pointerType !== 'mouse') updateNewCapabilityColorField(event); }}
            onKeyDown={moveNewCapabilityColorField}
          >
            <span
              style={{
                left: `${newCapabilityHsv.saturation}%`,
                top: `${100 - newCapabilityHsv.value}%`,
              }}
            />
          </div>
          <label className="capability-hue-slider">
            <span aria-hidden="true">#</span>
            <input type="range" min="0" max="359" value={newCapabilityHsv.hue} onChange={(event) => updateNewCapabilityHue(event.target.value)} aria-label="Capability color hue" />
          </label>
        </div>
        <button className="capability-color-apply" type="button" onClick={() => setShowCapabilityColorPicker(false)}>
          <Check size={15} />
          Use color
        </button>
      </div>,
      document.body,
    )
    : null;

  return (
    <section className={['mes-workspace-panel work-centers-workspace', workCenterMapExpanded ? 'map-expanded' : ''].filter(Boolean).join(' ')}>
      {addressSuggestionMenu}
      {capabilityColorPicker}
      <div className="work-centers-header">
        <button className="academy-back-button engineering-back-button mes-workspace-back" type="button" onClick={() => onNavigate('/workspace/manufacturing-ops/mes')}>
          <ArrowLeft size={16} />
          MES Applications
        </button>
        <div className="work-centers-heading">
          <p className="eyebrow">MES / Work Centers</p>
          <h2>Work Centers</h2>
          <p>Create, organize, and monitor manufacturing locations, work cells, branches, and the stations inside them.</p>
        </div>
        <div className="work-centers-actions">
          <button type="button" onClick={openAddWorkCenterForm}><Plus size={16} /> Add Work Center</button>
          <button type="button" onClick={openAddStationForm} disabled={!selectedWorkCenter}><Plus size={16} /> Add Station</button>
        </div>
      </div>

      {workCentersLoading || workCentersError || (!workCentersLoading && workCenters.length === 0) ? (
        <div className={`mes-data-state ${workCentersError ? 'error' : ''}`}>
          {workCentersLoading ? 'Loading Work Centers from Supabase...' : workCentersError || 'No Work Centers found yet. Add one to start configuring stations.'}
        </div>
      ) : null}

      <div className="work-centers-operations-layout">
        <aside className="work-centers-location-rail">
          <section className="work-center-location-map" aria-label="Configured Work Center locations">
            <div className="work-center-map-header">
              <span>Locations</span>
              <div className="work-center-map-header-actions">
                <button
                  className={workCenterMapExpanded ? 'active' : ''}
                  type="button"
                  aria-label={workCenterMapExpanded ? 'Return map to normal view' : 'Expand Work Center map'}
                  title={workCenterMapExpanded ? 'Normal map view' : 'Expand map'}
                  onClick={() => setWorkCenterMapExpanded((current) => !current)}
                >
                  {workCenterMapExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>
                <button
                  className={workCenterMapOpacityMode ? 'active' : ''}
                  type="button"
                  aria-label={workCenterMapOpacityMode ? 'Show solid location pins' : 'Show transparent location pins'}
                  title={workCenterMapOpacityMode ? 'Solid pins' : 'Transparent pins'}
                  onClick={() => setWorkCenterMapOpacityMode((current) => !current)}
                >
                  <Eye size={16} />
                </button>
                <strong>{filteredWorkCenters.length}</strong>
              </div>
            </div>
            <GoogleWorkCentersMap
              workCenters={filteredWorkCenters.map((workCenter) => ({
                ...workCenter,
                stationCount: getStationsForWorkCenter(workCenter).length,
              }))}
              selectedWorkCenterId={selectedWorkCenter?.id ?? ''}
              expanded={workCenterMapExpanded}
              opacityMode={workCenterMapOpacityMode}
              onSelectWorkCenter={selectWorkCenter}
            />
            <p className="work-center-map-note">Google Maps auto-fits visible Work Center pins from their saved coordinates.</p>
          </section>

          {selectedWorkCenter ? (
            <section className="work-center-selected-card" aria-label="Selected Work Center summary">
              <div className="work-center-selected-header">
                <div>
                  <div className="work-center-selected-heading">
                    <span>Selected Work Center</span>
                    <MesStatusBadge value={selectedWorkCenter.status} />
                  </div>
                  <strong>{selectedWorkCenter.name}</strong>
                  <em>{selectedWorkCenter.code}</em>
                  <small>{selectedWorkCenter.address}</small>
                </div>
              </div>
              <dl className="work-center-detail-list">
                <div><dt>Stations</dt><dd>{selectedStations.length}</dd></div>
                <div><dt>Active jobs</dt><dd>{selectedStations.filter((station) => station.currentJob).length}</dd></div>
                <div><dt>Station availability</dt><dd>{stationIdle} idle</dd></div>
                <div><dt>WIP load</dt><dd>{selectedWorkCenter.wipCount}</dd></div>
              </dl>
              <div className="work-center-selected-copy">
                <p>{selectedWorkCenter.description}</p>
                <div className="work-center-detail-tags">
                  {getStationCapabilitiesForWorkCenter(selectedWorkCenter).map((capability) => renderCapabilityPill(capability))}
                </div>
              </div>
              <div className="work-center-admin-actions">
                <button type="button" onClick={openEditWorkCenterForm}>Edit Work Center</button>
                <button type="button" onClick={confirmDeleteSelectedWorkCenter}>Delete Work Center</button>
              </div>
            </section>
          ) : null}

          {selectedStation ? (
            <section className="work-center-selected-card selected-station-card" aria-label="Selected Station summary">
              <div className="work-center-selected-header">
                <div>
                  <div className="work-center-selected-heading">
                    <span>Selected Station</span>
                    <MesStatusBadge value={selectedStation.status} />
                  </div>
                  <strong>{selectedStation.name}</strong>
                  <em>{selectedStation.code} / {selectedStation.processStep}</em>
                  <small>{selectedStation.type} / Operator: {selectedStation.operator}</small>
                </div>
                <button className="station-edit-inline-button" type="button" onClick={() => openEditStationForm(selectedStation)}>
                  <Pencil size={14} />
                  Edit Station
                </button>
              </div>
              {renderStationVisual(selectedStation, 'selected-station-visual station-card-visual')}
              <dl className="work-center-detail-list">
                <div><dt>Current job</dt><dd>{selectedStationCurrentJob ?? 'Unassigned'}</dd></div>
                <div><dt>Queue</dt><dd>{selectedStationQueueCount} jobs</dd></div>
                <div><dt>WIP</dt><dd>{selectedStationPlanningMetrics.wipCount}</dd></div>
                <div><dt>Scheduled Utilization</dt><dd>{selectedStationPlanningMetrics.hasPlannedShifts ? `${selectedStationPlanningMetrics.scheduledUtilization}%` : 'No shifts planned'}</dd></div>
                <div><dt>Machine Load</dt><dd><span className={`machine-load-pill load-${selectedStationPlanningMetrics.machineLoad}`}>{formatMachineLoadLabel(selectedStationPlanningMetrics.machineLoad)}</span></dd></div>
                <div><dt>Due risk</dt><dd><span className={`selected-state-text state-${selectedStationPlanningMetrics.dueRisk}`}>{formatRiskLabel(selectedStationPlanningMetrics.dueRisk)}</span></dd></div>
                <div><dt>Maintenance</dt><dd><span className={`selected-state-text state-${getMaintenanceTone(selectedStation.maintenanceStatus)}`}>{selectedStation.maintenanceStatus}</span></dd></div>
                <div><dt>Last event</dt><dd>{selectedStation.lastEvent}</dd></div>
              </dl>
              <div className="station-shift-breakdown selected">
                {selectedStationPlanningMetrics.shiftBreakdown.map((shift) => (
                  <span key={shift.value}>
                    <strong>{shift.label}</strong>
                    {renderShiftOrderChips(shift.orders, openProductionOrderFromShiftChip, 2)}
                  </span>
                ))}
              </div>
              <div className="work-center-selected-copy">
                <div className="work-center-detail-tags">
                  {selectedStation.capabilities.map((capability) => renderCapabilityPill(capability))}
                </div>
              </div>
              <div className="work-center-quick-actions">
                <button type="button" onClick={openStationJobQueue}>Job Queue</button>
                <button type="button" onClick={() => updateSelectedStationStatus('setup')}>Start Setup</button>
                <button type="button" onClick={() => updateSelectedStationStatus('down')}>Mark Down</button>
                <button type="button" onClick={() => updateSelectedStationStatus('idle')}>Mark Available</button>
                <button type="button">Open Downtime</button>
                <button type="button" onClick={() => setShowDetailModal(true)}>View Details</button>
              </div>
            </section>
          ) : null}
        </aside>

        <main className="work-centers-operations-main">
          <section className="work-centers-management-panel">
            <div className="work-centers-panel-heading">
              <div>
                <p className="eyebrow">Work Centers</p>
                <h3>Operational control points across manufacturing, receiving, quality, and shipping</h3>
                <p className="work-centers-panel-copy">Track each Work Center as a capacity node: station availability, active job load, WIP pressure, due-date exposure, and the capabilities available through its stations.</p>
              </div>
              <span>{filteredWorkCenters.length} showing / {workCenters.length} total</span>
            </div>
            <p className="kpi-interaction-hint">Hover or click the <CircleHelp size={13} strokeWidth={2.4} aria-hidden="true" /> icon for KPI logic. Click a dynamic KPI card to filter the table to Work Centers that need attention.</p>
            <div className="work-centers-kpi-grid compact">
              <article><span>Total</span><strong>{totalWorkCenters}</strong></article>
              <article
                className={`kpi-status-card status-${stationAvailabilityStatus} ${activeWorkCenterKpiFilter === 'availability' ? 'active' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => toggleWorkCenterKpiFilter('availability')}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') toggleWorkCenterKpiFilter('availability'); }}
              >
                <div className="kpi-card-label">
                  <span>Station Availability</span>
                  {renderKpiHelp(
                    'stationAvailability',
                    'Station Availability',
                    'Measures how many stations are currently available for production across configured Work Centers.',
                    'Available Stations / Total Stations',
                    [{ label: 'Healthy: 85% or higher', tone: 'good' }, { label: 'Limited: 70% to 84%', tone: 'warning' }, { label: 'Critical: below 70%', tone: 'critical' }],
                    `${stationAvailabilityPercent}% is ${formatKpiStatusLabel(stationAvailabilityStatus)}: ${stationAvailabilityStatus === 'healthy' ? 'at or above 85%' : stationAvailabilityStatus === 'limited' ? 'between 70% and 84%' : 'below 70%'}. Available = Running + Idle.`,
                  )}
                </div>
                <strong>{stationAvailabilityPercent}%</strong>
                <em>{formatKpiStatusLabel(stationAvailabilityStatus)}</em>
              </article>
              <article><span>Active Job Orders</span><strong>{activeJobOrders}</strong></article>
              <article
                className={`kpi-status-card status-${wipLoadStatus} ${activeWorkCenterKpiFilter === 'wip' ? 'active' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => toggleWorkCenterKpiFilter('wip')}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') toggleWorkCenterKpiFilter('wip'); }}
              >
                <div className="kpi-card-label">
                  <span>WIP Load</span>
                  {renderKpiHelp(
                    'wipLoad',
                    'WIP Load',
                    'Measures how much work-in-process is currently loaded compared to estimated station capacity.',
                    'Current WIP / WIP Capacity',
                    [{ label: 'Low: 60% or lower', tone: 'good' }, { label: 'Medium: above 60% up to 85%', tone: 'warning' }, { label: 'High: above 85%', tone: 'critical' }],
                    `${activeWip} / ${wipCapacity} is ${formatKpiStatusLabel(wipLoadStatus)}: ${wipLoadStatus === 'low' ? 'at or below 60% capacity' : wipLoadStatus === 'medium' ? 'between 61% and 85% capacity' : 'above 85% capacity'}.`,
                  )}
                </div>
                <strong>{activeWip} / {wipCapacity}</strong>
                <em>{formatKpiStatusLabel(wipLoadStatus)}</em>
              </article>
              <article
                className={`kpi-status-card status-${dueRiskStatus} ${activeWorkCenterKpiFilter === 'risk' ? 'active' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => toggleWorkCenterKpiFilter('risk')}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') toggleWorkCenterKpiFilter('risk'); }}
              >
                <div className="kpi-card-label">
                  <span>Due Risk</span>
                  {renderKpiHelp(
                    'dueRisk',
                    'Due Risk',
                    'Measures how many Work Centers have medium or high due-date risk from their station schedules and active Production Orders.',
                    'At-Risk Work Centers / Total Work Centers',
                    [{ label: 'Low: 20% or lower', tone: 'good' }, { label: 'Medium: above 20% up to 50%', tone: 'warning' }, { label: 'High: above 50%', tone: 'critical' }],
                    `${atRiskWorkCenters} / ${totalWorkCenters} is ${formatKpiStatusLabel(dueRiskStatus)}: ${totalWorkCenters ? `${formatPercent(dueRiskRatio)} of Work Centers are at risk` : 'no Work Centers in the denominator'}. ${riskyJobOrders} active job${riskyJobOrders === 1 ? '' : 's'} are affected by the current station risk profile.`,
                    dueRiskBreakdown,
                  )}
                </div>
                <strong>{atRiskWorkCenters} / {totalWorkCenters}</strong>
                <em>{formatKpiStatusLabel(dueRiskStatus)}</em>
              </article>
            </div>
            {activeWorkCenterKpiFilter ? (
              <div className="kpi-active-filter">
                <span>Filtered by: {activeWorkCenterKpiFilter === 'availability' ? 'Limited or critical availability' : activeWorkCenterKpiFilter === 'wip' ? 'Medium or high WIP load' : 'Medium or high due risk'}</span>
                <button type="button" onClick={() => setActiveWorkCenterKpiFilter(null)}>Clear</button>
              </div>
            ) : null}
            <div className="work-centers-filter-bar compact">
              <label>
                <span>Search</span>
                <input value={filters.search} onChange={(event) => setFilter('search', event.target.value)} placeholder="Work Center, code, capability, risk" />
              </label>
              <label>
                <span>Capability</span>
                <MesOrderDropdown id="work-center-capability-filter" value={filters.capability} placeholder="All capabilities" options={[{ value: '', label: 'All capabilities' }, ...allCapabilityTags.map((capability) => ({ value: capability, label: capability }))]} onChange={(value) => setFilter('capability', value)} />
              </label>
              <label>
                <span>Risk</span>
                <MesOrderDropdown id="work-center-risk-filter" value={filters.risk} placeholder="All risks" options={[{ value: '', label: 'All risks' }, { value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }]} onChange={(value) => setFilter('risk', value)} />
              </label>
            </div>
            <div className="work-centers-table" role="table" aria-label="Work Centers">
              <div className="work-centers-table-row header" role="row">
                <span>Work Center</span>
                <span>Capabilities</span>
                <span>Stations</span>
                <span>Active Jobs</span>
                <span>WIP</span>
                <span>Risk</span>
              </div>
              {filteredWorkCenters.map((workCenter, index) => {
                const stations = getStationsForWorkCenter(workCenter);
                const stationCapabilities = Array.from(new Set(stations.flatMap((station) => station.capabilities)));
                const planningSummary = getPlanningSummaryForWorkCenter(workCenter);
                const risk = planningSummary.dueRisk;
                const selected = workCenter.id === selectedWorkCenter?.id;
                return (
                  <button
                    className={['work-centers-table-row', selected ? 'selected' : ''].filter(Boolean).join(' ')}
                    type="button"
                    role="row"
                    key={workCenter.id}
                    onClick={() => selectWorkCenter(workCenter.id)}
                  >
                    <span className="work-center-table-identity">
                      <span className="work-center-index-badge">{index + 1}</span>
                      <span><strong>{workCenter.name}</strong><em>{workCenter.code}</em></span>
                    </span>
                    <span className="work-center-capability-pills">
                      {stationCapabilities.map((capability) => renderCapabilityPill(capability))}
                    </span>
                    <span>{stations.length}</span>
                    <span>{planningSummary.activeJobCount}</span>
                    <span>{planningSummary.wipCount}</span>
                    <span className={`work-center-risk-label risk-${risk}`}>
                      <span className="risk-face"><WorkCenterRiskIcon risk={risk} /></span>
                      {formatRiskLabel(risk)}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="stations-management-panel">
            <div className="work-centers-panel-heading">
              <div>
                <p className="eyebrow">Stations</p>
                <div className="stations-heading-content">
                  <div className="stations-selected-work-center">
                    <span>Selected Work Center</span>
                    <strong>{selectedWorkCenter?.name ?? 'No Work Center selected'}</strong>
                    {selectedWorkCenter ? <em>{selectedWorkCenter.code}</em> : null}
                  </div>
                  <div className="stations-heading-description">
                    <h3>Station-level execution inside this Work Center</h3>
                    <p>Monitor the machines, benches, buffers, and process steps that make up the selected Work Center, including active utilization, available capacity, downtime, maintenance constraints, and capability coverage.</p>
                  </div>
                </div>
              </div>
              <span>{filteredStations.length} showing / {selectedStations.length} total</span>
            </div>
            <div className={`work-center-operational-summary summary-${operationalSummary.tone}`}>
              <span>Operational summary</span>
              <small>Executive readout generated from the selected Work Center status, station availability, WIP, queue, downtime, and due-risk signals.</small>
              <ul>
                {operationalSummary.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
            <p className="kpi-interaction-hint stations-kpi-hint">Hover or click the <CircleHelp size={13} strokeWidth={2.4} aria-hidden="true" /> icon for station KPI logic. Click a dynamic KPI card to filter the station list by that operational state.</p>
            <div className="station-kpi-grid">
              <article><span>Total</span><strong>{stationTotal}</strong></article>
              <article
                className={`station-kpi-status-card station-status-${stationRunningStatus} ${activeStationKpiFilter === 'running' ? 'active' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => toggleStationKpiFilter('running')}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') toggleStationKpiFilter('running'); }}
              >
                <div className="kpi-card-label">
                  <span>Running</span>
                  {renderKpiHelp(
                    'stationRunning',
                    'Running Stations',
                    'Shows how many stations are actively executing production, setup, inspection, or material handling work.',
                    'Running Stations / Total Stations',
                    [{ label: 'High Activity: 70% or higher', tone: 'good' }, { label: 'Moderate Activity: 30% to 69%', tone: 'warning' }, { label: 'Low Activity: below 30%', tone: 'info' }],
                    `${stationRunning} / ${stationTotal} is ${formatKpiStatusLabel(stationRunningStatus)}: ${stationRunningStatus === 'high-activity' ? '70% or more running' : stationRunningStatus === 'moderate-activity' ? '30% to 69% running' : 'below 30% running'}.`,
                  )}
                </div>
                <strong>{stationRunning} / {stationTotal}</strong>
                <em>{formatKpiStatusLabel(stationRunningStatus)}</em>
              </article>
              <article
                className={`station-kpi-status-card station-status-${stationIdleStatus} ${activeStationKpiFilter === 'idle' ? 'active' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => toggleStationKpiFilter('idle')}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') toggleStationKpiFilter('idle'); }}
              >
                <div className="kpi-card-label">
                  <span>Idle</span>
                  {renderKpiHelp(
                    'stationIdle',
                    'Idle Stations',
                    'Shows how many stations are available but not currently running a job.',
                    'Idle Stations / Total Stations',
                    [{ label: 'Fully Loaded: 20% idle or lower', tone: 'info' }, { label: 'Available Capacity: above 20% up to 60%', tone: 'good' }, { label: 'Underutilized: above 60% idle', tone: 'warning' }],
                    `${stationIdle} / ${stationTotal} is ${formatKpiStatusLabel(stationIdleStatus)}: ${stationIdleStatus === 'fully-loaded' ? '20% or fewer idle' : stationIdleStatus === 'available-capacity' ? '21% to 60% idle' : 'above 60% idle'}.`,
                  )}
                </div>
                <strong>{stationIdle} / {stationTotal}</strong>
                <em>{formatKpiStatusLabel(stationIdleStatus)}</em>
              </article>
              <article
                className={`station-kpi-status-card station-status-${stationDownStatus} ${activeStationKpiFilter === 'down' ? 'active' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => toggleStationKpiFilter('down')}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') toggleStationKpiFilter('down'); }}
              >
                <div className="kpi-card-label">
                  <span>Down</span>
                  {renderKpiHelp(
                    'stationDown',
                    'Down Stations',
                    'Shows how many stations are unavailable due to failures, faults, or downtime.',
                    'Down Stations / Total Stations',
                    [{ label: 'Healthy: 0 down stations', tone: 'good' }, { label: 'Degraded: more than 0 up to 25%', tone: 'warning' }, { label: 'Critical: above 25% or small-center rule', tone: 'critical' }],
                    `${stationDown} / ${stationTotal} is ${formatKpiStatusLabel(stationDownStatus)}: ${stationDown === 0 ? 'no stations are down' : stationTotal <= 3 ? 'small Work Center rule applies' : stationDownStatus === 'degraded' ? 'at or below 25% down' : 'above 25% down'}.`,
                  )}
                </div>
                <strong>{stationDown} / {stationTotal}</strong>
                <em>{formatKpiStatusLabel(stationDownStatus)}</em>
              </article>
              <article
                className={`station-kpi-status-card station-status-${stationMaintenanceStatus} ${activeStationKpiFilter === 'maintenance' ? 'active' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => toggleStationKpiFilter('maintenance')}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') toggleStationKpiFilter('maintenance'); }}
              >
                <div className="kpi-card-label">
                  <span>Maintenance</span>
                  {renderKpiHelp(
                    'stationMaintenance',
                    'Maintenance Stations',
                    'Shows how many stations are unavailable due to planned or unplanned maintenance.',
                    'Maintenance Stations / Total Stations',
                    [{ label: 'Clear: 0 stations in maintenance', tone: 'good' }, { label: 'Limited: more than 0 up to 30%', tone: 'warning' }, { label: 'Constrained: above 30% or small-center rule', tone: 'critical' }],
                    `${stationMaintenance} / ${stationTotal} is ${formatKpiStatusLabel(stationMaintenanceStatus)}: ${stationMaintenance === 0 ? 'no stations in maintenance' : stationTotal <= 2 ? 'small Work Center rule applies' : stationMaintenanceStatus === 'limited' ? 'at or below 30% maintenance' : 'above 30% maintenance'}.`,
                  )}
                </div>
                <strong>{stationMaintenance} / {stationTotal}</strong>
                <em>{formatKpiStatusLabel(stationMaintenanceStatus)}</em>
              </article>
            </div>
            {activeStationKpiFilter ? (
              <div className="kpi-active-filter">
                <span>Filtered by: {formatKpiStatusLabel(activeStationKpiFilter)} stations</span>
                <button type="button" onClick={() => { setActiveStationKpiFilter(null); setStationFilter('status', ''); }}>Clear</button>
              </div>
            ) : null}
            <div className="station-filter-bar">
              <label>
                <span>Search</span>
                <input value={stationFilters.search} onChange={(event) => setStationFilter('search', event.target.value)} placeholder="Station, process, job" />
              </label>
              <label>
                <span>Status</span>
                <MesOrderDropdown id="station-status-filter" value={stationFilters.status} placeholder="All statuses" options={[{ value: '', label: 'All statuses' }, ...workCenterStatuses.map((status) => ({ value: status, label: formatLabel(status) }))]} onChange={(value) => setStationFilter('status', value)} />
              </label>
              <label>
                <span>Capability</span>
                <MesOrderDropdown id="station-capability-filter" value={stationFilters.capability} placeholder="All capabilities" options={[{ value: '', label: 'All capabilities' }, ...allCapabilityTags.map((capability) => ({ value: capability, label: capability }))]} onChange={(value) => setStationFilter('capability', value)} />
              </label>
            </div>
            <div className="station-card-grid">
              {filteredStations.map((station) => {
                const stationSelected = station.id === selectedStation?.id;
                const stationQueueSummary = getStationJobQueueSummary(selectedWorkCenter, station);
                const stationCurrentJob = stationQueueSummary?.currentJob?.orderNumber ?? station.currentJob ?? 'Unassigned';
                const stationQueueCount = stationQueueSummary?.queuedJobs.length ?? station.queueCount;
                const stationPlanningMetrics = getStationPlanningMetrics(
                  getActiveStationOrders(productionOrders, selectedWorkCenter, station),
                  todayIsoDate,
                );
                return (
                  <article
                    className={['station-card', stationSelected ? 'selected' : ''].filter(Boolean).join(' ')}
                    key={station.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={stationSelected}
                    onClick={() => setSelectedStationId(station.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedStationId(station.id);
                      }
                    }}
                  >
                    <div className="station-card-header">
                      {renderStationVisual(station)}
                      <div className="station-card-title">
                        <div>
                          <h4>{station.name}</h4>
                          <span>{station.code}</span>
                        </div>
                        <div className="station-card-title-actions">
                          <span className={`station-status-pill station-status-${station.status}`}>{formatLabel(station.status)}</span>
                          <button
                            className="station-card-edit-button"
                            type="button"
                            aria-label={`Edit ${station.name}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              openEditStationForm(station);
                            }}
                            onKeyDown={(event) => event.stopPropagation()}
                          >
                            <Pencil size={14} />
                            Edit
                          </button>
                        </div>
                      </div>
                    </div>
                    <dl>
                      <div><dt>Type</dt><dd>{station.type}</dd></div>
                      <div><dt>Process</dt><dd>{station.processStep}</dd></div>
                      <div><dt>Current Job</dt><dd>{stationCurrentJob}</dd></div>
                      <div><dt>Operator</dt><dd><span className="station-operator-pill">{station.operator}</span></dd></div>
                      <div><dt>Queue</dt><dd>{stationQueueCount}</dd></div>
                      <div><dt>WIP</dt><dd>{stationPlanningMetrics.wipCount}</dd></div>
                    </dl>
                    <div className={`work-center-utilization utilization-${getStationUtilizationStatus(stationPlanningMetrics.scheduledUtilization)}`} aria-hidden="true"><span style={{ width: `${stationPlanningMetrics.scheduledUtilization}%` }} /></div>
                    <div className="station-card-footer">
                      <span>{stationPlanningMetrics.hasPlannedShifts ? `${stationPlanningMetrics.scheduledUtilization}% scheduled utilization` : 'No shifts planned'}</span>
                      <span className={`machine-load-pill load-${stationPlanningMetrics.machineLoad}`}>{formatMachineLoadLabel(stationPlanningMetrics.machineLoad)}</span>
                      <strong className={`risk-${stationPlanningMetrics.dueRisk}`}>{formatRiskLabel(stationPlanningMetrics.dueRisk)} risk</strong>
                    </div>
                    <div className="station-shift-breakdown">
                      {stationPlanningMetrics.shiftBreakdown.map((shift) => (
                        <span key={shift.value}>
                          <strong>{shift.label}</strong>
                          {renderShiftOrderChips(shift.orders, openProductionOrderFromShiftChip)}
                        </span>
                      ))}
                    </div>
                    <div className="work-center-tags">
                      {station.capabilities.map((capability) => renderCapabilityPill(capability))}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </main>
      </div>

      {showAddForm ? (
        <div className="mes-modal-backdrop" role="presentation">
          <section className="mes-order-modal work-center-form-modal" role="dialog" aria-modal="true" aria-labelledby="work-center-form-title">
            <div>
              <p className="eyebrow">Work Center</p>
              <h3 id="work-center-form-title">{editingWorkCenterId ? 'Edit Work Center' : 'Add Work Center'}</h3>
            </div>
            <form className="mes-order-form" onSubmit={saveWorkCenterForm}>
              <label>Work Center Name<input value={formState.name} onChange={(event) => setFormState((current) => ({ ...current, name: event.target.value }))} required /></label>
              <label>Work Center Code<input value={formState.code} onChange={(event) => setFormState((current) => ({ ...current, code: event.target.value }))} required /></label>
              <label className="mes-order-form-wide work-center-address-field">
                Address
                <div className="address-lookup-control" ref={addressLookupControlRef}>
                  <input
                    value={formState.address}
                    onChange={(event) => {
                      setFormState((current) => ({ ...current, address: event.target.value, latitude: '', longitude: '' }));
                      setAddressLookup({ status: 'idle', message: '' });
                      setShowAddressSuggestions(true);
                    }}
                    onFocus={() => setShowAddressSuggestions(addressSuggestions.length > 0)}
                    placeholder="Street, city, state, country"
                    required
                  />
                  <button type="button" onClick={() => { void lookupWorkCenterAddress(); }} disabled={addressLookup.status === 'loading'}>
                    {addressLookup.status === 'loading' ? 'Searching...' : 'Find address'}
                  </button>
                </div>
                {addressLookup.message ? <small className={`address-lookup-message ${addressLookup.status}`}>{addressLookup.message}</small> : null}
              </label>
              <label className="mes-order-form-wide">Description<input value={formState.description} onChange={(event) => setFormState((current) => ({ ...current, description: event.target.value }))} placeholder="Receiving dock, quality area, branch office..." /></label>
              <div className="mes-order-form-actions">
                <button type="button" onClick={() => { setEditingWorkCenterId(null); setShowAddressSuggestions(false); setShowAddForm(false); }}>Cancel</button>
                <button type="submit" disabled={addressLookup.status === 'loading'}>{editingWorkCenterId ? 'Save Changes' : 'Save Work Center'}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {showStationForm ? (
        <div className="mes-modal-backdrop" role="presentation">
          <section className="mes-order-modal work-center-form-modal station-form-modal" role="dialog" aria-modal="true" aria-labelledby="station-form-title">
            <div>
              <p className="eyebrow">Station</p>
              <h3 id="station-form-title">{editingStationId ? 'Edit Station' : 'Add Station'}</h3>
            </div>
            <form className="mes-order-form" onSubmit={saveStationForm}>
              <label className="mes-order-form-wide">
                Work Center
                <MesOrderDropdown
                  id="station-work-center-field"
                  value={stationFormState.workCenterId}
                  placeholder="Select Work Center"
                  options={workCenters.map((workCenter) => ({ value: workCenter.id, label: `${workCenter.name} / ${workCenter.code}` }))}
                  onChange={(value) => setStationFormState((current) => ({ ...current, workCenterId: value }))}
                />
              </label>
              <label>Station Name<input value={stationFormState.name} onChange={(event) => setStationFormState((current) => ({ ...current, name: event.target.value }))} required /></label>
              <label>Station Code<input value={stationFormState.code} onChange={(event) => setStationFormState((current) => ({ ...current, code: event.target.value }))} required /></label>
              <label>
                Type
                <MesOrderDropdown
                  id="station-type-field"
                  value={stationFormState.type}
                  options={stationFormTypes.map((type) => ({ value: type, label: type }))}
                  onChange={(value) => setStationFormState((current) => ({ ...current, type: value }))}
                />
              </label>
              <label>
                Operator
                <MesOrderDropdown
                  id="station-operator-field"
                  value={stationFormState.operator}
                  options={registeredOperatorOptions.map((operator) => ({ value: operator, label: operator }))}
                  onChange={(value) => setStationFormState((current) => ({ ...current, operator: value }))}
                />
              </label>
              <div className="station-image-upload mes-order-form-wide">
                <div className="station-image-upload-copy">
                  <span>Station Photo</span>
                  <small>Optional. Upload from your device; stations without a photo keep the initials image.</small>
                </div>
                <div className="station-image-upload-control">
                  <div className="station-image-preview" aria-hidden="true">
                    {stationImagePreviewUrl ? (
                      <img src={stationImagePreviewUrl} alt="" />
                    ) : (
                      <span>{stationFormState.type.split(' ').map((word) => word[0]).join('').slice(0, 2)}</span>
                    )}
                  </div>
                  <div className="station-image-upload-actions">
                    <label>
                      <ImagePlus size={16} />
                      <span>{stationImageFile || stationImagePreviewUrl ? 'Change Photo' : 'Upload Photo'}</span>
                      <input key={stationImageFile ? stationImageFile.name : 'empty'} type="file" accept="image/*" onChange={selectStationImageFile} />
                    </label>
                    {stationImageFile ? <button type="button" onClick={clearStationImageFile}>Remove</button> : null}
                  </div>
                </div>
                {stationImageFile ? <small className="station-image-file-name">{stationImageFile.name}</small> : null}
                {stationImageUploadError ? <small className="station-image-upload-error">{stationImageUploadError}</small> : null}
              </div>
              <label className="mes-order-form-wide">
                Capability
                <MesOrderDropdown
                  id="station-capability-field"
                  value={stationFormState.capability}
                  placeholder="Select capability"
                  options={[
                    ...allCapabilityTags.map((capability) => ({ value: capability, label: capability })),
                    { value: registerNewCapabilityValue, label: '+ Register new capability' },
                  ]}
                  onChange={(value) => {
                    setStationFormState((current) => ({ ...current, capability: value }));
                    setShowCapabilityColorPicker(false);
                  }}
                />
              </label>
              {stationFormState.capability === registerNewCapabilityValue ? (
                <div className="station-new-capability mes-order-form-wide">
                  <label>Capability Name<input value={stationFormState.newCapabilityName} onChange={(event) => setStationFormState((current) => ({ ...current, newCapabilityName: event.target.value }))} required /></label>
                  <div className="station-new-capability-color" role="group" aria-labelledby="station-new-capability-color-label">
                    <span id="station-new-capability-color-label">Capability Color</span>
                    <div className="capability-color-picker">
                      {presetCapabilityColorOptions.map((color) => (
                        <button
                          className={stationFormState.newCapabilityColor === color ? 'selected' : ''}
                          type="button"
                          key={color}
                          aria-label={`Select capability color ${color}`}
                          style={{ backgroundColor: color }}
                          onClick={() => {
                            updateNewCapabilityColor(color);
                            setShowCapabilityColorPicker(false);
                          }}
                        />
                      ))}
                      <span className="capability-custom-color-wrap" ref={capabilityColorTriggerRef}>
                        <button
                          className={showCapabilityColorPicker || usesCustomCapabilityColor ? 'selected custom' : 'custom'}
                          type="button"
                          aria-label="Pick custom capability color"
                          style={usesCustomCapabilityColor ? {
                            backgroundColor: stationFormState.newCapabilityColor,
                            color: newCapabilityHsv.value > 72 ? '#07111c' : '#ffffff',
                          } : undefined}
                          onClick={() => {
                            setShowCapabilityColorPicker((current) => !current);
                          }}
                        >
                          {usesCustomCapabilityColor ? <Check size={16} /> : <Plus size={16} />}
                        </button>
                      </span>
                    </div>
                  </div>
                </div>
              ) : null}
              <div className="mes-order-form-actions">
                <button type="button" onClick={closeStationForm} disabled={stationImageUploading}>Cancel</button>
                <button type="submit" disabled={stationImageUploading}>{stationImageUploading ? 'Uploading...' : editingStationId ? 'Save Changes' : 'Save Station'}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {showDetailModal && selectedWorkCenter ? (
        <div className="mes-modal-backdrop work-center-detail-backdrop" role="presentation">
          <section className="work-center-detail-modal" role="dialog" aria-modal="true" aria-labelledby="work-center-detail-title">
            <div className="work-center-detail-modal-header">
              <div>
                <p className="eyebrow">Work Center Detail</p>
                <h3 id="work-center-detail-title">{selectedWorkCenter.name}</h3>
                <span>{selectedWorkCenter.code} / {selectedWorkCenter.type}</span>
              </div>
              <button type="button" onClick={() => setShowDetailModal(false)}>Close</button>
            </div>
            <div className="work-center-detail-modal-grid">
              <section><h4>Overview</h4><p>{selectedWorkCenter.description}</p><dl><div><dt>Address</dt><dd>{selectedWorkCenter.address}</dd></div><div><dt>Status</dt><dd>{formatLabel(selectedWorkCenter.status)}</dd></div></dl><div className="work-center-detail-tags">{selectedWorkCenter.capabilities.map((capability) => <span key={capability}>{capability}</span>)}</div></section>
              {selectedStation ? (
                <section className="station-detail-image-section">
                  <h4>Selected Station</h4>
                  {renderStationVisual(selectedStation, 'station-detail-visual station-card-visual')}
                  <dl>
                    <div><dt>Station</dt><dd>{selectedStation.name}</dd></div>
                    <div><dt>Code</dt><dd>{selectedStation.code}</dd></div>
                    <div><dt>Type</dt><dd>{selectedStation.type}</dd></div>
                    <div><dt>Capability</dt><dd>{selectedStation.processStep}</dd></div>
                  </dl>
                </section>
              ) : null}
              <section><h4>Live Status</h4><dl><div><dt>Current job</dt><dd>{selectedWorkCenter.currentJob ?? 'Unassigned'}</dd></div><div><dt>Operator</dt><dd>{selectedWorkCenter.currentOperator}</dd></div><div><dt>Step</dt><dd>{selectedWorkCenter.currentStep}</dd></div><div><dt>Queue / WIP</dt><dd>{selectedWorkCenter.queueCount} / {selectedWorkCenter.wipCount}</dd></div><div><dt>Last event</dt><dd>{selectedWorkCenter.lastEvent}</dd></div><div><dt>Downtime</dt><dd>{selectedWorkCenter.activeDowntime ? 'Active' : 'None active'}</dd></div></dl></section>
              <section><h4>Queue</h4>{selectedWorkCenter.queue.length > 0 ? selectedWorkCenter.queue.map((job) => <article className="work-center-list-row" key={job.orderId}><strong>{job.orderId}</strong><span>{job.product}</span><em>{formatLabel(job.priority)} / {formatDate(job.dueDate)} / {job.estimatedMinutes} min</em></article>) : <p>No queued jobs.</p>}</section>
              <section><h4>Events</h4>{selectedWorkCenter.events.map((event) => <article className="work-center-list-row" key={`${event.timestamp}-${event.eventType}`}><strong>{event.eventType}</strong><span>{event.relatedOrder} / {event.operator}</span><em>{event.timestamp} - {event.notes}</em></article>)}</section>
              <section><h4>Maintenance</h4><dl><div><dt>Status</dt><dd>{selectedWorkCenter.maintenanceStatus}</dd></div><div><dt>Last</dt><dd>{formatDate(selectedWorkCenter.lastMaintenanceDate)}</dd></div><div><dt>Next</dt><dd>{formatDate(selectedWorkCenter.nextMaintenanceDate)}</dd></div><div><dt>Today / Week</dt><dd>{selectedWorkCenter.downtimeTodayMinutes} min / {selectedWorkCenter.downtimeTodayMinutes + 42} min</dd></div></dl><p>{selectedWorkCenter.maintenanceNotes}</p></section>
            </div>
          </section>
        </div>
      ) : null}

      {jobQueueSummary ? <JobQueueModal summary={jobQueueSummary} onClose={() => setJobQueueSummary(null)} /> : null}

      {workCenterConfirmation ? (
        <div className="mes-modal-backdrop" role="presentation">
          <section
            className={['mes-confirm-modal', workCenterConfirmation.tone === 'danger' ? 'danger' : ''].filter(Boolean).join(' ')}
            role="dialog"
            aria-modal="true"
            aria-labelledby="work-center-confirm-title"
          >
            <div className="mes-confirm-mark" aria-hidden="true">
              {workCenterConfirmation.tone === 'danger' ? <AlertTriangle size={24} /> : <Check size={24} />}
            </div>
            <div>
              <p className="eyebrow">Work Center</p>
              <h3 id="work-center-confirm-title">{workCenterConfirmation.title}</h3>
              <p>{workCenterConfirmation.message}</p>
            </div>
            <div className="mes-confirm-actions">
              <button type="button" onClick={() => setWorkCenterConfirmation(null)}>
                Cancel
              </button>
              <button type="button" onClick={() => void confirmPendingWorkCenterAction()}>
                {workCenterConfirmation.confirmLabel}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function toTraceabilityNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : null;
}

function getTraceabilityPayloadString(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === 'string' ? value : '';
}

function getTraceabilityPayloadBoolean(payload: Record<string, unknown>, key: string): boolean | null {
  const value = payload[key];
  return typeof value === 'boolean' ? value : null;
}

function mapTraceabilityCapture(row: TraceabilityCaptureRow): TraceabilityCapture {
  const order = row.mes_production_orders;
  const payload = row.payload ?? {};
  const plannedQuantity = order?.planned_quantity ?? 0;
  const shift = typeof payload.shift === 'string' ? payload.shift : '';
  const stationName = typeof payload.station_name === 'string' ? payload.station_name : '';
  const payloadPieceSequence = typeof payload.piece_sequence === 'number'
    ? payload.piece_sequence
    : typeof payload.piece_sequence === 'string'
      ? Number(payload.piece_sequence)
      : null;
  const pieceSequence = payloadPieceSequence && Number.isFinite(payloadPieceSequence) ? payloadPieceSequence : null;
  const inferredStatusAtCapture: ProductionOrderStatus | '' = pieceSequence && plannedQuantity > 0
    ? pieceSequence >= plannedQuantity ? 'completed' : 'running'
    : order?.status ?? '';
  const statusAtCapture = getTraceabilityPayloadStatus(payload) || inferredStatusAtCapture;
  const reportedQuantity = pieceSequence ?? ((order?.completed_quantity ?? 0) + (order?.scrap_quantity ?? 0));
  return {
    id: row.id,
    productionOrderId: row.production_order_id ?? '',
    timestamp: row.created_at,
    productionOrder: order?.order_number ?? 'Unassigned order',
    partNumber: order?.part_number ?? '',
    partName: order?.part_name ?? row.part_label ?? 'Captured part',
    clientName: order?.client_name ?? getTraceabilityPayloadString(payload, 'client'),
    workCenter: row.work_center_code,
    station: row.station_code,
    stationName,
    templateId: row.template_id,
    partLabel: row.part_label ?? '',
    toolId: row.tool_id ?? '',
    serialNumber: row.serial_number ?? '',
    dimensionsUnit: row.dimensions_unit,
    beforeNotch: toTraceabilityNumber(row.before_notch),
    beforeToothLength: toTraceabilityNumber(row.before_tooth_length),
    damageCodes: row.damage_codes ?? [],
    damageImageUrl: row.damage_image_url ?? '',
    stockToRemove: toTraceabilityNumber(row.stock_to_remove),
    afterToothLength: toTraceabilityNumber(row.after_tooth_length),
    beforeHeight: toTraceabilityNumber(payload.before_height),
    afterHeight: toTraceabilityNumber(payload.after_height),
    shaverSharpeningNumber: getTraceabilityPayloadString(payload, 'shaver_sharpening_number'),
    shaverDiameter: toTraceabilityNumber(payload.shaver_diameter),
    shaverSpan: toTraceabilityNumber(payload.shaver_span),
    shaverTeeth: toTraceabilityNumber(payload.shaver_teeth),
    shaverDamage: getTraceabilityPayloadBoolean(payload, 'shaver_damage'),
    orderStatus: order?.status ?? '',
    statusAtCapture,
    pieceSequence,
    plannedQuantity,
    completionPercent: plannedQuantity > 0 ? Math.round((reportedQuantity / plannedQuantity) * 100) : 0,
    shift,
  };
}

const traceabilityShiftOptions = ['1st', '2nd', '3rd'];
const traceabilityPageSizeOptions = [
  { value: '10', label: '10' },
  { value: '20', label: '20' },
  { value: '50', label: '50' },
  { value: '100', label: '100' },
];
const traceabilityStatusOptions: ProductionOrderStatus[] = ['planned', 'released', 'running', 'paused', 'waiting-inspection', 'completed', 'cancelled'];
const traceabilityFiltersStorageKey = 'yvimo-mes-traceability-filters';

type TraceabilityFilters = {
  orderSearch: string;
  partSearch: string;
  serialSearch: string;
  toolSearch: string;
  client: string;
  workCenter: string;
  station: string;
  dateFrom: string;
  dateTo: string;
  shifts: string[];
  showEvents: boolean;
  showManufacturing: boolean;
  showQuality: boolean;
};

function getDefaultTraceabilityFilters(): TraceabilityFilters {
  const today = toLocalIsoDate(new Date());
  return {
    orderSearch: '',
    partSearch: '',
    serialSearch: '',
    toolSearch: '',
    client: '',
    workCenter: '',
    station: '',
    dateFrom: today,
    dateTo: today,
    shifts: [],
    showEvents: true,
    showManufacturing: true,
    showQuality: true,
  };
}

function loadTraceabilityFilters(): TraceabilityFilters {
  const defaultFilters = getDefaultTraceabilityFilters();
  if (typeof window === 'undefined') return defaultFilters;

  try {
    const storedFilters = window.localStorage.getItem(traceabilityFiltersStorageKey);
    if (!storedFilters) return defaultFilters;
    const parsedFilters = JSON.parse(storedFilters) as Partial<TraceabilityFilters>;
    return {
      ...defaultFilters,
      ...parsedFilters,
      client: typeof parsedFilters.client === 'string' ? parsedFilters.client : '',
      showEvents: parsedFilters.showEvents !== false,
      showManufacturing: parsedFilters.showManufacturing !== false,
      showQuality: parsedFilters.showQuality !== false,
      shifts: Array.isArray(parsedFilters.shifts) ? parsedFilters.shifts.filter((shift) => traceabilityShiftOptions.includes(shift)) : [],
      dateFrom: typeof parsedFilters.dateFrom === 'string' && parsedFilters.dateFrom ? parsedFilters.dateFrom : defaultFilters.dateFrom,
      dateTo: typeof parsedFilters.dateTo === 'string' && parsedFilters.dateTo ? parsedFilters.dateTo : defaultFilters.dateTo,
    };
  } catch (error) {
    console.warn('Unable to load traceability filters', error);
    return defaultFilters;
  }
}

function getClearedTraceabilityFilters(): TraceabilityFilters {
  return {
    orderSearch: '',
    partSearch: '',
    serialSearch: '',
    toolSearch: '',
    client: '',
    workCenter: '',
    station: '',
    dateFrom: '',
    dateTo: '',
    shifts: [],
    showEvents: true,
    showManufacturing: true,
    showQuality: true,
  };
}

function getTraceabilityPayloadStatus(payload: Record<string, unknown>): ProductionOrderStatus | '' {
  return typeof payload.order_status === 'string' && traceabilityStatusOptions.includes(payload.order_status as ProductionOrderStatus)
    ? payload.order_status as ProductionOrderStatus
    : '';
}

function formatTraceabilityStatus(status: ProductionOrderStatus | '') {
  if (status === 'running') return 'In Progress';
  return status ? formatLabel(status) : 'Unknown';
}

type TraceabilityMeasureDisplay = {
  label: string;
  value: string;
};

function formatTraceabilityMeasurementValue(value: number | string | boolean | null | undefined, unit = '') {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (value === null || value === undefined || value === '') return 'N/A';
  return `${value}${unit ? ` ${unit}` : ''}`;
}

function getTraceabilityMeasureDisplays(capture: TraceabilityCapture): TraceabilityMeasureDisplay[] {
  const templateId = capture.templateId || '';
  const unit = capture.dimensionsUnit;
  if (templateId === 'shaver-sharpening' || templateId === 'shavers') {
    return [
      { label: 'No. Afilado', value: formatTraceabilityMeasurementValue(capture.shaverSharpeningNumber) },
      { label: 'Diameter', value: formatTraceabilityMeasurementValue(capture.shaverDiameter, unit) },
      { label: 'Span', value: formatTraceabilityMeasurementValue(capture.shaverSpan, unit) },
      { label: 'Teeth', value: formatTraceabilityMeasurementValue(capture.shaverTeeth) },
      { label: 'Damage', value: formatTraceabilityMeasurementValue(capture.shaverDamage) },
    ];
  }
  if (templateId === 'shaper-sharpening' || templateId === 'shapers') {
    return [
      { label: 'Before height', value: formatTraceabilityMeasurementValue(capture.beforeHeight, unit) },
      { label: 'Stock remove', value: formatTraceabilityMeasurementValue(capture.stockToRemove, unit) },
      { label: 'After height', value: formatTraceabilityMeasurementValue(capture.afterHeight, unit) },
    ];
  }
  return [
    { label: 'Before notch', value: formatTraceabilityMeasurementValue(capture.beforeNotch, unit) },
    { label: 'Before tooth', value: formatTraceabilityMeasurementValue(capture.beforeToothLength, unit) },
    { label: 'Stock remove', value: formatTraceabilityMeasurementValue(capture.stockToRemove, unit) },
    { label: 'After tooth', value: formatTraceabilityMeasurementValue(capture.afterToothLength, unit) },
  ];
}

function getTraceabilityRecordNumber(record: Record<string, unknown>, key: string): number | null {
  return toTraceabilityNumber(record[key]);
}

function getTraceabilityRecordPayload(record: Record<string, unknown>) {
  const payload = record.payload;
  return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
}

function getTraceabilityCorrectionDisplays(record: Record<string, unknown>): TraceabilityMeasureDisplay[] {
  const payload = getTraceabilityRecordPayload(record);
  const templateId = typeof record.template_id === 'string' ? record.template_id : typeof payload.traceability_template === 'string' ? payload.traceability_template : '';
  const unit = typeof record.dimensions_unit === 'string' ? record.dimensions_unit : 'in';
  if (templateId === 'shaver-sharpening' || templateId === 'shavers') {
    return [
      { label: 'No. Afilado', value: formatTraceabilityMeasurementValue(payload.shaver_sharpening_number as string | undefined) },
      { label: 'Diameter', value: formatTraceabilityMeasurementValue(toTraceabilityNumber(payload.shaver_diameter), unit) },
      { label: 'Span', value: formatTraceabilityMeasurementValue(toTraceabilityNumber(payload.shaver_span), unit) },
      { label: 'Teeth', value: formatTraceabilityMeasurementValue(toTraceabilityNumber(payload.shaver_teeth)) },
      { label: 'Damage', value: formatTraceabilityMeasurementValue(typeof payload.shaver_damage === 'boolean' ? payload.shaver_damage : null) },
    ];
  }
  if (templateId === 'shaper-sharpening' || templateId === 'shapers') {
    return [
      { label: 'Before height', value: formatTraceabilityMeasurementValue(toTraceabilityNumber(payload.before_height), unit) },
      { label: 'Stock remove', value: formatTraceabilityMeasurementValue(getTraceabilityRecordNumber(record, 'stock_to_remove'), unit) },
      { label: 'After height', value: formatTraceabilityMeasurementValue(toTraceabilityNumber(payload.after_height), unit) },
    ];
  }
  return [
    { label: 'Before notch', value: formatTraceabilityMeasurementValue(getTraceabilityRecordNumber(record, 'before_notch'), unit) },
    { label: 'Before tooth', value: formatTraceabilityMeasurementValue(getTraceabilityRecordNumber(record, 'before_tooth_length'), unit) },
    { label: 'Stock remove', value: formatTraceabilityMeasurementValue(getTraceabilityRecordNumber(record, 'stock_to_remove'), unit) },
    { label: 'After tooth', value: formatTraceabilityMeasurementValue(getTraceabilityRecordNumber(record, 'after_tooth_length'), unit) },
  ];
}

function getTraceabilityCorrectionComparison(event: TraceabilityOperatorEventRow) {
  const payload = event.payload ?? {};
  const previous = payload.previous && typeof payload.previous === 'object' && !Array.isArray(payload.previous) ? payload.previous as Record<string, unknown> : null;
  const corrected = payload.corrected && typeof payload.corrected === 'object' && !Array.isArray(payload.corrected) ? payload.corrected as Record<string, unknown> : null;
  if (!previous || !corrected) return null;
  return {
    previous: getTraceabilityCorrectionDisplays(previous),
    corrected: getTraceabilityCorrectionDisplays(corrected),
  };
}

type TraceabilityEventTone =
  | 'job-started'
  | 'job-resumed'
  | 'job-paused'
  | 'downtime'
  | 'scrap'
  | 'waiting-inspection'
  | 'order-completed'
  | 'quality-inspection'
  | 'adjustment';

function getTraceabilityEventTone(eventType: string): TraceabilityEventTone {
  if (eventType === 'job-started') return 'job-started';
  if (eventType === 'job-resumed') return 'job-resumed';
  if (eventType === 'job-paused') return 'job-paused';
  if (eventType === 'downtime-started') return 'downtime';
  if (eventType === 'production-scrap') return 'scrap';
  if (eventType === 'manufacturing-completed') return 'waiting-inspection';
  if (eventType === 'operation-completed') return 'order-completed';
  if (eventType === 'quality-inspection-saved' || eventType === 'quality-inspection-skipped') return 'quality-inspection';
  return 'adjustment';
}

function renderTraceabilityEventIcon(eventType: string) {
  const iconProps = { size: 19, strokeWidth: 2.6 };
  if (eventType === 'job-started') return <Activity {...iconProps} />;
  if (eventType === 'job-resumed') return <RadioTower {...iconProps} />;
  if (eventType === 'job-paused') return <Timer {...iconProps} />;
  if (eventType === 'downtime-started') return <AlertTriangle {...iconProps} />;
  if (eventType === 'production-scrap') return <CircleX {...iconProps} />;
  if (eventType === 'manufacturing-completed') return <CalendarDays {...iconProps} />;
  if (eventType === 'operation-completed') return <CheckCircle2 {...iconProps} />;
  if (eventType === 'quality-inspection-saved') return <Eye {...iconProps} />;
  if (eventType === 'quality-inspection-skipped') return <Minus {...iconProps} />;
  if (eventType === 'measurement-corrected') return <Pencil {...iconProps} />;
  return <CircleHelp {...iconProps} />;
}

function getTraceabilityEventLabel(eventType: string) {
  const eventLabels: Record<string, string> = {
    'job-started': 'Job Started',
    'job-resumed': 'Job Resumed',
    'job-paused': 'Job Paused',
    'downtime-started': 'Downtime Started',
    'production-scrap': '+1 Scrap',
    'manufacturing-completed': 'Waiting Inspection',
    'operation-completed': 'Order Completed',
    'quality-inspection-saved': 'Quality Inspection Saved',
    'quality-inspection-skipped': 'Quality Inspection Skipped',
    'measurement-corrected': 'Measurement Corrected',
    adjustment: 'Adjustment',
  };
  return eventLabels[eventType] ?? formatTitleLabel(eventType);
}

function getTraceabilityEventSummary(event: TraceabilityOperatorEventRow) {
  if (event.event_type === 'production-scrap') {
    return `${event.quantity || 1} scrap part${(event.quantity || 1) === 1 ? '' : 's'} reported`;
  }
  if (event.event_type === 'downtime-started') return 'Downtime was reported from the Operator Terminal';
  if (event.event_type === 'job-paused') return 'Production was paused by the operator';
  if (event.event_type === 'job-started') return 'Production was started from the Operator Terminal';
  if (event.event_type === 'job-resumed') return 'Production was resumed by the operator';
  if (event.event_type === 'manufacturing-completed') return 'Manufacturing is complete and the order is waiting for Quality inspection';
  if (event.event_type === 'operation-completed') return 'The production order was marked complete';
  if (event.event_type === 'quality-inspection-saved') {
    const serialNumber = event.payload && typeof event.payload.serial_number === 'string' ? event.payload.serial_number : '';
    return serialNumber ? `Quality inspection completed for ${serialNumber}` : 'Quality inspection completed';
  }
  if (event.event_type === 'quality-inspection-skipped') {
    const serialNumber = event.payload && typeof event.payload.serial_number === 'string' ? event.payload.serial_number : '';
    const skipReason = event.payload && typeof event.payload.skip_reason === 'string' ? event.payload.skip_reason.trim() : '';
    const summary = serialNumber ? `Quality inspection skipped for ${serialNumber}` : 'Quality inspection skipped';
    return skipReason ? `${summary}: ${skipReason}` : summary;
  }
  if (event.event_type === 'measurement-corrected') return 'Measurement was corrected from the Operator Terminal';
  return 'Operator event captured';
}

function getTraceabilityEventShift(event: TraceabilityOperatorEventRow) {
  return event.payload && typeof event.payload.shift === 'string' && event.payload.shift.trim()
    ? event.payload.shift
    : 'N/A';
}

function isTraceabilityQualityEvent(eventType: string) {
  return eventType === 'quality-inspection-saved' || eventType === 'quality-inspection-skipped';
}

type TraceabilityQualityStatus = 'ok' | 'approach' | 'nok' | 'pending' | 'skipped';

type TraceabilityQualityInspection = {
  inspection: string;
  status: TraceabilityQualityStatus;
};

function getTraceabilityQualityInspections(event: TraceabilityOperatorEventRow): TraceabilityQualityInspection[] {
  const inspections = event.payload?.inspections;
  if (!Array.isArray(inspections)) return [];
  return inspections.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const entry = item as Record<string, unknown>;
    const inspection = typeof entry.inspection === 'string' ? entry.inspection : '';
    const status = typeof entry.status === 'string' ? entry.status : '';
    if (!inspection || !['ok', 'approach', 'nok', 'pending'].includes(status)) return [];
    return [{ inspection, status: status as TraceabilityQualityStatus }];
  });
}

function getTraceabilityQualityDocumentCount(event: TraceabilityOperatorEventRow) {
  const count = event.payload?.document_count;
  return typeof count === 'number' && Number.isFinite(count) ? count : 0;
}

function renderTraceabilityCaptureTime(timestamp: string, shift: string) {
  return (
    <div className="traceability-capture-time-group">
      <span className="traceability-capture-time">
        <Timer size={15} />
        <span>
          <b>Captured:</b>
          {formatTimestamp(timestamp)}
        </span>
      </span>
      <span className="traceability-capture-shift">
        <CalendarDays size={15} />
        <span>
          <b>Shift:</b>
          {shift || 'N/A'}
        </span>
      </span>
    </div>
  );
}

type TraceabilityTimelineItem =
  | { kind: 'measurement'; id: string; timestamp: string; capture: TraceabilityCapture }
  | { kind: 'event'; id: string; timestamp: string; event: TraceabilityOperatorEventRow; tone: TraceabilityEventTone };

export function TraceabilityWorkspace({ onNavigate, organizationId }: WorkspaceProps) {
  const [captures, setCaptures] = React.useState<TraceabilityCapture[]>([]);
  const [newCaptureIds, setNewCaptureIds] = React.useState<Set<string>>(() => new Set());
  const [operatorEvents, setOperatorEvents] = React.useState<TraceabilityOperatorEventRow[]>([]);
  const [orders, setOrders] = React.useState<TraceabilityOrderOption[]>([]);
  const [clients, setClients] = React.useState<ProductionOrderCustomerOptionRow[]>([]);
  const [workCenters, setWorkCenters] = React.useState<TraceabilityWorkCenterOption[]>([]);
  const [stations, setStations] = React.useState<TraceabilityStationOption[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [errorMessage, setErrorMessage] = React.useState('');
  const [filters, setFilters] = React.useState<TraceabilityFilters>(() => loadTraceabilityFilters());
  const [traceabilityPageSize, setTraceabilityPageSize] = React.useState(10);
  const [traceabilityPage, setTraceabilityPage] = React.useState(1);
  const newCaptureTimersRef = React.useRef<Record<string, number>>({});
  const knownCaptureIdsRef = React.useRef<Set<string>>(new Set());
  const knownEventIdsRef = React.useRef<Set<string>>(new Set());
  const traceabilityLoadedRef = React.useRef(false);

  const markCaptureAsNew = React.useCallback((captureId: string) => {
    if (!captureId) return;
    setTraceabilityPage(1);
    setNewCaptureIds((currentIds) => {
      const nextIds = new Set(currentIds);
      nextIds.add(captureId);
      return nextIds;
    });

    if (newCaptureTimersRef.current[captureId]) {
      window.clearTimeout(newCaptureTimersRef.current[captureId]);
    }

    newCaptureTimersRef.current[captureId] = window.setTimeout(() => {
      setNewCaptureIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.delete(captureId);
        return nextIds;
      });
      delete newCaptureTimersRef.current[captureId];
    }, 6500);
  }, []);

  const loadTraceability = React.useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setErrorMessage('');
    const [
      { data: capturesData, error: capturesError },
      { data: ordersData, error: ordersError },
      { data: workCentersData, error: workCentersError },
      { data: stationsData, error: stationsError },
      { data: eventsData, error: eventsError },
      { data: clientsData, error: clientsError },
    ] = await Promise.all([
      supabase
        .from('mes_operator_terminal_traceability')
        .select(`
          id,
          production_order_id,
          work_center_code,
          station_code,
          template_id,
          part_label,
          tool_id,
          serial_number,
          dimensions_unit,
          before_notch,
          before_tooth_length,
          damage_codes,
          damage_image_url,
          stock_to_remove,
          after_tooth_length,
          payload,
          created_at,
          mes_production_orders (
            order_number,
            part_number,
            part_name,
            customer_id,
            client_name,
            planned_quantity,
            completed_quantity,
            scrap_quantity,
            status
          )
        `)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('mes_production_orders')
        .select('id, order_number, part_number, part_name, customer_id, client_name, assigned_work_center, assigned_station, status')
        .eq('organization_id', organizationId)
        .order('order_number', { ascending: true }),
      supabase
        .from('mes_work_centers')
        .select('id, code, name')
        .eq('organization_id', organizationId)
        .order('name', { ascending: true }),
      supabase
        .from('mes_work_center_stations')
        .select('id, work_center_id, code, name')
        .eq('organization_id', organizationId)
        .order('name', { ascending: true }),
      supabase
        .from('mes_operator_terminal_events')
        .select(`
          id,
          production_order_id,
          work_center_code,
          station_code,
          event_type,
          quantity,
          reason,
          comment,
          payload,
          created_at,
          mes_production_orders (
            order_number,
            part_number,
            part_name,
            customer_id,
            client_name,
            planned_quantity,
            completed_quantity,
            scrap_quantity,
            status
          )
        `)
        .eq('organization_id', organizationId)
        .in('event_type', ['production-scrap', 'downtime-started', 'job-paused', 'job-started', 'job-resumed', 'manufacturing-completed', 'operation-completed', 'adjustment', 'quality-inspection-saved', 'quality-inspection-skipped', 'measurement-corrected'])
        .order('created_at', { ascending: false })
        .limit(300),
      supabase
        .from('mes_customers')
        .select('id, customer_name, legal_name, status')
        .eq('organization_id', organizationId)
        .order('customer_name', { ascending: true }),
    ]);

    const loadError = capturesError ?? ordersError ?? workCentersError ?? stationsError ?? eventsError ?? clientsError;
    if (loadError) {
      console.error('Unable to load MES traceability data', loadError);
      setErrorMessage('Unable to load traceability data from Supabase.');
      setCaptures([]);
      setOperatorEvents([]);
      setOrders([]);
      setClients([]);
      setWorkCenters([]);
      setStations([]);
    } else {
      const workCenterRows = (workCentersData ?? []) as TraceabilityWorkCenterOption[];
      const workCenterCodeById = new Map(workCenterRows.map((workCenter) => [workCenter.id, workCenter.code]));
      const nextCaptures = ((capturesData ?? []) as TraceabilityCaptureRow[]).map(mapTraceabilityCapture);
      if (silent && traceabilityLoadedRef.current) {
        nextCaptures
          .filter((capture) => !knownCaptureIdsRef.current.has(capture.id))
          .forEach((capture) => markCaptureAsNew(capture.id));
      }
      knownCaptureIdsRef.current = new Set(nextCaptures.map((capture) => capture.id));
      traceabilityLoadedRef.current = true;
      setCaptures(nextCaptures);
      setOrders(((ordersData ?? []) as TraceabilityOrderRow[]).map((order) => ({
        id: order.id,
        orderNumber: order.order_number,
        partNumber: order.part_number,
        partName: order.part_name,
        customerId: order.customer_id ?? '',
        clientName: order.client_name ?? '',
        assignedWorkCenter: order.assigned_work_center,
        assignedStation: order.assigned_station ?? '',
        status: order.status,
      })));
      setClients((clientsData ?? []) as ProductionOrderCustomerOptionRow[]);
      setWorkCenters(workCenterRows);
      setStations(((stationsData ?? []) as Array<{ id: string; work_center_id: string; code: string; name: string }>).map((station) => ({
        id: station.id,
        workCenterId: station.work_center_id,
        workCenterCode: workCenterCodeById.get(station.work_center_id) ?? '',
        code: station.code,
        name: station.name,
      })));
      const nextOperatorEvents = (eventsData ?? []) as TraceabilityOperatorEventRow[];
      if (silent && traceabilityLoadedRef.current) {
        nextOperatorEvents
          .filter((event) => !knownEventIdsRef.current.has(event.id))
          .forEach((event) => markCaptureAsNew(`event-${event.id}`));
      }
      knownEventIdsRef.current = new Set(nextOperatorEvents.map((event) => event.id));
      setOperatorEvents(nextOperatorEvents);
    }
    if (!silent) setLoading(false);
  }, [markCaptureAsNew, organizationId]);

  React.useEffect(() => {
    void loadTraceability();
    const syncInterval = window.setInterval(() => {
      void loadTraceability(true);
    }, 12000);

    return () => window.clearInterval(syncInterval);
  }, [loadTraceability]);

  React.useEffect(() => {
    const traceabilityChannel = supabase
      .channel(`mes-traceability-live:${organizationId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'mes_operator_terminal_traceability',
        filter: `organization_id=eq.${organizationId}`,
      }, (payload) => {
        const newCapture = payload.new as Partial<{ id: string }>;
        const captureId = typeof newCapture.id === 'string' ? newCapture.id : '';
        markCaptureAsNew(captureId);
        void loadTraceability(true);
      })
      .subscribe();
    const eventChannel = supabase
      .channel(`mes-traceability-events-live:${organizationId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'mes_operator_terminal_events',
        filter: `organization_id=eq.${organizationId}`,
      }, (payload) => {
        const newEvent = payload.new as Partial<{ id: string; event_type: string }>;
        if (newEvent.event_type && !['production-scrap', 'downtime-started', 'job-paused', 'job-started', 'job-resumed', 'manufacturing-completed', 'operation-completed', 'adjustment', 'quality-inspection-saved', 'quality-inspection-skipped', 'measurement-corrected'].includes(newEvent.event_type)) return;
        const eventId = typeof newEvent.id === 'string' ? newEvent.id : '';
        if (eventId) markCaptureAsNew(`event-${eventId}`);
        void loadTraceability(true);
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(traceabilityChannel);
      void supabase.removeChannel(eventChannel);
    };
  }, [loadTraceability, markCaptureAsNew, organizationId]);

  React.useEffect(() => {
    return () => {
      Object.values(newCaptureTimersRef.current).forEach((timerId) => window.clearTimeout(timerId));
      newCaptureTimersRef.current = {};
    };
  }, []);

  React.useEffect(() => {
    try {
      window.localStorage.setItem(traceabilityFiltersStorageKey, JSON.stringify(filters));
    } catch (error) {
      console.warn('Unable to save traceability filters', error);
    }
  }, [filters]);

  React.useEffect(() => {
    setTraceabilityPage(1);
  }, [filters, traceabilityPageSize]);

  const clientNamesByKey = new Map<string, string>();
  clients.forEach((client) => clientNamesByKey.set(
    client.id,
    client.status === 'inactive' ? `${client.customer_name} (Inactive)` : client.customer_name,
  ));
  orders.forEach((order) => {
    const clientKey = getTraceabilityClientKey(order);
    if (clientKey && order.clientName && !clientNamesByKey.has(clientKey)) clientNamesByKey.set(clientKey, order.clientName);
  });
  const clientDropdownOptions: MesOrderDropdownOption[] = [
    { value: '', label: 'All Clients' },
    ...Array.from(clientNamesByKey.entries())
      .sort((firstClient, secondClient) => firstClient[1].localeCompare(secondClient[1]))
      .map(([value, label]) => ({ value, label })),
  ];
  const selectedClientName = clients.find((client) => client.id === filters.client)?.customer_name.trim().toLowerCase() ?? '';
  const matchesClientFilter = (order: TraceabilityOrderOption) => !filters.client
    || getTraceabilityClientKey(order) === filters.client
    || Boolean(selectedClientName && !order.customerId && order.clientName.trim().toLowerCase() === selectedClientName);
  const matchingClientOrderIds = new Set(orders
    .filter(matchesClientFilter)
    .map((order) => order.id));
  const filteredCaptures = captures.filter((capture) => {
    if (!filters.showManufacturing) return false;
    const captureDate = toLocalIsoDate(capture.timestamp);
    const orderSearch = filters.orderSearch.trim().toLowerCase();
    const partSearch = filters.partSearch.trim().toLowerCase();
    const serialSearch = filters.serialSearch.trim().toLowerCase();
    const toolSearch = filters.toolSearch.trim().toLowerCase();
    return (!orderSearch || capture.productionOrder.toLowerCase().includes(orderSearch))
      && (!partSearch || capture.partNumber.toLowerCase().includes(partSearch) || capture.partName.toLowerCase().includes(partSearch) || capture.partLabel.toLowerCase().includes(partSearch))
      && (!serialSearch || capture.serialNumber.toLowerCase().includes(serialSearch))
      && (!toolSearch || capture.toolId.toLowerCase().includes(toolSearch))
      && (!filters.client || matchingClientOrderIds.has(capture.productionOrderId))
      && (!filters.workCenter || capture.workCenter === filters.workCenter)
      && (!filters.station || capture.station === filters.station)
      && (!filters.dateFrom || captureDate >= filters.dateFrom)
      && (!filters.dateTo || captureDate <= filters.dateTo)
      && (filters.shifts.length === 0 || filters.shifts.includes(capture.shift));
  });

  const setFilter = (key: Exclude<keyof typeof filters, 'shifts' | 'showEvents' | 'showManufacturing' | 'showQuality'>, value: string) => {
    setFilters((currentFilters) => ({ ...currentFilters, [key]: value }));
  };

  const toggleShiftFilter = (shift: string) => {
    setFilters((currentFilters) => ({
      ...currentFilters,
      shifts: currentFilters.shifts.includes(shift)
        ? currentFilters.shifts.filter((selectedShift) => selectedShift !== shift)
        : [...currentFilters.shifts, shift],
    }));
  };

  const setDateRangeFilter = (range: MesOrderDateRange) => {
    setFilters((currentFilters) => ({
      ...currentFilters,
      dateFrom: range.from,
      dateTo: range.to,
    }));
  };

  const stationOptions = filters.workCenter ? stations.filter((station) => station.workCenterCode === filters.workCenter) : stations;
  const workCenterDropdownOptions: MesOrderDropdownOption[] = [
    { value: '', label: 'All Work Centers' },
    ...workCenters.map((workCenter) => ({ value: workCenter.code, label: `${workCenter.code} / ${workCenter.name}` })),
  ];
  const stationDropdownOptions: MesOrderDropdownOption[] = [
    { value: '', label: 'All Stations' },
    ...stationOptions.map((station) => ({ value: station.code, label: `${station.code} / ${station.name}` })),
  ];
  const selectedContextOrders = orders.filter((order) => {
    const orderSearch = filters.orderSearch.trim().toLowerCase();
    const partSearch = filters.partSearch.trim().toLowerCase();
    return (!filters.workCenter || order.assignedWorkCenter === filters.workCenter)
      && matchesClientFilter(order)
      && (!filters.station || order.assignedStation === filters.station)
      && (!orderSearch || order.orderNumber.toLowerCase().includes(orderSearch))
      && (!partSearch || order.partNumber.toLowerCase().includes(partSearch) || order.partName.toLowerCase().includes(partSearch));
  }).slice(0, 6);
  const activeStatuses: ProductionOrderStatus[] = ['released', 'running', 'paused', 'waiting-inspection'];
  const contextOrderIds = new Set(orders.filter((order) => {
    const orderSearch = filters.orderSearch.trim().toLowerCase();
    const partSearch = filters.partSearch.trim().toLowerCase();
    return (!filters.workCenter || order.assignedWorkCenter === filters.workCenter)
      && matchesClientFilter(order)
      && (!filters.station || order.assignedStation === filters.station)
      && (!orderSearch || order.orderNumber.toLowerCase().includes(orderSearch))
      && (!partSearch || order.partNumber.toLowerCase().includes(partSearch) || order.partName.toLowerCase().includes(partSearch));
  }).map((order) => order.id));
  const filteredOperatorEvents = operatorEvents.filter((event) => {
    const orderSearch = filters.orderSearch.trim().toLowerCase();
    const partSearch = filters.partSearch.trim().toLowerCase();
    const isQualityEvent = isTraceabilityQualityEvent(event.event_type);
    const matchesRecordCategory = isQualityEvent ? filters.showQuality : filters.showEvents;
    const measurementOnlyFilterActive = Boolean(filters.serialSearch.trim() || filters.toolSearch.trim() || filters.shifts.length > 0);
    const eventDate = toLocalIsoDate(event.created_at);
    const eventOrder = event.mes_production_orders;
    const matchesOrderSearch = !orderSearch
      || (event.production_order_id ? contextOrderIds.has(event.production_order_id) : false)
      || Boolean(eventOrder?.order_number.toLowerCase().includes(orderSearch));
    const matchesPartSearch = !partSearch
      || Boolean(eventOrder && (
        eventOrder.part_number.toLowerCase().includes(partSearch)
        || eventOrder.part_name.toLowerCase().includes(partSearch)
      ));
    return matchesRecordCategory
      && (!filters.client || Boolean(event.production_order_id && matchingClientOrderIds.has(event.production_order_id)))
      && (!filters.workCenter || event.work_center_code === filters.workCenter)
      && (!filters.station || event.station_code === filters.station)
      && !measurementOnlyFilterActive
      && matchesOrderSearch
      && matchesPartSearch
      && (!filters.dateFrom || eventDate >= filters.dateFrom)
      && (!filters.dateTo || eventDate <= filters.dateTo);
  });
  const timelineItems = React.useMemo<TraceabilityTimelineItem[]>(() => ([
    ...filteredCaptures.map((capture) => ({
      kind: 'measurement' as const,
      id: capture.id,
      timestamp: capture.timestamp,
      capture,
    })),
    ...filteredOperatorEvents.map((event) => ({
      kind: 'event' as const,
      id: `event-${event.id}`,
      timestamp: event.created_at,
      event,
      tone: getTraceabilityEventTone(event.event_type),
    })),
  ].sort((firstItem, secondItem) => new Date(secondItem.timestamp).getTime() - new Date(firstItem.timestamp).getTime())), [filteredCaptures, filteredOperatorEvents]);
  const traceabilityPageCount = Math.max(1, Math.ceil(timelineItems.length / traceabilityPageSize));
  const currentTraceabilityPage = Math.min(traceabilityPage, traceabilityPageCount);
  const traceabilityPageStartIndex = (currentTraceabilityPage - 1) * traceabilityPageSize;
  const visibleTimelineItems = timelineItems.slice(traceabilityPageStartIndex, traceabilityPageStartIndex + traceabilityPageSize);
  const traceabilityPageStartLabel = timelineItems.length === 0 ? 0 : traceabilityPageStartIndex + 1;
  const traceabilityPageEndLabel = Math.min(timelineItems.length, traceabilityPageStartIndex + traceabilityPageSize);
  const canGoToPreviousTraceabilityPage = currentTraceabilityPage > 1;
  const canGoToNextTraceabilityPage = currentTraceabilityPage < traceabilityPageCount;

  React.useEffect(() => {
    if (traceabilityPage > traceabilityPageCount) {
      setTraceabilityPage(traceabilityPageCount);
    }
  }, [traceabilityPage, traceabilityPageCount]);

  const activeTraceRecords = new Set(filteredCaptures
    .filter((capture) => capture.productionOrderId && capture.orderStatus && activeStatuses.includes(capture.orderStatus))
    .map((capture) => capture.productionOrderId)).size;
  const completedPartRecords = filteredCaptures.length;
  const completedProductionOrders = new Set(filteredCaptures
    .filter((capture) => capture.productionOrderId && capture.orderStatus === 'completed')
    .map((capture) => capture.productionOrderId)).size;
  const missingDataRecords = filteredCaptures.filter((capture) => !capture.productionOrderId || !capture.serialNumber || !capture.partNumber || !capture.workCenter || !capture.station).length;
  const damageRecords = filteredCaptures.filter((capture) => capture.damageCodes.length > 0).length;
  const scrapExceptionRecords = damageRecords + filteredOperatorEvents.filter((event) => event.event_type === 'production-scrap').length;
  const downtimeExceptionRecords = filteredOperatorEvents.filter((event) => event.event_type === 'downtime-started').length;
  const pausedExceptionRecords = filteredOperatorEvents.filter((event) => event.event_type === 'job-paused').length;
  const adjustmentExceptionRecords = filteredOperatorEvents.filter((event) => event.event_type === 'adjustment').length;
  const renderTraceabilityPaginationControls = () => (
    <div className="traceability-pagination-controls" aria-label="Traceability pagination">
      <button
        type="button"
        aria-label="Previous page"
        disabled={!canGoToPreviousTraceabilityPage}
        onClick={() => setTraceabilityPage((currentPage) => Math.max(1, currentPage - 1))}
      >
        <ChevronLeft size={16} />
      </button>
      <span>
        Page <b>{currentTraceabilityPage}</b> of <b>{traceabilityPageCount}</b>
      </span>
      <button
        type="button"
        aria-label="Next page"
        disabled={!canGoToNextTraceabilityPage}
        onClick={() => setTraceabilityPage((currentPage) => Math.min(traceabilityPageCount, currentPage + 1))}
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );

  return (
    <MesWorkspaceShell
      eyebrow="MES / Traceability"
      title="Traceability"
      description="Search captured part history by production order, part, serial number, work center, station, and date range."
      onBack={() => onNavigate('/workspace/manufacturing-ops/mes')}
      className="traceability-workspace-panel"
    >
      <div className="traceability-primary-filters">
        <label>
          <span>Work center</span>
          <MesOrderDropdown
            id="traceability-work-center-filter"
            value={filters.workCenter}
            options={workCenterDropdownOptions}
            placeholder="All Work Centers"
            placement="bottom"
            onChange={(nextWorkCenter) => {
              setFilters((currentFilters) => ({
                ...currentFilters,
                workCenter: nextWorkCenter,
                station: currentFilters.station && stations.some((station) => station.code === currentFilters.station && station.workCenterCode === nextWorkCenter) ? currentFilters.station : '',
              }));
            }}
          />
        </label>
        <label>
          <span>Station</span>
          <MesOrderDropdown
            id="traceability-station-filter"
            value={filters.station}
            options={stationDropdownOptions}
            placeholder="All Stations"
            placement="bottom"
            onChange={(value) => setFilter('station', value)}
          />
        </label>
        <label>
          <span>From</span>
          <MesOrderDatePicker id="traceability-date-from" value={filters.dateFrom} placeholder="dd/mm/aaaa" onChange={(value) => setFilter('dateFrom', value)} onQuickRange={setDateRangeFilter} />
        </label>
        <label>
          <span>To</span>
          <MesOrderDatePicker id="traceability-date-to" value={filters.dateTo} placeholder="dd/mm/aaaa" onChange={(value) => setFilter('dateTo', value)} onQuickRange={setDateRangeFilter} />
        </label>
        <fieldset className="traceability-shift-filter">
          <legend>Shift</legend>
          <div>
            <button
              type="button"
              className={filters.shifts.length === 0 ? 'active' : ''}
              onClick={() => setFilters((currentFilters) => ({ ...currentFilters, shifts: [] }))}
            >
              All
            </button>
            {traceabilityShiftOptions.map((shift) => (
              <button
                type="button"
                key={shift}
                className={filters.shifts.includes(shift) ? 'active' : ''}
                onClick={() => toggleShiftFilter(shift)}
              >
                {shift}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="traceability-app-strip">
        <article>
          <span><Database size={16} /> Total Trace Records</span>
          <strong>{filteredCaptures.length}</strong>
          <em>{captures.length} loaded records</em>
        </article>
        <article>
          <span><Timer size={16} /> Active / In Progress</span>
          <strong>{activeTraceRecords}</strong>
          <em>still in production</em>
        </article>
        <article>
          <span><Check size={16} /> Completed</span>
          <div className="traceability-kpi-split traceability-completed-split">
            <strong>{completedPartRecords}<em>Parts</em></strong>
            <strong>{completedProductionOrders}<em>Production Orders</em></strong>
          </div>
        </article>
        <article>
          <span><AlertTriangle size={16} /> Exceptions</span>
          <div className="traceability-kpi-split traceability-exception-split">
            <strong>{scrapExceptionRecords}<em>Scrap / Damage</em></strong>
            <strong>{downtimeExceptionRecords}<em>Downtime</em></strong>
            <strong>{pausedExceptionRecords}<em>Paused</em></strong>
            <strong>{missingDataRecords + adjustmentExceptionRecords}<em>Missing / Adjustments</em></strong>
          </div>
        </article>
      </div>

      <div className="mes-filter-panel traceability-filter-panel">
        <label>
          Order number
          <input type="search" placeholder="Search PO-10491" value={filters.orderSearch} onChange={(event) => setFilter('orderSearch', event.target.value)} />
        </label>
        <label>
          Part / order name
          <input type="search" placeholder="Part number or name" value={filters.partSearch} onChange={(event) => setFilter('partSearch', event.target.value)} />
        </label>
        <label>
          Serial number
          <input type="search" placeholder="Type serial number" value={filters.serialSearch} onChange={(event) => setFilter('serialSearch', event.target.value)} />
        </label>
        <label>
          Tool ID
          <input type="search" placeholder="Tool, cutter, fixture" value={filters.toolSearch} onChange={(event) => setFilter('toolSearch', event.target.value)} />
        </label>
      </div>

      <div className="mes-toolbar traceability-toolbar">
        <div className="traceability-toolbar-summary">
          <span><Search size={15} /> {loading ? 'Loading records...' : `${timelineItems.length} matching records / auto-sync on`}</span>
          <label className="traceability-page-size-control">
            <span>Show</span>
            <MesOrderDropdown
              id="traceability-page-size"
              value={String(traceabilityPageSize)}
              options={traceabilityPageSizeOptions}
              placement="bottom"
              onChange={(value) => setTraceabilityPageSize(Number(value))}
            />
          </label>
          {renderTraceabilityPaginationControls()}
        </div>
        <div className="traceability-toolbar-actions">
          <div className="traceability-record-type-filters" aria-label="Traceability record types">
            <label><input type="checkbox" checked={filters.showEvents} onChange={() => setFilters((current) => ({ ...current, showEvents: !current.showEvents }))} /><span>Events</span></label>
            <label><input type="checkbox" checked={filters.showManufacturing} onChange={() => setFilters((current) => ({ ...current, showManufacturing: !current.showManufacturing }))} /><span>Manufacturing</span></label>
            <label><input type="checkbox" checked={filters.showQuality} onChange={() => setFilters((current) => ({ ...current, showQuality: !current.showQuality }))} /><span>Quality</span></label>
          </div>
          <label className="traceability-client-filter">
            <span>Client</span>
            <MesOrderDropdown
              id="traceability-client-filter"
              value={filters.client}
              options={clientDropdownOptions}
              placeholder="All Clients"
              onChange={(value) => setFilter('client', value)}
            />
          </label>
          <button type="button" onClick={() => setFilters(getClearedTraceabilityFilters())}>Clear Filters</button>
          <button type="button" onClick={() => onNavigate('/workspace/manufacturing-ops/mes/operator-terminal')}>Open Terminal</button>
        </div>
      </div>

      {errorMessage ? <div className="mes-sync-message traceability-sync-message">{errorMessage}</div> : null}

      {selectedContextOrders.length > 0 ? (
        <section className="traceability-context-orders" aria-label="Production orders matching traceability context">
          <div>
            <span>Context orders</span>
            <strong>{selectedContextOrders.length} matching production orders</strong>
          </div>
          <div className="traceability-context-order-list">
            {selectedContextOrders.map((order) => (
              <button
                type="button"
                key={order.id}
                className="traceability-context-order-card"
                onClick={() => {
                  setFilters((currentFilters) => ({
                    ...currentFilters,
                    orderSearch: order.orderNumber,
                    partSearch: order.partNumber || order.partName,
                    workCenter: order.assignedWorkCenter,
                    station: order.assignedStation,
                  }));
                }}
              >
                <div>
                  <strong>{order.orderNumber}</strong>
                  <span>{order.partNumber} / {order.partName}</span>
                  <em>{order.assignedWorkCenter || 'No work center'} / {order.assignedStation || 'No station'}</em>
                </div>
                <MesStatusBadge value={order.status} tone="status" />
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <div className="mes-event-timeline traceability-capture-list">
        {!loading && timelineItems.length === 0 ? (
          <div className="traceability-empty-state">
            <Database size={28} />
            <strong>No traceability records found</strong>
            <span>Use Operator Terminal to save sharpening traceability; auto-sync will update this page.</span>
          </div>
        ) : null}
        {visibleTimelineItems.map((item) => {
          if (item.kind === 'event') {
            const event = item.event;
            const order = event.mes_production_orders;
            const eventClientName = order?.client_name ?? '';
            const eventLabel = getTraceabilityEventLabel(event.event_type);
            const payloadComment = event.payload && typeof event.payload.comment === 'string' ? event.payload.comment : '';
            const comment = event.comment || payloadComment;
            const qualityInspections = getTraceabilityQualityInspections(event);
            const qualityDocumentCount = getTraceabilityQualityDocumentCount(event);
            const correctionComparison = event.event_type === 'measurement-corrected' ? getTraceabilityCorrectionComparison(event) : null;
            const isQualityEvent = isTraceabilityQualityEvent(event.event_type);
            const showEventQuantity = !isQualityEvent && event.event_type !== 'measurement-corrected';
            const qualityStatusConfig = {
              ok: { label: 'OK', icon: CheckCircle2 },
              approach: { label: 'Approach', icon: AlertTriangle },
              nok: { label: 'NOK', icon: CircleX },
              pending: { label: 'Pending', icon: Minus },
              skipped: { label: 'Skipped', icon: Minus },
            } as const;
            return (
              <article
                className={['mes-event-row traceability-event-row', `event-tone-${item.tone}`, newCaptureIds.has(item.id) ? 'new-capture' : ''].filter(Boolean).join(' ')}
                key={item.id}
              >
                <span className="mes-event-marker">{renderTraceabilityEventIcon(event.event_type)}</span>
                <div>
                  <div className="mes-event-heading traceability-event-heading">
                    <div className="traceability-event-title">
                      <span>Event record</span>
                      <strong>{eventLabel}</strong>
                      {event.event_type !== 'quality-inspection-saved' ? <p>{getTraceabilityEventSummary(event)}</p> : null}
                    </div>
                    {renderTraceabilityCaptureTime(event.created_at, getTraceabilityEventShift(event))}
                  </div>
                  <div className="traceability-event-detail-grid">
                    <span><b>Order Number</b>{order?.order_number ?? 'Unassigned order'}</span>
                    <span><b>Part Name</b>{order?.part_name ?? 'N/A'}</span>
                    <span><b>Client</b>{eventClientName || 'Unassigned client'}</span>
                    {showEventQuantity ? <span><b>Quantity</b>{event.quantity || 'N/A'}</span> : null}
                  </div>
                  <div className="mes-event-meta traceability-capture-meta">
                    <span><Factory size={15} /><b>Work Center</b>{event.work_center_code || 'No work center'}</span>
                    <span><RadioTower size={15} /><b>Station</b>{event.station_code || 'No station'}</span>
                    {!isQualityEvent ? <span><AlertTriangle size={15} /><b>Reason</b>{event.reason || 'No reason entered'}</span> : null}
                    {!isQualityEvent ? <span><Activity size={15} /><b>Status</b>{order?.status ? formatTraceabilityStatus(order.status) : 'Unknown'}</span> : null}
                  </div>
                  {isQualityEvent ? (
                    <div className="traceability-quality-summary">
                      {qualityInspections.length ? (
                        <div className="traceability-quality-inspection-list">
                          {qualityInspections.map((inspection) => {
                            const StatusIcon = qualityStatusConfig[inspection.status].icon;
                            return (
                              <span className={`traceability-quality-inspection ${inspection.status}`} key={inspection.inspection}>
                                <b>{inspection.inspection}</b>
                                <em><StatusIcon size={18} />{qualityStatusConfig[inspection.status].label}</em>
                              </span>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {correctionComparison ? (
                    <div className="traceability-correction-comparison">
                      <section>
                        <b>Previous</b>
                        <div>
                          {correctionComparison.previous.map((measurement) => (
                            <span key={measurement.label}><small>{measurement.label}</small>{measurement.value}</span>
                          ))}
                        </div>
                      </section>
                      <section>
                        <b>Corrected</b>
                        <div>
                          {correctionComparison.corrected.map((measurement) => (
                            <span key={measurement.label}><small>{measurement.label}</small>{measurement.value}</span>
                          ))}
                        </div>
                      </section>
                    </div>
                  ) : null}
                  {comment ? (
                    <p className="traceability-event-comment">{comment}</p>
                  ) : null}
                  <div className="traceability-tags traceability-event-tags">
                    <span>{eventLabel}</span>
                    {event.reason ? <span>{event.reason}</span> : null}
                    {qualityDocumentCount > 0 ? <span className="traceability-quality-document-tag"><FileText size={14} />{qualityDocumentCount === 1 ? '1 inspection document attached' : `${qualityDocumentCount} inspection documents attached`}</span> : null}
                    {comment ? <span>Comment added</span> : null}
                  </div>
                </div>
              </article>
            );
          }

          const capture = item.capture;
          const measureDisplays = getTraceabilityMeasureDisplays(capture);
          return (
            <article
              className={['mes-event-row traceability-capture-row', newCaptureIds.has(item.id) ? 'new-capture' : ''].filter(Boolean).join(' ')}
              key={item.id}
            >
              <span className="mes-event-marker"><Ruler size={19} strokeWidth={2.6} /></span>
              <div>
                <div className="mes-event-heading traceability-capture-heading">
                  <div className="traceability-capture-title-grid">
                    <span><b>Record Type:</b> Measurement record</span>
                    <span><b>Order Number:</b> {capture.productionOrder}</span>
                    <span><b>Client:</b> {capture.clientName || 'Unassigned client'}</span>
                    {renderTraceabilityCaptureTime(capture.timestamp, capture.shift)}
                  </div>
                </div>
                <div className={['traceability-measure-grid', `template-${capture.templateId || 'default'}`].join(' ')}>
                  {measureDisplays.map((measurement) => (
                    <span key={measurement.label}><b>{measurement.label}</b>{measurement.value}</span>
                  ))}
                </div>
                <div className="mes-event-meta traceability-capture-meta">
                  <span><Factory size={15} /><b>Work Center</b>{capture.workCenter || 'No work center'}</span>
                  <span><RadioTower size={15} /><b>Station</b>{capture.stationName || capture.station || 'No station'}</span>
                  <span><Eye size={15} /><b>Serial</b>{capture.serialNumber || 'No serial'}</span>
                  <span><Activity size={15} /><b>Progress</b>{capture.completionPercent}%{capture.pieceSequence ? ` (${capture.pieceSequence}/${capture.plannedQuantity || 'N/A'})` : ''}</span>
                </div>
                <div className="traceability-tags">
                  <span>{formatLabel(capture.templateId)}</span>
                  {capture.partLabel ? <span>{capture.partLabel}</span> : null}
                  {capture.toolId ? <span>Tool {capture.toolId}</span> : null}
                  <span className={`status status-${capture.statusAtCapture || 'unknown'}`}>Status {formatTraceabilityStatus(capture.statusAtCapture)}</span>
                  {capture.damageCodes.length ? capture.damageCodes.map((code) => <span className="danger" key={code}>{formatLabel(code)}</span>) : <span className="success">No damage noted</span>}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {timelineItems.length > 0 ? (
        <div className="traceability-pagination-footer">
          <span>Showing {traceabilityPageStartLabel}-{traceabilityPageEndLabel} of {timelineItems.length} records</span>
          {renderTraceabilityPaginationControls()}
        </div>
      ) : null}
    </MesWorkspaceShell>
  );
}
