import React from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  Check,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  FileText,
  ImagePlus,
  Pause,
  Play,
  Power,
  RotateCcw,
  Search,
  SquareTerminal,
  Timer,
  Wrench,
  X,
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useSupabaseRealtimeRefresh } from '../lib/useSupabaseRealtimeRefresh';
import {
  getProductionOrderDetailPayloadNumber,
  JobQueueModal,
  ProductionOrderDetailsModal,
  type JobQueueSummary,
  type ProductionOrderDetailPiece,
  type ProductionOrderDetailQualityDocumentRow,
  type ProductionOrderDetailQualityInspectionRow,
  type ProductionOrderDetailQualityMeasurementRow,
  type ProductionOrderDetailSerialRow,
  type ProductionOrderDetailsState,
  type ProductionOrderDetailTraceabilityRow,
} from './MesWorkspaces';
import type { ProductionOrder } from './mesTypes';
import {
  fetchOperatorScrapEvents,
  fetchOperatorProductionSerials,
  fetchOperatorTraceabilityRecord,
  closeOperatorStationDowntime,
  correctOperatorMeasurement,
  fetchOperatorTerminalSnapshot,
  reportOperatorProduction,
  reportOperatorStationDowntime,
  resumeOperatorStation,
  setOperatorStationSetup,
  setOperatorStationAvailability,
  setOperatorTerminalState,
  switchOperatorActiveOrder,
  type OperatorScrapEvent,
  type OperatorProductionSerial,
  type OperatorTraceabilityRecord,
  type OperatorTerminalSnapshot,
} from './operatorTerminalApi';

type OperatorTerminalProps = {
  onNavigate: (path: string) => void;
  organizationId: string;
  languageCode?: string;
  t?: (text: string) => string;
};

type TerminalState = 'not-started' | 'running' | 'paused' | 'setup' | 'down' | 'maintenance' | 'offline' | 'completed';
type TerminalModal = 'scrap' | 'pause' | 'downtime' | 'maintenance' | 'offline' | 'complete' | 'undo' | 'queue' | 'scrap-events' | 'switch-order' | 'part-picker' | null;
const getActiveOrderStorageKey = (organizationId: string) => `yvimo-operator-terminal-active-order:${organizationId}`;
const defaultOperatorT = (text: string) => text;
const operatorTerminalSpanish: Record<string, string> = {
  'Operator Terminal': 'Terminal de operador',
  'MES Applications': 'Aplicaciones MES',
  'Production count': 'Conteo de producción',
  'Reported': 'Reportadas',
  'of': 'de',
  'left': 'restantes',
  'Scrap': 'Scrap',
  'Open scrap events': 'Abrir eventos de scrap',
  'Work Center': 'Centro de trabajo',
  'Station': 'Estación',
  'Operator': 'Operador',
  'Shift': 'Turno',
  '1st': '1er',
  '2nd': '2do',
  '3rd': '3er',
  'Now Running': 'Corriendo ahora',
  'Order Number': 'Número de orden',
  'Part Name': 'Nombre de pieza',
  'Part Number': 'Número de parte',
  'Due Date': 'Fecha vencimiento',
  'No Production Order assigned to this station': 'No hay orden de producción asignada a esta estación',
  'Station is in downtime': 'La estación está en paro',
  'Operator actions': 'Acciones del operador',
  'Complete Operation': 'Completar operación',
  'Final counts reached': 'Conteos finales alcanzados',
  '+1 Good': '+1 Buena',
  'Fast production report': 'Reporte rápido de producción',
  '+1 Scrap': '+1 Scrap',
  'Requires reason': 'Requiere motivo',
  'Production Order is in downtime': 'La orden está en paro',
  'Production Order has not started': 'La orden no ha iniciado',
  'Production Order is paused': 'La orden está pausada',
  'Press Resume once the issue is cleared to continue reporting production.': 'Presiona Reanudar cuando el problema esté resuelto para seguir reportando producción.',
  'Press Start Job to begin reporting production.': 'Presiona Iniciar trabajo para comenzar a reportar producción.',
  'Press Resume to continue reporting production.': 'Presiona Reanudar para continuar reportando producción.',
  'Undo Last': 'Deshacer último',
  'Pause': 'Pausar',
  'Resume': 'Reanudar',
  'Station returned to service': 'Estación nuevamente disponible',
  'Start Job': 'Iniciar trabajo',
  'Report Downtime': 'Reportar paro',
  'Job Queue': 'Cola de trabajo',
  'Order Details': 'Detalles de orden',
  'Part Traceability': 'Trazabilidad de pieza',
  'Sharpening capture': 'Captura de afilado',
  'Wheel capture': 'Captura de rueda',
  'Job metadata': 'Datos del trabajo',
  'Client': 'Cliente',
  'Select customer': 'Seleccionar cliente',
  'Template': 'Plantilla',
  'Sharpening Data': 'Datos de afilado',
  'Inspection Data': 'Datos de inspección',
  'Part': 'Pieza',
  'Tool ID': 'Tool ID',
  'Serial Number': 'Número de serie',
  'Search part, serial, or status': 'Buscar pieza, serie o estado',
  'Dimensions': 'Dimensiones',
  'Dimensions unit': 'Unidad de dimensiones',
  'Inches': 'Pulgadas',
  'Millimeters': 'Milímetros',
  'Before Sharpening': 'Antes de afilar',
  'Notch': 'Muesca',
  'Height': 'Altura',
  'Tooth Length': 'Longitud de diente',
  'Tooth Damage': 'Daño de diente',
  'Damage Photo': 'Foto de daño',
  'Part Photo': 'Foto de pieza',
  'No. Afilado': 'No. Afilado',
  'Sharpening No.': 'No. de afilado',
  'Diameter': 'Diámetro',
  'Span': 'Span',
  'Teeth': 'Dientes',
  'Damage': 'Daño',
  'Stock to Remove': 'Material a remover',
  'After Sharpening': 'Después de afilar',
  'Part traceability disabled': 'Trazabilidad de pieza deshabilitada',
  'Capture will be enabled when this station has an assigned Production Order.': 'La captura se habilitará cuando esta estación tenga una orden de producción asignada.',
  'Shipper': 'Shipper',
  'Reception': 'Recepción',
  'Report Scrap': 'Reportar scrap',
  'Scrap Reason': 'Motivo de scrap',
  'Pause Job': 'Pausar trabajo',
  'Pause Reason': 'Motivo de pausa',
  'Downtime Reason': 'Motivo de paro',
  'Complete Review': 'Revisión de cierre',
  'Completion Review': 'Revisión de cierre',
  'Undo Last Report': 'Deshacer último reporte',
  'Adjustment Reason': 'Motivo de ajuste',
  'Good Qty': 'Cantidad buena',
  'Scrap Qty': 'Cantidad scrap',
  'Total Reported': 'Total reportado',
  'Comment': 'Comentario',
  'Optional note for the event log': 'Nota opcional para el registro de eventos',
  'Attach Photo': 'Adjuntar foto',
  'Cancel': 'Cancelar',
  'Close': 'Cerrar',
  'Scrap Events': 'Eventos de scrap',
  'Order': 'Orden',
  'Loading scrap events...': 'Cargando eventos de scrap...',
  'No scrap events reported for this Production Order yet.': 'Aún no hay eventos de scrap reportados para esta orden.',
  'Select Part': 'Seleccionar pieza',
  'Edit': 'Editar',
  'Editing reported piece': 'Editando pieza reportada',
  'Save Correction': 'Guardar corrección',
  'Cancel Correction': 'Cancelar corrección',
  'Measurement correction loaded': 'Corrección de medición cargada',
  'Measurement correction saved': 'Corrección de medición guardada',
  'Could not load measurement correction': 'No se pudo cargar la corrección de medición',
  'Could not save measurement correction': 'No se pudo guardar la corrección de medición',
  'Select a planned piece for this operation.': 'Selecciona una pieza planeada para esta operación.',
  'Search part, tool, serial, or status': 'Buscar pieza, tool, serie o estado',
  'Status': 'Estado',
  'Loading pieces...': 'Cargando piezas...',
  'No assigned pieces found for this Production Order.': 'No se encontraron piezas asignadas para esta orden.',
  'available': 'disponible',
  'good': 'buena',
  'scrap': 'scrap',
  'Change Active Order': 'Cambiar orden activa',
  'Select any non-completed Production Order to make it the active running job for this station.': 'Selecciona una orden no completada para hacerla el trabajo activo de esta estación.',
  'Search order, part, or client': 'Buscar orden, pieza o cliente',
  'Work Order / Part': 'Orden / Pieza',
  'Manufacturing Status': 'Estado de manufactura',
  'Manufacturing Progress': 'Progreso de manufactura',
  'Manufactured': 'Fabricado',
  'Unassigned': 'Sin asignar',
  'Select': 'Seleccionar',
  'Inactive': 'Inactivo',
  'No non-completed work orders found': 'No se encontraron órdenes sin completar',
  'released': 'liberada',
  'running': 'corriendo',
  'paused': 'pausada',
  'No single-operation production orders are assigned yet.': 'Aún no hay órdenes de operación única asignadas.',
  'Operator Terminal backend is not available yet. Showing demo terminal data.': 'El backend de Terminal de operador aún no está disponible. Mostrando datos demo.',
  'No active customers configured in Clients.': 'No hay clientes activos configurados en Clientes.',
  'Enter a serial number before reporting this piece.': 'Ingresa un número de serie antes de reportar esta pieza.',
  'Enter a serial number before reporting this piece': 'Ingresa un número de serie antes de reportar esta pieza',
  'Good part reported': 'Pieza buena reportada',
  'Good part and traceability saved': 'Pieza buena y trazabilidad guardadas',
  'Could not sync production report': 'No se pudo sincronizar el reporte de producción',
  'Scrap reported': 'Scrap reportado',
  'Scrap and traceability saved': 'Scrap y trazabilidad guardados',
  'Could not load scrap events': 'No se pudieron cargar los eventos de scrap',
  'Could not sync pause': 'No se pudo sincronizar la pausa',
  'Job paused': 'Trabajo pausado',
  'Could not sync downtime': 'No se pudo sincronizar el paro',
  'Downtime reported': 'Paro reportado',
  'Manufacturing completed; waiting for Quality inspection': 'Manufactura completada; esperando inspección de calidad',
  'Operation completed': 'Operación completada',
  'Could not sync completion': 'No se pudo sincronizar el cierre',
  'Last report adjusted': 'Último reporte ajustado',
  'Job resumed': 'Trabajo reanudado',
  'Job started': 'Trabajo iniciado',
  'Could not sync job state': 'No se pudo sincronizar el estado del trabajo',
  'Active order changed': 'Orden activa cambiada',
  'Could not change active order': 'No se pudo cambiar la orden activa',
  'Tooth damage': 'Daño de diente',
  'Out of tolerance': 'Fuera de tolerancia',
  'Surface defect': 'Defecto superficial',
  'Wrong tool': 'Tool incorrecto',
  'Setup issue': 'Problema de setup',
  'Machine issue': 'Problema de máquina',
  'Material issue': 'Problema de material',
  'Other': 'Otro',
  'Break': 'Descanso',
  'Shift change': 'Cambio de turno',
  'Waiting for material': 'Esperando material',
  'Waiting for setup': 'Esperando setup',
  'Waiting for quality': 'Esperando calidad',
  'Waiting for maintenance': 'Esperando mantenimiento',
  'Tooling issue': 'Problema de herramental',
  'Machine fault': 'Falla de máquina',
  'Maintenance required': 'Mantenimiento requerido',
  'Tool broken': 'Tool roto',
  'Sensor issue': 'Problema de sensor',
  'Controls issue': 'Problema de controles',
  'Quality hold': 'Retención de calidad',
  'No material': 'Sin material',
  'No operator': 'Sin operador',
  'Confirm final counts': 'Confirmar conteos finales',
  'Needs supervisor review': 'Requiere revisión de supervisor',
  'Wrong button pressed': 'Botón incorrecto presionado',
  'Duplicate entry': 'Entrada duplicada',
  'Supervisor adjustment': 'Ajuste de supervisor',
};

function createOperatorTranslator(languageCode = 'en', baseT: (text: string) => string = defaultOperatorT) {
  return (text: string) => {
    const baseTranslation = baseT(text);
    if (languageCode === 'es') return operatorTerminalSpanish[text] ?? baseTranslation;
    return baseTranslation;
  };
}

function loadActiveOrderId(organizationId: string) {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(getActiveOrderStorageKey(organizationId)) ?? '';
  } catch {
    return '';
  }
}

function persistActiveOrderId(organizationId: string, orderId: string) {
  if (typeof window === 'undefined' || !orderId) return;
  try {
    window.localStorage.setItem(getActiveOrderStorageKey(organizationId), orderId);
  } catch {
    // The server-side running order remains the fallback when storage is unavailable.
  }
}

type ReportEvent = {
  type: 'good' | 'scrap';
  timestamp: string;
  reason?: string;
  comment?: string;
  partNumber?: string;
  partName?: string;
  orderNumber?: string;
  reportedTotal?: number;
};

type TraceabilityFormState = {
  customerId: string;
  client: string;
  shipper: string;
  reception: string;
  toolId: string;
  serialNumber: string;
  beforeHeight: string;
  beforeNotch: string;
  beforeToothLength: string;
  damageA: string;
  damageB: string;
  damageC: string;
  stockToRemove: string;
  afterToothLength: string;
  shaverSharpeningNumber: string;
  shaverDiameter: string;
  shaverSpan: string;
  shaverTeeth: string;
  shaverDamage: boolean;
};

type TraceabilityTextField = Exclude<keyof TraceabilityFormState, 'shaverDamage'>;

type OperatorCustomerOption = {
  id: string;
  customer_name: string;
  status: 'active' | 'inactive';
};

const scrapReasons = [
  'Tooth damage',
  'Out of tolerance',
  'Surface defect',
  'Wrong tool',
  'Setup issue',
  'Machine issue',
  'Material issue',
  'Other',
];

const pauseReasons = [
  'Break',
  'Shift change',
  'Waiting for material',
  'Waiting for setup',
  'Waiting for quality',
  'Waiting for maintenance',
  'Tooling issue',
  'Other',
];

const downtimeReasons = [
  'Machine fault',
  'Maintenance required',
  'Tool broken',
  'Sensor issue',
  'Controls issue',
  'Quality hold',
  'No material',
  'No operator',
  'Other',
];

const queueJobs = [
  { orderNumber: 'SO-54652', partNumber: 'HC-651647', partName: 'Hob Cutter', priority: 'Normal', dueDate: 'Jun 08, 2026', status: 'Released' },
  { orderNumber: 'SO-54673', partNumber: 'HC-751120', partName: 'Skiving Tool', priority: 'High', dueDate: 'Jun 09, 2026', status: 'Queued' },
  { orderNumber: 'SO-54710', partNumber: 'HC-882031', partName: 'Spline Hob', priority: 'Expedite', dueDate: 'Jun 10, 2026', status: 'Queued' },
];

