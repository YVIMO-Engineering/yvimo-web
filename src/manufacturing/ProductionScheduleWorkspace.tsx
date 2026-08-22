import React from 'react';
import { AlertTriangle, ArrowLeft, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Factory, GripVertical, LoaderCircle, PackageOpen, Plus, X } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { getDaysUntilDelivery } from './DeliveryRiskTimeline';
import { getOrderRiskLevel, type OrderRiskLevel } from './orderRisk';
import './productionSchedule.css';

type Props = { onNavigate: (path: string) => void; organizationId: string };
type Station = { id: string; code: string; name: string; type: string; capability_color: string | null; work_center_id: string; schedule_position: number | null };
type WorkCenter = { id: string; code: string; name: string };
type Order = { id: string; order_number: string; client_name: string | null; part_number: string; part_name: string; planned_quantity: number; completed_quantity: number; due_date: string; priority: string; status: string; assigned_station: string | null; assigned_work_center: string | null; manufacturing_type: 'multi-step' | 'single-operation' };
type QueueItem = { id: string; station_id: string; production_order_id: string; position: number };
type ProductionPiece = { production_order_id: string; assigned_station: string | null; compatible_stations: string[] | null };

const activeStatuses = ['planned', 'released', 'running', 'paused'];
const riskLabels: Record<OrderRiskLevel, string> = { overdue: 'Overdue', high: 'High risk', moderate: 'Moderate risk', low: 'Low risk' };
const deliveryDistance = (dueDate: string) => { const days = getDaysUntilDelivery(dueDate); return days < 0 ? `${Math.abs(days)} days overdue` : days === 0 ? 'Due today' : days === 1 ? '1 day left' : `${days} days left`; };
const formatDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const yvimoStationColors = ['#ff7a00', '#117a72', '#315f9a', '#774b8f', '#799a32', '#a94a42', '#28738a', '#8b6137', '#4c6f52', '#645a9b', '#b56b28', '#3f6b78', '#8a4761', '#557d33', '#476ca8', '#9a573d'];
const stationColor = (index: number) => {
  const base = yvimoStationColors[index % yvimoStationColors.length];
  const cycle = Math.floor(index / yvimoStationColors.length);
  return cycle === 0 ? base : `color-mix(in srgb, ${base} ${Math.max(58, 92 - cycle * 7)}%, #17202a)`;
};

