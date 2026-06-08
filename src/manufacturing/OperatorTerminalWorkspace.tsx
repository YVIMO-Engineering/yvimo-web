import React from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  Check,
  ChevronDown,
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
import {
  fetchOperatorTerminalSnapshot,
  reportOperatorProduction,
  setOperatorTerminalState,
  type OperatorTerminalSnapshot,
} from './operatorTerminalApi';

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
  manufacturingType: 'single-operation',
  productionFlow: '',
  assignedStation: 'CNC-01',
};

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
  const [snapshot, setSnapshot] = React.useState<OperatorTerminalSnapshot | null>(null);
  const [terminalMessage, setTerminalMessage] = React.useState('');
  const [syncPending, setSyncPending] = React.useState(false);
  const [selectedWorkCenterCode, setSelectedWorkCenterCode] = React.useState('');
  const [selectedStationCode, setSelectedStationCode] = React.useState('');
  const [dimensionUnit, setDimensionUnit] = React.useState<'in' | 'mm'>('in');
  const [templateId, setTemplateId] = React.useState('sharpening');
  const [selectedShift, setSelectedShift] = React.useState<'1st' | '2nd' | '3rd'>('1st');
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
    }];
  const stationCode = stationOptions.some((station) => station.code === selectedStationCode)
    ? selectedStationCode
    : stationOptions[0]?.code ?? baseStationCode;
  const selectedStation = stationOptions.find((station) => station.code === stationCode) ?? stationOptions[0];
  const stationName = selectedStation?.name ?? baseStationName;
  const stationOperator = selectedStation?.operator ?? snapshot?.station?.operator ?? 'Carlos Mota';
  const stationImageUrl = selectedStation?.imageUrl ?? snapshot?.station?.imageUrl ?? '';
  const stationOrders = snapshot
    ? snapshot.activeOrders.filter((order) => order.assignedStation === stationCode && order.assignedWorkCenter === workCenterCode)
    : [fallbackCurrentOrder];
  const currentOrder = stationOrders.find((order) => order.status === 'running' || order.status === 'paused')
    ?? stationOrders.find((order) => order.status === 'released')
    ?? null;
  const queuedOrders = snapshot
    ? stationOrders.filter((order) => order.id !== currentOrder?.id)
    : queuedProductionOrders;
  const hasAssignedOrder = Boolean(currentOrder);
  const hasSupabaseOrder = Boolean(snapshot && currentOrder);
  const totalQty = currentOrder?.plannedQuantity ?? 0;
  const completedQty = hasAssignedOrder ? goodQty + scrapQty : 0;
  const remainingQty = Math.max(0, totalQty - completedQty);
  const activePartSequence = totalQty > 0 ? Math.min(totalQty, completedQty + 1) : 0;
  const isQuantityComplete = hasAssignedOrder && completedQty >= totalQty;
  const canReport = hasAssignedOrder && state === 'running';
  const startLabel = state === 'paused' || state === 'down' ? 'Resume' : 'Start Job';
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

  const applyOrder = (order: ProductionOrder) => {
    setGoodQty(order.completedQuantity);
    setScrapQty(order.scrapQuantity);
    setState(order.status === 'running' ? 'running' : order.status === 'paused' ? 'paused' : order.status === 'completed' ? 'completed' : 'not-started');
  };

  React.useEffect(() => {
    let active = true;
    const loadSnapshot = async () => {
      try {
        const nextSnapshot = await fetchOperatorTerminalSnapshot();
        if (!active) return;
        setSnapshot(nextSnapshot);
        setTerminalMessage(nextSnapshot.activeOrders.length ? '' : 'No single-operation production orders are assigned yet.');
        setSelectedWorkCenterCode(nextSnapshot.workCenter?.code ?? nextSnapshot.workCenterOptions[0]?.code ?? '');
        setSelectedStationCode(nextSnapshot.station?.code ?? nextSnapshot.currentOrder?.assignedStation ?? '');
        if (nextSnapshot.currentOrder) applyOrder(nextSnapshot.currentOrder);
      } catch (error) {
        console.error('Unable to load Operator Terminal snapshot', error);
        if (!active) return;
        setTerminalMessage('Operator Terminal backend is not available yet. Showing demo terminal data.');
      }
    };

    void loadSnapshot();

    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    if (!snapshot) return;
    const nextOrder = snapshot.activeOrders.find((order) => (
      order.assignedStation === stationCode
      && order.assignedWorkCenter === workCenterCode
      && (order.status === 'running' || order.status === 'paused')
    )) ?? snapshot.activeOrders.find((order) => (
      order.assignedStation === stationCode
      && order.assignedWorkCenter === workCenterCode
      && order.status === 'released'
    ));

    if (nextOrder) {
      applyOrder(nextOrder);
      setTerminalMessage('');
      return;
    }

    setGoodQty(0);
    setScrapQty(0);
    setState('not-started');
    setEvents([]);
    setTerminalMessage('');
  }, [snapshot, stationCode, workCenterCode]);

  const reportGood = async () => {
    if (!currentOrder) return;
    if (!canReport || completedQty >= totalQty) return;
    if (!hasSupabaseOrder) {
      setGoodQty((quantity) => Math.min(totalQty - scrapQty, quantity + 1));
      setEvents((current) => [{ type: 'good', timestamp: formatToastTime() }, ...current].slice(0, 8));
      showToast('Good part reported');
      return;
    }

    setSyncPending(true);
    try {
      const order = await reportOperatorProduction({ orderId: currentOrder.id, stationCode, goodDelta: 1 });
      applyOrder(order);
      setSnapshot((current) => current ? { ...current, currentOrder: order } : current);
      setEvents((current) => [{ type: 'good', timestamp: formatToastTime() }, ...current].slice(0, 8));
      showToast('Good part reported');
    } catch (error) {
      console.error('Unable to report good production', error);
      showToast('Could not sync good part');
    } finally {
      setSyncPending(false);
    }
  };

  const submitModal = async (reason = '', comment = '') => {
    if (!currentOrder && modal !== 'undo') {
      setModal(null);
      return;
    }
    if (modal === 'scrap') {
      if (!hasSupabaseOrder) {
        setScrapQty((quantity) => Math.min(totalQty - goodQty, quantity + 1));
        setEvents((current) => [{ type: 'scrap', timestamp: formatToastTime() }, ...current].slice(0, 8));
        showToast('Scrap reported');
      } else {
        setSyncPending(true);
        try {
          const order = await reportOperatorProduction({ orderId: currentOrder.id, stationCode, scrapDelta: 1, reason, comment });
          applyOrder(order);
          setSnapshot((current) => current ? { ...current, currentOrder: order } : current);
          setEvents((current) => [{ type: 'scrap', timestamp: formatToastTime() }, ...current].slice(0, 8));
          showToast('Scrap reported');
        } catch (error) {
          console.error('Unable to report scrap', error);
          showToast('Could not sync scrap');
        } finally {
          setSyncPending(false);
        }
      }
    }
    if (modal === 'pause') {
      if (hasSupabaseOrder) {
        setSyncPending(true);
        try {
          const order = await setOperatorTerminalState({ orderId: currentOrder.id, stationCode, state: 'paused', reason, comment });
          setSnapshot((current) => current ? { ...current, currentOrder: order } : current);
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
      if (hasSupabaseOrder) {
        setSyncPending(true);
        try {
          const order = await setOperatorTerminalState({ orderId: currentOrder.id, stationCode, state: 'down', reason, comment });
          setSnapshot((current) => current ? { ...current, currentOrder: order } : current);
        } catch (error) {
          console.error('Unable to report downtime', error);
          showToast('Could not sync downtime');
        } finally {
          setSyncPending(false);
        }
      }
      setState('down');
      showToast('Downtime reported');
    }
    if (modal === 'complete') {
      if (hasSupabaseOrder) {
        setSyncPending(true);
        try {
          const order = await setOperatorTerminalState({ orderId: currentOrder.id, stationCode, state: 'completed', reason, comment });
          applyOrder(order);
          setSnapshot((current) => current ? { ...current, currentOrder: order } : current);
        } catch (error) {
          console.error('Unable to complete operation', error);
          showToast('Could not sync completion');
        } finally {
          setSyncPending(false);
        }
      }
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

  const startOrResume = async () => {
    if (!currentOrder) return;
    const nextMessage = state === 'paused' || state === 'down' ? 'Job resumed' : 'Job started';
    if (hasSupabaseOrder) {
      setSyncPending(true);
      try {
        const order = await setOperatorTerminalState({ orderId: currentOrder.id, stationCode, state: 'running' });
        setSnapshot((current) => current ? { ...current, currentOrder: order } : current);
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
          <article className="operator-terminal-scrap-count" aria-label="Scrap count">
            <span>Scrap</span>
            <strong>{scrapQty}</strong>
          </article>
          <article className="operator-terminal-context-card operator-terminal-selector-card">
            <span>Work Center</span>
            <OperatorTerminalDropdown
              ariaLabel="Work Center"
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
            <span>Station</span>
            <OperatorTerminalDropdown
              ariaLabel="Station"
              value={stationCode}
              options={stationOptions.map((station) => ({ value: station.code, label: station.name }))}
              onChange={setSelectedStationCode}
            />
            <div className="operator-terminal-station-visual">
              {stationImageUrl ? <img src={stationImageUrl} alt="" /> : <SquareTerminal size={42} />}
            </div>
            <dl>
              <div><dt>Operator</dt><dd>{stationOperator}</dd></div>
              <div className="operator-terminal-shift-control">
                <dt>Shift</dt>
                <dd>
                  {(['1st', '2nd', '3rd'] as const).map((shift) => (
                    <button
                      className={selectedShift === shift ? 'active' : ''}
                      type="button"
                      key={shift}
                      onClick={() => setSelectedShift(shift)}
                    >
                      {shift}
                    </button>
                  ))}
                </dd>
              </div>
            </dl>
          </article>
        </aside>

        <main className="operator-terminal-main">
          {terminalMessage ? <div className="operator-terminal-sync-message">{terminalMessage}</div> : null}
          <section className="operator-terminal-now-card">
            <div className="operator-terminal-section-title">
              <ActivityPulse />
              <h3>Now Running</h3>
            </div>
            <div className="operator-terminal-now-content">
              {currentOrder ? (
                <div className="operator-terminal-job-fields">
                  <article><span>Order Number</span><strong>{currentOrder.orderNumber}</strong></article>
                  <article><span>Part Name</span><strong>{currentOrder.partName}</strong></article>
                  <article><span>Part Number</span><strong>{currentOrder.partNumber}</strong></article>
                  <article><span>Due Date</span><strong>{currentOrder.dueDate}</strong></article>
                </div>
              ) : (
                <div className="operator-terminal-empty-job" role="status">
                  <SquareTerminal size={34} />
                  <strong>No Production Order assigned to this station</strong>
                  <span>Select another station or assign an order to enable the terminal.</span>
                </div>
              )}
            </div>
          </section>

          <section className="operator-terminal-actions" aria-label="Operator actions">
            <div className={`operator-terminal-report-actions ${isQuantityComplete ? 'complete-ready' : ''}`}>
              {isQuantityComplete ? (
                <button className="operator-action complete-large" type="button" disabled={!hasAssignedOrder || state === 'completed' || syncPending} onClick={() => setModal('complete')}>
                  <ClipboardCheck size={38} />
                  <strong>Complete Operation</strong>
                  <span>Final counts reached</span>
                </button>
              ) : (
                <>
                  <button className="operator-action good" type="button" disabled={!hasAssignedOrder || syncPending || !canReport || completedQty >= totalQty} onClick={reportGood}>
                    <Check size={34} />
                    <strong>+1 Good</strong>
                    <span>Fast production report</span>
                  </button>
                  <button className="operator-action scrap" type="button" disabled={!hasAssignedOrder || syncPending || !canReport || completedQty >= totalQty} onClick={() => setModal('scrap')}>
                    <AlertTriangle size={34} />
                    <strong>+1 Scrap</strong>
                    <span>Requires reason</span>
                  </button>
                </>
              )}
              <button className="operator-terminal-undo" type="button" disabled={!hasAssignedOrder || syncPending || !events.length} onClick={() => setModal('undo')}>
                <RotateCcw size={17} />
                Undo Last
              </button>
            </div>
            <div className="operator-terminal-run-actions">
              <button
                className={`operator-control ${state === 'running' ? 'pause' : 'start'}`}
                type="button"
                disabled={!hasAssignedOrder || syncPending || state === 'completed'}
                onClick={() => {
                  if (state === 'running') {
                    setModal('pause');
                    return;
                  }
                  void startOrResume();
                }}
              >
                {state === 'running' ? <Pause size={22} /> : <Play size={22} />}
                {state === 'running' ? 'Pause' : startLabel}
              </button>
              <button className="operator-control downtime" type="button" disabled={!hasAssignedOrder || syncPending || state === 'completed'} onClick={() => setModal('downtime')}>
                <AlertTriangle size={22} />
                Report Downtime
              </button>
              <button className="operator-control queue" type="button" disabled={!hasAssignedOrder || syncPending} onClick={() => setModal('queue')}>
                <Timer size={22} />
                Job Queue
              </button>
            </div>
          </section>

          <section className={`operator-terminal-traceability ${!hasAssignedOrder ? 'disabled' : ''}`}>
            <div className="operator-terminal-trace-heading">
              <div>
                <p className="eyebrow">Part Traceability</p>
                <h3>Sharpening capture</h3>
              </div>
              {hasAssignedOrder ? <div className="operator-terminal-trace-meta" aria-label="Job metadata">
                {dataCards.map((card) => (
                  <label key={card.label}>
                    {card.label}
                    <input defaultValue={card.value} />
                  </label>
                ))}
                <label>
                  Template
                  <OperatorTerminalDropdown
                    ariaLabel="Template"
                    value={templateId}
                    options={[
                      { value: 'sharpening', label: 'Sharpening Data' },
                      { value: 'inspection', label: 'Inspection Data' },
                    ]}
                    onChange={setTemplateId}
                  />
                </label>
              </div> : null}
            </div>
            {hasAssignedOrder ? (
            <div className="operator-terminal-form-grid">
              <div className="operator-terminal-part-reference">
                <span>Part</span>
                <strong>{activePartSequence.toLocaleString()}</strong>
              </div>
              <label>Tool ID<input defaultValue="TOOL-1034" /></label>
              <label>Serial Number<input defaultValue="SN-928441" /></label>
              <div className="operator-terminal-unit-switch" role="group" aria-label="Dimensions unit">
                <span>Dimensions</span>
                <div>
                  <button className={dimensionUnit === 'in' ? 'active' : ''} type="button" onClick={() => setDimensionUnit('in')}>Inches</button>
                  <button className={dimensionUnit === 'mm' ? 'active' : ''} type="button" onClick={() => setDimensionUnit('mm')}>Millimeters</button>
                </div>
              </div>
              <fieldset>
                <legend>Before Sharpening</legend>
                <label>Notch<span className="operator-terminal-measure-field"><input placeholder="0.000" inputMode="decimal" /><em>{dimensionUnit}</em></span></label>
                <label>Tooth Length<span className="operator-terminal-measure-field"><input placeholder="0.000" inputMode="decimal" /><em>{dimensionUnit}</em></span></label>
              </fieldset>
              <fieldset>
                <legend>Tooth Damage</legend>
                <div className="operator-terminal-damage-capture">
                  <div className="operator-terminal-damage-options">
                    {['A', 'B', 'C'].map((option) => (
                      <label key={option}>{option}<input placeholder="0" inputMode="numeric" /></label>
                    ))}
                  </div>
                  <button type="button" className="operator-terminal-photo">
                    <Camera size={22} />
                    Damage Photo
                  </button>
                </div>
              </fieldset>
              <fieldset>
                <legend>Sharpening Data</legend>
                <label>Stock to Remove<span className="operator-terminal-measure-field"><input placeholder="0.000" inputMode="decimal" /><em>{dimensionUnit}</em></span></label>
              </fieldset>
              <fieldset>
                <legend>After Sharpening</legend>
                <label>Tooth Length<span className="operator-terminal-measure-field"><input placeholder="0.000" inputMode="decimal" /><em>{dimensionUnit}</em></span></label>
              </fieldset>
            </div>
            ) : (
              <div className="operator-terminal-trace-disabled">
                <ClipboardCheck size={30} />
                <strong>Part traceability disabled</strong>
                <span>Capture will be enabled when this station has an assigned Production Order.</span>
              </div>
            )}
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

function OperatorTerminalDropdown({
  ariaLabel,
  value,
  options,
  onChange,
}: {
  ariaLabel: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  React.useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  return (
    <div className="operator-terminal-dropdown" ref={rootRef}>
      <button
        className="operator-terminal-dropdown-trigger"
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selected?.label ?? 'Select'}</span>
        <ChevronDown size={16} />
      </button>
      {open ? (
        <div className="operator-terminal-dropdown-menu" role="listbox" aria-label={ariaLabel}>
          {options.map((option) => (
            <button
              className={option.value === selected?.value ? 'active' : ''}
              type="button"
              key={option.value}
              role="option"
              aria-selected={option.value === selected?.value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