const queuedProductionOrders: ProductionOrder[] = queueJobs.map((job, index) => ({
  id: `operator-queue-${index + 1}`,
  orderNumber: job.orderNumber,
  partNumber: job.partNumber,
  partName: job.partName,
  plannedQuantity: index === 0 ? 350 : index === 1 ? 800 : 25,
  completedQuantity: 0,
  scrapQuantity: 0,
  status: 'released',
  priority: job.priority.toLowerCase() === 'expedite' ? 'expedite' : job.priority.toLowerCase() === 'high' ? 'high' : 'normal',
  dueDate: job.dueDate,
  assignedWorkCenter: 'TRC-HQ',
  plannedShifts: [],
  manufacturingType: 'single-operation',
  productionFlow: '',
  assignedStation: 'CNC-01',
}));

const fallbackCurrentOrder: ProductionOrder = {
  id: 'operator-terminal-demo-order',
  orderNumber: 'SO-54651',
  partNumber: 'HC-651646',
  partName: 'Hob Cutter',
  plannedQuantity: 100,
  completedQuantity: 0,
  scrapQuantity: 0,
  status: 'released',
  priority: 'normal',
  dueDate: 'Jun 07, 2026',
  assignedWorkCenter: 'TRC-HQ',
  plannedShifts: [],
  manufacturingType: 'single-operation',
  productionFlow: '',
  assignedStation: 'CNC-01',
};

const initialTraceabilityForm: TraceabilityFormState = {
  customerId: '',
  client: '',
  shipper: 'SHIP-000245',
  reception: 'REC-000884',
  toolId: 'TOOL-1034',
  serialNumber: 'SN-928441',
  beforeHeight: '',
  beforeNotch: '',
  beforeToothLength: '',
  damageA: '',
  damageB: '',
  damageC: '',
  stockToRemove: '',
  afterToothLength: '',
  shaverSharpeningNumber: '',
  shaverDiameter: '',
  shaverSpan: '',
  shaverTeeth: '',
  shaverDamage: false,
};

const clearedTraceabilityMeasurements: Pick<
  TraceabilityFormState,
  | 'beforeHeight'
  | 'beforeNotch'
  | 'beforeToothLength'
  | 'damageA'
  | 'damageB'
  | 'damageC'
  | 'stockToRemove'
  | 'afterToothLength'
  | 'shaverSharpeningNumber'
  | 'shaverDiameter'
  | 'shaverSpan'
  | 'shaverTeeth'
  | 'shaverDamage'
> = {
  beforeHeight: '',
  beforeNotch: '',
  beforeToothLength: '',
  damageA: '',
  damageB: '',
  damageC: '',
  stockToRemove: '',
  afterToothLength: '',
  shaverSharpeningNumber: '',
  shaverDiameter: '',
  shaverSpan: '',
  shaverTeeth: '',
  shaverDamage: false,
};

function formatToastTime() {
  return new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' }).format(new Date());
}

