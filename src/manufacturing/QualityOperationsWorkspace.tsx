import React from 'react';
import { createPortal } from 'react-dom';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import {
  AlertTriangle,
  ArrowLeft,
  Award,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleX,
  ClipboardCheck,
  Download,
  FileText,
  FolderCheck,
  PackageCheck,
  Minus,
  Plus,
  Upload,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { mockProductionOrders } from './mesMockData';
import { qualityInspectionsByPieceType, qualityPieceTypes } from './qualityInspectionConfig';
import type { ProductionOrder, ProductionOrderPriority, ProductionOrderStatus, QualityCheckLimit, QualityMeasurementUnit, QualityPieceType } from './mesTypes';

export type QualityContextTab =
  | 'dashboard'
  | 'inspections'
  | 'quality-plans'
  | 'specifications'
  | 'certificates-docs'
  | 'ncrs'
  | 'holds-releases';

type QualityOperationsWorkspaceProps = {
  onNavigate: (path: string) => void;
  activeTab: QualityContextTab;
  organizationId: string;
  organizationName?: string;
  organizationLogoUrl?: string;
};

type QualitySelectionState = {
  orderId: string;
  serial: string;
};

const getQualitySelectionStorageKey = (organizationId: string) => `yvimo:mes:quality-selection:${organizationId}`;

function readQualitySelection(organizationId: string): QualitySelectionState | null {
  if (typeof window === 'undefined') return null;
  try {
    const storedValue = window.sessionStorage.getItem(getQualitySelectionStorageKey(organizationId));
    return storedValue ? JSON.parse(storedValue) as QualitySelectionState : null;
  } catch {
    return null;
  }
}

function writeQualitySelection(organizationId: string, selection: QualitySelectionState) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(getQualitySelectionStorageKey(organizationId), JSON.stringify(selection));
}

type QualityPageConfig = {
  eyebrow: string;
  title: string;
  description: string;
  actionLabel: string;
  fields: string[];
  plannedOptions?: Array<{ title: string; values: string[] }>;
};

const qualityKpis = [
  { label: 'Pending Inspections', value: 0, helper: 'waiting for quality review' },
  { label: 'OK Results', value: 0, helper: 'within specification' },
  { label: 'NOK Results', value: 0, helper: 'out of specification' },
  { label: 'Orders on Hold', value: 0, helper: 'blocked by quality' },
  { label: 'Missing Certificates', value: 0, helper: 'required quality docs' },
  { label: 'Released Orders', value: 0, helper: 'cleared by quality' },
];

const qualityDashboardPanels = [
  { title: 'Waiting for Inspection', icon: ClipboardCheck },
  { title: 'Quality Hold', icon: ShieldCheck },
  { title: 'Missing Docs', icon: FileText },
  { title: 'Recent NCRs', icon: AlertTriangle },
];

type QualityDashboardDateRange = { from: string; to: string };

type QualityCalendarPosition = { top: number; left: number; width: number };

type QualityQuickRangeValue = 'today' | 'week' | 'month' | 'year';

function toQualityIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getQualityTodayIsoDate() {
  return toQualityIsoDate(new Date());
}

