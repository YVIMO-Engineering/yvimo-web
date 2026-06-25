import React from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ClipboardCheck,
  FileText,
  FolderCheck,
  PackageCheck,
  Plus,
  ShieldCheck,
  X,
} from 'lucide-react';
import { mockProductionOrders } from './mesMockData';
import type { ProductionOrder } from './mesTypes';

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
};

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
    description: 'Store and review quality certificates, inspection files, and production order documentation.',
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
        values: ['Rework', 'Repair', 'Scrap', 'Use As Is', 'Return to Supplier', 'Customer Deviation Required', 'Engineering Review'],
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

function getQualityKpiTone(kpi: typeof qualityKpis[number]) {
  if (kpi.value === 0) return 'neutral';
  if (kpi.label === 'NOK Results') return 'red';
  if (kpi.label === 'OK Results') return 'green';
  if (['Pending Inspections', 'Orders on Hold', 'Missing Certificates'].includes(kpi.label)) return 'yellow';
  return 'neutral';
}

function QualityDashboard() {
  return (
    <>
      <section className="quality-kpi-grid" aria-label="Quality KPI summary">
        {qualityKpis.map((kpi) => (
          <article key={kpi.label} className={'quality-kpi-' + getQualityKpiTone(kpi)}>
            <span>{kpi.label}</span>
            <strong>{kpi.value}</strong>
            <em>{kpi.helper}</em>
          </article>
        ))}
      </section>

      <section className="quality-dashboard-tray" aria-label="Quality operational queues">
        <div className="quality-dashboard-panel-grid">
          {qualityDashboardPanels.map((panel) => {
            const Icon = panel.icon;
            return (
              <article key={panel.title}>
                <div>
                  <Icon size={18} />
                  <strong>{panel.title}</strong>
                </div>
                <p>No records</p>
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

function QualityOrderSelector({ order, onOpen }: { order: ProductionOrder; onOpen: () => void }) {
  return (
    <section className="quality-active-order-panel" aria-label="Selected production order for inspection">
      <div className="quality-active-order-heading">
        <ClipboardCheck size={16} />
        <strong>Selected Work Order</strong>
      </div>
      <button type="button" className="quality-active-order-card" onClick={onOpen}>
        <span>
          <em>Order Number</em>
          <strong>{order.orderNumber}</strong>
        </span>
        <span>
          <em>Part Name</em>
          <strong>{order.partName}</strong>
        </span>
        <span>
          <em>Part Number</em>
          <strong>{order.partNumber}</strong>
        </span>
        <span>
          <em>Due Date</em>
          <strong>{formatQualityDate(order.dueDate)}</strong>
        </span>
      </button>
    </section>
  );
}

function QualityOrderPickerModal({ orders, currentOrderId, onClose, onSelect }: {
  orders: ProductionOrder[];
  currentOrderId: string;
  onClose: () => void;
  onSelect: (order: ProductionOrder) => void;
}) {
  return (
    <div className="quality-order-modal-backdrop" role="presentation">
      <section className="quality-order-modal" role="dialog" aria-modal="true" aria-labelledby="quality-order-modal-title">
        <div className="quality-order-modal-heading">
          <span><ClipboardCheck size={22} /></span>
          <div>
            <p className="eyebrow">Quality</p>
            <h3 id="quality-order-modal-title">Change Work Order</h3>
          </div>
          <button type="button" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        <p className="quality-order-modal-copy">Select the Production Order that should be inspected by Quality.</p>
        <div className="quality-order-switch-list">
          {orders.map((order) => {
            const reported = order.completedQuantity + order.scrapQuantity;
            return (
              <button
                className={order.id === currentOrderId ? 'active' : ''}
                type="button"
                key={order.id}
                disabled={order.id === currentOrderId}
                onClick={() => onSelect(order)}
              >
                <div>
                  <strong>{order.orderNumber}</strong>
                  <span>{order.partName} / {order.partNumber}</span>
                </div>
                <em>{order.status}</em>
                <b>{reported.toLocaleString()} of {order.plannedQuantity.toLocaleString()}</b>
              </button>
            );
          })}
        </div>
        <div className="quality-order-modal-actions">
          <button type="button" onClick={onClose}>Cancel</button>
        </div>
      </section>
    </div>
  );
}

function QualityInspectionsPage({ selectedOrder, onChangeOrder }: { selectedOrder: ProductionOrder; onChangeOrder: () => void }) {
  return (
    <div className="quality-inspections-workspace">
      <QualityOrderSelector order={selectedOrder} onOpen={onChangeOrder} />
      <section className="quality-inspection-board" aria-label="Inspection foundation for selected work order">
        <article>
          <div>
            <ClipboardCheck size={18} />
            <strong>Required Inspections</strong>
          </div>
          <p>No inspections configured for this work order</p>
        </article>
        <article>
          <div>
            <ShieldCheck size={18} />
            <strong>Measurement Capture</strong>
          </div>
          <p>No measurement records</p>
        </article>
        <article>
          <div>
            <FileText size={18} />
            <strong>Inspection Documents</strong>
          </div>
          <p>No attachments</p>
        </article>
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

export function QualityOperationsWorkspace({ onNavigate, activeTab }: QualityOperationsWorkspaceProps) {
  const [selectedInspectionOrderId, setSelectedInspectionOrderId] = React.useState(mockProductionOrders[0]?.id ?? '');
  const [orderPickerOpen, setOrderPickerOpen] = React.useState(false);
  const selectedInspectionOrder = mockProductionOrders.find((order) => order.id === selectedInspectionOrderId) ?? mockProductionOrders[0];
  const isDashboard = activeTab === 'dashboard';
  const activeConfig = isDashboard ? null : qualityPageConfig[activeTab as Exclude<QualityContextTab, 'dashboard'>];
  const eyebrow = isDashboard ? 'MES / QUALITY DASHBOARD' : activeConfig!.eyebrow;
  const title = isDashboard ? 'Quality Dashboard' : activeConfig!.title;
  const description = isDashboard
    ? 'Monitor inspections, NOK results, quality holds, and certificate risk at a glance.'
    : activeConfig!.description;
  const actionLabel = isDashboard ? 'New Inspection' : activeConfig!.actionLabel;

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
        <div className="quality-header-actions">
          <button type="button">
            <Plus size={16} /> {actionLabel}
          </button>
        </div>
      </div>

      <div className="quality-app-shell">
        {isDashboard ? <QualityDashboard /> : null}
        {activeTab === 'inspections' && selectedInspectionOrder ? (
          <QualityInspectionsPage selectedOrder={selectedInspectionOrder} onChangeOrder={() => setOrderPickerOpen(true)} />
        ) : null}
        {!isDashboard && activeTab !== 'inspections' ? <QualityPlaceholderPage config={activeConfig!} /> : null}
      </div>

      {orderPickerOpen ? (
        <QualityOrderPickerModal
          orders={mockProductionOrders}
          currentOrderId={selectedInspectionOrder?.id ?? ''}
          onClose={() => setOrderPickerOpen(false)}
          onSelect={(order) => {
            setSelectedInspectionOrderId(order.id);
            setOrderPickerOpen(false);
          }}
        />
      ) : null}
    </section>
  );
}
