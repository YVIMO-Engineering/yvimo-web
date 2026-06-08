import React from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  Check,
  ClipboardCheck,
  Clock3,
  ImagePlus,
  Pause,
  Play,
  RotateCcw,
  SquareTerminal,
  Timer,
  Wrench,
  X,
} from 'lucide-react';
import { JobQueueModal, type JobQueueSummary } from './MesWorkspaces';
import type { ProductionOrder } from './mesTypes';

type OperatorTerminalProps = {
  onNavigate: (path: string) => void;
};

type TerminalState = 'not-started' | 'running' | 'paused' | 'down' | 'completed';
type TerminalModal = 'scrap' | 'pause' | 'downtime' | 'complete' | 'undo' | 'queue' | null;
type ReportEvent = {
  type: 'good' | 'scrap';
  timestamp: string;
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
  manufacturingType: 'single-operation',
  productionFlow: '',
  assignedStation: 'CNC-01',
}));

const dataCards = [
  { label: 'Client', value: 'Client Name' },
  { label: 'Shipper', value: 'SHIP-000245' },
  { label: 'Reception', value: 'REC-000884' },
];

function formatToastTime() {
  return new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' }).format(new Date());
}

function ReasonModal({
  modal,
  goodQty,
  scrapQty,
  onClose,
  onSubmit,
}: {
  modal: Exclude<TerminalModal, 'queue' | null>;
  goodQty: number;
  scrapQty: number;
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
            <p className="eyebrow">Operator Terminal</p>
            <h3 id="operator-terminal-modal-title">{config.title}</h3>
          </div>
          <button type="button" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        {modal === 'complete' ? (
          <div className="operator-terminal-complete-summary">
            <article><span>Good Qty</span><strong>{goodQty}</strong></article>
            <article><span>Scrap Qty</span><strong>{scrapQty}</strong></article>
            <article><span>Total Reported</span><strong>{goodQty + scrapQty}</strong></article>
          </div>
        ) : null}
        <label>
          {config.label}
          <select value={reason} onChange={(event) => setReason(event.target.value)} required>
            {config.options.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label>
          Comment
          <textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Optional note for the event log" />
        </label>
        {modal === 'scrap' ? (
          <button className="operator-terminal-attach" type="button">
            <ImagePlus size={18} />
            Attach Photo
          </button>
        ) : null}
        <div className="operator-terminal-modal-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" onClick={() => onSubmit(reason, comment)}>{config.action}</button>
        </div>
      </section>
    </div>
  );
}

export function OperatorTerminalWorkspace({ onNavigate }: OperatorTerminalProps) {
  const [state, setState] = React.useState<TerminalState>('not-started');
  const [goodQty, setGoodQty] = React.useState(0);
  const [scrapQty, setScrapQty] = React.useState(0);
  const [modal, setModal] = React.useState<TerminalModal>(null);
  const [toast, setToast] = React.useState('');
  const [events, setEvents] = React.useState<ReportEvent[]>([]);
  const totalQty = 100;
  const completedQty = goodQty + scrapQty;
  const remainingQty = Math.max(0, totalQty - completedQty);
  const isQuantityComplete = completedQty >= totalQty;
  const stationState = state === 'running' ? 'Running' : state === 'paused' ? 'Paused' : state === 'down' ? 'Down' : state === 'completed' ? 'Available' : 'Available';
  const operationState = state === 'running' ? 'In Progress' : state === 'paused' ? 'Paused' : state === 'down' ? 'Interrupted' : state === 'completed' ? 'Completed' : 'Not Started';
  const canReport = state === 'running';
  const startLabel = state === 'paused' || state === 'down' ? 'Resume' : 'Start Job';
  const jobQueueSummary: JobQueueSummary = {
    machine: {
      workCenterCode: 'TRC-HQ',
      stationCode: 'CNC-01',
      stationName: 'Grinder Station 03',
    },
    currentJob: {
      id: 'operator-current-so-54651',
      orderNumber: 'SO-54651',
      partNumber: 'HC-651646',
      partName: 'Hob Cutter',
      plannedQuantity: totalQty,
      completedQuantity: completedQty,
      scrapQuantity: scrapQty,
      status: state === 'completed' ? 'completed' : state === 'paused' ? 'paused' : state === 'running' ? 'running' : 'released',
      priority: 'normal',
      dueDate: 'Jun 07, 2026',
      assignedWorkCenter: 'TRC-HQ',
      manufacturingType: 'single-operation',
      productionFlow: '',
      assignedStation: 'CNC-01',
    },
    queuedJobs: queuedProductionOrders.map((order, index) => ({ order, position: index + 1 })),
    totalQuantity: remainingQty + queuedProductionOrders.reduce((total, order) => total + Math.max(0, order.plannedQuantity - order.completedQuantity), 0),
  };

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2200);
  };

  const reportGood = () => {
    if (!canReport || completedQty >= totalQty) return;
    setGoodQty((quantity) => Math.min(totalQty - scrapQty, quantity + 1));
    setEvents((current) => [{ type: 'good', timestamp: formatToastTime() }, ...current].slice(0, 8));
    showToast('Good part reported');
  };

  const submitModal = () => {
    if (modal === 'scrap') {
      setScrapQty((quantity) => Math.min(totalQty - goodQty, quantity + 1));
      setEvents((current) => [{ type: 'scrap', timestamp: formatToastTime() }, ...current].slice(0, 8));
      showToast('Scrap reported');
    }
    if (modal === 'pause') {
      setState('paused');
      showToast('Job paused');
    }
    if (modal === 'downtime') {
      setState('down');
      showToast('Downtime reported');
    }
    if (modal === 'complete') {
      setState('completed');
      showToast('Operation completed');
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

  const startOrResume = () => {
    setState('running');
    showToast(state === 'paused' || state === 'down' ? 'Job resumed' : 'Job started');
  };

  return (
    <section className="operator-terminal-page" aria-label="Operator Terminal">
      <div className="operator-terminal-layout">
        <aside className="operator-terminal-context">
          <button className="operator-terminal-back-button" type="button" onClick={() => onNavigate('/workspace/manufacturing-ops/mes')}>
            <ArrowLeft size={16} />
            MES Applications
          </button>
          <article className="operator-terminal-side-count" aria-label="Production count">
            <span>Reported</span>
            <div>
              <strong>{completedQty}</strong>
              <em>of <b>{totalQty}</b></em>
            </div>
            <small>{remainingQty} left</small>
          </article>
          <article className={`operator-terminal-state state-${stationState.toLowerCase().replace(/\s+/g, '-')}`}>
            <span>Station</span>
            <strong>{stationState}</strong>
            <em>{operationState}</em>
          </article>
          <article className="operator-terminal-context-card">
            <span>Work Center</span>
            <strong>Sharpening Area 01</strong>
          </article>
          <article className="operator-terminal-station-card">
            <span>Station</span>
            <div className="operator-terminal-station-visual">
              <SquareTerminal size={42} />
            </div>
            <strong>Grinder Station 03</strong>
            <dl>
              <div><dt>Operator</dt><dd>Carlos Mota</dd></div>
              <div><dt>Shift</dt><dd>A / Day</dd></div>
            </dl>
          </article>
          <button className="operator-terminal-queue-button" type="button" onClick={() => setModal('queue')}>
            <Timer size={18} />
            Job Queue
            <strong>{queueJobs.length}</strong>
          </button>
        </aside>

        <main className="operator-terminal-main">
          <section className="operator-terminal-now-card">
            <div className="operator-terminal-section-title">
              <ActivityPulse />
              <h3>Now Running</h3>
            </div>
            <div className="operator-terminal-now-content">
              <div className="operator-terminal-job-fields">
                <article><span>Order Number</span><strong>SO-54651</strong></article>
                <article><span>Part Name</span><strong>Hob Cutter</strong></article>
                <article><span>Part Number</span><strong>HC-651646</strong></article>
                <article><span>Due Date</span><strong>Jun 07, 2026</strong></article>
              </div>
            </div>
          </section>

          <section className="operator-terminal-actions" aria-label="Operator actions">
            <div className={`operator-terminal-report-actions ${isQuantityComplete ? 'complete-ready' : ''}`}>
              {isQuantityComplete ? (
                <button className="operator-action complete-large" type="button" disabled={state === 'completed'} onClick={() => setModal('complete')}>
                  <ClipboardCheck size={38} />
                  <strong>Complete Operation</strong>
                  <span>Final counts reached</span>
                </button>
              ) : (
                <>
                  <button className="operator-action good" type="button" disabled={!canReport || completedQty >= totalQty} onClick={reportGood}>
                    <Check size={34} />
                    <strong>+1 Good</strong>
                    <span>Fast production report</span>
                  </button>
                  <button className="operator-action scrap" type="button" disabled={!canReport || completedQty >= totalQty} onClick={() => setModal('scrap')}>
                    <AlertTriangle size={34} />
                    <strong>+1 Scrap</strong>
                    <span>Requires reason</span>
                  </button>
                </>
              )}
              <button className="operator-terminal-undo" type="button" disabled={!events.length} onClick={() => setModal('undo')}>
                <RotateCcw size={17} />
                Undo Last
              </button>
            </div>
            <div className="operator-terminal-run-actions">
              <button
                className={`operator-control ${state === 'running' ? 'pause' : 'start'}`}
                type="button"
                disabled={state === 'completed'}
                onClick={() => {
                  if (state === 'running') {
                    setModal('pause');
                    return;
                  }
                  startOrResume();
                }}
              >
                {state === 'running' ? <Pause size={22} /> : <Play size={22} />}
                {state === 'running' ? 'Pause' : startLabel}
              </button>
              <button className="operator-control downtime" type="button" disabled={state === 'completed'} onClick={() => setModal('downtime')}>
                <AlertTriangle size={22} />
                Report Downtime
              </button>
              {isQuantityComplete ? (
                <button className="operator-control queue" type="button" onClick={() => setModal('queue')}>
                  <Timer size={22} />
                  Job Queue
                </button>
              ) : (
                <button className="operator-control complete" type="button" disabled={state === 'completed'} onClick={() => setModal('complete')}>
                  <ClipboardCheck size={22} />
                  Complete Operation
                </button>
              )}
            </div>
          </section>

          <section className="operator-terminal-traceability">
            <div className="operator-terminal-trace-heading">
              <div>
                <p className="eyebrow">Part Traceability</p>
                <h3>Sharpening capture</h3>
              </div>
              <div className="operator-terminal-trace-meta" aria-label="Job metadata">
                {dataCards.map((card) => (
                  <article key={card.label}>
                    <span>{card.label}</span>
                    <strong>{card.value}</strong>
                  </article>
                ))}
                <label>
                  Template
                  <select defaultValue="sharpening">
                    <option value="sharpening">Sharpening Data</option>
                    <option value="inspection">Inspection Data</option>
                  </select>
                </label>
              </div>
              <span>Dimensions: in / inches</span>
            </div>
            <div className="operator-terminal-form-grid">
              <label>Part<input defaultValue="001" /></label>
              <label>Tool ID<input defaultValue="TOOL-1034" /></label>
              <label>Serial Number<input defaultValue="SN-928441" /></label>
              <fieldset>
                <legend>Before Sharpening</legend>
                <label>Notch<input placeholder="0.000" inputMode="decimal" /></label>
                <label>Tooth Length<input placeholder="0.000" inputMode="decimal" /></label>
              </fieldset>
              <fieldset>
                <legend>Tooth Damage</legend>
                <div className="operator-terminal-damage-options">
                  {['A', 'B', 'C'].map((option) => (
                    <label key={option}><input type="checkbox" />{option}</label>
                  ))}
                </div>
                <button type="button" className="operator-terminal-photo">
                  <Camera size={22} />
                  Damage Photo
                </button>
              </fieldset>
              <fieldset>
                <legend>Sharpening Data</legend>
                <label>Stock to Remove<input placeholder="0.000" inputMode="decimal" /></label>
              </fieldset>
              <fieldset>
                <legend>After Sharpening</legend>
                <label>Tooth Length<input placeholder="0.000" inputMode="decimal" /></label>
              </fieldset>
            </div>
          </section>
        </main>
      </div>

      {toast ? <div className="operator-terminal-toast" role="status">{toast}</div> : null}
      {modal && modal !== 'queue' ? <ReasonModal modal={modal} goodQty={goodQty} scrapQty={scrapQty} onClose={() => setModal(null)} onSubmit={submitModal} /> : null}
      {modal === 'queue' ? <JobQueueModal summary={jobQueueSummary} onClose={() => setModal(null)} /> : null}
    </section>
  );
}

function ActivityPulse() {
  return <span className="operator-terminal-pulse" aria-hidden="true"><Clock3 size={16} /></span>;
}