function formatQualityDateInputLabel(value: string) {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${month}/${day}/${year}`;
}

function getQualityMonthDates(displayDate: Date) {
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

function getQualityQuickRange(range: QualityQuickRangeValue): QualityDashboardDateRange {
  const today = new Date();
  const startDate = new Date(today);
  const endDate = new Date(today);

  if (range === 'week') {
    startDate.setDate(today.getDate() - today.getDay());
  }
  if (range === 'month') {
    startDate.setDate(1);
  }
  if (range === 'year') {
    startDate.setMonth(0, 1);
  }

  return { from: toQualityIsoDate(startDate), to: toQualityIsoDate(endDate) };
}

function isQualityDateInRange(value: string, range: QualityDashboardDateRange) {
  const isoDate = value.includes('T') ? toQualityIsoDate(new Date(value)) : value;
  if (!isoDate) return false;
  return (!range.from || isoDate >= range.from) && (!range.to || isoDate <= range.to);
}

function isQualityDateOnOrBefore(value: string, date: string) {
  const isoDate = value.includes('T') ? toQualityIsoDate(new Date(value)) : value;
  return Boolean(isoDate) && (!date || isoDate <= date);
}

function QualityDatePicker({ id, value, placeholder = 'Select date', onChange, onQuickRange }: {
  id: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  onQuickRange?: (range: QualityDashboardDateRange) => void;
}) {
  const selectedDate = React.useMemo(() => value ? new Date(`${value}T12:00:00`) : new Date(), [value]);
  const [open, setOpen] = React.useState(false);
  const [displayDate, setDisplayDate] = React.useState(selectedDate);
  const [calendarPosition, setCalendarPosition] = React.useState<QualityCalendarPosition | null>(null);
  const triggerRef = React.useRef<HTMLDivElement | null>(null);
  const calendarRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => { setDisplayDate(selectedDate); }, [selectedDate]);

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

  const calendarDates = getQualityMonthDates(displayDate);
  const selectedIsoDate = value ? toQualityIsoDate(selectedDate) : '';
  const todayIsoDate = getQualityTodayIsoDate();
  const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(displayDate);
  const calendar = open && calendarPosition
    ? createPortal(
      <div className="mes-order-calendar" id={`${id}-calendar`} ref={calendarRef} style={{ top: calendarPosition.top, left: calendarPosition.left, width: calendarPosition.width }}>
        <div className="mes-order-calendar-header">
          <button type="button" onClick={() => setDisplayDate((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))} aria-label="Previous month"><ChevronLeft size={16} /></button>
          <strong>{monthLabel}</strong>
          <button type="button" onClick={() => setDisplayDate((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))} aria-label="Next month"><ChevronRight size={16} /></button>
        </div>
        <div className="mes-order-calendar-weekdays" aria-hidden="true">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day}>{day}</span>)}
        </div>
        <div className="mes-order-calendar-grid">
          {calendarDates.map((date) => {
            const isoDate = toQualityIsoDate(date);
            const outsideMonth = date.getMonth() !== displayDate.getMonth();
            return (
              <button className={[outsideMonth ? 'outside-month' : '', isoDate === selectedIsoDate ? 'selected' : '', isoDate === todayIsoDate ? 'today' : ''].filter(Boolean).join(' ')} type="button" key={isoDate} onClick={() => { onChange(isoDate); setOpen(false); }}>
                {date.getDate()}
              </button>
            );
          })}
        </div>
        <div className="mes-order-calendar-shortcuts">
          {([
            { value: 'today', label: 'Today' },
            { value: 'week', label: 'This week' },
            { value: 'month', label: 'This month' },
            { value: 'year', label: 'This year' },
          ] as Array<{ value: QualityQuickRangeValue; label: string }>).map((shortcut) => (
            <button type="button" key={shortcut.value} onClick={() => { const range = getQualityQuickRange(shortcut.value); setDisplayDate(new Date(`${range.from}T12:00:00`)); if (onQuickRange) onQuickRange(range); else onChange(range.from); setOpen(false); }}>
              {shortcut.label}
            </button>
          ))}
        </div>
      </div>,
      document.body,
    )
    : null;

  return (
    <div className={['mes-order-date-picker', open ? 'open' : ''].filter(Boolean).join(' ')} ref={triggerRef}>
      <button className={!value ? 'placeholder' : ''} type="button" aria-expanded={open} aria-controls={`${id}-calendar`} onClick={() => setOpen((current) => !current)}>
        <span>{value ? formatQualityDateInputLabel(value) : placeholder}</span>
        <CalendarDays size={16} />
      </button>
      {calendar}
    </div>
  );
}

function QualityDashboardDateFilters({ range, onChange }: { range: QualityDashboardDateRange; onChange: (range: QualityDashboardDateRange) => void }) {
  const setDateRange = (nextRange: QualityDashboardDateRange) => onChange(nextRange.from > nextRange.to ? { from: nextRange.to, to: nextRange.from } : nextRange);

  return (
    <div className="quality-dashboard-date-filters" aria-label="Quality dashboard date filters">
      <label><span>From</span><QualityDatePicker id="quality-dashboard-date-from" value={range.from} onChange={(from) => setDateRange({ ...range, from })} onQuickRange={setDateRange} /></label>
      <label><span>To</span><QualityDatePicker id="quality-dashboard-date-to" value={range.to} onChange={(to) => setDateRange({ ...range, to })} onQuickRange={setDateRange} /></label>
    </div>
  );
}


type QualityInspectionResult = 'ok' | 'nok' | 'approach';

type QualityMeasurementRecord = {
  id: string;
  production_order_id: string;
  serial_number: string;
  inspection_name: string;
  measured_value: number;
  lower_limit: number | null;
  upper_limit: number | null;
  result: QualityInspectionResult;
  measured_at: string;
};

type QualityInspectionDocument = {
  id: string;
  production_order_id: string;
  serial_number: string;
  inspection_name: string | null;
  file_name: string;
  file_path: string;
  file_type: string;
  uploaded_at: string;
};

type QualityDocumentPreview = {
  fileName: string;
  fileUrl: string;
};

type QualitySerialInspectionRecord = {
  id: string;
  production_order_id: string;
  serial_number: string;
  result: QualityInspectionResult;
  inspected_at: string;
};

type QualityProductionSerialRecord = {
  id: string;
  production_order_id: string;
  serial_number: string;
  piece_sequence: number;
  result: 'good' | 'scrap' | null;
  ready_for_quality: boolean;
  reported_at: string | null;
};

const qualityDocumentsBucket = 'mes-quality-inspection-documents';
const getQualityDocumentPreviewUrl = (fileUrl: string) => `${fileUrl}#toolbar=1&navpanes=0&scrollbar=1&view=FitH`;
const qualityMeasurementUnitOptions: Array<{ value: QualityMeasurementUnit; label: string; symbol: string }> = [
  { value: 'microns', label: 'Microns (mm)', symbol: 'mm' },
  { value: 'tenths', label: 'Tenths (in)', symbol: 'in' },
];

function getQualityMeasurementUnit(order: ProductionOrder) {
  return order.qualityMeasurementUnit ?? 'microns';
}

function getQualityMeasurementUnitSymbol(order: ProductionOrder) {
  return qualityMeasurementUnitOptions.find((option) => option.value === getQualityMeasurementUnit(order))?.symbol ?? 'mm';
}

function isQualityCheckEnabledOrder(order: ProductionOrder) {
  return order.qualityChecksEnabled === true;
}
type QualityProductionOrderRow = {
  id: string;
  order_number: string;
  part_number: string;
  part_name: string;
  client_name?: string | null;
  planned_quantity: number;
  completed_quantity: number;
  scrap_quantity: number;
  status: ProductionOrderStatus;
  priority: ProductionOrderPriority;
  due_date: string;
  assigned_work_center: string;
  planned_shifts?: string[] | null;
  manufacturing_type?: ProductionOrder['manufacturingType'] | null;
  production_flow?: string | null;
  assigned_station?: string | null;
  piece_type?: QualityPieceType | null;
  quality_checks_enabled?: boolean | null;
  quality_checks?: string[] | null;
  quality_check_limits?: Record<string, QualityCheckLimit> | null;
  quality_measurement_unit?: QualityMeasurementUnit | null;
};

const qualityDemoOrders: ProductionOrder[] = mockProductionOrders.map((order, index) => {
  const pieceType = qualityPieceTypes[index % qualityPieceTypes.length];
  return {
    ...order,
    pieceType,
    qualityChecksEnabled: true,
    qualityChecks: qualityInspectionsByPieceType[pieceType],
    qualityCheckLimits: Object.fromEntries(qualityInspectionsByPieceType[pieceType].map((inspection, inspectionIndex) => [
      inspection,
      { lowerLimit: inspectionIndex + 1, upperLimit: inspectionIndex + 5 },
    ])),
    qualityMeasurementUnit: 'microns',
  };
});

function mapQualityProductionOrder(row: QualityProductionOrderRow): ProductionOrder {
  return {
    id: row.id,
    orderNumber: row.order_number,
    partNumber: row.part_number,
    partName: row.part_name,
    clientName: row.client_name ?? '',
    plannedQuantity: row.planned_quantity,
    completedQuantity: row.completed_quantity,
    scrapQuantity: row.scrap_quantity,
    status: row.status,
    priority: row.priority,
    dueDate: row.due_date,
    assignedWorkCenter: row.assigned_work_center,
    plannedShifts: row.planned_shifts ?? [],
    manufacturingType: row.manufacturing_type ?? 'multi-step',
    productionFlow: row.production_flow ?? '',
    assignedStation: row.assigned_station ?? '',
    pieceType: row.piece_type ?? 'hobs',
    qualityChecksEnabled: row.quality_checks_enabled ?? false,
    qualityChecks: row.quality_checks ?? [],
    qualityCheckLimits: row.quality_check_limits ?? {},
    qualityMeasurementUnit: row.quality_measurement_unit ?? 'microns',
  };
}

const qualityPageConfig: Record<Exclude<QualityContextTab, 'dashboard'>, QualityPageConfig> = {
  inspections: {
    eyebrow: 'MES / QUALITY / INSPECTIONS',
    title: 'Inspections',
    description: 'Capture measurements, review OK/NOK results, and manage inspection records.',
    actionLabel: 'New Inspection',
    fields: [
      'Inspection ID',
      'Production Order',
      'Part Number',
      'Process / Operation',
      'Work Center',
      'Inspector',
      'Inspection Type',
      'Status',
      'Overall Result',
      'Date',
      'Attachments',
    ],
    plannedOptions: [
      {
        title: 'Inspection types',
        values: [
          'First Piece Inspection',
          'In-Process Inspection',
          'Final Inspection',
          'Receiving Inspection',
          'Rework Inspection',
          'Audit Inspection',
        ],
      },
      {
        title: 'Statuses',
        values: ['Draft', 'Pending', 'In Progress', 'Completed', 'Cancelled'],
      },
      {
        title: 'Overall results',
        values: ['Pending', 'OK', 'NOK', 'On Hold', 'Released', 'Rejected', 'Deviation Approved'],
      },
    ],
  },
  'quality-plans': {
    eyebrow: 'MES / QUALITY / QUALITY PLANS',
    title: 'Quality Plans',
    description: 'Define reusable inspection templates by part, process, operation, or work center.',
    actionLabel: 'Add Quality Plan',
    fields: [
      'Plan Name',
      'Description',
      'Part Number',
      'Process Type',
      'Work Center',
      'Required Inspections',
      'Required Features',
      'Certificate Required',
      'Active / Inactive',
      'Created By',
      'Last Updated',
    ],
    plannedOptions: [
      {
        title: 'Reusable checks',
        values: [
          'OD Diameter',
          'ID / Bore Diameter',
          'Face Width',
          'Runout',
          'Surface Finish',
          'Visual Inspection',
          'Material Certificate',
          'Final Certificate of Conformance',
        ],
      },
    ],
  },
  specifications: {
    eyebrow: 'MES / QUALITY / SPECIFICATIONS',
    title: 'Specifications',
    description: 'Manage process tolerances, inspection features, and OK/NOK criteria.',
    actionLabel: 'Add Specification',
    fields: [
      'Feature',
      'Nominal',
      'Min',
      'Max',
      'Unit',
      'Method',
      'Instrument',
      'Critical',
      'Status',
    ],
    plannedOptions: [
      {
        title: 'Feature types',
        values: ['Numeric', 'Boolean', 'Pass/Fail', 'Text', 'File Required', 'Checklist'],
      },
      {
        title: 'Non-numeric checks',
        values: [
          'Visual inspection: Pass / Fail',
          'Certificate present: Yes / No',
          'Surface condition: Accept / Reject',
          'Thread quality: OK / NOK',
        ],
      },
    ],
  },
  'certificates-docs': {
    eyebrow: 'MES / QUALITY / CERTIFICATES & DOCS',
    title: 'Certificates & Docs',
    description: 'Review completed inspections, measurement evidence, attached files, and issued quality certificates.',
    actionLabel: 'Upload Document',
    fields: [
      'Document Name',
      'Document Type',
      'Production Order',
      'Inspection',
      'Part Number',
      'Lot / Batch / Serial',
      'Uploaded By',
      'Uploaded Date',
      'Status',
      'Approved By',
      'Approved Date',
    ],
    plannedOptions: [
      {
        title: 'Document types',
        values: [
          'Certificate of Conformance',
          'Dimensional Report',
          'CMM Report',
          'Material Certificate',
          'Calibration Certificate',
          'Inspection Photos',
          'Gauge Readings',
          'Customer Quality Document',
          'Deviation Approval',
          'Rework Approval',
          'NCR Attachment',
          'Final Quality Release',
        ],
      },
      {
        title: 'Statuses',
        values: ['Pending Review', 'Approved', 'Rejected', 'Expired', 'Superseded'],
      },
      {
        title: 'Linked entities',
        values: ['Production Order', 'Inspection', 'Part Number', 'Lot / Batch / Serial', 'Customer', 'Supplier'],
      },
    ],
  },
  ncrs: {
    eyebrow: 'MES / QUALITY / NCRs',
    title: 'NCRs',
    description: 'Track non-conformance reports, defect disposition, rework, scrap, and deviations.',
    actionLabel: 'New NCR',
    fields: [
      'NCR Number',
      'Production Order',
      'Inspection',
      'Part Number',
      'Lot / Batch / Serial',
      'Defect Type',
      'Description',
      'Quantity Affected',
      'Severity',
      'Disposition',
      'Assigned To',
      'Status',
      'Created By',
      'Created Date',
      'Closed By',
      'Closed Date',
    ],
    plannedOptions: [
      {
        title: 'Disposition options',
        values: ['Rework', 'Repair', 'Scrap', 'Use As Is', 'Retun to Supplier', 'Customer Deviation Required', 'Engineering Review'],
      },
      {
        title: 'Statuses',
        values: ['Open', 'In Review', 'Waiting Disposition', 'Rework In Progress', 'Closed', 'Cancelled'],
      },
    ],
  },
  'holds-releases': {
    eyebrow: 'MES / QUALITY / HOLDS & RELEASES',
    title: 'Holds & Releases',
    description: 'Manage quality holds, blocked orders, missing inspections, and final quality releases.',
    actionLabel: 'Add Quality Hold',
    fields: [
      'Hold ID',
      'Production Order',
      'Inspection',
      'Hold Reason',
      'Hold Status',
      'Notes',
      'Created By',
      'Created Date',
      'Released By',
      'Released Date',
    ],
    plannedOptions: [
      {
        title: 'Hold reasons',
        values: [
          'NOK Result',
          'Missing Certificate',
          'Pending Inspection',
          'Customer Approval Required',
          'Drawing Mismatch',
          'Material Certificate Missing',
          'Suspected Process Issue',
          'Calibration Expired',
          'Supplier Issue',
        ],
      },
      {
        title: 'Hold statuses',
        values: ['Active', 'Released', 'Cancelled'],
      },
      {
        title: 'Prepared workflow rules',
        values: ['Block shipment while active', 'Block missing final inspection', 'Block missing required certificates', 'Require authorized release'],
      },
    ],
  },
};

type QualityDashboardKpi = typeof qualityKpis[number];

type QualityDashboardQueueItem = {
  id: string;
  title: string;
  meta: string;
  detail: string;
  inspections?: string[];
  status: string;
  tone?: 'ok' | 'nok' | 'approach' | 'pending';
};

function getQualityKpiTone(kpi: QualityDashboardKpi) {
  if (kpi.value === 0) return 'neutral';
  if (kpi.label === 'NOK Results') return 'red';
  if (kpi.label === 'OK Results') return 'green';
  if (['Pending Inspections', 'Orders on Hold', 'Missing Certificates'].includes(kpi.label)) return 'yellow';
  return 'neutral';
}

function getQualityDashboardData(orders: ProductionOrder[], measurements: QualityMeasurementRecord[], documents: QualityInspectionDocument[], inspectedSerials: QualitySerialInspectionRecord[], productionSerials: QualityProductionSerialRecord[]) {
  const qualityOrders = orders.filter((order) => order.qualityChecksEnabled && (order.qualityChecks?.length ?? 0) > 0);
  const inspectedKeys = new Set(inspectedSerials.map((record) => `${record.production_order_id}::${record.serial_number}`));
  const documentOrderIds = new Set(documents.map((document) => document.production_order_id));
  const pendingSerials = qualityOrders.flatMap((order) => getQualityOrderSerials(order, productionSerials)
    .filter((serial) => !inspectedKeys.has(`${order.id}::${serial}`))
    .map((serial) => ({ order, serial })));
  const holdSerials = inspectedSerials
    .filter((record) => record.result === 'nok')
    .flatMap((record) => {
      const order = orders.find((candidate) => candidate.id === record.production_order_id);
      return order ? [{ order, record }] : [];
    });
  const missingDocOrders = qualityOrders.filter((order) => getQualityOrderSerials(order, productionSerials).length > 0 && !documentOrderIds.has(order.id));
  const recentNokMeasurements = measurements
    .filter((measurement) => measurement.result === 'nok')
    .sort((first, second) => new Date(second.measured_at).getTime() - new Date(first.measured_at).getTime())
    .flatMap((measurement) => {
      const order = orders.find((candidate) => candidate.id === measurement.production_order_id);
      return order ? [{ order, measurement }] : [];
    });

  const recentNcrItems = recentNokMeasurements.reduce<QualityDashboardQueueItem[]>((items, { order, measurement }) => {
    const id = `${order.id}-${measurement.serial_number}`;
    const inspectionName = measurement.inspection_name ?? 'Unknown inspection';
    const existingItem = items.find((item) => item.id === id);

    if (existingItem) {
      if (!existingItem.inspections?.includes(inspectionName)) existingItem.inspections?.push(inspectionName);
      return items;
    }

    items.push({
      id,
      title: order.orderNumber,
      meta: measurement.serial_number,
      detail: inspectionName,
      inspections: [inspectionName],
      status: 'NOK',
      tone: 'nok',
    });
    return items;
  }, []).slice(0, 12);

  const kpis: QualityDashboardKpi[] = [
    { label: 'Pending Inspections', value: pendingSerials.length, helper: 'waiting for quality review' },
    { label: 'OK Results', value: measurements.filter((measurement) => measurement.result === 'ok').length, helper: 'within specification' },
    { label: 'NOK Results', value: measurements.filter((measurement) => measurement.result === 'nok').length, helper: 'out of specification' },
    { label: 'Orders on Hold', value: new Set(holdSerials.map(({ order }) => order.id)).size, helper: 'blocked by quality' },
    { label: 'Missing Certificates', value: missingDocOrders.length, helper: 'required quality docs' },
    { label: 'Released Orders', value: inspectedSerials.filter((record) => record.result !== 'nok').length, helper: 'cleared by quality' },
  ];

  const queues: Record<string, QualityDashboardQueueItem[]> = {
    'Waiting for Inspection': pendingSerials.slice(0, 12).map(({ order, serial }) => ({
      id: `${order.id}-${serial}`,
      title: order.orderNumber,
      meta: serial,
      detail: `${order.partName} / ${order.partNumber}`,
      status: 'Pending',
      tone: 'pending',
    })),
    'Quality Hold': holdSerials.slice(0, 12).map(({ order, record }) => ({
      id: record.id,
      title: order.orderNumber,
      meta: record.serial_number,
      detail: `${order.partName} / ${order.partNumber}`,
      status: 'NOK',
      tone: 'nok',
    })),
    'Missing Docs': missingDocOrders.slice(0, 12).map((order) => ({
      id: order.id,
      title: order.orderNumber,
      meta: order.partNumber,
      detail: order.partName,
      status: 'Missing docs',
      tone: 'pending',
    })),
    'Recent NCRs': recentNcrItems,
  };

  return { kpis, queues };
}

function QualityDashboard({ orders, measurements, documents, inspectedSerials, productionSerials }: {
  orders: ProductionOrder[];
  measurements: QualityMeasurementRecord[];
  documents: QualityInspectionDocument[];
  inspectedSerials: QualitySerialInspectionRecord[];
  productionSerials: QualityProductionSerialRecord[];
}) {
  const { kpis, queues } = getQualityDashboardData(orders, measurements, documents, inspectedSerials, productionSerials);

  return (
    <>
      <section className="quality-kpi-grid" aria-label="Quality KPI summary">
        {kpis.map((kpi) => (
          <article key={kpi.label} className={'quality-kpi-' + getQualityKpiTone(kpi)}>
            <span>{kpi.label}</span>
            <strong>{kpi.value.toLocaleString()}</strong>
            <em>{kpi.helper}</em>
          </article>
        ))}
      </section>

      <section className="quality-dashboard-tray" aria-label="Quality operational queues">
        <div className="quality-dashboard-panel-grid">
          {qualityDashboardPanels.map((panel) => {
            const Icon = panel.icon;
            const items = queues[panel.title] ?? [];
            const visibleItems = items.slice(0, 7);
            const hiddenItemCount = Math.max(items.length - visibleItems.length, 0);
            return (
              <article key={panel.title}>
                <div>
                  <Icon size={18} />
                  <strong>{panel.title}</strong>
                </div>
                {items.length ? (
                  <div className="quality-dashboard-record-list">
                    {visibleItems.map((item, index) => (
                      <div className={`quality-dashboard-record ${index === 0 ? 'featured' : 'stacked'} ${item.tone ?? 'pending'}`} key={item.id}>
                        <strong><i className="quality-dashboard-field-label"><ClipboardCheck size={13} />Order name:</i>{item.title}</strong>
                        <span><i className="quality-dashboard-field-label"><PackageCheck size={13} />{panel.title === 'Missing Docs' ? 'Part number:' : 'Serial:'}</i>{item.meta}</span>
                        {panel.title === 'Recent NCRs' ? (
                          <div className="quality-dashboard-ncr-inspections">
                            {(item.inspections ?? [item.detail]).map((inspection) => (
                              <div className="quality-dashboard-ncr-inspection" key={inspection}>
                                <p>{inspection}</p>
                                <p><CircleX size={15} />NOK</p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <em><i className="quality-dashboard-field-label">{panel.title === 'Missing Docs' ? <FileText size={13} /> : <PackageCheck size={13} />}{panel.title === 'Missing Docs' ? 'Part name:' : 'Part:'}</i>{item.detail}</em>
                        )}
                        {panel.title !== 'Recent NCRs' ? <b>{item.status}</b> : null}
                      </div>
                    ))}
                    {hiddenItemCount > 0 ? <div className="quality-dashboard-more">+{hiddenItemCount} Items</div> : null}
                  </div>
                ) : (
                  <p>No records</p>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}


function formatQualityDate(dateValue: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: '2-digit', year: 'numeric' }).format(new Date(dateValue));
}

const qualityOrderClients = ['Apex Motion Systems', 'Northstar Industrial', 'Vanguard Controls', 'Summit Automation'];

function getQualityOrderClient(order: ProductionOrder) {
  if (order.clientName?.trim()) return order.clientName;
  const orderIndex = mockProductionOrders.findIndex((candidate) => candidate.id === order.id);
  if (orderIndex < 0) return 'Not specified';
  return qualityOrderClients[orderIndex % qualityOrderClients.length];
}

function getQualityOrderSerials(order: ProductionOrder, productionSerials: QualityProductionSerialRecord[]) {
  return productionSerials
    .filter((record) => record.production_order_id === order.id && record.result === 'good' && record.ready_for_quality)
    .sort((first, second) => first.piece_sequence - second.piece_sequence)
    .map((record) => record.serial_number);
}


function getQualityInspectedQuantity(order: ProductionOrder) {
  return mockProductionOrders.some((demoOrder) => demoOrder.id === order.id) ? order.completedQuantity : 0;
}

function QualityInspectionCounter({ inspected, required }: { inspected: number; required: number }) {
  const remaining = Math.max(required - inspected, 0);
  return (
    <aside className="quality-inspection-counter" aria-label={`${inspected} of ${required} pieces inspected`}>
      <span>Inspected</span>
      <div><strong>{inspected.toLocaleString()}</strong><b>of {required.toLocaleString()}</b></div>
      <em>{remaining.toLocaleString()} left</em>
    </aside>
  );
}

function QualityOrderSelector({ order, selectedSerial, onOpenOrder, onOpenSerial }: {
  order: ProductionOrder;
  selectedSerial: string;
  onOpenOrder: () => void;
  onOpenSerial: () => void;
}) {
  return (
    <section className="quality-active-order-panel" aria-label="Selected production order for inspection">
      <div className="quality-active-order-heading"><ClipboardCheck size={16} /><strong>Selected Work Order</strong></div>
      <div className="quality-active-order-card">
        <button type="button" onClick={onOpenOrder}><em>Order Number</em><strong>{order.orderNumber}</strong></button>
        <span><em>Part Name</em><strong>{order.partName}</strong></span>
        <span><em>Part Number</em><strong>{order.partNumber}</strong></span>
        <span><em>Due Date</em><strong>{formatQualityDate(order.dueDate)}</strong></span>
        <span><em>Client</em><strong>{getQualityOrderClient(order)}</strong></span>
        <button type="button" onClick={onOpenSerial}><em>Serial Number</em><strong>{selectedSerial}</strong></button>
      </div>
    </section>
  );
}

function QualityOrderPickerModal({ orders, currentOrderId, inspectedSerials, productionSerials, completedOnly = false, onClose, onSelect }: {
  orders: ProductionOrder[];
  currentOrderId: string;
  inspectedSerials: QualitySerialInspectionRecord[];
  productionSerials: QualityProductionSerialRecord[];
  completedOnly?: boolean;
  onClose: () => void;
  onSelect: (order: ProductionOrder) => void;
}) {
  const [query, setQuery] = React.useState('');
  const normalizedQuery = query.trim().toLowerCase();
  const filteredOrders = normalizedQuery
    ? orders.filter((order) => [order.orderNumber, order.partName, order.partNumber, getQualityOrderClient(order)].some((value) => value.toLowerCase().includes(normalizedQuery)))
    : orders;

  return (
    <div className="quality-order-modal-backdrop" role="presentation">
      <section className="quality-order-modal" role="dialog" aria-modal="true" aria-labelledby="quality-order-modal-title">
        <div className="quality-order-modal-heading">
          <span><ClipboardCheck size={22} /></span>
          <div><p className="eyebrow">Quality</p><h3 id="quality-order-modal-title">Change Work Order</h3></div>
          <button type="button" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        <p className="quality-order-modal-copy">{completedOnly ? 'Select a Production Order with completed Quality inspections.' : 'Select the Production Order that should be inspected by Quality.'}</p>
        <label className="quality-serial-search quality-order-search">
          <Search size={17} />
          <input autoFocus type="search" value={query} placeholder="Search order, part, or client" onChange={(event) => setQuery(event.target.value)} />
        </label>
        <div className="quality-order-switch-header" aria-hidden="true">
          <span>Work Order / Part</span><span>Manufacturing Status</span><span>Quality Inspection</span>
        </div>
        <div className="quality-order-switch-list">
          {filteredOrders.map((order) => {
            const orderSerials = new Set(getQualityOrderSerials(order, productionSerials));
            const inspectedCount = new Set(
              inspectedSerials
                .filter((record) => record.production_order_id === order.id && orderSerials.has(record.serial_number))
                .map((record) => record.serial_number),
            ).size;
            return (
              <button className={order.id === currentOrderId ? 'active' : ''} type="button" key={order.id} disabled={order.id === currentOrderId} onClick={() => onSelect(order)}>
                <div><strong>{order.orderNumber}</strong><span>{order.partName} / {order.partNumber}</span></div>
                <em className={`quality-picker-status quality-picker-status-${order.status}`}>{order.status}</em><b><span>Inspected</span>{inspectedCount.toLocaleString()} of {orderSerials.size.toLocaleString()}</b>
              </button>
            );
          })}
          {!filteredOrders.length ? <p>{completedOnly ? 'No completed work orders found' : 'No work orders found'}</p> : null}
        </div>
        <div className="quality-order-modal-actions"><button type="button" onClick={onClose}>Cancel</button></div>
      </section>
    </div>
  );
}

function QualitySerialPickerModal({ order, currentSerial, inspectedSerials, productionSerials, completedOnly = false, onClose, onSelect }: {
  order: ProductionOrder;
  currentSerial: string;
  inspectedSerials: QualitySerialInspectionRecord[];
  productionSerials: QualityProductionSerialRecord[];
  completedOnly?: boolean;
  onClose: () => void;
  onSelect: (serial: string) => void;
}) {
  const [query, setQuery] = React.useState('');
  const normalizedQuery = query.trim().toLowerCase();
  const serials = completedOnly
    ? inspectedSerials.filter((record) => record.production_order_id === order.id).map((record) => record.serial_number)
    : getPendingQualityOrderSerials(order, inspectedSerials, productionSerials);
  const filteredSerials = normalizedQuery ? serials.filter((serial) => serial.toLowerCase().includes(normalizedQuery)) : serials;
  return (
    <div className="quality-order-modal-backdrop" role="presentation">
      <section className="quality-order-modal quality-serial-modal" role="dialog" aria-modal="true" aria-labelledby="quality-serial-modal-title">
        <div className="quality-order-modal-heading">
          <span><PackageCheck size={22} /></span>
          <div><p className="eyebrow">{order.orderNumber}</p><h3 id="quality-serial-modal-title">Select Serial Number</h3></div>
          <button type="button" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        <p className="quality-order-modal-copy">{completedOnly ? 'Select a completed inspection to review its certificate and documents.' : 'Select the individual piece that will be inspected.'}</p>
        <label className="quality-serial-search">
          <Search size={17} />
          <input autoFocus type="search" value={query} placeholder="Search serial number" onChange={(event) => setQuery(event.target.value)} />
        </label>
        <div className="quality-serial-list">
          {filteredSerials.map((serial) => {
            const status = isQualitySerialInspected(inspectedSerials, order.id, serial) ? 'inspected' : 'pending';
            return (
              <button className={serial === currentSerial ? 'active' : ''} type="button" key={serial} disabled={serial === currentSerial} onClick={() => onSelect(serial)}>
                <span>{serial}</span><em className={`quality-picker-status quality-picker-status-${status}`}>{status}</em>
              </button>
            );
          })}
          {!filteredSerials.length ? <p>{completedOnly ? 'No completed serial numbers found' : 'No pending serial numbers found'}</p> : null}
        </div>
        <div className="quality-order-modal-actions"><button type="button" onClick={onClose}>Cancel</button></div>
      </section>
    </div>
  );
}

type QualityInspectionStatus = 'ok' | 'approach' | 'nok' | 'pending';

type MeasurementDraft = Record<string, string>;

function isDemoQualityOrder(order: ProductionOrder) {
  return mockProductionOrders.some((demoOrder) => demoOrder.id === order.id);
}

function getMeasurementKey(orderId: string, serial: string, inspectionName: string) {
  return `${orderId}::${serial}::${inspectionName}`;
}

function getLatestMeasurement(records: QualityMeasurementRecord[], order: ProductionOrder, serial: string, inspectionName: string) {
  return records
    .filter((record) => record.production_order_id === order.id && record.serial_number === serial && record.inspection_name === inspectionName)
    .sort((first, second) => new Date(second.measured_at).getTime() - new Date(first.measured_at).getTime())[0];
}

function evaluateMeasurement(value: number, limits?: QualityCheckLimit): QualityInspectionResult {
  const lower = limits?.lowerLimit;
  const upper = limits?.upperLimit;
  if (typeof lower === 'number' && value < lower) return 'nok';
  if (typeof upper === 'number' && value > upper) return 'nok';
  const approachPercent = limits?.approachPercent ?? 0;
  if (approachPercent > 0 && typeof lower === 'number' && typeof upper === 'number' && upper > lower) {
    const approachBand = (upper - lower) * (approachPercent / 100);
    if (value <= lower + approachBand || value >= upper - approachBand) return 'approach';
  }
  return 'ok';
}

function formatLimit(value?: number | null) {
  return typeof value === 'number' ? value : '-';
}

function getInspectionStatus(order: ProductionOrder, serial: string, inspection: string, records: QualityMeasurementRecord[]): QualityInspectionStatus {
  const latestMeasurement = getLatestMeasurement(records, order, serial, inspection);
  if (latestMeasurement) return latestMeasurement.result;
  if (!isDemoQualityOrder(order)) return 'pending';
  return 'pending';
}

function getRequiredInspectionStatuses(order: ProductionOrder, serial: string, measurements: QualityMeasurementRecord[]) {
  const inspections = order.qualityChecksEnabled ? order.qualityChecks ?? [] : [];
  return inspections.map((inspection) => ({
    inspection,
    status: getInspectionStatus(order, serial, inspection, measurements),
  }));
}

function isSerialReadyToSaveInspection(order: ProductionOrder, serial: string, measurements: QualityMeasurementRecord[]) {
  const statuses = getRequiredInspectionStatuses(order, serial, measurements);
  return statuses.length > 0 && statuses.every(({ status }) => status !== 'pending');
}

function getOverallSerialInspectionResult(order: ProductionOrder, serial: string, measurements: QualityMeasurementRecord[]): QualityInspectionResult {
  const statuses = getRequiredInspectionStatuses(order, serial, measurements).map(({ status }) => status);
  if (statuses.includes('nok')) return 'nok';
  if (statuses.includes('approach')) return 'approach';
  return 'ok';
}

function isQualitySerialInspected(records: QualitySerialInspectionRecord[], orderId: string, serial: string) {
  return records.some((record) => record.production_order_id === orderId && record.serial_number === serial);
}

function RequiredInspections({ order, serial, measurements, readyToSaveInspection, onSaveInspection }: { order: ProductionOrder; serial: string; measurements: QualityMeasurementRecord[]; readyToSaveInspection: boolean; onSaveInspection: () => Promise<void> }) {
  const inspections = order.qualityChecksEnabled ? order.qualityChecks ?? [] : [];
  const statusConfig = {
    ok: { label: 'OK', icon: CheckCircle2 },
    approach: { label: 'Approach', icon: AlertTriangle },
    nok: { label: 'NOK', icon: CircleX },
    pending: { label: 'Pending', icon: Minus },
  } as const;

  return (
    <article className="quality-required-inspections">
      <div className="quality-inspection-panel-heading"><ClipboardCheck size={18} /><strong>Required Inspections</strong></div>
      {inspections.length ? (
        <>
          <div className="quality-required-inspection-list">
            {inspections.map((inspection) => {
              const status = getInspectionStatus(order, serial, inspection, measurements);
              const StatusIcon = statusConfig[status].icon;
              return (
                <div className={`quality-required-inspection ${status}`} key={inspection}>
                  <span>{inspection}</span>
                  <em><StatusIcon size={18} />{statusConfig[status].label}</em>
                </div>
              );
            })}
          </div>
          {readyToSaveInspection ? (
            <div className="quality-save-inspection-actions">
              <button type="button" onClick={onSaveInspection}><CheckCircle2 size={18} />Save Inspection</button>
            </div>
          ) : null}
        </>
      ) : (
        <div className="quality-inspection-empty-message"><AlertTriangle size={16} /><span>No inspections configured for this work order.</span></div>
      )}
    </article>
  );
}

function MeasurementCapture({ order, serial, measurements, onSaveMeasurement, onConfigureLimits }: {
  order: ProductionOrder;
  serial: string;
  measurements: QualityMeasurementRecord[];
  onSaveMeasurement: (inspectionName: string, measuredValue: number) => Promise<void>;
  onConfigureLimits: (inspectionName: string) => void;
}) {
  const inspections = order.qualityChecksEnabled ? order.qualityChecks ?? [] : [];
  const measurementUnitSymbol = getQualityMeasurementUnitSymbol(order);
  const [drafts, setDrafts] = React.useState<MeasurementDraft>({});
  const [savingInspection, setSavingInspection] = React.useState<string | null>(null);

  React.useEffect(() => { setDrafts({}); }, [order.id, serial]);

  return (
    <article className="quality-measurement-capture">
      <div className="quality-inspection-panel-heading"><ShieldCheck size={18} /><strong>Measurement Capture</strong></div>
      {inspections.length ? (
        <div className="quality-measurement-list">
          {inspections.map((inspection) => {
            const limits = order.qualityCheckLimits?.[inspection] ?? {};
            const hasConfiguredLimits = typeof limits.lowerLimit === 'number' && typeof limits.upperLimit === 'number';
            const latest = getLatestMeasurement(measurements, order, serial, inspection);
            const draftValue = drafts[inspection] ?? '';
            return (
              <div className={`quality-measurement-row ${latest?.result ?? 'pending'} ${hasConfiguredLimits ? '' : 'missing-limits'}`} key={inspection}>
                <div>
                  <strong>{inspection}</strong>
                </div>
                {!hasConfiguredLimits ? (
                  <button className="quality-measurement-limit-message" type="button" onClick={() => onConfigureLimits(inspection)}><AlertTriangle size={15} /><span>Limits have not been configured yet.</span></button>
                ) : null}
                <label>
                  <span>Lower ({measurementUnitSymbol})</span>
                  <input type="number" value={limits.lowerLimit ?? ''} readOnly />
                </label>
                <label className="quality-measurement-value">
                  <span>Measured ({measurementUnitSymbol})</span>
                  <input
                    type="number"
                    step="any"
                    value={draftValue}
                    placeholder={latest ? String(latest.measured_value) : '0.00'}
                    disabled={!hasConfiguredLimits}
                    onChange={(event) => setDrafts((current) => ({ ...current, [inspection]: event.target.value }))}
                  />
                </label>
                <label>
                  <span>Upper ({measurementUnitSymbol})</span>
                  <input type="number" value={limits.upperLimit ?? ''} readOnly />
                </label>
                <button
                  type="button"
                  disabled={!hasConfiguredLimits || draftValue === '' || savingInspection === inspection}
                  onClick={async () => {
                    setSavingInspection(inspection);
                    await onSaveMeasurement(inspection, Number(draftValue));
                    setSavingInspection(null);
                    setDrafts((current) => ({ ...current, [inspection]: '' }));
                  }}
                  aria-label={`Save ${inspection} measurement`}
                >
                  <CheckCircle2 size={18} />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="quality-inspection-empty-message"><AlertTriangle size={16} /><span>No measurement records.</span></div>
      )}
    </article>
  );
}

function InspectionDocuments({ order, serial, documents, onUploadDocument, onOpenDocument }: {
  order: ProductionOrder;
  serial: string;
  documents: QualityInspectionDocument[];
  onUploadDocument: (file: File) => Promise<void>;
  onOpenDocument: (document: QualityInspectionDocument) => Promise<void>;
}) {
  const [uploading, setUploading] = React.useState(false);
  const serialDocuments = documents.filter((document) => document.production_order_id === order.id && document.serial_number === serial);

  return (
    <article className="quality-inspection-documents">
      <div className="quality-inspection-panel-heading"><FileText size={18} /><strong>Inspection Documents</strong></div>
      <label className="quality-document-dropzone">
        <Upload size={18} />
        <strong>{uploading ? 'Uploading PDF' : 'Upload PDF'}</strong>
        <span>{serialDocuments.length ? `${serialDocuments.length} files attached` : 'No attachments yet'}</span>
        <input
          type="file"
          accept="application/pdf,.pdf"
          multiple
          disabled={uploading}
          onChange={async (event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = '';
            if (!files.length) return;
            setUploading(true);
            for (const file of files) {
              await onUploadDocument(file);
            }
            setUploading(false);
          }}
        />
      </label>
      {serialDocuments.length ? (
        <div className="quality-document-list">
          {serialDocuments.map((document) => (
            <div className="quality-document-row" key={document.id}>
              <div>
                <strong>{document.file_name}</strong>
                <span>{new Date(document.uploaded_at).toLocaleDateString()}</span>
              </div>
              <button type="button" onClick={() => onOpenDocument(document)}>Open</button>
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}
function QualityInspectionsPage({ selectedOrder, selectedSerial, measurements, documents, inspectedSerials, productionSerials, onChangeOrder, onChangeSerial, onSaveMeasurement, onUploadDocument, onOpenDocument, onConfigureLimits, onSaveInspection }: {
  selectedOrder: ProductionOrder;
  selectedSerial: string;
  measurements: QualityMeasurementRecord[];
  documents: QualityInspectionDocument[];
  inspectedSerials: QualitySerialInspectionRecord[];
  productionSerials: QualityProductionSerialRecord[];
  onChangeOrder: () => void;
  onChangeSerial: () => void;
  onSaveMeasurement: (inspectionName: string, measuredValue: number) => Promise<void>;
  onUploadDocument: (file: File) => Promise<void>;
  onOpenDocument: (document: QualityInspectionDocument) => Promise<void>;
  onConfigureLimits: (inspectionName: string) => void;
  onSaveInspection: () => Promise<void>;
}) {
  const availableSerials = getQualityOrderSerials(selectedOrder, productionSerials);
  const inspectedCount = inspectedSerials.filter((record) => record.production_order_id === selectedOrder.id && availableSerials.includes(record.serial_number)).length;
  const readyToSaveInspection = isSerialReadyToSaveInspection(selectedOrder, selectedSerial, measurements)
    && !isQualitySerialInspected(inspectedSerials, selectedOrder.id, selectedSerial);

  return (
    <div className="quality-inspections-workspace">
      <div className="quality-inspection-order-row">
        <QualityInspectionCounter inspected={inspectedCount} required={availableSerials.length} />
        <QualityOrderSelector order={selectedOrder} selectedSerial={selectedSerial} onOpenOrder={onChangeOrder} onOpenSerial={onChangeSerial} />
      </div>
      <section className="quality-inspection-board" aria-label="Inspection foundation for selected work order">
        <RequiredInspections order={selectedOrder} serial={selectedSerial} measurements={measurements} readyToSaveInspection={readyToSaveInspection} onSaveInspection={onSaveInspection} />
        <MeasurementCapture order={selectedOrder} serial={selectedSerial} measurements={measurements} onSaveMeasurement={onSaveMeasurement} onConfigureLimits={onConfigureLimits} />
        <InspectionDocuments order={selectedOrder} serial={selectedSerial} documents={documents} onUploadDocument={onUploadDocument} onOpenDocument={onOpenDocument} />
      </section>
    </div>
  );
}
type SpecificationDraft = Record<string, { lowerLimit: string; upperLimit: string; approachPercent: string }>;

type SpecificationHighlightRequest = { inspectionName: string; token: number };

function QualitySpecificationOrderSelector({ order, onOpenOrder }: { order: ProductionOrder; onOpenOrder: () => void }) {
  return (
    <section className="quality-active-order-panel quality-specification-order-panel" aria-label="Selected production order for specifications">
      <div className="quality-active-order-heading"><ClipboardCheck size={16} /><strong>Selected Work Order</strong></div>
      <div className="quality-active-order-card quality-specification-order-card">
        <button type="button" onClick={onOpenOrder}><em>Order Number</em><strong>{order.orderNumber}</strong></button>
        <span><em>Part Name</em><strong>{order.partName}</strong></span>
        <span><em>Part Number</em><strong>{order.partNumber}</strong></span>
        <span><em>Due Date</em><strong>{formatQualityDate(order.dueDate)}</strong></span>
        <span><em>Client</em><strong>{getQualityOrderClient(order)}</strong></span>
      </div>
    </section>
  );
}

function createSpecificationDraft(order: ProductionOrder): SpecificationDraft {
  const inspections = order.qualityChecksEnabled ? order.qualityChecks ?? [] : [];
  return Object.fromEntries(inspections.map((inspection) => {
    const limits = order.qualityCheckLimits?.[inspection] ?? {};
    return [inspection, {
      lowerLimit: limits.lowerLimit == null ? '' : String(limits.lowerLimit),
      upperLimit: limits.upperLimit == null ? '' : String(limits.upperLimit),
      approachPercent: limits.approachPercent == null ? '' : String(limits.approachPercent),
    }];
  })) as SpecificationDraft;
}

function draftToQualityLimits(draft: SpecificationDraft): Record<string, QualityCheckLimit> {
  return Object.fromEntries(Object.entries(draft).map(([inspection, limits]) => [inspection, {
    lowerLimit: limits.lowerLimit === '' ? null : Number(limits.lowerLimit),
    upperLimit: limits.upperLimit === '' ? null : Number(limits.upperLimit),
    approachPercent: limits.approachPercent === '' ? null : Number(limits.approachPercent),
  }]));
}

function QualitySpecificationsPage({ selectedOrder, onChangeOrder, onSaveSpecifications, highlightRequest }: {
  selectedOrder: ProductionOrder;
  onChangeOrder: () => void;
  onSaveSpecifications: (limits: Record<string, QualityCheckLimit>, measurementUnit: QualityMeasurementUnit) => Promise<void>;
  highlightRequest: SpecificationHighlightRequest | null;
}) {
  const inspections = selectedOrder.qualityChecksEnabled ? selectedOrder.qualityChecks ?? [] : [];
  const [activeInspection, setActiveInspection] = React.useState(inspections[0] ?? '');
  const [draft, setDraft] = React.useState<SpecificationDraft>(() => createSpecificationDraft(selectedOrder));
  const [measurementUnit, setMeasurementUnit] = React.useState<QualityMeasurementUnit>(() => getQualityMeasurementUnit(selectedOrder));
  const [saving, setSaving] = React.useState(false);
  const [highlightedInspection, setHighlightedInspection] = React.useState('');

  React.useEffect(() => {
    const nextDraft = createSpecificationDraft(selectedOrder);
    setDraft(nextDraft);
    setMeasurementUnit(getQualityMeasurementUnit(selectedOrder));
    setActiveInspection(Object.keys(nextDraft)[0] ?? '');
  }, [selectedOrder.id, selectedOrder.qualityChecks?.join('|'), selectedOrder.qualityCheckLimits, selectedOrder.qualityMeasurementUnit]);

  React.useEffect(() => {
    if (!highlightRequest || !inspections.includes(highlightRequest.inspectionName)) return;
    setActiveInspection(highlightRequest.inspectionName);
    setHighlightedInspection(highlightRequest.inspectionName);
    const timeout = window.setTimeout(() => setHighlightedInspection(''), 3200);
    return () => window.clearTimeout(timeout);
  }, [highlightRequest?.token, highlightRequest?.inspectionName, inspections.join('|')]);

  const activeLimits = draft[activeInspection];
  const measurementUnitSymbol = qualityMeasurementUnitOptions.find((option) => option.value === measurementUnit)?.symbol ?? 'mm';

  return (
    <div className="quality-specifications-workspace">
      <QualitySpecificationOrderSelector order={selectedOrder} onOpenOrder={onChangeOrder} />
      <section className="quality-specification-configurator" aria-label="Quality specification limits">
        <aside className="quality-specification-menu">
          <div className="quality-inspection-panel-heading"><ShieldCheck size={18} /><strong>Required Inspections</strong></div>
          {inspections.length ? inspections.map((inspection) => {
            const limits = draft[inspection];
            const configured = limits?.lowerLimit !== '' || limits?.upperLimit !== '';
            return (
              <button className={`${activeInspection === inspection ? 'active' : ''} ${configured ? 'configured' : ''}`} type="button" key={inspection} onClick={() => setActiveInspection(inspection)}>
                <span>{inspection}</span>
                <em>{configured ? <><CheckCircle2 size={14} />Configured</> : <><CircleX size={14} />Missing limits</>}</em>
              </button>
            );
          }) : <div className="quality-specification-message quality-specification-empty-message"><AlertTriangle size={16} /><span>No inspections configured for this work order.</span></div>}
        </aside>
        <article className="quality-specification-editor">
          <div className="quality-specification-editor-header">
            <div className="quality-inspection-panel-heading"><FileText size={18} /><strong>Specification Limits</strong></div>
            <div className="quality-specification-unit-control">
              <strong>Measurement Unit</strong>
              <div role="radiogroup" aria-label="Quality measurement unit">
                {qualityMeasurementUnitOptions.map((option) => (
                  <button className={measurementUnit === option.value ? 'active' : ''} type="button" role="radio" aria-checked={measurementUnit === option.value} key={option.value} onClick={() => setMeasurementUnit(option.value)}>{option.label}</button>
                ))}
              </div>
            </div>
          </div>
          {activeInspection && activeLimits ? (
            <>
              <div className="quality-specification-editor-title">
                <h3>{activeInspection}</h3>
                <div className="quality-specification-message"><AlertTriangle size={16} /><span>NOK is automatic outside lower and upper limits.</span></div>
              </div>
              <div className={`quality-specification-fields ${highlightedInspection === activeInspection ? 'highlight' : ''}`}>
                <label>
                  <span>Lower Limit ({measurementUnitSymbol})</span>
                  <input type="number" step="any" value={activeLimits.lowerLimit} onChange={(event) => setDraft((current) => ({ ...current, [activeInspection]: { ...current[activeInspection], lowerLimit: event.target.value } }))} />
                </label>
                <label>
                  <span>Upper Limit ({measurementUnitSymbol})</span>
                  <input type="number" step="any" value={activeLimits.upperLimit} onChange={(event) => setDraft((current) => ({ ...current, [activeInspection]: { ...current[activeInspection], upperLimit: event.target.value } }))} />
                </label>
                <label>
                  <span>Approach Range %</span>
                  <input type="number" step="any" min="0" max="100" value={activeLimits.approachPercent} placeholder="10" onChange={(event) => setDraft((current) => ({ ...current, [activeInspection]: { ...current[activeInspection], approachPercent: event.target.value } }))} />
                </label>
              </div>
              <div className="quality-specification-preview">
                <strong>Category behavior</strong>
                <span className="ok">OK: within tolerance</span>
                <span className="approach">Approach: within configured percent near either limit</span>
                <span className="nok">NOK: outside tolerance limits</span>
              </div>
              <button className="quality-specification-save" type="button" disabled={saving} onClick={async () => { setSaving(true); await onSaveSpecifications(draftToQualityLimits(draft), measurementUnit); setSaving(false); }}>
                <CheckCircle2 size={18} /> {saving ? 'Saving' : 'Save Specifications'}
              </button>
            </>
          ) : (
            <div className="quality-specification-message quality-specification-empty-message"><AlertTriangle size={16} /><span>Select a required inspection to configure its specification.</span></div>
          )}
        </article>
      </section>
    </div>
  );
}
function getQualityCertificateCode(record: QualitySerialInspectionRecord) {
  return `YVIMO-QC-${record.id.toUpperCase()}`;
}

function getQualityCertificateHash(value: string) {
  let first = 2166136261;
  let second = 2246822519;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ code, 3266489917);
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}-${(second >>> 0).toString(16).padStart(8, '0')}`.toUpperCase();
}

function QualityCertificateQr({ value }: { value: string }) {
  return (
    <span className="quality-certificate-qr" aria-label={`Inspection certificate QR ${value}`}>
      {Array.from({ length: 49 }, (_, index) => {
        const code = value.charCodeAt(index % value.length) || index;
        const active = index % 8 === 0 || (code + index * 7) % 5 < 2;
        return <i className={active ? 'active' : ''} key={index} />;
      })}
    </span>
  );
}

function QualityCertificatesPage({ selectedOrder, selectedSerial, inspectionRecord, measurements, documents, organizationName, organizationLogoUrl, onChangeOrder, onChangeSerial, onOpenDocument }: {
  selectedOrder: ProductionOrder;
  selectedSerial: string;
  inspectionRecord: QualitySerialInspectionRecord;
  measurements: QualityMeasurementRecord[];
  documents: QualityInspectionDocument[];
  organizationName: string;
  organizationLogoUrl: string;
  onChangeOrder: () => void;
  onChangeSerial: () => void;
  onOpenDocument: (document: QualityInspectionDocument) => Promise<void>;
}) {
  const certificateCode = getQualityCertificateCode(inspectionRecord);
  const measurementUnitSymbol = getQualityMeasurementUnitSymbol(selectedOrder);
  const certificateHash = getQualityCertificateHash(certificateCode);
  const certificateRef = React.useRef<HTMLElement>(null);
  const [downloadingCertificate, setDownloadingCertificate] = React.useState(false);
  const [certificateDownloadError, setCertificateDownloadError] = React.useState('');
  const serialMeasurements = measurements
    .filter((measurement) => measurement.production_order_id === selectedOrder.id && measurement.serial_number === selectedSerial)
    .sort((first, second) => new Date(second.measured_at).getTime() - new Date(first.measured_at).getTime());
  const latestMeasurements = Array.from(serialMeasurements.reduce<Map<string, QualityMeasurementRecord>>((records, measurement) => {
    if (!records.has(measurement.inspection_name)) records.set(measurement.inspection_name, measurement);
    return records;
  }, new Map()).values());
  const serialDocuments = documents
    .filter((document) => document.production_order_id === selectedOrder.id && document.serial_number === selectedSerial)
    .sort((first, second) => new Date(second.uploaded_at).getTime() - new Date(first.uploaded_at).getTime());

  const handleDownloadCertificate = async () => {
    if (!certificateRef.current || downloadingCertificate) return;
    setDownloadingCertificate(true);
    setCertificateDownloadError('');

    try {
      await document.fonts?.ready;
      const images = Array.from(certificateRef.current.querySelectorAll('img'));
      await Promise.all(images.map((image) => image.complete ? Promise.resolve() : new Promise<void>((resolve) => {
        image.addEventListener('load', () => resolve(), { once: true });
        image.addEventListener('error', () => resolve(), { once: true });
      })));

      const canvas = await html2canvas(certificateRef.current, {
        backgroundColor: '#ffffff',
        logging: false,
        scale: 2,
        useCORS: true,
      });
      const certificatePageWidth = 841.89;
      const certificatePageHeight = certificatePageWidth * (canvas.height / canvas.width);
      const certificatePdf = new jsPDF({
        format: [certificatePageWidth, certificatePageHeight],
        orientation: 'landscape',
        unit: 'pt',
      });
      certificatePdf.addImage(canvas.toDataURL('image/jpeg', 0.96), 'JPEG', 0, 0, certificatePageWidth, certificatePageHeight);

      const pdfLibModuleUrl = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm';
      const { PDFDocument } = await import(/* @vite-ignore */ pdfLibModuleUrl) as { PDFDocument: any };
      const outputPdf = await PDFDocument.create();
      const certificateDocument = await PDFDocument.load(certificatePdf.output('arraybuffer'));
      const certificatePages = await outputPdf.copyPages(certificateDocument, certificateDocument.getPageIndices());
      certificatePages.forEach((page: unknown) => outputPdf.addPage(page));
      const normalizedPageWidth = certificateDocument.getPage(0).getWidth();

      for (const inspectionDocument of serialDocuments) {
        const isPdf = inspectionDocument.file_type === 'application/pdf' || inspectionDocument.file_name.toLowerCase().endsWith('.pdf');
        if (!isPdf) continue;

        let documentUrl = inspectionDocument.file_path;
        if (!documentUrl.startsWith('blob:')) {
          const { data, error } = await supabase.storage.from(qualityDocumentsBucket).createSignedUrl(documentUrl, 60 * 10);
          if (error || !data?.signedUrl) throw error ?? new Error(`Unable to access ${inspectionDocument.file_name}`);
          documentUrl = data.signedUrl;
        }

        const response = await fetch(documentUrl);
        if (!response.ok) throw new Error(`Unable to download ${inspectionDocument.file_name}`);
        const sourceDocument = await PDFDocument.load(await response.arrayBuffer());
        for (const pageIndex of sourceDocument.getPageIndices()) {
          const sourcePage = sourceDocument.getPage(pageIndex);
          const sourceWidth = sourcePage.getWidth();
          const sourceHeight = sourcePage.getHeight();
          const normalizedPageHeight = normalizedPageWidth * (sourceHeight / sourceWidth);
          const embeddedPage = await outputPdf.embedPage(sourcePage);
          const outputPage = outputPdf.addPage([normalizedPageWidth, normalizedPageHeight]);
          outputPage.drawPage(embeddedPage, {
            height: normalizedPageHeight,
            width: normalizedPageWidth,
            x: 0,
            y: 0,
          });
        }
      }

      const pdfBytes = await outputPdf.save();
      const downloadUrl = URL.createObjectURL(new Blob([pdfBytes], { type: 'application/pdf' }));
      const downloadLink = document.createElement('a');
      const safeOrderNumber = selectedOrder.orderNumber.replace(/[^a-z0-9_-]+/gi, '-');
      const safeSerial = selectedSerial.replace(/[^a-z0-9_-]+/gi, '-');
      downloadLink.href = downloadUrl;
      downloadLink.download = `quality-certificate-${safeOrderNumber}-${safeSerial}.pdf`;
      downloadLink.click();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    } catch (error) {
      console.error('Unable to generate Quality inspection certificate', error);
      setCertificateDownloadError('The certificate could not be generated. Check the attached PDFs and try again.');
    } finally {
      setDownloadingCertificate(false);
    }
  };

  return (
    <div className="quality-certificates-workspace">
      <QualityOrderSelector order={selectedOrder} selectedSerial={selectedSerial} onOpenOrder={onChangeOrder} onOpenSerial={onChangeSerial} />

      <section className={`quality-certificate-package ${inspectionRecord.result}`} ref={certificateRef}>
      <section className={`quality-inspection-certificate ${inspectionRecord.result}`} aria-label={`Inspection certificate ${certificateCode}`}>
        <div className="quality-certificate-main">
          <span className="quality-certificate-seal"><Award size={32} /></span>
          <div>
            <p>Quality Inspection Certificate</p>
            <h3>{selectedOrder.partName} - {selectedSerial}</h3>
            <span className="quality-certificate-issued">Issued {formatQualityDate(inspectionRecord.inspected_at)}</span>
            <div className="quality-certificate-order-data">
              <span><em>Work Order</em><strong>{selectedOrder.orderNumber}</strong></span>
              <span><em>Part Number</em><strong>{selectedOrder.partNumber}</strong></span>
              <span><em>Client</em><strong>{getQualityOrderClient(selectedOrder)}</strong></span>
              <span><em>Serial Number</em><strong>{selectedSerial}</strong></span>
            </div>
          </div>
        </div>

        <div className="quality-certificate-identifiers">
          <span><em>Certificate ID</em><code>{certificateCode}</code></span>
          <span><em>Certificate Hash</em><code>{certificateHash}</code></span>
        </div>
        <div className="quality-certificate-verification">
          <span className="quality-certificate-brand-mark"><img crossOrigin="anonymous" src="/assets/logos/yvimo-square-logo-2024.png" alt="YVIMO" /></span>
          <span className="quality-certificate-brand-mark organization">
            {organizationLogoUrl ? <img crossOrigin="anonymous" src={organizationLogoUrl} alt={organizationName} /> : <b>{organizationName.trim().charAt(0).toUpperCase() || 'M'}</b>}
          </span>
          <QualityCertificateQr value={certificateCode} />
          <div className={`quality-certificate-result ${inspectionRecord.result}`}>
            {inspectionRecord.result === 'nok' ? <CircleX size={18} /> : inspectionRecord.result === 'approach' ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
            {inspectionRecord.result.toUpperCase()}
          </div>
          <button className="quality-certificate-download" type="button" disabled={downloadingCertificate} data-html2canvas-ignore="true" onClick={() => void handleDownloadCertificate()}>
            <Download size={17} /> {downloadingCertificate ? 'Generating PDF' : 'Download Certificate'}
          </button>
          {certificateDownloadError ? <span className="quality-certificate-download-error" data-html2canvas-ignore="true">{certificateDownloadError}</span> : null}
        </div>
      </section>

      <div className="quality-certificate-detail-grid">
        <section className="quality-certificate-measurements">
          <div className="quality-inspection-panel-heading"><ClipboardCheck size={18} /><strong>Completed Inspections</strong></div>
          {latestMeasurements.length ? (
            <div className="quality-certificate-measurement-list">
              {latestMeasurements.map((measurement) => (
                <article className={measurement.result} key={measurement.id}>
                  <div>
                    <strong>{measurement.inspection_name}</strong>
                    <span>Measured {formatQualityDate(measurement.measured_at)}</span>
                  </div>
                  <dl>
                    <div><dt>Lower ({measurementUnitSymbol})</dt><dd>{formatLimit(measurement.lower_limit)}</dd></div>
                    <div><dt>Measured ({measurementUnitSymbol})</dt><dd>{measurement.measured_value}</dd></div>
                    <div><dt>Upper ({measurementUnitSymbol})</dt><dd>{formatLimit(measurement.upper_limit)}</dd></div>
                  </dl>
                  <b>
                    {measurement.result === 'nok' ? <CircleX size={16} /> : measurement.result === 'approach' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
                    {measurement.result.toUpperCase()}
                  </b>
                </article>
              ))}
            </div>
          ) : (
            <div className="quality-certificate-empty"><AlertTriangle size={17} /><span>No measurement values were saved for this completed inspection.</span></div>
          )}
        </section>

        <section className="quality-certificate-documents">
          <div className="quality-inspection-panel-heading"><FileText size={18} /><strong>Inspection Documents</strong></div>
          {serialDocuments.length ? (
            <div className="quality-certificate-document-list">
              {serialDocuments.map((document) => (
                <article key={document.id}>
                  <FileText size={20} />
                  <div><strong>{document.file_name}</strong><span>Uploaded {formatQualityDate(document.uploaded_at)}</span></div>
                  <button type="button" onClick={() => void onOpenDocument(document)}>Open</button>
                </article>
              ))}
            </div>
          ) : (
            <div className="quality-certificate-empty"><AlertTriangle size={17} /><span>No files were attached to this inspection.</span></div>
          )}
        </section>
      </div>
      </section>
    </div>
  );
}
function QualityPlaceholderPage({ config }: { config: QualityPageConfig }) {
  return (
    <div className="quality-page-foundation">
      <section className="quality-table-card" aria-label={`${config.title} table foundation`}>
        <div className="quality-table-header">
          {config.fields.map((field) => <span key={field}>{field}</span>)}
        </div>
        <div className="quality-empty-state">
          <PackageCheck size={24} />
          <strong>No records</strong>
        </div>
      </section>

      {config.plannedOptions?.length ? (
        <section className="quality-option-grid" aria-label={`${config.title} planned options`}>
          {config.plannedOptions.map((group) => (
            <article key={group.title}>
              <span>{group.title}</span>
              <div>
                {group.values.map((value) => <em key={value}>{value}</em>)}
              </div>
            </article>
          ))}
        </section>
      ) : null}
    </div>
  );
}

export function QualityOperationsWorkspace({ onNavigate, activeTab, organizationId, organizationName = 'Manufacturing Organization', organizationLogoUrl = '' }: QualityOperationsWorkspaceProps) {
  const initialSelection = readQualitySelection(organizationId);
  const initialOrder = qualityDemoOrders.find((order) => order.id === initialSelection?.orderId) ?? qualityDemoOrders[0];
  const selectionOrganizationRef = React.useRef('');
  const [inspectionOrders, setInspectionOrders] = React.useState<ProductionOrder[]>(qualityDemoOrders);
  const qualityEnabledOrders = React.useMemo(() => inspectionOrders.filter(isQualityCheckEnabledOrder), [inspectionOrders]);
  const [selectedInspectionOrderId, setSelectedInspectionOrderId] = React.useState(initialOrder?.id ?? '');
  const [orderPickerOpen, setOrderPickerOpen] = React.useState(false);
  const [serialPickerOpen, setSerialPickerOpen] = React.useState(false);
  const selectedInspectionOrder = qualityEnabledOrders.find((order) => order.id === selectedInspectionOrderId) ?? qualityEnabledOrders[0];
  const [selectedInspectionSerial, setSelectedInspectionSerial] = React.useState(initialSelection?.serial ?? '');
  const [measurementRecords, setMeasurementRecords] = React.useState<QualityMeasurementRecord[]>([]);
  const [inspectionDocuments, setInspectionDocuments] = React.useState<QualityInspectionDocument[]>([]);
  const [serialInspectionRecords, setSerialInspectionRecords] = React.useState<QualitySerialInspectionRecord[]>([]);
  const [productionSerialRecords, setProductionSerialRecords] = React.useState<QualityProductionSerialRecord[]>([]);
  const [dashboardDateRange, setDashboardDateRange] = React.useState<QualityDashboardDateRange>(() => getQualityQuickRange('month'));
  const [specificationHighlightRequest, setSpecificationHighlightRequest] = React.useState<SpecificationHighlightRequest | null>(null);
  const [documentPreview, setDocumentPreview] = React.useState<QualityDocumentPreview | null>(null);


  React.useEffect(() => {
    if (selectionOrganizationRef.current !== organizationId || !selectedInspectionOrderId) return;
    writeQualitySelection(organizationId, { orderId: selectedInspectionOrderId, serial: selectedInspectionSerial });
  }, [organizationId, selectedInspectionOrderId, selectedInspectionSerial]);

  React.useEffect(() => {
    let active = true;
    selectionOrganizationRef.current = '';

    const loadInspectionOrders = async () => {
      const { data, error } = await supabase
        .from('mes_production_orders')
        .select('*')
        .eq('organization_id', organizationId)
        .order('due_date', { ascending: true });

      if (!active || error) {
        if (error) console.error('Unable to load Production Orders for Quality', error);
        return;
      }

      const loadedOrders = ((data ?? []) as QualityProductionOrderRow[]).map(mapQualityProductionOrder);
      const nextOrders = loadedOrders.length ? loadedOrders : qualityDemoOrders;
      const nextQualityOrders = nextOrders.filter(isQualityCheckEnabledOrder);
      const savedSelection = readQualitySelection(organizationId);
      const nextOrder = nextQualityOrders.find((order) => order.id === savedSelection?.orderId) ?? nextQualityOrders[0];
      const nextSerial = savedSelection?.serial ?? '';
      selectionOrganizationRef.current = organizationId;
      setInspectionOrders(nextOrders);
      setSelectedInspectionOrderId(nextOrder?.id ?? '');
      setSelectedInspectionSerial(nextSerial);
    };

    void loadInspectionOrders();
    return () => { active = false; };
  }, [organizationId]);

  React.useEffect(() => {
    let active = true;

    const loadQualityInspectionRecords = async () => {
      const [
        { data: measurementsData, error: measurementsError },
        { data: documentsData, error: documentsError },
        { data: serialInspectionsData, error: serialInspectionsError },
        { data: productionSerialsData, error: productionSerialsError },
      ] = await Promise.all([
        supabase.from('mes_quality_measurements').select('*').eq('organization_id', organizationId),
        supabase.from('mes_quality_inspection_documents').select('*').eq('organization_id', organizationId),
        supabase.from('mes_quality_serial_inspections').select('*').eq('organization_id', organizationId),
        supabase.from('mes_production_serials').select('*').eq('organization_id', organizationId).order('piece_sequence', { ascending: true }),
      ]);

      if (!active) return;
      if (measurementsError) console.error('Unable to load Quality measurements', measurementsError);
      if (documentsError) console.error('Unable to load Quality inspection documents', documentsError);
      if (serialInspectionsError) console.error('Unable to load Quality serial inspections', serialInspectionsError);
      if (productionSerialsError) console.error('Unable to load manufactured serial numbers for Quality', productionSerialsError);
      setMeasurementRecords((measurementsData ?? []) as QualityMeasurementRecord[]);
      setInspectionDocuments((documentsData ?? []) as QualityInspectionDocument[]);
      setSerialInspectionRecords((serialInspectionsData ?? []) as QualitySerialInspectionRecord[]);
      setProductionSerialRecords((productionSerialsData ?? []) as QualityProductionSerialRecord[]);
    };

    void loadQualityInspectionRecords();
    return () => { active = false; };
  }, [organizationId]);

  const handleConfigureInspectionLimits = React.useCallback((inspectionName: string) => {
    setSpecificationHighlightRequest({ inspectionName, token: Date.now() });
    onNavigate('/workspace/manufacturing-ops/mes/quality/specifications');
  }, [onNavigate]);
  const handleSaveMeasurement = React.useCallback(async (inspectionName: string, measuredValue: number) => {
    if (!selectedInspectionOrder || Number.isNaN(measuredValue)) return;
    const limits = selectedInspectionOrder.qualityCheckLimits?.[inspectionName] ?? {};
    const result = evaluateMeasurement(measuredValue, limits);
    const nextRecord: QualityMeasurementRecord = {
      id: `quality-measurement-${Date.now()}`,
      production_order_id: selectedInspectionOrder.id,
      serial_number: selectedInspectionSerial,
      inspection_name: inspectionName,
      measured_value: measuredValue,
      lower_limit: limits.lowerLimit ?? null,
      upper_limit: limits.upperLimit ?? null,
      result,
      measured_at: new Date().toISOString(),
    };

    if (!isDemoQualityOrder(selectedInspectionOrder)) {
      const { data, error } = await supabase
        .from('mes_quality_measurements')
        .insert({
          organization_id: organizationId,
          production_order_id: selectedInspectionOrder.id,
          serial_number: selectedInspectionSerial,
          inspection_name: inspectionName,
          measured_value: measuredValue,
          lower_limit: limits.lowerLimit ?? null,
          upper_limit: limits.upperLimit ?? null,
          result,
        })
        .select('*')
        .single();

      if (error) {
        console.error('Unable to save Quality measurement', error);
        return;
      }
      Object.assign(nextRecord, data as QualityMeasurementRecord);
    }

    const measurementKey = getMeasurementKey(selectedInspectionOrder.id, selectedInspectionSerial, inspectionName);
    setMeasurementRecords((current) => [
      nextRecord,
      ...current.filter((record) => getMeasurementKey(record.production_order_id, record.serial_number, record.inspection_name) !== measurementKey),
    ]);
  }, [organizationId, selectedInspectionOrder, selectedInspectionSerial]);

  const handleSaveSerialInspection = React.useCallback(async () => {
    if (!selectedInspectionOrder || !selectedInspectionSerial) return;
    const result = getOverallSerialInspectionResult(selectedInspectionOrder, selectedInspectionSerial, measurementRecords);
    let nextRecord: QualitySerialInspectionRecord = {
      id: `quality-serial-inspection-${Date.now()}`,
      production_order_id: selectedInspectionOrder.id,
      serial_number: selectedInspectionSerial,
      result,
      inspected_at: new Date().toISOString(),
    };

    if (!isDemoQualityOrder(selectedInspectionOrder)) {
      const inspectionStatuses = getRequiredInspectionStatuses(selectedInspectionOrder, selectedInspectionSerial, measurementRecords);
      const documentCount = inspectionDocuments.filter((document) => document.production_order_id === selectedInspectionOrder.id && document.serial_number === selectedInspectionSerial).length;
      const { data, error } = await supabase.rpc('mes_quality_save_serial_inspection', {
        p_organization_id: organizationId,
        p_order_id: selectedInspectionOrder.id,
        p_serial_number: selectedInspectionSerial,
        p_result: result,
        p_event_payload: {
          inspection_count: inspectionStatuses.length,
          inspections: inspectionStatuses,
          document_count: documentCount,
          measurement_unit: getQualityMeasurementUnit(selectedInspectionOrder),
          measurement_unit_symbol: getQualityMeasurementUnitSymbol(selectedInspectionOrder),
        },
      });

      if (error) {
        console.error('Unable to save Quality serial inspection', error);
        return;
      }
      nextRecord = data as QualitySerialInspectionRecord;
    }

    const nextSerialInspectionRecords = [
      nextRecord,
      ...serialInspectionRecords.filter((record) => !(record.production_order_id === selectedInspectionOrder.id && record.serial_number === selectedInspectionSerial)),
    ];
    setSerialInspectionRecords(nextSerialInspectionRecords);

    const serials = getQualityOrderSerials(selectedInspectionOrder, productionSerialRecords);
    const currentIndex = serials.indexOf(selectedInspectionSerial);
    const followingSerials = currentIndex >= 0 ? serials.slice(currentIndex + 1) : serials;
    const nextPendingSerial = followingSerials.find((serial) => !isQualitySerialInspected(nextSerialInspectionRecords, selectedInspectionOrder.id, serial))
      ?? serials.find((serial) => !isQualitySerialInspected(nextSerialInspectionRecords, selectedInspectionOrder.id, serial));
    if (!nextPendingSerial && selectedInspectionOrder.status === 'waiting-inspection') {
      setInspectionOrders((current) => current.map((order) => order.id === selectedInspectionOrder.id ? { ...order, status: 'completed' } : order));
    }
    setSelectedInspectionSerial(nextPendingSerial ?? '');
  }, [inspectionDocuments, measurementRecords, organizationId, selectedInspectionOrder, selectedInspectionSerial, serialInspectionRecords, productionSerialRecords]);
  const handleUploadDocument = React.useCallback(async (file: File) => {
    if (!selectedInspectionOrder) return;
    const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
    const storagePath = `${organizationId}/${selectedInspectionOrder.id}/${selectedInspectionSerial}/${Date.now()}-${safeFileName}`;
    const filePath = isDemoQualityOrder(selectedInspectionOrder) ? URL.createObjectURL(file) : storagePath;
    let nextDocument: QualityInspectionDocument = {
      id: `quality-document-${Date.now()}`,
      production_order_id: selectedInspectionOrder.id,
      serial_number: selectedInspectionSerial,
      inspection_name: null,
      file_name: file.name,
      file_path: filePath,
      file_type: file.type || 'application/pdf',
      uploaded_at: new Date().toISOString(),
    };

    if (!isDemoQualityOrder(selectedInspectionOrder)) {
      const { error: uploadError } = await supabase.storage.from(qualityDocumentsBucket).upload(storagePath, file, { contentType: file.type || 'application/pdf' });
      if (uploadError) {
        console.error('Unable to upload Quality inspection document', uploadError);
        return;
      }

      const { data, error } = await supabase
        .from('mes_quality_inspection_documents')
        .insert({
          organization_id: organizationId,
          production_order_id: selectedInspectionOrder.id,
          serial_number: selectedInspectionSerial,
          inspection_name: null,
          file_name: file.name,
          file_path: storagePath,
          file_type: file.type || 'application/pdf',
        })
        .select('*')
        .single();

      if (error) {
        console.error('Unable to save Quality inspection document', error);
        return;
      }
      nextDocument = data as QualityInspectionDocument;
    }

    setInspectionDocuments((current) => [nextDocument, ...current]);
  }, [organizationId, selectedInspectionOrder, selectedInspectionSerial]);

  const handleSaveSpecifications = React.useCallback(async (limits: Record<string, QualityCheckLimit>, measurementUnit: QualityMeasurementUnit) => {
    if (!selectedInspectionOrder) return;

    if (!isDemoQualityOrder(selectedInspectionOrder)) {
      const { error } = await supabase
        .from('mes_production_orders')
        .update({ quality_check_limits: limits, quality_measurement_unit: measurementUnit })
        .eq('id', selectedInspectionOrder.id)
        .eq('organization_id', organizationId);

      if (error) {
        console.error('Unable to save Quality specifications', error);
        return;
      }
    }

    setInspectionOrders((current) => current.map((order) => (
      order.id === selectedInspectionOrder.id ? { ...order, qualityCheckLimits: limits, qualityMeasurementUnit: measurementUnit } : order
    )));
  }, [organizationId, selectedInspectionOrder]);
  const handleOpenDocument = React.useCallback(async (document: QualityInspectionDocument) => {
    if (document.file_path.startsWith('blob:')) {
      setDocumentPreview({ fileName: document.file_name, fileUrl: document.file_path });
      return;
    }

    const { data, error } = await supabase.storage.from(qualityDocumentsBucket).createSignedUrl(document.file_path, 60 * 5);
    if (error || !data?.signedUrl) {
      console.error('Unable to open Quality inspection document', error);
      return;
    }
    setDocumentPreview({ fileName: document.file_name, fileUrl: data.signedUrl });
  }, []);
  const isDashboard = activeTab === 'dashboard';
  const activeConfig = isDashboard ? null : qualityPageConfig[activeTab as Exclude<QualityContextTab, 'dashboard'>];
  const eyebrow = isDashboard ? 'MES / QUALITY DASHBOARD' : activeConfig!.eyebrow;
  const title = isDashboard ? 'Quality Dashboard' : activeConfig!.title;
  const description = isDashboard
    ? 'Monitor inspections, NOK results, quality holds, and certificate risk at a glance.'
    : activeConfig!.description;
  const actionLabel = isDashboard ? 'New Inspection' : activeConfig!.actionLabel;
  const dashboardMeasurements = React.useMemo(() => measurementRecords.filter((measurement) => isQualityDateInRange(measurement.measured_at, dashboardDateRange)), [dashboardDateRange, measurementRecords]);
  const dashboardDocuments = React.useMemo(() => inspectionDocuments.filter((document) => isQualityDateOnOrBefore(document.uploaded_at, dashboardDateRange.to)), [dashboardDateRange.to, inspectionDocuments]);
  const dashboardInspectedSerials = React.useMemo(() => serialInspectionRecords.filter((record) => isQualityDateOnOrBefore(record.inspected_at, dashboardDateRange.to)), [dashboardDateRange.to, serialInspectionRecords]);
  const dashboardProductionSerials = React.useMemo(() => productionSerialRecords.filter((record) => record.reported_at && isQualityDateOnOrBefore(record.reported_at, dashboardDateRange.to)), [dashboardDateRange.to, productionSerialRecords]);
  const isInspectionsPage = activeTab === 'inspections';
  const pendingInspectionOrders = React.useMemo(() => qualityEnabledOrders.filter((order) => getPendingQualityOrderSerials(order, serialInspectionRecords, productionSerialRecords).length > 0), [qualityEnabledOrders, serialInspectionRecords, productionSerialRecords]);
  const isCertificatesPage = activeTab === 'certificates-docs';
  const completedOrderIds = React.useMemo(() => new Set(serialInspectionRecords.map((record) => record.production_order_id)), [serialInspectionRecords]);
  const completedOrders = React.useMemo(() => qualityEnabledOrders.filter((order) => completedOrderIds.has(order.id)), [completedOrderIds, qualityEnabledOrders]);
  const selectedCertificateRecord = serialInspectionRecords.find((record) => record.production_order_id === selectedInspectionOrder?.id && record.serial_number === selectedInspectionSerial);
  const selectedAvailableSerialCount = selectedInspectionOrder ? getQualityOrderSerials(selectedInspectionOrder, productionSerialRecords).length : 0;

  React.useEffect(() => {
    if (!isInspectionsPage) return;
    if (!pendingInspectionOrders.length) {
      if (selectedInspectionSerial) setSelectedInspectionSerial('');
      return;
    }

    const nextOrder = pendingInspectionOrders.find((order) => order.id === selectedInspectionOrderId) ?? pendingInspectionOrders[0];
    const pendingSerials = getPendingQualityOrderSerials(nextOrder, serialInspectionRecords, productionSerialRecords);
    const nextSerial = pendingSerials.includes(selectedInspectionSerial) ? selectedInspectionSerial : pendingSerials[0] ?? '';

    if (nextOrder.id !== selectedInspectionOrderId) setSelectedInspectionOrderId(nextOrder.id);
    if (nextSerial !== selectedInspectionSerial) setSelectedInspectionSerial(nextSerial);
  }, [isInspectionsPage, pendingInspectionOrders, selectedInspectionOrderId, selectedInspectionSerial, serialInspectionRecords, productionSerialRecords]);

  React.useEffect(() => {
    if (!isCertificatesPage || !completedOrders.length) return;
    const nextOrder = completedOrders.find((order) => order.id === selectedInspectionOrderId) ?? completedOrders[0];
    const completedSerials = serialInspectionRecords.filter((record) => record.production_order_id === nextOrder.id);
    const nextSerial = completedSerials.some((record) => record.serial_number === selectedInspectionSerial)
      ? selectedInspectionSerial
      : completedSerials[0]?.serial_number ?? '';

    if (nextOrder.id !== selectedInspectionOrderId) setSelectedInspectionOrderId(nextOrder.id);
    if (nextSerial !== selectedInspectionSerial) setSelectedInspectionSerial(nextSerial);
  }, [completedOrders, isCertificatesPage, selectedInspectionOrderId, selectedInspectionSerial, serialInspectionRecords, productionSerialRecords]);

  return (
    <section className="mes-workspace-panel quality-operations-workspace">
      <div className="mes-screen-header">
        <button className="academy-back-button engineering-back-button mes-workspace-back" type="button" onClick={() => onNavigate('/workspace/manufacturing-ops/mes')}>
          <ArrowLeft size={16} />
          MES Applications
        </button>
        <div className="mes-workspace-heading">
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        {isDashboard ? (
          <QualityDashboardDateFilters range={dashboardDateRange} onChange={setDashboardDateRange} />
        ) : activeTab !== 'inspections' && activeTab !== 'certificates-docs' ? (
          <div className="quality-header-actions">
            <button type="button">
              <Plus size={16} /> {actionLabel}
            </button>
          </div>
        ) : <div className="quality-header-actions empty" aria-hidden="true" />}
      </div>

      <div className="quality-app-shell">
        {isDashboard ? <QualityDashboard orders={inspectionOrders} measurements={dashboardMeasurements} documents={dashboardDocuments} inspectedSerials={dashboardInspectedSerials} productionSerials={dashboardProductionSerials} /> : null}
        {isInspectionsPage && selectedInspectionOrder && selectedInspectionSerial ? (
          <QualityInspectionsPage
            selectedOrder={selectedInspectionOrder}
            selectedSerial={selectedInspectionSerial}
            measurements={measurementRecords}
            documents={inspectionDocuments}
            inspectedSerials={serialInspectionRecords}
            productionSerials={productionSerialRecords}
            onChangeOrder={() => setOrderPickerOpen(true)}
            onChangeSerial={() => setSerialPickerOpen(true)}
            onSaveMeasurement={handleSaveMeasurement}
            onUploadDocument={handleUploadDocument}
            onOpenDocument={handleOpenDocument}
            onConfigureLimits={handleConfigureInspectionLimits}
            onSaveInspection={handleSaveSerialInspection}
          />
        ) : null}
        {isInspectionsPage && !selectedInspectionSerial ? (
          <div className="quality-certificates-empty-state">
            <PackageCheck size={28} />
            <strong>{selectedAvailableSerialCount ? 'All available pieces inspected' : 'No manufactured pieces available'}</strong>
            <span>{selectedAvailableSerialCount ? 'Completed inspections are available in Certificates & Docs.' : 'Only good pieces with saved Operator Terminal measurements can be inspected.'}</span>
          </div>
        ) : null}
        {activeTab === 'specifications' && selectedInspectionOrder ? (
          <QualitySpecificationsPage
            selectedOrder={selectedInspectionOrder}
            onChangeOrder={() => setOrderPickerOpen(true)}
            onSaveSpecifications={handleSaveSpecifications}
            highlightRequest={specificationHighlightRequest}
          />
        ) : null}
        {isCertificatesPage && selectedInspectionOrder && selectedCertificateRecord ? (
          <QualityCertificatesPage
            selectedOrder={selectedInspectionOrder}
            selectedSerial={selectedInspectionSerial}
            inspectionRecord={selectedCertificateRecord}
            measurements={measurementRecords}
            documents={inspectionDocuments}
            organizationName={organizationName}
            organizationLogoUrl={organizationLogoUrl}
            onChangeOrder={() => setOrderPickerOpen(true)}
            onChangeSerial={() => setSerialPickerOpen(true)}
            onOpenDocument={handleOpenDocument}
          />
        ) : null}
        {isCertificatesPage && (!selectedInspectionOrder || !selectedCertificateRecord) ? (
          <div className="quality-certificates-empty-state"><ShieldCheck size={28} /><strong>No completed inspections yet</strong><span>Certificates will appear here after a serial inspection is saved.</span></div>
        ) : null}
        {!isDashboard && activeTab !== 'inspections' && activeTab !== 'specifications' && activeTab !== 'certificates-docs' ? <QualityPlaceholderPage config={activeConfig!} /> : null}
      </div>

      {orderPickerOpen ? (
        <QualityOrderPickerModal
          orders={isCertificatesPage ? completedOrders : isInspectionsPage ? pendingInspectionOrders : qualityEnabledOrders}
          currentOrderId={selectedInspectionOrder?.id ?? ''}
          inspectedSerials={serialInspectionRecords}
          productionSerials={productionSerialRecords}
          completedOnly={isCertificatesPage}
          onClose={() => setOrderPickerOpen(false)}
          onSelect={(order) => {
            setSelectedInspectionOrderId(order.id);
            const firstCompletedSerial = serialInspectionRecords.find((record) => record.production_order_id === order.id)?.serial_number;
            const firstPendingSerial = getPendingQualityOrderSerials(order, serialInspectionRecords, productionSerialRecords)[0];
            setSelectedInspectionSerial(isCertificatesPage ? firstCompletedSerial ?? '' : firstPendingSerial ?? '');
            setOrderPickerOpen(false);
          }}
        />
      ) : null}

      {serialPickerOpen && selectedInspectionOrder ? (
        <QualitySerialPickerModal
          order={selectedInspectionOrder}
          currentSerial={selectedInspectionSerial}
          inspectedSerials={serialInspectionRecords}
          productionSerials={productionSerialRecords}
          completedOnly={isCertificatesPage}
          onClose={() => setSerialPickerOpen(false)}
          onSelect={(serial) => {
            setSelectedInspectionSerial(serial);
            setSerialPickerOpen(false);
          }}
        />
      ) : null}

      {documentPreview ? (
        <div className="supplier-modal-backdrop" role="presentation">
          <div className="supplier-modal quality-document-viewer-modal" role="dialog" aria-modal="true" aria-labelledby="quality-document-viewer-title">
            <button className="supplier-modal-close" type="button" onClick={() => setDocumentPreview(null)} aria-label="Close document viewer">
              <X size={18} />
            </button>
            <div>
              <div className="supplier-modal-header">
                <span>Inspection Document</span>
                <strong id="quality-document-viewer-title">{documentPreview.fileName}</strong>
              </div>
              <div className="supplier-document-preview">
                <iframe src={getQualityDocumentPreviewUrl(documentPreview.fileUrl)} title={`Preview ${documentPreview.fileName}`} />
              </div>
              <div className="supplier-modal-actions">
                <button type="button" onClick={() => setDocumentPreview(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function getPendingQualityOrderSerials(order: ProductionOrder, inspectedSerials: QualitySerialInspectionRecord[], productionSerials: QualityProductionSerialRecord[]) {
  return getQualityOrderSerials(order, productionSerials).filter((serial) => !isQualitySerialInspected(inspectedSerials, order.id, serial));
}