function formatEventTimestamp(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function parseTraceabilityNumber(value: string) {
  const normalizedValue = value.trim();
  if (!normalizedValue) return null;
  const nextValue = Number(normalizedValue);
  return Number.isFinite(nextValue) ? nextValue : null;
}

function getTraceabilityDamageCodes(form: TraceabilityFormState, reportType: 'good' | 'scrap', reason = '') {
  const codes = ([
    ['A', form.damageA],
    ['B', form.damageB],
    ['C', form.damageC],
  ] as const)
    .filter(([, value]) => Number(value) > 0)
    .map(([code, value]) => `${code}:${value}`);

  if (reportType === 'scrap' && reason) codes.push(`scrap:${reason}`);
  return codes;
}

type OperatorTraceabilityTemplate = {
  id: 'hobs' | 'shapers' | 'shavers' | 'wheel';
  beforeFields: Array<{
    key: Extract<TraceabilityTextField, 'beforeHeight' | 'beforeNotch' | 'beforeToothLength'>;
    label: string;
  }>;
  showToothDamage: boolean;
  photoLabel: string;
  afterToothLabel: string;
};

const hobsTraceabilityTemplate: OperatorTraceabilityTemplate = {
  id: 'hobs',
  beforeFields: [
    { key: 'beforeNotch', label: 'Notch' },
    { key: 'beforeToothLength', label: 'Tooth Length' },
  ],
  showToothDamage: true,
  photoLabel: 'Damage Photo',
  afterToothLabel: 'Tooth Length',
};

const shapersTraceabilityTemplate: OperatorTraceabilityTemplate = {
  id: 'shapers',
  beforeFields: [
    { key: 'beforeHeight', label: 'Height' },
  ],
  showToothDamage: false,
  photoLabel: 'Part Photo',
  afterToothLabel: 'Height',
};

const shaversTraceabilityTemplate: OperatorTraceabilityTemplate = {
  id: 'shavers',
  beforeFields: [],
  showToothDamage: false,
  photoLabel: 'Part Photo',
  afterToothLabel: 'After Sharpening',
};

const wheelTraceabilityTemplate: OperatorTraceabilityTemplate = {
  id: 'wheel',
  beforeFields: [],
  showToothDamage: false,
  photoLabel: '',
  afterToothLabel: '',
};

function getTraceabilityTemplateForPart(partName = '') {
  const normalizedPartName = partName.trim().toLowerCase();
  if (/\b(wheel|wheels)\b/.test(normalizedPartName)) return wheelTraceabilityTemplate;
  if (/\b(shaver|shavers)\b/.test(normalizedPartName)) return shaversTraceabilityTemplate;
  if (/\b(shaper|tallador|talladores)\b/.test(normalizedPartName)) return shapersTraceabilityTemplate;
  return hobsTraceabilityTemplate;
}

function suggestNextSerialNumber(serialNumber: string, partNumber: string, nextSequence: number) {
  const trimmedSerial = serialNumber.trim();
  const numericSuffix = trimmedSerial.match(/^(.*?)(\d+)$/);
  if (numericSuffix) {
    const nextNumber = String(Number(numericSuffix[2]) + 1).padStart(numericSuffix[2].length, '0');
    return `${numericSuffix[1]}${nextNumber}`;
  }
  return `${partNumber}-SN-${String(Math.max(1, nextSequence)).padStart(4, '0')}`;
}

function getOperatorReportErrorMessage(error: unknown) {
  const message = typeof error === 'object' && error && 'message' in error ? String(error.message) : '';
  return message.includes('already assigned') ? message : 'Could not sync production report';
}

function ReasonModal({
  modal,
  goodQty,
  scrapQty,
  t,
  onClose,
  onSubmit,
}: {
  modal: Exclude<TerminalModal, 'queue' | 'scrap-events' | 'switch-order' | 'part-picker' | null>;
  goodQty: number;
  scrapQty: number;
  t: (text: string) => string;
  onClose: () => void;
  onSubmit: (reason: string, comment: string) => void;
}) {
  const config = {
    scrap: {
      title: 'Report Scrap',
      label: 'Scrap Reason',
      options: scrapReasons,
      action: 'Report Scrap',
      icon: <AlertTriangle size={22} />,
    },
    pause: {
      title: 'Pause Job',
      label: 'Pause Reason',
      options: pauseReasons,
      action: 'Pause Job',
      icon: <Pause size={22} />,
    },
    downtime: {
      title: 'Report Downtime',
      label: 'Downtime Reason',
      options: downtimeReasons,
      action: 'Report Downtime',
      icon: <Wrench size={22} />,
    },
    maintenance: {
      title: 'Set Maintenance Status',
      label: 'Maintenance Reason',
      options: ['Preventive maintenance', 'Corrective maintenance', 'Inspection or service', 'Other'],
      action: 'Confirm Maintenance',
      icon: <Wrench size={22} />,
    },
    offline: {
      title: 'Set Offline Status',
      label: 'Offline Reason',
      options: ['End of shift', 'Machine unavailable', 'Utility or facility issue', 'Other'],
      action: 'Confirm Offline',
      icon: <Power size={22} />,
    },
    complete: {
      title: 'Complete Operation',
      label: 'Completion Review',
      options: ['Confirm final counts', 'Needs supervisor review', 'Other'],
      action: 'Complete Operation',
      icon: <ClipboardCheck size={22} />,
    },
    undo: {
      title: 'Undo Last Report',
      label: 'Adjustment Reason',
      options: ['Wrong button pressed', 'Duplicate entry', 'Supervisor adjustment', 'Other'],
      action: 'Undo Last',
      icon: <RotateCcw size={22} />,
    },
  }[modal];
  const [reason, setReason] = React.useState(config.options[0] ?? '');
  const [comment, setComment] = React.useState('');

  return (
    <div className="operator-terminal-modal-backdrop" role="presentation">
      <section className="operator-terminal-modal" role="dialog" aria-modal="true" aria-labelledby="operator-terminal-modal-title">
        <div className="operator-terminal-modal-heading">
          <span>{config.icon}</span>
          <div>
            <p className="eyebrow">{t('Operator Terminal')}</p>
            <h3 id="operator-terminal-modal-title">{t(config.title)}</h3>
          </div>
          <button type="button" aria-label={t('Close')} onClick={onClose}><X size={18} /></button>
        </div>
        {modal === 'complete' ? (
          <div className="operator-terminal-complete-summary">
            <article><span>{t('Good Qty')}</span><strong>{goodQty}</strong></article>
            <article><span>{t('Scrap Qty')}</span><strong>{scrapQty}</strong></article>
            <article><span>{t('Total Reported')}</span><strong>{goodQty + scrapQty}</strong></article>
          </div>
        ) : null}
        <label>
          {t(config.label)}
          <select value={reason} onChange={(event) => setReason(event.target.value)} required>
            {config.options.map((option) => <option key={option} value={option}>{t(option)}</option>)}
          </select>
        </label>
        <label>
          {t('Comment')}
          <textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder={t('Optional note for the event log')} />
        </label>
        {modal === 'scrap' ? (
          <button className="operator-terminal-attach" type="button">
            <ImagePlus size={18} />
            {t('Attach Photo')}
          </button>
        ) : null}
        <div className="operator-terminal-modal-actions">
          <button type="button" onClick={onClose}>{t('Cancel')}</button>
          <button type="button" onClick={() => onSubmit(reason, comment)}>{t(config.action)}</button>
        </div>
      </section>
    </div>
  );
}

function ScrapEventsModal({
  events,
  loading,
  order,
  t,
  onClose,
}: {
  events: OperatorScrapEvent[];
  loading: boolean;
  order: ProductionOrder | null;
  t: (text: string) => string;
  onClose: () => void;
}) {
  return (
    <div className="operator-terminal-modal-backdrop" role="presentation">
      <section className="operator-terminal-modal operator-terminal-scrap-events-modal" role="dialog" aria-modal="true" aria-labelledby="operator-terminal-scrap-events-title">
        <div className="operator-terminal-modal-heading">
          <span><AlertTriangle size={22} /></span>
          <div>
            <p className="eyebrow">{t('Operator Terminal')}</p>
            <h3 id="operator-terminal-scrap-events-title">{t('Scrap Events')}</h3>
          </div>
          <button type="button" aria-label={t('Close')} onClick={onClose}><X size={18} /></button>
        </div>
        <div className="operator-terminal-scrap-events-summary">
          <article><span>{t('Order')}</span><strong>{order?.orderNumber ?? t('Unassigned')}</strong></article>
          <article><span>{t('Part')}</span><strong>{order?.partName ?? '-'}</strong></article>
          <article><span>{t('Scrap Events')}</span><strong>{events.length}</strong></article>
        </div>
        {loading ? (
          <div className="operator-terminal-scrap-events-empty">{t('Loading scrap events...')}</div>
        ) : events.length ? (
          <div className="operator-terminal-scrap-events-list">
            {events.map((event) => (
              <article key={event.id}>
                <div>
                  <time>{formatEventTimestamp(event.timestamp)}</time>
                  <span>{event.reason}</span>
                </div>
                <div>
                  <span>{t('Comment')}</span>
                  <strong>{event.comment || '-'}</strong>
                </div>
                <b>{event.quantity.toLocaleString()}</b>
              </article>
            ))}
          </div>
        ) : (
          <div className="operator-terminal-scrap-events-empty">{t('No scrap events reported for this Production Order yet.')}</div>
        )}
        <div className="operator-terminal-modal-actions">
          <button type="button" onClick={onClose}>{t('Close')}</button>
        </div>
      </section>
    </div>
  );
}

function PartPickerModal({
  order,
  serials,
  activePieceSequence,
  loading,
  correctionLoading,
  t,
  onClose,
  onSelect,
  onEdit,
}: {
  order: ProductionOrder | null;
  serials: OperatorProductionSerial[];
  activePieceSequence: number;
  loading: boolean;
  correctionLoading: boolean;
  t: (text: string) => string;
  onClose: () => void;
  onSelect: (serial: OperatorProductionSerial) => void;
  onEdit: (serial: OperatorProductionSerial) => void;
}) {
  const [query, setQuery] = React.useState('');
  const isWheelOrder = /\b(wheel|wheels)\b/i.test(order?.partName ?? '');
  const normalizedQuery = query.trim().toLowerCase();
  const filteredSerials = normalizedQuery
    ? serials.filter((serial) => [
      String(serial.pieceSequence),
      serial.toolId,
      serial.serialNumber,
      serial.result ?? 'available',
    ].some((value) => value.toLowerCase().includes(normalizedQuery)))
    : serials;

  return (
    <div className="quality-order-modal-backdrop" role="presentation">
      <section className="quality-order-modal operator-terminal-part-picker-modal" role="dialog" aria-modal="true" aria-labelledby="operator-terminal-part-picker-title">
        <div className="quality-order-modal-heading">
          <span><ClipboardCheck size={22} /></span>
          <div><p className="eyebrow">{order?.orderNumber ?? t('Operator Terminal')}</p><h3 id="operator-terminal-part-picker-title">{t('Select Part')}</h3></div>
          <button type="button" aria-label={t('Close')} onClick={onClose}><X size={18} /></button>
        </div>
        <p className="quality-order-modal-copy">{order ? `${order.partName} / ${order.partNumber}` : t('Select a planned piece for this operation.')}</p>
        <label className="quality-serial-search quality-order-search">
          <Search size={17} />
          <input autoFocus type="search" value={query} placeholder={t(isWheelOrder ? 'Search part, serial, or status' : 'Search part, tool, serial, or status')} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <div className={`operator-terminal-part-picker-header ${isWheelOrder ? 'wheel' : ''}`} aria-hidden="true">
          <span>{t('Part')}</span>{!isWheelOrder ? <span>{t('Tool ID')}</span> : null}<span>{t('Serial Number')}</span><span>{t('Status')}</span><span></span>
        </div>
        <div className="operator-terminal-part-picker-list">
          {loading ? <div className="operator-terminal-part-picker-empty">{t('Loading pieces...')}</div> : null}
          {!loading && filteredSerials.map((serial) => {
            const reported = Boolean(serial.result);
            return (
              <article
                className={['operator-terminal-part-picker-row', isWheelOrder ? 'wheel' : '', serial.pieceSequence === activePieceSequence ? 'active' : '', reported ? 'reported' : ''].filter(Boolean).join(' ')}
                key={serial.id}
              >
                <strong>{serial.pieceSequence}</strong>
                {!isWheelOrder ? <span>{serial.toolId || '-'}</span> : null}
                <span>{serial.serialNumber}</span>
                <em className={reported ? `reported ${serial.result}` : 'available'}>{t(reported ? serial.result ?? '' : 'available')}</em>
                {reported ? (
                  <button className="operator-terminal-part-picker-edit" type="button" disabled={correctionLoading || !serial.traceabilityId} onClick={() => onEdit(serial)}>
                    {t('Edit')}
                  </button>
                ) : (
                  <button className="operator-terminal-part-picker-select" type="button" disabled={correctionLoading} onClick={() => onSelect(serial)}>
                    {t('Select')}
                  </button>
                )}
              </article>
            );
          })}
          {!loading && !filteredSerials.length ? <div className="operator-terminal-part-picker-empty">{t('No assigned pieces found for this Production Order.')}</div> : null}
        </div>
      </section>
    </div>
  );
}

function SwitchOrderModal({
  orders,
  currentOrderId,
  loading,
  t,
  onClose,
  onSelect,
}: {
  orders: ProductionOrder[];
  currentOrderId: string | null;
  loading: boolean;
  t: (text: string) => string;
  onClose: () => void;
  onSelect: (order: ProductionOrder) => void;
}) {
  const [query, setQuery] = React.useState('');
  const normalizedQuery = query.trim().toLowerCase();
  const availableOrders = orders.filter((order) => ['released', 'running', 'paused'].includes(order.status));
  const filteredOrders = normalizedQuery
    ? availableOrders.filter((order) => [
      order.orderNumber,
      order.partName,
      order.partNumber,
      order.clientName ?? '',
    ].some((value) => value.toLowerCase().includes(normalizedQuery)))
    : availableOrders;

  return (
    <div className="quality-order-modal-backdrop" role="presentation">
      <section className="quality-order-modal operator-terminal-switch-order-modal" role="dialog" aria-modal="true" aria-labelledby="operator-terminal-switch-order-title">
        <div className="quality-order-modal-heading">
          <span><ClipboardCheck size={22} /></span>
          <div><p className="eyebrow">{t('Operator Terminal')}</p><h3 id="operator-terminal-switch-order-title">{t('Change Active Order')}</h3></div>
          <button type="button" aria-label={t('Close')} onClick={onClose}><X size={18} /></button>
        </div>
        <p className="quality-order-modal-copy">{t('Select any non-completed Production Order to make it the active running job for this station.')}</p>
        <label className="quality-serial-search quality-order-search">
          <Search size={17} />
          <input autoFocus type="search" value={query} placeholder={t('Search order, part, or client')} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <div className="quality-order-switch-header" aria-hidden="true">
          <span>{t('Work Order / Part')}</span><span>{t('Client')}</span><span>{t('Manufacturing Status')}</span><span>{t('Manufacturing Progress')}</span>
        </div>
        <div className="quality-order-switch-list operator-terminal-order-picker-list">
          {filteredOrders.map((order) => (
            <button
              className={order.id === currentOrderId ? 'active' : ''}
              type="button"
              key={order.id}
              disabled={loading || order.id === currentOrderId}
              onClick={() => onSelect(order)}
            >
              <div>
                <strong>{order.orderNumber}</strong>
                <span>{order.partName} / {order.partNumber}</span>
              </div>
              <span className="operator-terminal-order-client">{order.clientName || t('Unassigned')}</span>
              <em className={`quality-picker-status quality-picker-status-${order.status}`}>{t(order.status)}</em>
              <b>
                <span>{t('Manufactured')}</span>
                {order.completedQuantity.toLocaleString()} {t('of')} {order.plannedQuantity.toLocaleString()}
              </b>
            </button>
          ))}
          {!filteredOrders.length ? <p>{t('No non-completed work orders found')}</p> : null}
        </div>
        <div className="quality-order-modal-actions">
          <button type="button" onClick={onClose}>{t('Cancel')}</button>
        </div>
      </section>
    </div>
  );
}

export function OperatorTerminalWorkspace({ onNavigate, organizationId, languageCode = 'en', t: baseT = defaultOperatorT }: OperatorTerminalProps) {
  const t = React.useMemo(() => createOperatorTranslator(languageCode, baseT), [baseT, languageCode]);
  const [state, setState] = React.useState<TerminalState>('not-started');
  const [goodQty, setGoodQty] = React.useState(0);
  const [scrapQty, setScrapQty] = React.useState(0);
  const [modal, setModal] = React.useState<TerminalModal>(null);
  const [toast, setToast] = React.useState('');
  const [events, setEvents] = React.useState<ReportEvent[]>([]);
  const [scrapEvents, setScrapEvents] = React.useState<OperatorScrapEvent[]>([]);
  const [scrapEventsLoading, setScrapEventsLoading] = React.useState(false);
  const [switchOrderLoading, setSwitchOrderLoading] = React.useState(false);
  const [orderDetailsOpen, setOrderDetailsOpen] = React.useState(false);
  const [orderDetails, setOrderDetails] = React.useState<ProductionOrderDetailsState>({
    loading: false,
    error: '',
    pieces: [],
    timeSpentMs: 0,
  });
  React.useEffect(() => {
    if (!orderDetailsOpen || orderDetails.loading || orderDetails.error) return undefined;
    const hasActiveProduction = orderDetails.pieces.some(
      (piece) => piece.status === 'running' || piece.status === 'setup',
    );
    if (!hasActiveProduction) return undefined;

    const intervalId = window.setInterval(() => {
      setOrderDetails((current) => ({
        ...current,
        timeSpentMs: current.timeSpentMs + 1000,
        pieces: current.pieces.map((piece) => (
          piece.status === 'running' || piece.status === 'setup'
            ? {
                ...piece,
                timeSpentMs: piece.timeSpentMs + 1000,
                runningTimeMs: piece.runningTimeMs + (piece.status === 'running' ? 1000 : 0),
                setupTimeMs: piece.setupTimeMs + (piece.status === 'setup' ? 1000 : 0),
              }
            : piece
        )),
      }));
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [orderDetailsOpen, orderDetails.loading, orderDetails.error, orderDetails.pieces]);
  const [snapshot, setSnapshot] = React.useState<OperatorTerminalSnapshot | null>(null);
  const [terminalMessage, setTerminalMessage] = React.useState('');
  const [syncPending, setSyncPending] = React.useState(false);
  const [productionSerials, setProductionSerials] = React.useState<OperatorProductionSerial[]>([]);
  const [productionSerialsLoading, setProductionSerialsLoading] = React.useState(false);
  const [selectedProductionSerialId, setSelectedProductionSerialId] = React.useState('');
  const [correctionSerial, setCorrectionSerial] = React.useState<OperatorProductionSerial | null>(null);
  const [correctionTraceability, setCorrectionTraceability] = React.useState<OperatorTraceabilityRecord | null>(null);
  const [correctionLoading, setCorrectionLoading] = React.useState(false);
  const [selectedWorkCenterCode, setSelectedWorkCenterCode] = React.useState('');
  const [selectedStationCode, setSelectedStationCode] = React.useState('');
  const selectedStationCodeRef = React.useRef('');
  selectedStationCodeRef.current = selectedStationCode;
  const [selectedOrderId, setSelectedOrderId] = React.useState('');
  const [dimensionUnit, setDimensionUnit] = React.useState<'in' | 'mm'>('in');
  const templateId = 'sharpening';
  const [traceabilityForm, setTraceabilityForm] = React.useState<TraceabilityFormState>(initialTraceabilityForm);
  const [customerOptions, setCustomerOptions] = React.useState<OperatorCustomerOption[]>([]);
  const [selectedShift, setSelectedShift] = React.useState<'1st' | '2nd' | '3rd'>('1st');
  const reportedCountsByOrderRef = React.useRef(new Map<string, { goodQty: number; scrapQty: number }>());
  const baseSnapshotOrder = snapshot?.currentOrder ?? fallbackCurrentOrder;
  const baseWorkCenterCode = snapshot?.workCenter?.code ?? baseSnapshotOrder.assignedWorkCenter;
  const baseWorkCenterName = snapshot?.workCenter?.name ?? 'Sharpening Area 01';
  const baseStationCode = snapshot?.station?.code ?? baseSnapshotOrder.assignedStation;
  const baseStationName = snapshot?.station?.name ?? 'Grinder Station 03';
  const workCenterOptions = snapshot?.workCenterOptions.length
    ? snapshot.workCenterOptions
    : [{ id: 'fallback-work-center', code: baseWorkCenterCode, name: baseWorkCenterName }];
  const workCenterCode = selectedWorkCenterCode || baseWorkCenterCode;
  const selectedWorkCenter = workCenterOptions.find((workCenter) => workCenter.code === workCenterCode) ?? workCenterOptions[0];
  const workCenterName = selectedWorkCenter?.name ?? baseWorkCenterName;
  const stationOptions = snapshot?.stationOptions.length
    ? snapshot.stationOptions.filter((station) => station.workCenterCode === workCenterCode)
    : [{
      id: 'fallback-station',
      workCenterId: 'fallback-work-center',
      workCenterCode,
      code: baseStationCode,
      name: baseStationName,
      type: 'Station',
      imageUrl: snapshot?.station?.imageUrl ?? '',
      status: snapshot?.station?.status ?? 'idle',
      operator: snapshot?.station?.operator ?? 'Carlos Mota',
      shift: snapshot?.station?.shift ?? 'A / Day',
      processStep: snapshot?.station?.processStep ?? 'Ready',
      currentJob: snapshot?.station?.currentJob ?? '',
    }];
  const stationCode = stationOptions.some((station) => station.code === selectedStationCode)
    ? selectedStationCode
    : stationOptions[0]?.code ?? baseStationCode;
  const selectedStation = stationOptions.find((station) => station.code === stationCode) ?? stationOptions[0];
  const stationName = selectedStation?.name ?? baseStationName;
  const stationOperator = selectedStation?.operator ?? snapshot?.station?.operator ?? 'Carlos Mota';
  const stationImageUrl = selectedStation?.imageUrl ?? snapshot?.station?.imageUrl ?? '';
  const stationOrders = snapshot
    ? snapshot.activeOrders.filter((order) => (
      order.assignedWorkCenter === workCenterCode
      && (order.manufacturingType === 'multi-step'
        ? snapshot.multiStepStationsByOrder[order.id]?.includes(stationCode)
        : order.assignedStation === stationCode)
    ))
    : [fallbackCurrentOrder];
  const currentOrder = stationOrders.find((order) => order.orderNumber === selectedStation?.currentJob)
    ?? stationOrders.find((order) => order.status === 'running')
    ?? stationOrders.find((order) => order.id === selectedOrderId)
    ?? stationOrders.find((order) => order.status === 'paused')
    ?? stationOrders.find((order) => order.status === 'released')
    ?? stationOrders.find((order) => order.status === 'completed')
    ?? null;
  const queuedOrders = snapshot
    ? stationOrders.filter((order) => order.id !== currentOrder?.id)
    : queuedProductionOrders;
  const hasAssignedOrder = Boolean(currentOrder);
  const hasSupabaseOrder = Boolean(snapshot && currentOrder);
  const totalQty = currentOrder?.plannedQuantity ?? 0;
  const completedQty = hasAssignedOrder ? goodQty + scrapQty : 0;
  const remainingQty = Math.max(0, totalQty - completedQty);
  const nextUnreportedProductionSerial = productionSerials.find((serial) => !serial.result) ?? null;
  const selectedProductionSerial = productionSerials.find((serial) => serial.id === selectedProductionSerialId) ?? null;
  const activePartSequence = selectedProductionSerial?.pieceSequence ?? nextUnreportedProductionSerial?.pieceSequence ?? (totalQty > 0 ? Math.min(totalQty, completedQty + 1) : 0);
  const isQuantityComplete = hasAssignedOrder && completedQty >= totalQty;
  const canReport = hasAssignedOrder && state === 'running';
  const isOrderPaused = hasAssignedOrder && state === 'paused';
  const isOrderDown = hasAssignedOrder && state === 'down';
  const isStationDown = state === 'down' || selectedStation?.status === 'down';
  const isStationSetup = state === 'setup' || selectedStation?.status === 'setup';
  const isStationMaintenance = state === 'maintenance' || selectedStation?.status === 'maintenance';
  const isStationOffline = state === 'offline' || selectedStation?.status === 'offline';
  const isStationUnavailable = isStationMaintenance || isStationOffline;
  const isOrderNotStarted = hasAssignedOrder && state === 'not-started';
  const startLabel = state === 'paused' || isStationDown || isStationSetup ? 'Resume' : 'Start Job';
  const traceabilityTemplate = React.useMemo(() => getTraceabilityTemplateForPart(currentOrder?.partName), [currentOrder?.partName]);

  React.useEffect(() => {
    const nextState: TerminalState = selectedStation?.status === 'down'
      ? 'down'
      : selectedStation?.status === 'setup'
        ? 'setup'
        : selectedStation?.status === 'maintenance'
          ? 'maintenance'
          : selectedStation?.status === 'offline'
            ? 'offline'
        : currentOrder?.status === 'running'
          ? 'running'
          : currentOrder?.status === 'paused'
            ? 'paused'
            : currentOrder && ['waiting-inspection', 'completed'].includes(currentOrder.status)
              ? 'completed'
              : 'not-started';
    setState((currentState) => currentState === nextState ? currentState : nextState);
  }, [stationCode, selectedStation?.status, currentOrder?.id, currentOrder?.status]);

  React.useEffect(() => {
    setModal(null);
    setTerminalMessage('');
  }, [stationCode]);

  React.useEffect(() => {
    setProductionSerials([]);
    setSelectedProductionSerialId('');
    setCorrectionSerial(null);
    setCorrectionTraceability(null);
    setTraceabilityForm(initialTraceabilityForm);
    setEvents([]);
  }, [stationCode]);

  const jobQueueSummary: JobQueueSummary = {
    machine: {
      workCenterCode,
      stationCode,
      stationName,
    },
    currentJob: currentOrder ? {
      id: currentOrder.id,
      orderNumber: currentOrder.orderNumber,
      partNumber: currentOrder.partNumber,
      partName: currentOrder.partName,
      plannedQuantity: totalQty,
      completedQuantity: completedQty,
      scrapQuantity: scrapQty,
      status: state === 'completed' ? 'completed' : state === 'paused' ? 'paused' : state === 'running' ? 'running' : 'released',
      priority: 'normal',
      dueDate: currentOrder.dueDate,
      assignedWorkCenter: currentOrder.assignedWorkCenter,
      manufacturingType: currentOrder.manufacturingType,
      productionFlow: currentOrder.productionFlow,
      assignedStation: currentOrder.assignedStation,
    } : null,
    queuedJobs: queuedOrders.map((order, index) => ({ order, position: index + 1 })),
    totalQuantity: remainingQty + queuedOrders.reduce((total, order) => total + Math.max(0, order.plannedQuantity - order.completedQuantity), 0),
  };

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2200);
  };

  const setTraceField = (field: TraceabilityTextField, value: string) => {
    setTraceabilityForm((current) => ({ ...current, [field]: value }));
  };

  const clearTraceabilityMeasurements = () => {
    setTraceabilityForm((current) => ({ ...current, ...clearedTraceabilityMeasurements }));
  };

  const rememberReportedCounts = React.useCallback((orderId: string, goodQuantity: number, scrapQuantity: number) => {
    const current = reportedCountsByOrderRef.current.get(orderId);
    const nextTotal = goodQuantity + scrapQuantity;
    const currentTotal = current ? current.goodQty + current.scrapQty : -1;
    if (!current || nextTotal >= currentTotal) {
      reportedCountsByOrderRef.current.set(orderId, { goodQty: goodQuantity, scrapQty: scrapQuantity });
    }
  }, []);

  const resolveOrderReportedCounts = React.useCallback((order: ProductionOrder) => {
    const reportedCounts = reportedCountsByOrderRef.current.get(order.id);
    if (!reportedCounts) return order;
    return {
      ...order,
      completedQuantity: reportedCounts.goodQty,
      scrapQuantity: reportedCounts.scrapQty,
    };
  }, []);

  const applyOrder = React.useCallback((order: ProductionOrder) => {
    const resolvedOrder = resolveOrderReportedCounts(order);
    rememberReportedCounts(resolvedOrder.id, resolvedOrder.completedQuantity, resolvedOrder.scrapQuantity);
    setGoodQty(resolvedOrder.completedQuantity);
    setScrapQty(resolvedOrder.scrapQuantity);
    setState((currentState) => {
      if (currentState === 'down' || currentState === 'setup' || currentState === 'maintenance' || currentState === 'offline') return currentState;
      return resolvedOrder.status === 'running'
        ? 'running'
        : resolvedOrder.status === 'paused'
          ? 'paused'
          : ['waiting-inspection', 'completed'].includes(resolvedOrder.status)
            ? 'completed'
            : 'not-started';
    });
  }, [rememberReportedCounts, resolveOrderReportedCounts]);

  const buildTraceabilityForUnit = (
    reportType: 'good' | 'scrap',
    order: ProductionOrder,
    serialNumber: string,
    reason = '',
    comment = '',
  ) => {
    const reportedSequence = selectedProductionSerial?.pieceSequence ?? Math.max(1, completedQty + 1);
    const isShaperTemplate = traceabilityTemplate.id === 'shapers';
    const isShaverTemplate = traceabilityTemplate.id === 'shavers';
    const isWheelTemplate = traceabilityTemplate.id === 'wheel';
    const templateDamageCodes = isWheelTemplate
      ? (reportType === 'scrap' && reason ? [`scrap:${reason}`] : [])
      : isShaverTemplate
      ? [
          ...(traceabilityForm.shaverDamage ? ['damage:yes'] : []),
          ...(reportType === 'scrap' && reason ? [`scrap:${reason}`] : []),
        ]
      : isShaperTemplate
        ? (reportType === 'scrap' && reason ? [`scrap:${reason}`] : [])
        : getTraceabilityDamageCodes(traceabilityForm, reportType, reason);
    return {
      template_id: isWheelTemplate ? 'wheel' : isShaverTemplate ? 'shaver-sharpening' : isShaperTemplate ? 'shaper-sharpening' : templateId,
      part_label: `Piece ${reportedSequence}`,
      tool_id: isWheelTemplate ? null : traceabilityForm.toolId.trim() || null,
      serial_number: serialNumber,
      dimensions_unit: dimensionUnit,
      before_notch: isShaperTemplate || isShaverTemplate || isWheelTemplate ? null : parseTraceabilityNumber(traceabilityForm.beforeNotch),
      before_tooth_length: isShaperTemplate || isShaverTemplate || isWheelTemplate ? null : parseTraceabilityNumber(traceabilityForm.beforeToothLength),
      damage_codes: templateDamageCodes,
      damage_image_url: null,
      stock_to_remove: isShaverTemplate || isWheelTemplate ? null : parseTraceabilityNumber(traceabilityForm.stockToRemove),
      after_tooth_length: isShaperTemplate || isShaverTemplate || isWheelTemplate ? null : parseTraceabilityNumber(traceabilityForm.afterToothLength),
      payload: {
        report_type: reportType,
        traceability_template: traceabilityTemplate.id,
        piece_sequence: reportedSequence,
        order_status: order.status,
        order_number: order.orderNumber,
        part_number: order.partNumber,
        part_name: order.partName,
        before_height: isShaperTemplate ? parseTraceabilityNumber(traceabilityForm.beforeHeight) : null,
        after_height: isShaperTemplate ? parseTraceabilityNumber(traceabilityForm.afterToothLength) : null,
        shaver_sharpening_number: isShaverTemplate ? traceabilityForm.shaverSharpeningNumber.trim() || null : null,
        shaver_diameter: isShaverTemplate ? parseTraceabilityNumber(traceabilityForm.shaverDiameter) : null,
        shaver_span: isShaverTemplate ? parseTraceabilityNumber(traceabilityForm.shaverSpan) : null,
        shaver_teeth: isShaverTemplate ? parseTraceabilityNumber(traceabilityForm.shaverTeeth) : null,
        shaver_damage: isShaverTemplate ? traceabilityForm.shaverDamage : null,
        reason: reason || null,
        comment: comment || null,
        customer_id: traceabilityForm.customerId || null,
        client: traceabilityForm.client,
        shipper: traceabilityForm.shipper,
        reception: traceabilityForm.reception,
        station_name: stationName,
        work_center_code: workCenterCode,
        operator: stationOperator,
        shift: selectedShift,
      },
    };
  };

  const localScrapEvents = React.useMemo<OperatorScrapEvent[]>(() => events
    .filter((event) => event.type === 'scrap')
    .map((event, index) => ({
      id: `local-scrap-${index}-${event.timestamp}`,
      timestamp: event.timestamp,
      quantity: 1,
      reason: event.reason ?? 'Scrap reported',
      comment: event.comment ?? '',
      partNumber: event.partNumber ?? currentOrder?.partNumber ?? '',
      partName: event.partName ?? currentOrder?.partName ?? '',
      orderNumber: event.orderNumber ?? currentOrder?.orderNumber ?? '',
      reportedTotal: event.reportedTotal ?? null,
    })), [currentOrder, events]);

  const openScrapEvents = async () => {
    if (!currentOrder || scrapQty <= 0) return;
    setModal('scrap-events');
    if (!hasSupabaseOrder) {
      setScrapEvents(localScrapEvents);
      return;
    }

    setScrapEventsLoading(true);
    try {
      const nextEvents = await fetchOperatorScrapEvents({
        orderId: currentOrder.id,
        organizationId,
        stationCode,
        fallbackOrder: currentOrder,
      });
      setScrapEvents(nextEvents);
    } catch (error) {
      console.error('Unable to load scrap events', error);
      setScrapEvents(localScrapEvents);
      showToast('Could not load scrap events');
    } finally {
      setScrapEventsLoading(false);
    }
  };

  const openOrderDetails = async () => {
    if (!currentOrder) return;
    setOrderDetailsOpen(true);
    setOrderDetails({ loading: true, error: '', pieces: [], timeSpentMs: 0 });
    try {
      const [
        { data: serialData, error: serialError },
        { data: traceabilityData, error: traceabilityError },
        { data: qualityInspectionData, error: qualityInspectionError },
        { data: qualityMeasurementData, error: qualityMeasurementError },
        { data: qualityDocumentData, error: qualityDocumentError },
        { data: statusCycleData, error: statusCycleError },
      ] = await Promise.all([
        supabase
          .from('mes_production_serials')
          .select('id, production_order_id, piece_sequence, tool_id, serial_number, result, ready_for_quality, traceability_id, reported_at')
          .eq('organization_id', organizationId)
          .eq('production_order_id', currentOrder.id)
          .order('piece_sequence', { ascending: true }),
        supabase
          .from('mes_operator_terminal_traceability')
          .select('id, production_order_id, template_id, part_label, tool_id, serial_number, dimensions_unit, before_notch, before_tooth_length, damage_codes, stock_to_remove, after_tooth_length, payload, created_at')
          .eq('organization_id', organizationId)
          .eq('production_order_id', currentOrder.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('mes_quality_serial_inspections')
          .select('id, production_order_id, serial_number, result, inspected_at')
          .eq('organization_id', organizationId)
          .eq('production_order_id', currentOrder.id)
          .order('inspected_at', { ascending: false }),
        supabase
          .from('mes_quality_measurements')
          .select('id, production_order_id, serial_number, inspection_name, measured_value, lower_limit, upper_limit, result, measured_at')
          .eq('organization_id', organizationId)
          .eq('production_order_id', currentOrder.id)
          .order('measured_at', { ascending: false }),
        supabase
          .from('mes_quality_inspection_documents')
          .select('id, production_order_id, serial_number, inspection_name, file_name, file_path, file_type, uploaded_at')
          .eq('organization_id', organizationId)
          .eq('production_order_id', currentOrder.id)
          .order('uploaded_at', { ascending: false }),
        supabase
          .from('mes_station_status_cycles')
          .select('production_order_id, order_number, station_code, serial_number, status, started_at, ended_at')
          .eq('organization_id', organizationId)
          .or(`production_order_id.eq.${currentOrder.id},order_number.eq.${currentOrder.orderNumber},and(station_code.eq.${stationCode},ended_at.is.null)`),
      ]);

      if (serialError) throw serialError;
      if (traceabilityError) throw traceabilityError;
      if (qualityInspectionError) throw qualityInspectionError;
      if (qualityMeasurementError) throw qualityMeasurementError;
      if (qualityDocumentError) throw qualityDocumentError;
      if (statusCycleError) throw statusCycleError;

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
      const timeSpentBySerial = new Map<string, number>();
      const runningTimeBySerial = new Map<string, number>();
      const setupTimeBySerial = new Map<string, number>();
      const activeStatusBySerial = new Map<string, string>();
      const serialsWithCycles = new Set<string>();
      const activeFallbackSerial = serialRows.find((serial) => !serial.result)?.serial_number ?? '';
      const activeFallbackSequence = serialRows.find((serial) => !serial.result)?.piece_sequence ?? 1;
      let unassignedCycleTimeMs = 0;
      let unassignedRunningTimeMs = 0;
      let unassignedSetupTimeMs = 0;
      let activeUnassignedStatus = '';
      const relevantStatusCycles = (statusCycleData ?? []).filter((cycle) => (
        cycle.production_order_id === currentOrder.id
        || cycle.order_number === currentOrder.orderNumber
        || (!cycle.ended_at && cycle.station_code === stationCode)
      ));

      relevantStatusCycles.forEach((cycle) => {
        const serialNumber = (cycle.serial_number || (!cycle.ended_at ? activeFallbackSerial : '')).trim().toLowerCase();
        if (!serialNumber) {
          if (!cycle.ended_at) activeUnassignedStatus = cycle.status;
          if (cycle.status === 'running' || cycle.status === 'setup') {
            const startedAt = new Date(cycle.started_at).getTime();
            const endedAt = cycle.ended_at ? new Date(cycle.ended_at).getTime() : Date.now();
            const elapsedMs = Math.max(0, endedAt - startedAt);
            unassignedCycleTimeMs += elapsedMs;
            if (cycle.status === 'running') unassignedRunningTimeMs += elapsedMs;
            if (cycle.status === 'setup') unassignedSetupTimeMs += elapsedMs;
          }
          return;
        }
        serialsWithCycles.add(serialNumber);
        if (!cycle.ended_at) activeStatusBySerial.set(serialNumber, cycle.status);
        if (cycle.status !== 'running' && cycle.status !== 'setup') return;
        const startedAt = new Date(cycle.started_at).getTime();
        const endedAt = cycle.ended_at ? new Date(cycle.ended_at).getTime() : Date.now();
        const elapsedMs = Math.max(0, endedAt - startedAt);
        timeSpentBySerial.set(serialNumber, (timeSpentBySerial.get(serialNumber) ?? 0) + elapsedMs);
        if (cycle.status === 'running') runningTimeBySerial.set(serialNumber, (runningTimeBySerial.get(serialNumber) ?? 0) + elapsedMs);
        if (cycle.status === 'setup') setupTimeBySerial.set(serialNumber, (setupTimeBySerial.get(serialNumber) ?? 0) + elapsedMs);
      });

      traceabilityRows.forEach((traceability) => {
        const serialNumber = traceability.serial_number?.trim().toLowerCase();
        if (serialNumber && !traceabilityBySerial.has(serialNumber)) traceabilityBySerial.set(serialNumber, traceability);
        const pieceSequence = getProductionOrderDetailPayloadNumber(traceability.payload, 'piece_sequence');
        if (pieceSequence && !traceabilityBySequence.has(pieceSequence)) traceabilityBySequence.set(pieceSequence, traceability);
      });
      qualityInspectionRows.forEach((inspection) => {
        const serialNumber = inspection.serial_number.trim().toLowerCase();
        if (serialNumber && !qualityInspectionBySerial.has(serialNumber)) qualityInspectionBySerial.set(serialNumber, inspection);
      });
      qualityMeasurementRows.forEach((measurement) => {
        const serialNumber = measurement.serial_number.trim().toLowerCase();
        if (!serialNumber) return;
        qualityMeasurementsBySerial.set(serialNumber, [...(qualityMeasurementsBySerial.get(serialNumber) ?? []), measurement]);
      });
      qualityDocumentRows.forEach((document) => {
        const serialNumber = document.serial_number.trim().toLowerCase();
        if (!serialNumber) return;
        qualityDocumentsBySerial.set(serialNumber, [...(qualityDocumentsBySerial.get(serialNumber) ?? []), document]);
      });

      const lastKnownSequence = Math.max(
        currentOrder.plannedQuantity,
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
        const resolvedSerialKey = (serial?.serial_number || traceability?.serial_number || '').trim().toLowerCase();
        const activeCycleStatus = activeStatusBySerial.get(resolvedSerialKey)
          ?? (pieceSequence === activeFallbackSequence ? activeUnassignedStatus : '');
        const intermediateStatus: ProductionOrderDetailPiece['status'] = activeCycleStatus === 'running'
          ? 'running'
          : activeCycleStatus === 'setup'
            ? 'setup'
            : activeCycleStatus === 'down'
              ? 'down'
              : activeCycleStatus === 'maintenance'
                ? 'maintenance'
                : activeCycleStatus === 'offline'
                  ? 'offline'
                  : activeCycleStatus === 'idle' && currentOrder.status === 'paused'
                    ? 'machine-paused'
                    : currentOrder.status === 'paused' && serialsWithCycles.has(resolvedSerialKey)
                      ? 'paused'
                      : 'not-started';
        return {
          serialId: serial?.id ?? '',
          pieceSequence,
          toolId: serial?.tool_id ?? traceability?.tool_id ?? '',
          serialNumber: serial?.serial_number || traceability?.serial_number || '',
          status: serial ? (serial.result ?? intermediateStatus) : (traceability ? 'good' : intermediateStatus),
          reportedAt: serial?.reported_at ?? traceability?.created_at ?? '',
          timeSpentMs: resolvedSerialKey
            ? timeSpentBySerial.get(resolvedSerialKey) ?? 0
            : pieceSequence === activeFallbackSequence ? unassignedCycleTimeMs : 0,
          runningTimeMs: resolvedSerialKey
            ? runningTimeBySerial.get(resolvedSerialKey) ?? 0
            : pieceSequence === activeFallbackSequence ? unassignedRunningTimeMs : 0,
          setupTimeMs: resolvedSerialKey
            ? setupTimeBySerial.get(resolvedSerialKey) ?? 0
            : pieceSequence === activeFallbackSequence ? unassignedSetupTimeMs : 0,
          traceability,
          qualityInspection: resolvedSerialKey ? qualityInspectionBySerial.get(resolvedSerialKey) ?? null : null,
          qualityMeasurements: resolvedSerialKey ? qualityMeasurementsBySerial.get(resolvedSerialKey) ?? [] : [],
          qualityDocuments: resolvedSerialKey ? qualityDocumentsBySerial.get(resolvedSerialKey) ?? [] : [],
        };
      });

      const timeSpentMs = relevantStatusCycles.reduce((total, cycle) => {
        if (cycle.status !== 'running' && cycle.status !== 'setup') return total;
        const startedAt = new Date(cycle.started_at).getTime();
        const endedAt = cycle.ended_at ? new Date(cycle.ended_at).getTime() : Date.now();
        return total + Math.max(0, endedAt - startedAt);
      }, 0);
      setOrderDetails({ loading: false, error: '', pieces, timeSpentMs });
    } catch (error) {
      console.error('Unable to load operator order details', error);
      setOrderDetails({ loading: false, error: 'Unable to load order details.', pieces: [], timeSpentMs: 0 });
    }
  };

  const syncSnapshotOrder = (order: ProductionOrder) => {
    const resolvedOrder = resolveOrderReportedCounts(order);
    setSnapshot((current) => {
      if (!current) return current;
      const remainsActive = ['released', 'running', 'paused'].includes(resolvedOrder.status);
      const activeOrders = remainsActive
        ? current.activeOrders.some((candidate) => candidate.id === resolvedOrder.id)
          ? current.activeOrders.map((candidate) => candidate.id === resolvedOrder.id ? resolvedOrder : candidate)
          : [resolvedOrder, ...current.activeOrders]
        : current.activeOrders.filter((candidate) => candidate.id !== resolvedOrder.id);

      return {
        ...current,
        currentOrder: remainsActive ? resolvedOrder : null,
        activeOrders,
        queuedOrders: activeOrders.filter((candidate) => candidate.id !== resolvedOrder.id),
      };
    });
  };

  const syncSwitchedOrder = (order: ProductionOrder) => {
    const resolvedOrder = resolveOrderReportedCounts(order);
    setSnapshot((current) => {
      if (!current) return current;
      const activeOrders = current.activeOrders.map((candidate) => {
        if (candidate.id === resolvedOrder.id) return resolvedOrder;
        if (
          candidate.assignedWorkCenter === resolvedOrder.assignedWorkCenter
          && candidate.assignedStation === resolvedOrder.assignedStation
          && candidate.status === 'running'
        ) {
          return { ...candidate, status: 'paused' as const };
        }
        return candidate;
      });

      return {
        ...current,
        currentOrder: resolvedOrder,
        activeOrders,
        queuedOrders: activeOrders.filter((candidate) => candidate.id !== resolvedOrder.id),
        station: current.station?.code === stationCode
          ? { ...current.station, currentJob: resolvedOrder.orderNumber, status: 'idle', processStep: 'Awaiting operator start' }
          : current.station,
        stationOptions: current.stationOptions.map((station) => station.code === stationCode
          ? { ...station, currentJob: resolvedOrder.orderNumber, status: 'idle', processStep: 'Awaiting operator start' }
          : station),
      };
    });
  };

  const markSelectedProductionSerialReported = (result: 'good' | 'scrap') => {
    const reportedSerialId = selectedProductionSerialId;
    if (!reportedSerialId) return null;
    const nextSerials = productionSerials.map((serial) => (
      serial.id === reportedSerialId ? { ...serial, result, readyForQuality: true } : serial
    ));
    const nextAvailableSerial = nextSerials.find((serial) => !serial.result) ?? null;
    setProductionSerials(nextSerials);
    return nextAvailableSerial;
  };

  const reconcileReportedCounts = React.useCallback((orderId: string, serials: OperatorProductionSerial[], traceabilityRows: ProductionOrderDetailTraceabilityRow[]) => {
    const serialResultsBySequence = new Map<number, 'good' | 'scrap'>();
    serials.forEach((serial) => {
      if (serial.result) serialResultsBySequence.set(serial.pieceSequence, serial.result);
    });

    const traceabilityResultsByPiece = new Map<string, 'good' | 'scrap'>();
    traceabilityRows.forEach((traceability) => {
      if (traceability.payload?.report_type === 'reverted') return;
      const pieceSequence = getProductionOrderDetailPayloadNumber(traceability.payload, 'piece_sequence');
      if (pieceSequence && serialResultsBySequence.has(pieceSequence)) return;
      const fallbackKey = (traceability.serial_number || traceability.id).trim().toLowerCase();
      const pieceKey = pieceSequence ? `piece:${pieceSequence}` : `trace:${fallbackKey}`;
      if (traceabilityResultsByPiece.has(pieceKey)) return;
      const payloadResult = traceability.payload?.report_type;
      traceabilityResultsByPiece.set(pieceKey, payloadResult === 'scrap' ? 'scrap' : 'good');
    });

    const results = [
      ...Array.from(serialResultsBySequence.values()),
      ...Array.from(traceabilityResultsByPiece.values()),
    ];
    const reconciledGoodQty = results.filter((result) => result === 'good').length;
    const reconciledScrapQty = results.filter((result) => result === 'scrap').length;
    const rememberedCounts = reportedCountsByOrderRef.current.get(orderId);
    const shouldKeepRememberedCounts = Boolean(
      rememberedCounts
      && rememberedCounts.goodQty + rememberedCounts.scrapQty > reconciledGoodQty + reconciledScrapQty
    );
    const nextGoodQty = shouldKeepRememberedCounts ? rememberedCounts!.goodQty : reconciledGoodQty;
    const nextScrapQty = shouldKeepRememberedCounts ? rememberedCounts!.scrapQty : reconciledScrapQty;

    rememberReportedCounts(orderId, nextGoodQty, nextScrapQty);
    setGoodQty(nextGoodQty);
    setScrapQty(nextScrapQty);
    setSnapshot((current) => {
      if (!current) return current;
      const updateOrderCounts = (order: ProductionOrder) => (
        order.id === orderId
          ? { ...order, completedQuantity: nextGoodQty, scrapQuantity: nextScrapQty }
          : order
      );
      return {
        ...current,
        currentOrder: current.currentOrder ? updateOrderCounts(current.currentOrder) : current.currentOrder,
        activeOrders: current.activeOrders.map(updateOrderCounts),
        queuedOrders: current.queuedOrders.map(updateOrderCounts),
      };
    });
  }, [rememberReportedCounts]);

  const operatorSnapshotRealtimeTables = React.useMemo(() => ([
    { table: 'mes_production_orders', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_production_serials', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_work_centers', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_work_center_stations', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_operator_terminal_events', filter: `organization_id=eq.${organizationId}` },
  ]), [organizationId]);
  const operatorCustomersRealtimeTables = React.useMemo(() => ([
    { table: 'mes_customers', filter: `organization_id=eq.${organizationId}` },
  ]), [organizationId]);
  const operatorSerialsRealtimeTables = React.useMemo(() => ([
    { table: 'mes_production_serials', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_operator_terminal_traceability', filter: `organization_id=eq.${organizationId}` },
  ]), [organizationId]);

  const loadSnapshot = React.useCallback(async () => {
    try {
      const nextSnapshot = await fetchOperatorTerminalSnapshot(organizationId);
      const normalizedActiveOrders = nextSnapshot.activeOrders.map(resolveOrderReportedCounts);
      const normalizedCurrentOrder = nextSnapshot.currentOrder ? resolveOrderReportedCounts(nextSnapshot.currentOrder) : null;
      const normalizedSnapshot = {
        ...nextSnapshot,
        currentOrder: normalizedCurrentOrder,
        activeOrders: normalizedActiveOrders,
        queuedOrders: nextSnapshot.queuedOrders.map(resolveOrderReportedCounts),
      };
      const storedOrderId = loadActiveOrderId(organizationId);
      const preferredStationCode = selectedStationCodeRef.current;
      const isOrderAvailableAtPreferredStation = (order: ProductionOrder) => !preferredStationCode
        || (order.manufacturingType === 'multi-step'
          ? normalizedSnapshot.multiStepStationsByOrder[order.id]?.includes(preferredStationCode)
          : order.assignedStation === preferredStationCode);
      const eligibleOrders = normalizedSnapshot.activeOrders.filter(isOrderAvailableAtPreferredStation);
      const restoredOrder = eligibleOrders.find((order) => order.id === storedOrderId)
        ?? eligibleOrders.find((order) => order.status === 'running')
        ?? eligibleOrders.find((order) => order.status === 'paused')
        ?? eligibleOrders.find((order) => order.status === 'released')
        ?? (!preferredStationCode ? normalizedSnapshot.currentOrder : null);
      const restoredSnapshot = restoredOrder
        ? {
            ...normalizedSnapshot,
            currentOrder: restoredOrder,
            queuedOrders: normalizedSnapshot.activeOrders.filter((order) => order.id !== restoredOrder.id),
          }
        : normalizedSnapshot;
      setSnapshot(restoredSnapshot);
      setTerminalMessage(normalizedSnapshot.activeOrders.length ? '' : 'No single-operation production orders are assigned yet.');
      setSelectedOrderId(restoredOrder?.id ?? '');
      setSelectedWorkCenterCode(restoredOrder?.assignedWorkCenter ?? normalizedSnapshot.workCenter?.code ?? normalizedSnapshot.workCenterOptions[0]?.code ?? '');
      setSelectedStationCode(preferredStationCode || restoredOrder?.assignedStation || normalizedSnapshot.station?.code || '');
      if (restoredOrder) applyOrder(restoredOrder);
    } catch (error) {
      console.error('Unable to load Operator Terminal snapshot', error);
      setTerminalMessage('Operator Terminal backend is not available yet. Showing demo terminal data.');
    }
  }, [applyOrder, organizationId, resolveOrderReportedCounts]);

  const loadCustomers = React.useCallback(async () => {
    const { data, error } = await supabase
      .from('mes_customers')
      .select('id, customer_name, status')
      .eq('organization_id', organizationId)
      .order('customer_name', { ascending: true });
    if (error) {
      setCustomerOptions([]);
      return;
    }
    const nextCustomers = (data ?? []) as OperatorCustomerOption[];
    setCustomerOptions(nextCustomers);
  }, [organizationId]);

  React.useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  useSupabaseRealtimeRefresh({
    channelName: `mes-operator-terminal-snapshot-live:${organizationId}`,
    tables: operatorSnapshotRealtimeTables,
    onRefresh: loadSnapshot,
  });

  React.useEffect(() => {
    if (!selectedOrderId) return;
    persistActiveOrderId(organizationId, selectedOrderId);
  }, [organizationId, selectedOrderId]);

  React.useEffect(() => {
    if (!snapshot || !currentOrder || currentOrder.id === selectedOrderId) return;
    setSelectedOrderId(currentOrder.id);
  }, [currentOrder?.id, selectedOrderId, snapshot]);

  React.useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  useSupabaseRealtimeRefresh({
    channelName: `mes-operator-terminal-customers-live:${organizationId}`,
    tables: operatorCustomersRealtimeTables,
    onRefresh: loadCustomers,
  });

  React.useEffect(() => {
    if (!currentOrder || !customerOptions.length) return;
    const linkedCustomer = customerOptions.find((customer) => (
      customer.id === currentOrder.customerId
      || (!currentOrder.customerId && customer.customer_name === currentOrder.clientName)
    ));
    setTraceabilityForm((current) => ({
      ...current,
      customerId: linkedCustomer?.id ?? '',
      client: linkedCustomer?.customer_name ?? '',
    }));
  }, [currentOrder?.id, currentOrder?.customerId, currentOrder?.clientName, customerOptions]);

  const applyProductionSerial = React.useCallback((serial: OperatorProductionSerial | null) => {
    if (!serial) return;
    setSelectedProductionSerialId(serial.id);
    setTraceabilityForm((current) => ({
      ...current,
      toolId: serial.toolId,
      serialNumber: serial.serialNumber,
    }));
  }, []);

  const applyTraceabilityRecordToForm = React.useCallback((record: OperatorTraceabilityRecord, serial: OperatorProductionSerial) => {
    const payload = record.payload ?? {};
    const payloadNumber = (key: string) => {
      const value = payload[key];
      return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
    };
    const payloadString = (key: string) => {
      const value = payload[key];
      return typeof value === 'string' ? value : '';
    };
    setSelectedProductionSerialId(serial.id);
    setDimensionUnit(record.dimensionsUnit === 'mm' ? 'mm' : 'in');
    setTraceabilityForm((current) => ({
      ...current,
      toolId: record.toolId || serial.toolId,
      serialNumber: record.serialNumber || serial.serialNumber,
      beforeHeight: payloadNumber('before_height'),
      beforeNotch: record.beforeNotch === null ? '' : String(record.beforeNotch),
      beforeToothLength: record.beforeToothLength === null ? '' : String(record.beforeToothLength),
      damageA: '',
      damageB: '',
      damageC: '',
      stockToRemove: record.stockToRemove === null ? '' : String(record.stockToRemove),
      afterToothLength: record.afterToothLength === null ? payloadNumber('after_height') : String(record.afterToothLength),
      shaverSharpeningNumber: payloadString('shaver_sharpening_number'),
      shaverDiameter: payloadNumber('shaver_diameter'),
      shaverSpan: payloadNumber('shaver_span'),
      shaverTeeth: payloadNumber('shaver_teeth'),
      shaverDamage: payload.shaver_damage === true,
    }));
  }, []);

  const beginMeasurementCorrection = async (serial: OperatorProductionSerial) => {
    if (!serial.traceabilityId || !currentOrder) return;
    setCorrectionLoading(true);
    try {
      const record = await fetchOperatorTraceabilityRecord({ traceabilityId: serial.traceabilityId, organizationId });
      setCorrectionSerial(serial);
      setCorrectionTraceability(record);
      applyTraceabilityRecordToForm(record, serial);
      setModal(null);
      showToast('Measurement correction loaded');
    } catch (error) {
      console.error('Unable to load measurement correction', error);
      showToast('Could not load measurement correction');
    } finally {
      setCorrectionLoading(false);
    }
  };

  const cancelMeasurementCorrection = () => {
    setCorrectionSerial(null);
    setCorrectionTraceability(null);
    const nextAvailableSerial = productionSerials.find((serial) => !serial.result) ?? null;
    if (nextAvailableSerial) applyProductionSerial(nextAvailableSerial);
  };

  const loadProductionSerials = React.useCallback(async () => {
    if (!currentOrder || !hasSupabaseOrder) {
      setProductionSerials([]);
      setSelectedProductionSerialId('');
      return;
    }
    setProductionSerialsLoading(true);
    try {
      const [
        nextSerials,
        { data: traceabilityData, error: traceabilityError },
      ] = await Promise.all([
        fetchOperatorProductionSerials({
          orderId: currentOrder.id,
          organizationId,
          stationCode: currentOrder.manufacturingType === 'multi-step' ? stationCode : undefined,
        }),
        supabase
          .from('mes_operator_terminal_traceability')
          .select('id, production_order_id, template_id, part_label, tool_id, serial_number, dimensions_unit, before_notch, before_tooth_length, damage_codes, stock_to_remove, after_tooth_length, payload, created_at')
          .eq('organization_id', organizationId)
          .eq('production_order_id', currentOrder.id)
          .order('created_at', { ascending: false }),
      ]);
      if (traceabilityError) throw traceabilityError;
      setProductionSerials(nextSerials);
      reconcileReportedCounts(currentOrder.id, nextSerials, (traceabilityData ?? []) as ProductionOrderDetailTraceabilityRow[]);
      if (correctionSerial) return;
      const selectedSerialStillAvailable = nextSerials.find((serial) => serial.id === selectedProductionSerialId && !serial.result);
      const nextAvailableSerial = selectedSerialStillAvailable ?? nextSerials.find((serial) => !serial.result) ?? null;
      if (nextAvailableSerial) {
        applyProductionSerial(nextAvailableSerial);
      } else {
        setSelectedProductionSerialId('');
      }
    } catch (error) {
      console.error('Unable to load assigned production serials', error);
      setProductionSerials([]);
      setSelectedProductionSerialId('');
    } finally {
      setProductionSerialsLoading(false);
    }
  }, [applyProductionSerial, correctionSerial, currentOrder?.id, currentOrder?.manufacturingType, hasSupabaseOrder, organizationId, reconcileReportedCounts, selectedProductionSerialId, stationCode]);

  React.useEffect(() => {
    void loadProductionSerials();
  }, [loadProductionSerials]);

  useSupabaseRealtimeRefresh({
    channelName: `mes-operator-terminal-serials-live:${organizationId}`,
    tables: operatorSerialsRealtimeTables,
    onRefresh: loadProductionSerials,
    enabled: Boolean(currentOrder && hasSupabaseOrder),
  });

  React.useEffect(() => {
    if (!snapshot) return;
    const stationActiveOrders = snapshot.activeOrders.filter((order) => (
      order.assignedWorkCenter === workCenterCode
      && (order.manufacturingType === 'multi-step'
        ? snapshot.multiStepStationsByOrder[order.id]?.includes(stationCode)
        : order.assignedStation === stationCode)
    ));
    const nextOrder = stationActiveOrders.find((order) => order.orderNumber === selectedStation?.currentJob)
      ?? stationActiveOrders.find((order) => order.status === 'running')
      ?? stationActiveOrders.find((order) => order.status === 'paused')
      ?? stationActiveOrders.find((order) => order.status === 'released');

    if (nextOrder) {
      setSelectedOrderId(nextOrder.id);
      applyOrder(nextOrder);
      setTerminalMessage('');
      return;
    }

    setGoodQty(0);
    setScrapQty(0);
    setState('not-started');
    setEvents([]);
    setTerminalMessage('');
  }, [applyOrder, selectedStation?.currentJob, snapshot, stationCode, workCenterCode]);

  React.useEffect(() => {
    if (!currentOrder || productionSerials.some((serial) => !serial.result)) return;
    setTraceabilityForm((current) => ({
      ...current,
      serialNumber: `${currentOrder.partNumber}-SN-${String(currentOrder.completedQuantity + currentOrder.scrapQuantity + 1).padStart(4, '0')}`,
    }));
  }, [currentOrder, productionSerials]);

  const finishMultiStepStationWork = async (reportedOrder: ProductionOrder) => {
    if (reportedOrder.manufacturingType !== 'multi-step') return false;
    const globalReportedQuantity = reportedOrder.completedQuantity + reportedOrder.scrapQuantity;
    if (globalReportedQuantity >= reportedOrder.plannedQuantity) return false;
    const nextStationOrder = stationOrders.find((order) => order.id !== reportedOrder.id && order.status === 'paused')
      ?? stationOrders.find((order) => order.id !== reportedOrder.id && order.status === 'released')
      ?? null;
    const pausedOrder = await setOperatorTerminalState({
      orderId: reportedOrder.id,
      organizationId,
      stationCode,
      shift: selectedShift,
      state: 'paused',
      reason: 'All pieces assigned to this station were reported',
      comment: `Station ${stationCode} completed its assigned Multi-step pieces`,
    });
    setSnapshot((current) => {
      if (!current) return current;
      const remainingStations = (current.multiStepStationsByOrder[reportedOrder.id] ?? []).filter((code) => code !== stationCode);
      return {
        ...current,
        currentOrder: current.currentOrder?.id === reportedOrder.id ? pausedOrder : current.currentOrder,
        activeOrders: current.activeOrders.map((order) => order.id === reportedOrder.id ? pausedOrder : order),
        queuedOrders: current.queuedOrders.map((order) => order.id === reportedOrder.id ? pausedOrder : order),
        multiStepStationsByOrder: {
          ...current.multiStepStationsByOrder,
          [reportedOrder.id]: remainingStations,
        },
      };
    });
    setProductionSerials([]);
    setSelectedProductionSerialId('');
    setEvents([]);
    clearTraceabilityMeasurements();

    if (nextStationOrder) {
      const switchedOrder = await switchOperatorActiveOrder({
        orderId: nextStationOrder.id,
        organizationId,
        stationCode,
        shift: selectedShift,
        comment: `Station ${stationCode} completed order ${reportedOrder.orderNumber} and advanced to ${nextStationOrder.orderNumber}`,
      });
      const nextOrder = switchedOrder.status === 'paused'
        ? switchedOrder
        : await setOperatorTerminalState({
            orderId: switchedOrder.id,
            organizationId,
            stationCode,
            shift: selectedShift,
            state: 'paused',
            reason: 'Automatically queued after previous station work completed',
            comment: 'Awaiting explicit operator Resume',
          });
      setSelectedOrderId(nextOrder.id);
      applyOrder(nextOrder);
      syncSwitchedOrder(nextOrder);
      setState('paused');
      setTerminalMessage('Previous station work completed. Press Resume when ready for the next order.');
      showToast(`Station work completed; ${nextOrder.orderNumber} is ready`);
    } else {
      setSelectedOrderId('');
      setState('not-started');
      setTerminalMessage('All pieces assigned to this station were completed.');
      showToast('All pieces assigned to this station were completed');
    }
    return true;
  };

  const reportGood = async () => {
    if (!currentOrder) return;
    if (!canReport || completedQty >= totalQty) return;
    const serialNumber = traceabilityForm.serialNumber.trim();
    if (!serialNumber) {
      setTerminalMessage('Enter a serial number before reporting this piece.');
      showToast('Enter a serial number before reporting this piece');
      return;
    }
    if (!hasSupabaseOrder) {
      setGoodQty((quantity) => Math.min(totalQty - scrapQty, quantity + 1));
      setEvents((current) => [{ type: 'good', timestamp: formatToastTime() }, ...current].slice(0, 8));
      setTraceField('serialNumber', suggestNextSerialNumber(serialNumber, currentOrder.partNumber, completedQty + 2));
      clearTraceabilityMeasurements();
      showToast('Good part reported');
      return;
    }

    setSyncPending(true);
    try {
      const order = await reportOperatorProduction({ orderId: currentOrder.id, organizationId, stationCode, shift: selectedShift, goodDelta: 1, serialNumber, traceability: buildTraceabilityForUnit('good', currentOrder, serialNumber) });
      rememberReportedCounts(order.id, order.completedQuantity, order.scrapQuantity);
      applyOrder(order);
      syncSnapshotOrder(order);
      setTerminalMessage('');
      setEvents((current) => [{ type: 'good', timestamp: formatToastTime() }, ...current].slice(0, 8));
      showToast('Good part and traceability saved');

      const nextAvailableSerial = markSelectedProductionSerialReported('good');
      if (nextAvailableSerial) {
        applyProductionSerial(nextAvailableSerial);
      } else {
        const stationWorkCompleted = await finishMultiStepStationWork(order);
        if (!stationWorkCompleted) {
          setTraceField('serialNumber', suggestNextSerialNumber(serialNumber, order.partNumber, order.completedQuantity + order.scrapQuantity + 1));
        }
      }
      clearTraceabilityMeasurements();
      if (nextAvailableSerial || order.manufacturingType !== 'multi-step') void loadProductionSerials();
    } catch (error) {
      console.error('Unable to report good production', error);
      const message = getOperatorReportErrorMessage(error);
      setTerminalMessage(message);
      showToast(message);
    } finally {
      setSyncPending(false);
    }
  };

  const saveMeasurementCorrection = async () => {
    if (!currentOrder || !correctionSerial || !correctionTraceability || !hasSupabaseOrder) return;
    const serialNumber = traceabilityForm.serialNumber.trim();
    if (!serialNumber) {
      setTerminalMessage('Enter a serial number before reporting this piece.');
      showToast('Enter a serial number before reporting this piece');
      return;
    }
    setSyncPending(true);
    try {
      const correctedTraceability = buildTraceabilityForUnit(correctionSerial.result === 'scrap' ? 'scrap' : 'good', currentOrder, serialNumber);
      const previousScrapCodes = correctionTraceability.damageCodes.filter((code) => code.startsWith('scrap:'));
      if (previousScrapCodes.length) {
        correctedTraceability.damage_codes = Array.from(new Set([
          ...(Array.isArray(correctedTraceability.damage_codes) ? correctedTraceability.damage_codes : []),
          ...previousScrapCodes,
        ]));
      }
      const updatedSerial = await correctOperatorMeasurement({
        organizationId,
        order: currentOrder,
        serial: correctionSerial,
        stationCode,
        shift: selectedShift,
        operator: stationOperator,
        previousTraceability: correctionTraceability,
        correctedTraceability,
      });
      setProductionSerials((currentSerials) => currentSerials.map((serial) => (
        serial.id === updatedSerial.id ? updatedSerial : serial
      )));
      setCorrectionSerial(null);
      setCorrectionTraceability(null);
      setTerminalMessage('');
      showToast('Measurement correction saved');
      void loadProductionSerials();
    } catch (error) {
      console.error('Unable to save measurement correction', error);
      showToast('Could not save measurement correction');
    } finally {
      setSyncPending(false);
    }
  };

  const submitModal = async (reason = '', comment = '') => {
    if (!currentOrder && modal !== 'undo' && modal !== 'downtime' && modal !== 'maintenance' && modal !== 'offline') {
      setModal(null);
      return;
    }
    if (modal === 'scrap') {
      const serialNumber = traceabilityForm.serialNumber.trim();
      if (!serialNumber) {
        setTerminalMessage('Enter a serial number before reporting this piece.');
        showToast('Enter a serial number before reporting this piece');
        return;
      }
      if (!hasSupabaseOrder) {
        const nextScrapTotal = Math.min(totalQty - goodQty, scrapQty + 1);
        setScrapQty((quantity) => Math.min(totalQty - goodQty, quantity + 1));
        setEvents((current) => [{
          type: 'scrap',
          timestamp: new Date().toISOString(),
          reason,
          comment,
          partNumber: currentOrder.partNumber,
          partName: currentOrder.partName,
          orderNumber: currentOrder.orderNumber,
          reportedTotal: goodQty + nextScrapTotal,
        }, ...current].slice(0, 8));
        setTraceField('serialNumber', suggestNextSerialNumber(serialNumber, currentOrder.partNumber, completedQty + 2));
        clearTraceabilityMeasurements();
        showToast('Scrap reported');
      } else {
        setSyncPending(true);
        try {
          const order = await reportOperatorProduction({ orderId: currentOrder.id, organizationId, stationCode, shift: selectedShift, scrapDelta: 1, serialNumber, traceability: buildTraceabilityForUnit('scrap', currentOrder, serialNumber, reason, comment), reason, comment });
          rememberReportedCounts(order.id, order.completedQuantity, order.scrapQuantity);
          applyOrder(order);
          syncSnapshotOrder(order);
          setTerminalMessage('');
          setEvents((current) => [{
            type: 'scrap',
            timestamp: new Date().toISOString(),
            reason,
            comment,
            partNumber: order.partNumber,
            partName: order.partName,
            orderNumber: order.orderNumber,
            reportedTotal: order.completedQuantity + order.scrapQuantity,
          }, ...current].slice(0, 8));
          showToast('Scrap and traceability saved');

          const nextAvailableSerial = markSelectedProductionSerialReported('scrap');
          if (nextAvailableSerial) {
            applyProductionSerial(nextAvailableSerial);
          } else {
            const stationWorkCompleted = await finishMultiStepStationWork(order);
            if (!stationWorkCompleted) {
              setTraceField('serialNumber', suggestNextSerialNumber(serialNumber, order.partNumber, order.completedQuantity + order.scrapQuantity + 1));
            }
          }
          clearTraceabilityMeasurements();
          if (nextAvailableSerial || order.manufacturingType !== 'multi-step') void loadProductionSerials();
        } catch (error) {
          console.error('Unable to report scrap', error);
          const message = getOperatorReportErrorMessage(error);
          setTerminalMessage(message);
          showToast(message);
          return;
        } finally {
          setSyncPending(false);
        }
      }
    }
    if (modal === 'pause') {
      if (hasSupabaseOrder) {
        setSyncPending(true);
        try {
          const order = await setOperatorTerminalState({ orderId: currentOrder.id, organizationId, stationCode, shift: selectedShift, state: 'paused', reason, comment });
          syncSnapshotOrder(order);
        } catch (error) {
          console.error('Unable to pause job', error);
          showToast('Could not sync pause');
        } finally {
          setSyncPending(false);
        }
      }
      setState('paused');
      showToast('Job paused');
    }
    if (modal === 'downtime') {
      setSyncPending(true);
      try {
        if (hasSupabaseOrder && currentOrder) {
          const order = await setOperatorTerminalState({ orderId: currentOrder.id, organizationId, stationCode, shift: selectedShift, state: 'down', reason, comment });
          syncSnapshotOrder(order);
          setSnapshot((current) => current ? {
            ...current,
            station: current.station?.code === stationCode ? { ...current.station, status: 'down', processStep: 'Downtime reported' } : current.station,
            stationOptions: current.stationOptions.map((station) => station.code === stationCode
              ? { ...station, status: 'down', processStep: 'Downtime reported' }
              : station),
          } : current);
        } else {
          await reportOperatorStationDowntime({ organizationId, workCenterCode, stationCode, shift: selectedShift, reason, comment });
          setSnapshot((current) => current ? {
            ...current,
            station: current.station?.code === stationCode ? { ...current.station, status: 'down', processStep: 'Downtime reported' } : current.station,
            stationOptions: current.stationOptions.map((station) => station.code === stationCode
              ? { ...station, status: 'down', processStep: 'Downtime reported' }
              : station),
          } : current);
        }
      } catch (error) {
        console.error('Unable to report downtime', error);
        const message = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
          ? error.message
          : 'Could not sync downtime';
        setTerminalMessage(message);
        showToast('Could not sync downtime');
        return;
      } finally {
        setSyncPending(false);
      }
      setState('down');
      setTerminalMessage('');
      showToast('Downtime reported');
    }
    if (modal === 'maintenance' || modal === 'offline') {
      const nextStatus = modal;
      setSyncPending(true);
      try {
        await setOperatorStationAvailability({
          organizationId,
          workCenterCode,
          stationCode,
          status: nextStatus,
          shift: selectedShift,
          reason,
          comment,
        });
        setSnapshot((current) => current ? {
          ...current,
          station: current.station?.code === stationCode ? { ...current.station, status: nextStatus, processStep: nextStatus === 'maintenance' ? 'Maintenance in progress' : 'Station offline' } : current.station,
          stationOptions: current.stationOptions.map((station) => station.code === stationCode
            ? { ...station, status: nextStatus, processStep: nextStatus === 'maintenance' ? 'Maintenance in progress' : 'Station offline' }
            : station),
        } : current);
        setState(nextStatus);
        setTerminalMessage(nextStatus === 'maintenance' ? 'Station is in Maintenance.' : 'Station is Offline.');
        showToast(nextStatus === 'maintenance' ? 'Maintenance started' : 'Station set offline');
      } catch (error) {
        console.error(`Unable to set station ${nextStatus}`, error);
        const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : `Could not set station ${nextStatus}`;
        setTerminalMessage(message);
        showToast(`Could not set station ${nextStatus}`);
        return;
      } finally {
        setSyncPending(false);
      }
    }
    if (modal === 'complete') {
      if (hasSupabaseOrder) {
        setSyncPending(true);
        try {
          const order = await setOperatorTerminalState({ orderId: currentOrder.id, organizationId, stationCode, shift: selectedShift, state: 'completed', reason, comment });
          applyOrder(order);
          syncSnapshotOrder(order);
          setState('completed');
          showToast(order.status === 'waiting-inspection' ? 'Manufacturing completed; waiting for Quality inspection' : 'Operation completed');
        } catch (error) {
          console.error('Unable to complete operation', error);
          const message = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
            ? error.message
            : 'Could not sync completion';
          setTerminalMessage(message);
          showToast('Could not sync completion');
        } finally {
          setSyncPending(false);
        }
      } else {
        setState('completed');
        showToast('Operation completed');
      }
    }
    if (modal === 'undo') {
      const lastEvent = events[0];
      if (lastEvent?.type === 'good') setGoodQty((quantity) => Math.max(0, quantity - 1));
      if (lastEvent?.type === 'scrap') setScrapQty((quantity) => Math.max(0, quantity - 1));
      setEvents((current) => current.slice(1));
      showToast('Last report adjusted');
    }
    setModal(null);
  };

  const restoreStationAvailability = async () => {
    if (!isStationUnavailable || syncPending) return;
    setSyncPending(true);
    try {
      await setOperatorStationAvailability({
        organizationId,
        workCenterCode,
        stationCode,
        status: 'idle',
        shift: selectedShift,
        reason: isStationMaintenance ? 'Maintenance completed' : 'Station returned online',
      });
      setSnapshot((current) => current ? {
        ...current,
        station: current.station?.code === stationCode ? { ...current.station, status: 'idle', processStep: 'Ready' } : current.station,
        stationOptions: current.stationOptions.map((station) => station.code === stationCode
          ? { ...station, status: 'idle', processStep: 'Ready' }
          : station),
      } : current);
      setState(currentOrder?.status === 'paused' ? 'paused' : 'not-started');
      setTerminalMessage('');
      showToast(isStationMaintenance ? 'Maintenance completed' : 'Station returned online');
    } catch (error) {
      console.error('Unable to restore station availability', error);
      const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Could not restore station';
      setTerminalMessage(message);
      showToast('Could not restore station');
    } finally {
      setSyncPending(false);
    }
  };

  const startOrResume = async () => {
    if (!currentOrder && !isStationDown) return;
    if (isStationDown) {
      setSyncPending(true);
      try {
        let resumedOrder: ProductionOrder | null = null;
        if (currentOrder && hasSupabaseOrder) {
          await closeOperatorStationDowntime({ organizationId, workCenterCode, stationCode });
          resumedOrder = await setOperatorTerminalState({
            orderId: currentOrder.id,
            organizationId,
            stationCode,
            shift: selectedShift,
            state: 'running',
          });
          syncSnapshotOrder(resumedOrder);
        } else {
          await resumeOperatorStation({ organizationId, workCenterCode, stationCode, shift: selectedShift });
        }
        const nextStationStatus = resumedOrder ? 'running' : 'idle';
        setSnapshot((current) => current ? {
          ...current,
          station: current.station?.code === stationCode ? { ...current.station, status: nextStationStatus, processStep: resumedOrder ? 'Job running' : 'Ready' } : current.station,
          stationOptions: current.stationOptions.map((station) => station.code === stationCode
            ? { ...station, status: nextStationStatus, processStep: resumedOrder ? 'Job running' : 'Ready' }
            : station),
        } : current);
        setState(resumedOrder ? 'running' : 'not-started');
        setTerminalMessage('');
        showToast(resumedOrder ? 'Downtime ended; job resumed' : 'Station returned to service');
      } catch (error) {
        console.error('Unable to end downtime and resume', error);
        const message = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
          ? error.message
          : 'Could not end downtime';
        setTerminalMessage(message);
        showToast('Could not end downtime');
      } finally {
        setSyncPending(false);
      }
      return;
    }
    if (!currentOrder) return;
    const nextMessage = state === 'paused' || state === 'down' ? 'Job resumed' : 'Job started';
    if (hasSupabaseOrder) {
      setSyncPending(true);
      try {
        const order = await setOperatorTerminalState({ orderId: currentOrder.id, organizationId, stationCode, shift: selectedShift, state: 'running' });
        syncSnapshotOrder(order);
      } catch (error) {
        console.error('Unable to start or resume job', error);
        showToast('Could not sync job state');
      } finally {
        setSyncPending(false);
      }
    }
    setState('running');
    showToast(nextMessage);
  };

  const toggleStationSetup = async () => {
    if (!stationCode || isStationDown || syncPending) return;
    setSyncPending(true);
    try {
      if (!isStationSetup && hasSupabaseOrder && currentOrder && state === 'running') {
        const pausedOrder = await setOperatorTerminalState({
          orderId: currentOrder.id,
          organizationId,
          stationCode,
          shift: selectedShift,
          state: 'paused',
          reason: 'Setup started',
        });
        syncSnapshotOrder(pausedOrder);
      }

      await setOperatorStationSetup({
        organizationId,
        workCenterCode,
        stationCode,
        shift: selectedShift,
        active: !isStationSetup,
      });
      const nextStationStatus = isStationSetup ? 'idle' : 'setup';
      setSnapshot((current) => current ? {
        ...current,
        station: current.station?.code === stationCode ? { ...current.station, status: nextStationStatus, processStep: isStationSetup ? 'Ready' : 'Setup in progress' } : current.station,
        stationOptions: current.stationOptions.map((station) => station.code === stationCode
          ? { ...station, status: nextStationStatus, processStep: isStationSetup ? 'Ready' : 'Setup in progress' }
          : station),
      } : current);
      setState(isStationSetup ? (currentOrder ? 'paused' : 'not-started') : 'setup');
      setTerminalMessage('');
      showToast(isStationSetup ? 'Setup completed' : 'Setup started');
    } catch (error) {
      console.error('Unable to update setup state', error);
      showToast('Could not update setup state');
    } finally {
      setSyncPending(false);
    }
  };

  const switchActiveOrder = async (order: ProductionOrder) => {
    if (order.id === currentOrder?.id || switchOrderLoading) return;
    if (!snapshot) {
      setSelectedOrderId(order.id);
      const pausedOrder = { ...order, status: 'paused' as const };
      applyOrder(pausedOrder);
      syncSwitchedOrder(pausedOrder);
      setEvents([]);
      setModal(null);
      showToast('Order selected; press Resume to start');
      return;
    }

    setSwitchOrderLoading(true);
    try {
      const targetStationCode = order.assignedStation || stationCode;
      const nextOrder = await switchOperatorActiveOrder({
        orderId: order.id,
        organizationId,
        stationCode: targetStationCode,
        shift: selectedShift,
        comment: `Operator Terminal active order changed from ${currentOrder?.orderNumber ?? 'none'} to ${order.orderNumber}`,
      });
      setSelectedWorkCenterCode(order.assignedWorkCenter);
      setSelectedStationCode(targetStationCode);
      setSelectedOrderId(nextOrder.id);
      applyOrder(nextOrder);
      syncSwitchedOrder(nextOrder);
      setEvents([]);
      setModal(null);
      showToast('Order selected; press Resume to start');
    } catch (error) {
      console.error('Unable to switch active order', error);
      showToast('Could not change active order');
    } finally {
      setSwitchOrderLoading(false);
    }
  };

  return (
    <section className="operator-terminal-page" aria-label={t('Operator Terminal')}>
      <div className="operator-terminal-layout">
        <aside className="operator-terminal-context">
          <button className="operator-terminal-back-button" type="button" onClick={() => onNavigate('/workspace/manufacturing-ops/mes')}>
            <ArrowLeft size={16} />
            {t('MES Applications')}
          </button>
          <article className="operator-terminal-side-count" aria-label={t('Production count')}>
            <span>{t('Reported')}</span>
            <div>
              <strong>{completedQty}</strong>
              <em>{t('of')} <b>{totalQty}</b></em>
            </div>
            <small>{remainingQty} {t('left')}</small>
          </article>
          <button
            className="operator-terminal-scrap-count"
            type="button"
            aria-label={t('Open scrap events')}
            disabled={!hasAssignedOrder || scrapQty <= 0}
            onClick={() => void openScrapEvents()}
          >
            <span>{t('Scrap')}</span>
            <strong>{scrapQty}</strong>
          </button>
          <article className="operator-terminal-context-card operator-terminal-selector-card">
            <span>{t('Work Center')}</span>
            <OperatorTerminalDropdown
              ariaLabel={t('Work Center')}
              value={workCenterCode}
              options={workCenterOptions.map((workCenter) => ({ value: workCenter.code, label: workCenter.name }))}
              onChange={(nextWorkCenterCode) => {
                setSelectedWorkCenterCode(nextWorkCenterCode);
                const nextStation = snapshot?.stationOptions.find((station) => station.workCenterCode === nextWorkCenterCode);
                setSelectedStationCode(nextStation?.code ?? '');
              }}
            />
          </article>
          <article className="operator-terminal-station-card">
            <span>{t('Station')}</span>
            <OperatorTerminalDropdown
              ariaLabel={t('Station')}
              value={stationCode}
              options={stationOptions.map((station) => ({ value: station.code, label: station.name }))}
              onChange={setSelectedStationCode}
            />
            <div className="operator-terminal-station-visual">
              {stationImageUrl ? <img src={stationImageUrl} alt="" /> : <SquareTerminal size={42} />}
            </div>
            <dl>
              <div><dt>{t('Operator')}</dt><dd>{stationOperator}</dd></div>
              <div className="operator-terminal-shift-control">
                <dt>{t('Shift')}</dt>
                <dd>
                  {(['1st', '2nd', '3rd'] as const).map((shift) => (
                    <button
                      className={selectedShift === shift ? 'active' : ''}
                      type="button"
                      key={shift}
                      onClick={() => setSelectedShift(shift)}
                    >
                      {t(shift)}
                    </button>
                  ))}
                </dd>
              </div>
            </dl>
            <div className="operator-terminal-availability-controls" aria-label={t('Station availability')}>
              <button
                className={isStationMaintenance ? 'maintenance active' : 'maintenance'}
                type="button"
                disabled={syncPending || !stationCode || isStationOffline}
                onClick={() => { if (isStationMaintenance) void restoreStationAvailability(); else setModal('maintenance'); }}
              >
                <Wrench size={15} /> {t(isStationMaintenance ? 'End Maintenance' : 'Maintenance')}
              </button>
              <button
                className={isStationOffline ? 'offline active' : 'offline'}
                type="button"
                disabled={syncPending || !stationCode || isStationMaintenance}
                onClick={() => { if (isStationOffline) void restoreStationAvailability(); else setModal('offline'); }}
              >
                <Power size={15} /> {t(isStationOffline ? 'Return Online' : 'Offline')}
              </button>
            </div>
          </article>
        </aside>

        <main className="operator-terminal-main">
          {terminalMessage ? <div className="operator-terminal-sync-message">{t(terminalMessage)}</div> : null}
          <section className="operator-terminal-now-card">
            <div className="operator-terminal-section-title">
              <ActivityPulse />
              <h3>{t('Now Running')}</h3>
            </div>
            <div className="operator-terminal-now-content">
              {currentOrder ? (
                <div className="operator-terminal-job-fields">
                  <button
                    className="operator-terminal-order-switch"
                    type="button"
                    onClick={() => setModal('switch-order')}
                  >
                    <span>{t('Order Number')}</span>
                    <strong>{currentOrder.orderNumber}</strong>
                  </button>
                  <article className={`operator-terminal-order-type ${currentOrder.manufacturingType === 'multi-step' ? 'multi-step' : 'single-operation'}`}>
                    <span>{t('Manufacturing Type')}</span>
                    <strong>{t(currentOrder.manufacturingType === 'multi-step' ? 'Multi-step' : 'Single')}</strong>
                  </article>
                  <article><span>{t('Part Name')}</span><strong>{currentOrder.partName}</strong></article>
                  <article><span>{t('Client')}</span><strong>{currentOrder.clientName || '-'}</strong></article>
                  <article><span>{t('Due Date')}</span><strong>{currentOrder.dueDate}</strong></article>
                </div>
              ) : (
                <div className={`operator-terminal-empty-job ${isStationDown ? 'downtime' : ''}`} role="status">
                  <strong>{t(isStationDown ? 'Station is in downtime' : 'No Production Order assigned to this station')}</strong>
                </div>
              )}
            </div>
          </section>

          <section className="operator-terminal-actions" aria-label={t('Operator actions')}>
            <div className={`operator-terminal-report-actions ${isQuantityComplete ? 'complete-ready' : ''}`}>
              {isQuantityComplete ? (
                <button className="operator-action complete-large" type="button" disabled={!hasAssignedOrder || state === 'completed' || syncPending || isStationUnavailable} onClick={() => setModal('complete')}>
                  <ClipboardCheck size={38} />
                  <strong>{t('Complete Operation')}</strong>
                  <span>{t('Final counts reached')}</span>
                </button>
              ) : (
                <div className="operator-terminal-report-buttons">
                  <button className="operator-action good" type="button" disabled={!hasAssignedOrder || syncPending || !canReport || completedQty >= totalQty} onClick={reportGood}>
                    <Check size={34} />
                    <strong>{t('+1 Good')}</strong>
                    <span>{t('Fast production report')}</span>
                  </button>
                  <button className="operator-action scrap" type="button" disabled={!hasAssignedOrder || syncPending || !canReport || completedQty >= totalQty} onClick={() => setModal('scrap')}>
                    <AlertTriangle size={34} />
                    <strong>{t('+1 Scrap')}</strong>
                    <span>{t('Requires reason')}</span>
                  </button>
                  {isOrderPaused || isOrderDown || isOrderNotStarted || isStationSetup || isStationUnavailable ? (
                    <div className={`operator-terminal-hold-overlay ${isStationMaintenance ? 'maintenance' : isStationOffline ? 'offline' : isOrderDown ? 'downtime' : isStationSetup ? 'setup' : isOrderNotStarted ? 'not-started' : 'paused'}`} role="status">
                      {isStationOffline ? <Power size={28} /> : isOrderDown || isStationSetup || isStationMaintenance ? <Wrench size={28} /> : isOrderNotStarted ? <Play size={28} /> : <Pause size={28} />}
                      <strong>
                        {isStationMaintenance
                          ? t('Station is under Maintenance')
                          : isStationOffline
                            ? t('Station is Offline')
                        : isOrderDown
                          ? t('Production Order is in downtime')
                          : isStationSetup
                            ? t('Station setup is in progress')
                          : isOrderNotStarted
                            ? t('Production Order has not started')
                            : t('Production Order is paused')}
                      </strong>
                      <span>
                        {isStationMaintenance
                          ? t('End Maintenance from the station panel before resuming production.')
                          : isStationOffline
                            ? t('Return the station Online before resuming production.')
                        : isOrderDown
                          ? t('Press Resume once the issue is cleared to continue reporting production.')
                          : isStationSetup
                            ? t('Press End Setup when setup is complete.')
                          : isOrderNotStarted
                            ? t('Press Start Job to begin reporting production.')
                            : t('Press Resume to continue reporting production.')}
                      </span>
                    </div>
                  ) : null}
                </div>
              )}
              <button className="operator-terminal-undo" type="button" disabled={!hasAssignedOrder || syncPending || !events.length} onClick={() => setModal('undo')}>
                <RotateCcw size={17} />
                {t('Undo Last')}
              </button>
            </div>
            <div className="operator-terminal-run-actions">
              <button
                className={`operator-control ${state === 'running' ? 'pause' : 'start'}`}
                type="button"
                disabled={syncPending || isStationSetup || isStationUnavailable || (!hasAssignedOrder && !isStationDown) || (hasAssignedOrder && (state === 'completed' || isQuantityComplete))}
                onClick={() => {
                  if (state === 'running') {
                    setModal('pause');
                    return;
                  }
                  void startOrResume();
                }}
              >
                {state === 'running' ? <Pause size={22} /> : <Play size={22} />}
                {state === 'running' ? t('Pause') : t(startLabel)}
              </button>
              <button className="operator-control downtime" type="button" disabled={syncPending || !stationCode || isStationDown || isStationSetup || isStationUnavailable || (hasAssignedOrder && (state === 'completed' || isQuantityComplete))} onClick={() => setModal('downtime')}>
                <AlertTriangle size={22} />
                {t('Report Downtime')}
              </button>
              <button className={`operator-control setup ${isStationSetup ? 'active' : ''}`} type="button" disabled={syncPending || !stationCode || isStationDown || isStationUnavailable} onClick={() => { void toggleStationSetup(); }}>
                <Wrench size={22} />
                {t(isStationSetup ? 'End Setup' : 'Start Setup')}
              </button>
              <div className="operator-terminal-secondary-actions">
                <button className="operator-control queue" type="button" disabled={!hasAssignedOrder || syncPending} onClick={() => setModal('queue')}>
                  <Timer size={19} />
                  {t('Job Queue')}
                </button>
                <button className="operator-control details" type="button" disabled={!hasAssignedOrder || syncPending} onClick={() => void openOrderDetails()}>
                  <FileText size={19} />
                  {t('Order Details')}
                </button>
              </div>
            </div>
          </section>

          {!isQuantityComplete ? (
          <section className={`operator-terminal-traceability ${!hasAssignedOrder ? 'disabled' : ''}`}>
            <div className="operator-terminal-trace-heading">
              <div>
                <p className="eyebrow">{t('Part Traceability')}</p>
                <h3>{t(traceabilityTemplate.id === 'wheel' ? 'Wheel capture' : 'Sharpening capture')}</h3>
              </div>
            </div>
            {hasAssignedOrder ? (
            <>
            {correctionSerial ? (
              <div className="operator-terminal-correction-banner">
                <div>
                  <span>{t('Editing reported piece')}</span>
                  <strong>Piece {correctionSerial.pieceSequence} / {correctionSerial.serialNumber}</strong>
                </div>
                <button type="button" onClick={cancelMeasurementCorrection}>{t('Cancel Correction')}</button>
              </div>
            ) : null}
            <div className={`operator-terminal-form-grid ${traceabilityTemplate.id === 'wheel' ? 'wheel' : ''}`}>
              <button
                className="operator-terminal-part-reference operator-terminal-part-reference-button"
                type="button"
                onClick={() => setModal('part-picker')}
              >
                <span>{t('Part')}</span>
                <strong>{activePartSequence.toLocaleString()}</strong>
              </button>
              {traceabilityTemplate.id !== 'wheel' ? <label>{t('Tool ID')}<input value={traceabilityForm.toolId} onChange={(event) => setTraceField('toolId', event.target.value)} /></label> : null}
              <label>{t('Serial Number')}<input required value={traceabilityForm.serialNumber} onChange={(event) => setTraceField('serialNumber', event.target.value)} /></label>
              {traceabilityTemplate.id !== 'wheel' ? <div className="operator-terminal-unit-switch" role="group" aria-label={t('Dimensions unit')}>
                <span>{t('Dimensions')}</span>
                <div>
                  <button className={dimensionUnit === 'in' ? 'active' : ''} type="button" onClick={() => setDimensionUnit('in')}>{t('Inches')}</button>
                  <button className={dimensionUnit === 'mm' ? 'active' : ''} type="button" onClick={() => setDimensionUnit('mm')}>{t('Millimeters')}</button>
                </div>
              </div> : null}
              {traceabilityTemplate.id !== 'shavers' && traceabilityTemplate.id !== 'wheel' ? (
                <fieldset>
                  <legend>{t('Before Sharpening')}</legend>
                  {traceabilityTemplate.beforeFields.map((field) => (
                    <label key={field.key}>
                      {t(field.label)}
                      <span className="operator-terminal-measure-field">
                        <input placeholder="0.000" inputMode="decimal" value={traceabilityForm[field.key]} onChange={(event) => setTraceField(field.key, event.target.value)} />
                        <em>{dimensionUnit}</em>
                      </span>
                    </label>
                  ))}
                </fieldset>
              ) : null}
              {traceabilityTemplate.id === 'wheel' ? null : traceabilityTemplate.showToothDamage ? (
                <fieldset>
                  <legend>{t('Tooth Damage')}</legend>
                  <div className="operator-terminal-damage-capture">
                    <div className="operator-terminal-damage-options">
                      <label>A<input placeholder="0" inputMode="numeric" value={traceabilityForm.damageA} onChange={(event) => setTraceField('damageA', event.target.value)} /></label>
                      <label>B<input placeholder="0" inputMode="numeric" value={traceabilityForm.damageB} onChange={(event) => setTraceField('damageB', event.target.value)} /></label>
                      <label>C<input placeholder="0" inputMode="numeric" value={traceabilityForm.damageC} onChange={(event) => setTraceField('damageC', event.target.value)} /></label>
                    </div>
                    <button type="button" className="operator-terminal-photo">
                      <Camera size={22} />
                      {t(traceabilityTemplate.photoLabel)}
                    </button>
                  </div>
                </fieldset>
              ) : (
                <fieldset className="operator-terminal-part-photo-fieldset">
                  <legend>{t('Part Photo')}</legend>
                  <button type="button" className="operator-terminal-photo">
                    <Camera size={22} />
                    {t(traceabilityTemplate.photoLabel)}
                  </button>
                </fieldset>
              )}
              {traceabilityTemplate.id !== 'shavers' && traceabilityTemplate.id !== 'wheel' ? (
                <fieldset>
                  <legend>{t('Sharpening Data')}</legend>
                  <label>{t('Stock to Remove')}<span className="operator-terminal-measure-field"><input placeholder="0.000" inputMode="decimal" value={traceabilityForm.stockToRemove} onChange={(event) => setTraceField('stockToRemove', event.target.value)} /><em>{dimensionUnit}</em></span></label>
                </fieldset>
              ) : null}
              {traceabilityTemplate.id !== 'wheel' ? <fieldset>
                <legend>{t('After Sharpening')}</legend>
                {traceabilityTemplate.id === 'shavers' ? (
                  <div className="operator-terminal-shaver-after-grid">
                    <label>{t('No. Afilado')}<input placeholder="05" inputMode="numeric" value={traceabilityForm.shaverSharpeningNumber} onChange={(event) => setTraceField('shaverSharpeningNumber', event.target.value)} /></label>
                    <label>{t('Diameter')}<span className="operator-terminal-measure-field"><input placeholder="0.000" inputMode="decimal" value={traceabilityForm.shaverDiameter} onChange={(event) => setTraceField('shaverDiameter', event.target.value)} /><em>{dimensionUnit}</em></span></label>
                    <label>{t('Span')}<span className="operator-terminal-measure-field"><input placeholder="0.000" inputMode="decimal" value={traceabilityForm.shaverSpan} onChange={(event) => setTraceField('shaverSpan', event.target.value)} /><em>{dimensionUnit}</em></span></label>
                    <label>{t('Teeth')}<input placeholder="0" inputMode="numeric" value={traceabilityForm.shaverTeeth} onChange={(event) => setTraceField('shaverTeeth', event.target.value)} /></label>
                    <label className="operator-terminal-shaver-damage-check">
                      <input type="checkbox" checked={traceabilityForm.shaverDamage} onChange={(event) => setTraceabilityForm((current) => ({ ...current, shaverDamage: event.target.checked }))} />
                      <span>{t('Damage')}</span>
                    </label>
                  </div>
                ) : (
                  <label>{t(traceabilityTemplate.afterToothLabel)}<span className="operator-terminal-measure-field"><input placeholder="0.000" inputMode="decimal" value={traceabilityForm.afterToothLength} onChange={(event) => setTraceField('afterToothLength', event.target.value)} /><em>{dimensionUnit}</em></span></label>
                )}
              </fieldset> : null}
            </div>
            {correctionSerial ? (
              <div className="operator-terminal-correction-actions">
                <button type="button" disabled={syncPending} onClick={() => void saveMeasurementCorrection()}>
                  {t('Save Correction')}
                </button>
              </div>
            ) : null}
            </>
            ) : (
              <div className="operator-terminal-trace-disabled">
                <ClipboardCheck size={30} />
                <strong>{t('Part traceability disabled')}</strong>
                <span>{t('Capture will be enabled when this station has an assigned Production Order.')}</span>
              </div>
            )}
          </section>
          ) : null}
        </main>
      </div>

      {toast ? <div className="operator-terminal-toast" role="status">{t(toast)}</div> : null}
      {modal && modal !== 'queue' && modal !== 'scrap-events' && modal !== 'switch-order' && modal !== 'part-picker' ? <ReasonModal modal={modal} goodQty={goodQty} scrapQty={scrapQty} t={t} onClose={() => setModal(null)} onSubmit={submitModal} /> : null}
      {modal === 'queue' ? <JobQueueModal summary={jobQueueSummary} onClose={() => setModal(null)} /> : null}
      {orderDetailsOpen && currentOrder ? (
        <ProductionOrderDetailsModal
          order={currentOrder}
          details={orderDetails}
          organizationId={organizationId}
          onPieceReleased={async () => {
            reportedCountsByOrderRef.current.delete(currentOrder.id);
            await loadSnapshot();
            await loadProductionSerials();
            await openOrderDetails();
          }}
          onClose={() => setOrderDetailsOpen(false)}
        />
      ) : null}
      {modal === 'scrap-events' ? (
        <ScrapEventsModal
          events={scrapEventsLoading ? [] : scrapEvents.length ? scrapEvents : localScrapEvents}
          loading={scrapEventsLoading}
          order={currentOrder}
          t={t}
          onClose={() => setModal(null)}
        />
      ) : null}
      {modal === 'switch-order' ? (
        <SwitchOrderModal
          orders={stationOrders.filter((order) => ['released', 'running', 'paused'].includes(order.status))}
          currentOrderId={currentOrder?.id ?? null}
          loading={switchOrderLoading}
          t={t}
          onClose={() => setModal(null)}
          onSelect={(order) => void switchActiveOrder(order)}
        />
      ) : null}
      {modal === 'part-picker' ? (
        <PartPickerModal
          order={currentOrder}
          serials={productionSerials}
          activePieceSequence={activePartSequence}
          loading={productionSerialsLoading}
          correctionLoading={correctionLoading}
          t={t}
          onClose={() => setModal(null)}
          onSelect={(serial) => {
            applyProductionSerial(serial);
            setCorrectionSerial(null);
            setCorrectionTraceability(null);
            setModal(null);
          }}
          onEdit={(serial) => void beginMeasurementCorrection(serial)}
        />
      ) : null}
    </section>
  );
}

function ActivityPulse() {
  return <span className="operator-terminal-pulse" aria-hidden="true"><Clock3 size={16} /></span>;
}

function OperatorTerminalDropdown({
  ariaLabel,
  value,
  options,
  onChange,
  placeholder = 'Select',
  disabled = false,
}: {
  ariaLabel: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [menuPosition, setMenuPosition] = React.useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const triggerRef = React.useRef<HTMLDivElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value);

  const updateMenuPosition = React.useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger || disabled) return;
    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 16;
    const availableBelow = window.innerHeight - rect.bottom - viewportPadding;
    const availableAbove = rect.top - viewportPadding;
    const desiredHeight = Math.min(240, Math.max(48, (options.length * 38) + 12));
    const openUp = availableBelow < desiredHeight && availableAbove > availableBelow;
    const maxHeight = Math.max(48, Math.min(desiredHeight, openUp ? availableAbove - 7 : availableBelow - 7));
    const width = Math.min(rect.width, window.innerWidth - (viewportPadding * 2));
    const left = Math.max(viewportPadding, Math.min(rect.left, window.innerWidth - width - viewportPadding));
    setMenuPosition({
      top: openUp ? Math.max(viewportPadding, rect.top - maxHeight - 7) : rect.bottom + 7,
      left,
      width,
      maxHeight,
    });
  }, [disabled, options.length]);

  React.useLayoutEffect(() => {
    if (!open || disabled) return;
    updateMenuPosition();
  }, [disabled, open, updateMenuPosition]);

  React.useEffect(() => {
    if (!open || disabled) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const reposition = () => updateMenuPosition();

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [disabled, open, updateMenuPosition]);

  const dropdownMenu = open && !disabled && menuPosition
    ? createPortal(
      <div
        className="mes-order-dropdown-menu operator-terminal-production-dropdown-menu"
        role="listbox"
        aria-label={ariaLabel}
        ref={menuRef}
        style={menuPosition}
      >
        {options.map((option) => (
          <button
            className={option.value === value ? 'selected' : ''}
            type="button"
            key={option.value}
            role="option"
            aria-selected={option.value === value}
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
      className={['mes-order-dropdown', 'operator-terminal-production-dropdown', open ? 'open' : ''].filter(Boolean).join(' ')}
      ref={triggerRef}
    >
      <button
        className={!selected ? 'placeholder' : ''}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={disabled ? false : open}
        disabled={disabled}
        onClick={() => {
          if (!disabled) setOpen((current) => !current);
        }}
      >
        <span>{selected?.label ?? placeholder}</span>
        <ChevronDown size={16} />
      </button>
      {dropdownMenu}
    </div>
  );
}