export function ProductionScheduleWorkspace({ onNavigate, organizationId }: Props) {
  const [stations, setStations] = React.useState<Station[]>([]), [workCenters, setWorkCenters] = React.useState<WorkCenter[]>([]), [orders, setOrders] = React.useState<Order[]>([]), [productionPieces, setProductionPieces] = React.useState<ProductionPiece[]>([]), [queue, setQueue] = React.useState<QueueItem[]>([]);
  const [selectedStationId, setSelectedStationId] = React.useState(''), [selectedWorkCenterId, setSelectedWorkCenterId] = React.useState('all'), [workspaceMenuOpen, setWorkspaceMenuOpen] = React.useState(false), [loading, setLoading] = React.useState(true), [savingOrderId, setSavingOrderId] = React.useState(''), [error, setError] = React.useState('');
  const [draggedQueueItemId, setDraggedQueueItemId] = React.useState(''), [reorderingStationId, setReorderingStationId] = React.useState('');
  const [draggedStationId, setDraggedStationId] = React.useState(''), [reorderingStations, setReorderingStations] = React.useState(false);
  const workspaceDropdownRef = React.useRef<HTMLDivElement>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    const [stationResult, centerResult, orderResult, pieceResult, queueResult] = await Promise.all([
      supabase.from('mes_work_center_stations').select('id, code, name, type, capability_color, work_center_id, schedule_position').eq('organization_id', organizationId).order('schedule_position').order('name'),
      supabase.from('mes_work_centers').select('id, code, name').eq('organization_id', organizationId).order('name'),
      supabase.from('mes_production_orders').select('id, order_number, client_name, part_number, part_name, planned_quantity, completed_quantity, due_date, priority, status, assigned_station, assigned_work_center, manufacturing_type').eq('organization_id', organizationId).in('status', activeStatuses).order('due_date'),
      supabase.from('mes_production_serials').select('production_order_id, assigned_station, compatible_stations').eq('organization_id', organizationId).is('result', null),
      supabase.from('mes_production_schedule_queue').select('id, station_id, production_order_id, position').eq('organization_id', organizationId).order('position'),
    ]);
    const loadError = stationResult.error ?? centerResult.error ?? orderResult.error ?? pieceResult.error ?? queueResult.error;
    if (loadError) setError(`Unable to load the production schedule: ${loadError.message}. Apply SQL migrations 134–136.`);
    else {
      const activeOrders = (orderResult.data ?? []) as Order[];
      const loadedQueue = (queueResult.data ?? []) as QueueItem[];
      const activeOrderIds = new Set(activeOrders.map((order) => order.id));
      const staleQueueIds = loadedQueue.filter((item) => !activeOrderIds.has(item.production_order_id)).map((item) => item.id);
      if (staleQueueIds.length) await supabase.from('mes_production_schedule_queue').delete().eq('organization_id', organizationId).in('id', staleQueueIds);
      setStations((stationResult.data ?? []) as Station[]);
      setWorkCenters((centerResult.data ?? []) as WorkCenter[]);
      setOrders(activeOrders);
      setProductionPieces((pieceResult.data ?? []) as ProductionPiece[]);
      setQueue(loadedQueue.filter((item) => activeOrderIds.has(item.production_order_id)));
      setError('');
    }
    setLoading(false);
  }, [organizationId]);
  React.useEffect(() => { void load(); }, [load]);
  React.useEffect(() => {
    if (!workspaceMenuOpen) return;
    const close = (event: MouseEvent) => { if (!workspaceDropdownRef.current?.contains(event.target as Node)) setWorkspaceMenuOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [workspaceMenuOpen]);

  const selectedStation = stations.find((station) => station.id === selectedStationId);
  const centerById = React.useMemo(() => new Map(workCenters.map((center) => [center.id, center])), [workCenters]);
  const orderById = React.useMemo(() => new Map(orders.map((order) => [order.id, order])), [orders]);
  const stationColorById = React.useMemo(() => new Map(stations.map((station, index) => [station.id, stationColor(index)])), [stations]);
  const orderedStations = React.useMemo(() => [...stations].sort((a, b) => (a.schedule_position ?? Number.MAX_SAFE_INTEGER) - (b.schedule_position ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name)), [stations]);
  const visibleStations = selectedWorkCenterId === 'all' ? orderedStations : orderedStations.filter((station) => station.work_center_id === selectedWorkCenterId);
  const selectedWorkCenter = workCenters.find((center) => center.id === selectedWorkCenterId);
  const multiStepPieceCount = React.useCallback((orderId: string, stationCode: string) => productionPieces.filter((piece) => piece.production_order_id === orderId && (piece.assigned_station === stationCode || (piece.compatible_stations ?? []).includes(stationCode))).length, [productionPieces]);
  const availableOrders = selectedStation ? orders.filter((order) => {
    const assignedCodes = (order.assigned_station ?? '').split(',').map((code) => code.trim()).filter(Boolean);
    const center = centerById.get(selectedStation.work_center_id);
    const stationCompatible = order.manufacturing_type === 'multi-step' ? multiStepPieceCount(order.id, selectedStation.code) > 0 : assignedCodes.includes(selectedStation.code) || (assignedCodes.length === 0 && Boolean(center && order.assigned_work_center === center.code));
    return stationCompatible && !queue.some((item) => item.station_id === selectedStation.id && item.production_order_id === order.id);
  }) : [];

  const addOrder = async (order: Order) => {
    if (!selectedStation) return;
    setSavingOrderId(order.id);
    const stationPositions = queue.filter((item) => item.station_id === selectedStation.id).map((item) => item.position);
    const { data, error: saveError } = await supabase.from('mes_production_schedule_queue').insert({ organization_id: organizationId, station_id: selectedStation.id, production_order_id: order.id, position: Math.max(0, ...stationPositions) + 1 }).select('id, station_id, production_order_id, position').single();
    setSavingOrderId('');
    if (saveError) { setError(saveError.message); return; }
    setQueue((current) => [...current, data as QueueItem]); setSelectedStationId('');
  };

  const reorderStationQueue = async (stationId: string, orderedIds: string[]) => {
    const previous = queue;
    setQueue((current) => current.map((item) => item.station_id === stationId ? { ...item, position: orderedIds.indexOf(item.id) + 1 } : item));
    setReorderingStationId(stationId);
    const { error: reorderError } = await supabase.rpc('reorder_mes_production_schedule_queue', { p_organization_id: organizationId, p_station_id: stationId, p_queue_item_ids: orderedIds });
    setReorderingStationId('');
    if (reorderError) { setQueue(previous); setError(`${reorderError.message}. Apply SQL migration 135.`); }
  };

  const moveQueueItem = (stationId: string, itemId: string, direction: -1 | 1) => {
    const ids = queue.filter((item) => item.station_id === stationId).sort((a, b) => a.position - b.position).map((item) => item.id), index = ids.indexOf(itemId), target = index + direction;
    if (index < 0 || target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    void reorderStationQueue(stationId, ids);
  };

  const dropQueueItem = (stationId: string, targetId: string) => {
    if (!draggedQueueItemId || draggedQueueItemId === targetId) return setDraggedQueueItemId('');
    const ids = queue.filter((item) => item.station_id === stationId).sort((a, b) => a.position - b.position).map((item) => item.id), from = ids.indexOf(draggedQueueItemId), to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return setDraggedQueueItemId('');
    const [moved] = ids.splice(from, 1); ids.splice(to, 0, moved); setDraggedQueueItemId(''); void reorderStationQueue(stationId, ids);
  };

  const reorderStations = async (visibleIds: string[]) => {
    const previous = stations;
    const visibleSet = new Set(visibleIds), replacements = [...visibleIds];
    const allIds = orderedStations.map((station) => visibleSet.has(station.id) ? replacements.shift()! : station.id);
    setStations((current) => current.map((station) => ({ ...station, schedule_position: allIds.indexOf(station.id) + 1 })));
    setReorderingStations(true);
    const { error: reorderError } = await supabase.rpc('reorder_mes_production_schedule_stations', { p_organization_id: organizationId, p_station_ids: allIds });
    setReorderingStations(false);
    if (reorderError) { setStations(previous); setError(`${reorderError.message}. Apply SQL migration 136.`); }
  };

  const moveStation = (stationId: string, direction: -1 | 1) => {
    const ids = visibleStations.map((station) => station.id), index = ids.indexOf(stationId), target = index + direction;
    if (index < 0 || target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]]; void reorderStations(ids);
  };

  const dropStation = (targetId: string) => {
    if (!draggedStationId || draggedStationId === targetId) return setDraggedStationId('');
    const ids = visibleStations.map((station) => station.id), from = ids.indexOf(draggedStationId), to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return setDraggedStationId('');
    const [moved] = ids.splice(from, 1); ids.splice(to, 0, moved); setDraggedStationId(''); void reorderStations(ids);
  };

  return <section className="mes-workspace-panel production-schedule-workspace">
    <div className="mes-screen-header production-schedule-header"><button className="academy-back-button engineering-back-button mes-workspace-back" type="button" onClick={() => onNavigate('/workspace/manufacturing-ops/aps')}><ArrowLeft size={16} /> APS</button><div className="mes-workspace-heading"><p className="eyebrow">APS / PRODUCTION SCHEDULE</p><h2>Production Schedule</h2><p>Build the production plan for each machine and coordinate scheduled work across the shop floor.</p></div></div>
    <div className="production-schedule-toolbar"><label><span>Workspace</span><div className={`production-workspace-dropdown${workspaceMenuOpen ? ' open' : ''}`} ref={workspaceDropdownRef}><button type="button" aria-haspopup="listbox" aria-expanded={workspaceMenuOpen} onClick={() => setWorkspaceMenuOpen((current) => !current)}><Factory size={17} /><strong>{selectedWorkCenter ? `${selectedWorkCenter.name} · ${selectedWorkCenter.code}` : 'All workspaces'}</strong><ChevronDown size={16} /></button>{workspaceMenuOpen ? <div className="production-workspace-menu" role="listbox"><button className={selectedWorkCenterId === 'all' ? 'selected' : ''} type="button" role="option" aria-selected={selectedWorkCenterId === 'all'} onClick={() => { setSelectedWorkCenterId('all'); setWorkspaceMenuOpen(false); }}><span><b>All workspaces</b><small>Show every production station</small></span>{selectedWorkCenterId === 'all' ? <Check size={16} /> : null}</button>{workCenters.map((center) => <button className={selectedWorkCenterId === center.id ? 'selected' : ''} type="button" role="option" aria-selected={selectedWorkCenterId === center.id} onClick={() => { setSelectedWorkCenterId(center.id); setWorkspaceMenuOpen(false); }} key={center.id}><span><b>{center.name}</b><small>{center.code}</small></span>{selectedWorkCenterId === center.id ? <Check size={16} /> : null}</button>)}</div> : null}</div></label><p><strong>{visibleStations.length}</strong> station{visibleStations.length === 1 ? '' : 's'} shown</p></div>
    {error ? <div className="production-schedule-message" role="alert">{error}</div> : null}
    {loading ? <div className="production-schedule-loading"><LoaderCircle size={24} /> Loading stations and orders…</div> : stations.length === 0 ? <div className="production-schedule-empty"><Factory size={28} /><strong>No stations are configured yet</strong><span>Create stations in MES Work Centers before building the production schedule.</span></div> : visibleStations.length === 0 ? <div className="production-schedule-empty"><Factory size={28} /><strong>No stations in this workspace</strong><span>Select another workspace to continue planning.</span></div> : <div className="production-schedule-board">{visibleStations.map((station) => {
      const stationQueue = queue.filter((item) => item.station_id === station.id).sort((a, b) => a.position - b.position), center = centerById.get(station.work_center_id), color = stationColorById.get(station.id) || '#ff8a1f';
      const stationIndex = visibleStations.findIndex((candidate) => candidate.id === station.id);
      return <section className={`production-station-lane${draggedStationId === station.id ? ' dragging' : ''}`} style={{ '--station-color': color } as React.CSSProperties} draggable={!reorderingStations} onDragStart={(event) => { if ((event.target as HTMLElement).closest('.production-queue-order')) { event.preventDefault(); return; } setDraggedStationId(station.id); }} onDragEnd={() => setDraggedStationId('')} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { if (!(event.target as HTMLElement).closest('.production-queue-order')) dropStation(station.id); }} key={station.id}><article className="production-station-card"><span className="production-station-color" /><div className="production-station-order-controls"><span><GripVertical size={15} /> Station {stationIndex + 1}</span><div><button type="button" disabled={stationIndex === 0 || reorderingStations} aria-label={`Move ${station.name} up`} onClick={() => moveStation(station.id, -1)}><ChevronDown size={15} /></button><button type="button" disabled={stationIndex === visibleStations.length - 1 || reorderingStations} aria-label={`Move ${station.name} down`} onClick={() => moveStation(station.id, 1)}><ChevronDown size={15} /></button></div></div><small>{center ? `${center.name} · ${center.code}` : 'Work center'}</small><strong>{station.name}</strong><b>{station.code}</b><em>{station.type}</em></article><div className="production-station-queue">{stationQueue.map((item) => {
        const order = orderById.get(item.production_order_id); if (!order) return null; const risk = getOrderRiskLevel(order.due_date);
        const stationPieceCount = order.manufacturing_type === 'multi-step' ? multiStepPieceCount(order.id, station.code) : Number(order.planned_quantity);
        const itemIndex = stationQueue.findIndex((candidate) => candidate.id === item.id);
        return <article className={`production-queue-order${draggedQueueItemId === item.id ? ' dragging' : ''}`} draggable={reorderingStationId !== station.id} onDragStart={() => setDraggedQueueItemId(item.id)} onDragEnd={() => setDraggedQueueItemId('')} onDragOver={(event) => event.preventDefault()} onDrop={() => dropQueueItem(station.id, item.id)} key={item.id}><div className="production-queue-order-controls"><span><GripVertical size={15} /> Queue {itemIndex + 1}</span><div><button type="button" disabled={itemIndex === 0 || reorderingStationId === station.id} aria-label={`Move order ${order.order_number} earlier`} onClick={() => moveQueueItem(station.id, item.id, -1)}><ChevronLeft size={15} /></button><button type="button" disabled={itemIndex === stationQueue.length - 1 || reorderingStationId === station.id} aria-label={`Move order ${order.order_number} later`} onClick={() => moveQueueItem(station.id, item.id, 1)}><ChevronRight size={15} /></button></div></div><header className={risk}><span><AlertTriangle size={14} /> {riskLabels[risk]}</span><b>{deliveryDistance(order.due_date)}</b><time><CalendarDays size={13} /> {formatDate(order.due_date)}</time></header><div><small>Production order</small><strong>#{order.order_number}</strong><span>{order.client_name || 'Customer not assigned'}</span><dl><div><dt>Part</dt><dd>{order.part_number || order.part_name || '—'}</dd></div>
{order.manufacturing_type === 'multi-step' ? <div className="production-multistep-piece-count"><dt>Multi-step</dt><dd>{stationPieceCount.toLocaleString()} pieces for this station</dd></div> : null}<div><dt>Pieces</dt><dd>{stationPieceCount.toLocaleString()}</dd></div><div className="production-queue-order-status"><dt>Status</dt><dd className={`status-${order.status}`}>{order.status.replaceAll('-', ' ')}</dd></div>
<div><dt>Progress</dt><dd>{Number(order.completed_quantity).toLocaleString()} / {Number(order.planned_quantity).toLocaleString()}</dd></div><div><dt>Priority</dt><dd>{order.priority}</dd></div></dl></div></article>;
      })}<button className="production-queue-add" type="button" onClick={() => setSelectedStationId(station.id)}><Plus size={28} /><strong>Add order</strong><span>Place the next job in this station queue</span></button></div></section>;
    })}</div>}
    {selectedStation ? <div className="production-order-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedStationId(''); }}><section className="production-order-modal" role="dialog" aria-modal="true" aria-labelledby="production-order-picker-title"><header><div><span>Select production order</span><h3 id="production-order-picker-title">{selectedStation.name} · {selectedStation.code}</h3><p>Choose an available order assigned to this station.</p></div><button type="button" aria-label="Close" onClick={() => setSelectedStationId('')}><X size={20} /></button></header><div className="production-order-options">{availableOrders.length ? availableOrders.map((order) => {
const risk = getOrderRiskLevel(order.due_date);
const stationPieceCount = order.manufacturing_type === 'multi-step' ? multiStepPieceCount(order.id, selectedStation.code) : Number(order.planned_quantity);
return <button type="button" disabled={Boolean(savingOrderId)} onClick={() => void addOrder(order)} key={order.id}><span className={`production-order-option-risk ${risk}`}>{riskLabels[risk]} · {deliveryDistance(order.due_date)}</span><strong>#{order.order_number}</strong><b>{order.client_name || 'Customer not assigned'}</b><dl><div><dt>Part</dt><dd>{order.part_number || order.part_name || '—'}</dd></div>
{order.manufacturing_type === 'multi-step' ? <div className="production-multistep-piece-count"><dt>Multi-step</dt><dd>{stationPieceCount.toLocaleString()} pieces for this station</dd></div> : null}<div><dt>Pieces</dt><dd>{stationPieceCount.toLocaleString()}</dd></div>
<div><dt>Completed</dt><dd>{Number(order.completed_quantity).toLocaleString()}</dd></div><div><dt>Delivery</dt><dd>{formatDate(order.due_date)}</dd></div><div><dt>Status</dt><dd>{order.status}</dd></div><div><dt>Priority</dt><dd>{order.priority}</dd></div></dl>{savingOrderId === order.id ? <em><LoaderCircle size={15} /> Adding…</em> : <em>Add to queue <Plus size={15} /></em>}</button>; }) : <div className="production-order-options-empty"><PackageOpen size={26} /><strong>No available orders for this station</strong><span>Active orders assigned to this station will appear here.</span></div>}</div></section></div> : null}
  </section>;
}
