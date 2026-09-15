import React from 'react';
import { AlertTriangle, ArrowLeft, ArrowLeftRight, Biohazard, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Combine, Factory, GripVertical, LoaderCircle, PackageOpen, Plus, Sparkles, X } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { getDaysUntilDelivery } from './DeliveryRiskTimeline';
import { ProductionOrdersWorkspace } from './MesWorkspaces';
import { getOrderRiskLevel, type OrderRiskLevel } from './orderRisk';
import { useSupabaseRealtimeRefresh, type RealtimeConnectionState } from '../lib/useSupabaseRealtimeRefresh';
import { StatisticsAlertSlider } from './statistics/StatisticsAlerts';
import { useStatisticsAlerts } from './statistics/useStatisticsAlerts';
import './productionSchedule.css';
// The alarm slider and its overlay are styled with the Statistics workspace.
import './statisticsWorkspace.css';

type Props = { onNavigate: (path: string) => void; organizationId: string };
type Station = { id: string; code: string; name: string; type: string; capability_color: string | null; work_center_id: string; schedule_position: number | null; mirror_group_id?: string | null };
type WorkCenter = { id: string; code: string; name: string };
type Order = { id: string; order_number: string; client_name: string | null; part_number: string; part_name: string; planned_quantity: number; completed_quantity: number; scrap_quantity: number; due_date: string; priority: string; status: string; assigned_station: string | null; assigned_work_center: string | null; manufacturing_type: 'multi-step' | 'single-operation' };
type QueueItem = { id: string; station_id: string; production_order_id: string; position: number; preferred_station_id?: string | null };
type ProductionPiece = { production_order_id: string; assigned_station: string | null; compatible_stations: string[] | null; quarantined?: boolean | null };

const productionOrderDeepLinkKey = 'yvimo:mes:selectedProductionOrderNumber';
const productionOrderDetailsDeepLinkKey = 'yvimo:mes:openProductionOrderDetails';
const activeStatuses = ['planned', 'released', 'running', 'paused'];
const unscheduledListLimit = 12;
const riskLabels: Record<OrderRiskLevel, string> = { overdue: 'Overdue', high: 'High risk', moderate: 'Moderate risk', low: 'Low risk' };
const deliveryDistance = (dueDate: string) => { const days = getDaysUntilDelivery(dueDate); return days < 0 ? `${Math.abs(days)} days overdue` : days === 0 ? 'Due today' : days === 1 ? '1 day left' : `${days} days left`; };
const liveClockFormatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' });
// Intelligent Scheduling order: overdue first, then high risk, then everything held in
// quarantine (nothing can be done with it right now), then moderate and low risk.
const urgencyRank = (risk: OrderRiskLevel, quarantineHeld: boolean) => (
  quarantineHeld ? 2 : risk === 'overdue' ? 0 : risk === 'high' ? 1 : risk === 'moderate' ? 3 : 4
);
const liveStateLabels: Record<RealtimeConnectionState, string> = { connecting: 'Connecting…', live: 'Live production', offline: 'Reconnecting…' };
const formatDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const yvimoStationColors = ['#ff7a00', '#117a72', '#315f9a', '#774b8f', '#799a32', '#a94a42', '#28738a', '#8b6137', '#4c6f52', '#645a9b', '#b56b28', '#3f6b78', '#8a4761', '#557d33', '#476ca8', '#9a573d'];
const stationColor = (index: number) => {
  const base = yvimoStationColors[index % yvimoStationColors.length];
  const cycle = Math.floor(index / yvimoStationColors.length);
  return cycle === 0 ? base : `color-mix(in srgb, ${base} ${Math.max(58, 92 - cycle * 7)}%, #17202a)`;
};

// PostgREST caps every response at 1000 rows. The board reads every pending piece in the
// organization, so past that cap whole orders arrive with no piece and therefore with no
// compatible station: they vanish from the board and from the Add order picker, and the
// queue cleanup below deletes their cards as misplaced. Page to the last row instead.
const rowPageSize = 1000;
async function fetchAllRows<Row>(request: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>) {
  const rows: Row[] = [];
  for (let from = 0; ; from += rowPageSize) {
    const { data, error } = await request(from, from + rowPageSize - 1);
    if (error) return { data: rows, error };
    const page = data ?? [];
    rows.push(...page);
    if (page.length < rowPageSize) return { data: rows, error: null };
  }
}

export function ProductionScheduleWorkspace({ onNavigate, organizationId }: Props) {
  const [stations, setStations] = React.useState<Station[]>([]), [workCenters, setWorkCenters] = React.useState<WorkCenter[]>([]), [orders, setOrders] = React.useState<Order[]>([]), [productionPieces, setProductionPieces] = React.useState<ProductionPiece[]>([]), [queue, setQueue] = React.useState<QueueItem[]>([]);
  const [selectedStationId, setSelectedStationId] = React.useState(''), [selectedWorkCenterId, setSelectedWorkCenterId] = React.useState('all'), [workspaceMenuOpen, setWorkspaceMenuOpen] = React.useState(false), [loading, setLoading] = React.useState(true), [savingOrderId, setSavingOrderId] = React.useState(''), [error, setError] = React.useState('');
  const [reorderingStationId, setReorderingStationId] = React.useState(''), [detailOrderNumber, setDetailOrderNumber] = React.useState('');
  const [draggedStationId, setDraggedStationId] = React.useState(''), [reorderingStations, setReorderingStations] = React.useState(false);
  const [liveState, setLiveState] = React.useState<RealtimeConnectionState>('connecting'), [lastUpdatedAt, setLastUpdatedAt] = React.useState('');
  const [intelligentScheduling, setIntelligentScheduling] = React.useState(false), [intelligentAvailable, setIntelligentAvailable] = React.useState(true), [intelligentSaving, setIntelligentSaving] = React.useState(false), [autoPlanning, setAutoPlanning] = React.useState(false);
  const autoPlanBusyRef = React.useRef(false);
  const { activeAlerts, acknowledgeAlert, acknowledgeAllAlerts, reloadAlerts } = useStatisticsAlerts(organizationId);
  const [mirrorGroupsAvailable, setMirrorGroupsAvailable] = React.useState(true), [mirrorPreferenceAvailable, setMirrorPreferenceAvailable] = React.useState(true), [swappingItemId, setSwappingItemId] = React.useState(''), [mirrorStationId, setMirrorStationId] = React.useState(''), [mirrorSelection, setMirrorSelection] = React.useState<string[]>([]), [mirrorSaving, setMirrorSaving] = React.useState(false);
  const workspaceDropdownRef = React.useRef<HTMLDivElement>(null);

  const load = React.useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const [stationResult, centerResult, orderResult, pieceResult, queueResult, settingsResult] = await Promise.all([
      supabase.from('mes_work_center_stations').select('id, code, name, type, capability_color, work_center_id, schedule_position, mirror_group_id').eq('organization_id', organizationId).order('schedule_position').order('name'),
      supabase.from('mes_work_centers').select('id, code, name').eq('organization_id', organizationId).order('name'),
      fetchAllRows<Order>((from, to) => supabase.from('mes_production_orders').select('id, order_number, client_name, part_number, part_name, planned_quantity, completed_quantity, scrap_quantity, due_date, priority, status, assigned_station, assigned_work_center, manufacturing_type').eq('organization_id', organizationId).in('status', activeStatuses).order('due_date').order('id').range(from, to)),
      fetchAllRows<ProductionPiece>((from, to) => supabase.from('mes_production_serials').select('production_order_id, assigned_station, compatible_stations, quarantined').eq('organization_id', organizationId).is('result', null).order('id').range(from, to)),
      fetchAllRows<QueueItem>((from, to) => supabase.from('mes_production_schedule_queue').select('id, station_id, production_order_id, position, preferred_station_id').eq('organization_id', organizationId).order('position').order('id').range(from, to)),
      supabase.from('mes_production_schedule_settings').select('intelligent_scheduling').eq('organization_id', organizationId).maybeSingle(),
    ]);
    // The switch lives in migration 178; without it the board stays fully manual.
    setIntelligentAvailable(!settingsResult.error);
    setIntelligentScheduling(!settingsResult.error && settingsResult.data?.intelligent_scheduling === true);
    // The manual mirror preference arrives with migration 180.
    const queueRows = queueResult.error?.message?.includes('preferred_station_id')
      ? await fetchAllRows<QueueItem>((from, to) => supabase.from('mes_production_schedule_queue').select('id, station_id, production_order_id, position').eq('organization_id', organizationId).order('position').order('id').range(from, to))
      : queueResult;
    setMirrorPreferenceAvailable(!queueResult.error?.message?.includes('preferred_station_id'));
    // Mirror groups arrive with migration 179; without them every station plans alone.
    const stationRows = stationResult.error?.message?.includes('mirror_group_id')
      ? await supabase.from('mes_work_center_stations').select('id, code, name, type, capability_color, work_center_id, schedule_position').eq('organization_id', organizationId).order('schedule_position').order('name')
      : stationResult;
    setMirrorGroupsAvailable(!stationResult.error?.message?.includes('mirror_group_id'));
    // The quarantine flag on the pieces arrives with migration 176; without it the
    // board still loads, it just cannot mark a queue card as held.
    const pieceRows = pieceResult.error?.message?.includes('quarantined')
      ? await fetchAllRows<ProductionPiece>((from, to) => supabase.from('mes_production_serials').select('production_order_id, assigned_station, compatible_stations').eq('organization_id', organizationId).is('result', null).order('id').range(from, to))
      : pieceResult;
    const loadError = stationRows.error ?? centerResult.error ?? orderResult.error ?? pieceRows.error ?? queueRows.error;
    if (loadError) setError(`Unable to load the production schedule: ${loadError.message}. Apply SQL migrations 134–136.`);
    else {
      let activeOrders = (orderResult.data ?? []) as Order[];
      const loadedQueue = (queueRows.data ?? []) as QueueItem[];
      const pendingOrderIds = new Set((pieceRows.data ?? []).map((piece) => piece.production_order_id));
      const stationsById = new Map((stationRows.data ?? []).map((station) => [station.id, station.code]));
      const staleCompletedOrders = activeOrders.filter((order) => (
        order.manufacturing_type === 'multi-step'
        && Number(order.completed_quantity) + Number(order.scrap_quantity) >= Number(order.planned_quantity)
        && !pendingOrderIds.has(order.id)
      ));
      const reconciledOrderIds = new Set<string>();
      await Promise.all(staleCompletedOrders.map(async (order) => {
        const queuedStationId = loadedQueue.find((item) => item.production_order_id === order.id)?.station_id;
        const stationCode = queuedStationId ? stationsById.get(queuedStationId) : undefined;
        if (!stationCode) return;
        const { error: completionError } = await supabase.rpc('mes_operator_set_state', {
          p_order_id: order.id,
          p_organization_id: organizationId,
          p_station_code: stationCode,
          p_state: 'completed',
          p_reason: 'Reconciled completed Multi-step order',
          p_comment: 'All planned pieces were already reported and no station work remained',
          p_shift: null,
        });
        if (!completionError) reconciledOrderIds.add(order.id);
      }));
      activeOrders = activeOrders.filter((order) => !reconciledOrderIds.has(order.id));
      const activeOrderIds = new Set(activeOrders.map((order) => order.id));
      const activeOrdersById = new Map(activeOrders.map((order) => [order.id, order]));
      const stationsByQueueId = new Map((stationRows.data ?? []).map((station) => [station.id, station as Station]));
      const centersById = new Map((centerResult.data ?? []).map((center) => [center.id, center as WorkCenter]));
      const pendingStationCodesByOrder = new Map<string, Set<string>>();
      for (const piece of (pieceRows.data ?? []) as ProductionPiece[]) {
        const codes = pendingStationCodesByOrder.get(piece.production_order_id) ?? new Set<string>();
        if (piece.assigned_station) codes.add(piece.assigned_station);
        for (const code of piece.compatible_stations ?? []) codes.add(code);
        pendingStationCodesByOrder.set(piece.production_order_id, codes);
      }
      // Mirror machines run each other's work, so a card parked on a sibling station is
      // legitimate and must survive the cleanup that drops misplaced queue cards.
      const mirrorSiblings = (station: Station) => (station.mirror_group_id
        ? ((stationRows.data ?? []) as Station[]).filter((candidate) => candidate.mirror_group_id === station.mirror_group_id)
        : [station]);
      // The same code names a different machine in each plant, so a card only belongs here
      // when the station sits in the work center the order carries.
      const runsForOrder = (station: Station, order: Order) => (
        !order.assigned_work_center || centersById.get(station.work_center_id)?.code === order.assigned_work_center
      );
      const staleQueueIds = loadedQueue.filter((item) => {
        const order = activeOrdersById.get(item.production_order_id);
        if (!order) return true;
        const station = stationsByQueueId.get(item.station_id);
        if (!station) return true;
        if (order.manufacturing_type === 'multi-step') return !runsForOrder(station, order) || !pendingStationCodesByOrder.get(order.id)?.has(station.code);
        if (order.manufacturing_type !== 'single-operation') return false;
        const siblings = mirrorSiblings(station);
        const assignedStations = (order.assigned_station ?? '').split(',').map((code) => code.trim()).filter(Boolean);
        if (assignedStations.length) return !siblings.some((sibling) => assignedStations.includes(sibling.code) && runsForOrder(sibling, order));
        if (!order.assigned_work_center) return false;
        return !siblings.some((sibling) => centersById.get(sibling.work_center_id)?.code === order.assigned_work_center);
      }).map((item) => item.id);
      const staleQueueIdSet = new Set(staleQueueIds);
      if (staleQueueIds.length) await supabase.from('mes_production_schedule_queue').delete().eq('organization_id', organizationId).in('id', staleQueueIds);
      setStations((stationRows.data ?? []) as Station[]);
      setWorkCenters((centerResult.data ?? []) as WorkCenter[]);
      setOrders(activeOrders);
      setProductionPieces((pieceRows.data ?? []) as ProductionPiece[]);
      setQueue(loadedQueue.filter((item) => activeOrderIds.has(item.production_order_id) && !staleQueueIdSet.has(item.id)));
      setError('');
      setLastUpdatedAt(new Date().toISOString());
    }
    setLoading(false);
  }, [organizationId]);
  React.useEffect(() => { void load(); }, [load]);
  // Skip background refreshes mid-interaction so a live update never fights an in-flight reorder.
  const interactionBusy = Boolean(draggedStationId || reorderingStationId || reorderingStations || savingOrderId);
  const interactionBusyRef = React.useRef(interactionBusy);
  React.useEffect(() => { interactionBusyRef.current = interactionBusy; }, [interactionBusy]);
  const realtimeTables = React.useMemo(() => ([
    { table: 'mes_production_orders', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_production_serials', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_production_schedule_queue', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_work_center_stations', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_production_schedule_settings', filter: `organization_id=eq.${organizationId}` },
    // Downtime and scrap raise an alarm the moment they are reported.
    { table: 'mes_operator_terminal_events', filter: `organization_id=eq.${organizationId}` },
  ]), [organizationId]);
  useSupabaseRealtimeRefresh({
    channelName: `production-schedule-live:${organizationId}`,
    tables: realtimeTables,
    onRefresh: () => { void reloadAlerts(); if (!interactionBusyRef.current) void load(true); },
    onConnectionStateChange: setLiveState,
    enabled: Boolean(organizationId),
    refreshOnFocus: true,
    pollMs: 20_000,
  });
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
  // A queue card is "in quarantine" when every piece still pending at this station is
  // held: nobody can work on it, so the card must not read as plain idle work.
  const stationQuarantineHold = React.useCallback((orderId: string, stationCode: string, multiStep: boolean) => {
    const pending = productionPieces.filter((piece) => piece.production_order_id === orderId
      && (!multiStep || piece.assigned_station === stationCode || (piece.compatible_stations ?? []).includes(stationCode)));
    const quarantined = pending.filter((piece) => piece.quarantined).length;
    return { pending: pending.length, quarantined, held: pending.length > 0 && quarantined === pending.length };
  }, [productionPieces]);
  // Mirror machines are sister stations: what one produces, the other can produce too.
  const mirrorSiblingsOf = React.useCallback((station: Station) => (station.mirror_group_id
    ? stations.filter((candidate) => candidate.mirror_group_id === station.mirror_group_id)
    : [station]), [stations]);
  // Which stations can actually run an order: multi-step orders follow their pending
  // pieces, single-operation orders follow the stations (or work center) they carry,
  // and any mirror sibling of those stations counts as the same machine.
  // Station codes are unique per work center, not per organization (migration 030), so the
  // KAPP 305 of Saltillo and the KAPP 305 of Queretaro are two different machines. Every
  // match by code has to be read inside the work center the order belongs to, or the board
  // plans Saltillo work in Queretaro and shows a multi-step order once per plant.
  const stationRunsForOrder = React.useCallback((station: Station, order: Order) => (
    !order.assigned_work_center || centerById.get(station.work_center_id)?.code === order.assigned_work_center
  ), [centerById]);
  const compatibleStationsFor = React.useCallback((order: Order, stationList: Station[]) => stationList.filter((station) => {
    if (order.manufacturing_type === 'multi-step') return stationRunsForOrder(station, order) && multiStepPieceCount(order.id, station.code) > 0;
    const assignedCodes = (order.assigned_station ?? '').split(',').map((code) => code.trim()).filter(Boolean);
    const siblings = mirrorSiblingsOf(station);
    if (assignedCodes.length) return siblings.some((sibling) => assignedCodes.includes(sibling.code) && stationRunsForOrder(sibling, order));
    return siblings.some((sibling) => {
      const center = centerById.get(sibling.work_center_id);
      return Boolean(center && order.assigned_work_center === center.code);
    });
  }), [centerById, mirrorSiblingsOf, multiStepPieceCount, stationRunsForOrder]);

  const mirrorStation = stations.find((station) => station.id === mirrorStationId) ?? null;
  const openMirrorSetup = (station: Station) => {
    setMirrorStationId(station.id);
    setMirrorSelection(station.mirror_group_id
      ? stations.filter((candidate) => candidate.id !== station.id && candidate.mirror_group_id === station.mirror_group_id).map((candidate) => candidate.id)
      : []);
  };
  const saveMirrorGroup = async () => {
    if (!mirrorStation) return;
    setMirrorSaving(true);
    const previousMemberIds = mirrorStation.mirror_group_id
      ? stations.filter((station) => station.mirror_group_id === mirrorStation.mirror_group_id).map((station) => station.id)
      : [];
    const memberIds = [mirrorStation.id, ...mirrorSelection];
    // A group of one is not a mirror: it is simply released.
    const groupId = memberIds.length > 1 ? mirrorStation.mirror_group_id || crypto.randomUUID() : null;
    const clearedIds = previousMemberIds.filter((id) => !memberIds.includes(id));
    const clearResult = clearedIds.length
      ? await supabase.from('mes_work_center_stations').update({ mirror_group_id: null }).eq('organization_id', organizationId).in('id', clearedIds)
      : { error: null };
    const assignResult = await supabase.from('mes_work_center_stations').update({ mirror_group_id: groupId }).eq('organization_id', organizationId).in('id', memberIds);
    setMirrorSaving(false);
    const mirrorError = clearResult.error ?? assignResult.error;
    if (mirrorError) { setError(`${mirrorError.message}. Apply SQL migration 179.`); return; }
    setError('');
    setMirrorStationId('');
    await load(true);
  };

  const toggleIntelligentScheduling = async () => {
    const next = !intelligentScheduling;
    setIntelligentSaving(true);
    setIntelligentScheduling(next);
    const { error: settingsError } = await supabase
      .from('mes_production_schedule_settings')
      .upsert({ organization_id: organizationId, intelligent_scheduling: next }, { onConflict: 'organization_id' });
    setIntelligentSaving(false);
    if (settingsError) {
      setIntelligentScheduling(!next);
      setError(`${settingsError.message}. Apply SQL migration 178.`);
      return;
    }
    setError('');
  };

  // Intelligent Scheduling runs in the database (migration 180): triggers replan the
  // board whenever orders, pieces, stations or the switch change, so the plan no longer
  // depends on somebody keeping this page open. This call is the catch-up for the one
  // thing no row change announces: the calendar turning an order overdue.
  const runIntelligentSchedule = React.useCallback(async () => {
    if (autoPlanBusyRef.current) return;
    autoPlanBusyRef.current = true;
    setAutoPlanning(true);
    try {
      const { data, error: planError } = await supabase.rpc('mes_intelligent_schedule_apply', { p_organization_id: organizationId });
      if (planError) {
        setError(planError.code === '42883' || planError.message.includes('does not exist')
          ? 'Intelligent Scheduling needs SQL migration 180.'
          : `Intelligent Scheduling could not plan the board: ${planError.message}`);
        return;
      }
      if (Number(data) > 0) await load(true);
    } finally {
      autoPlanBusyRef.current = false;
      setAutoPlanning(false);
    }
  }, [load, organizationId]);

  React.useEffect(() => {
    if (!intelligentScheduling || loading) return;
    void runIntelligentSchedule();
    const heartbeat = window.setInterval(() => { if (!interactionBusyRef.current) void runIntelligentSchedule(); }, 300_000);
    return () => window.clearInterval(heartbeat);
  }, [intelligentScheduling, loading, runIntelligentSchedule]);

  const availableOrders = selectedStation ? orders.filter((order) => {
    if (!compatibleStationsFor(order, [selectedStation]).length) return false;
    // Work already planned here, on a sister machine, or anywhere at all when the order
    // only runs once, is not available any more: it is already in the plan.
    const poolStationIds = new Set(mirrorSiblingsOf(selectedStation).map((station) => station.id));
    if (queue.some((item) => poolStationIds.has(item.station_id) && item.production_order_id === order.id)) return false;
    return order.manufacturing_type === 'multi-step' || !queue.some((item) => item.production_order_id === order.id);
  }) : [];

  // An active order no station can run never reaches a queue and never shows up in the
  // Add order picker either, so without this notice it just disappears from the board.
  const unscheduledOrders = React.useMemo(() => orders.filter((order) => compatibleStationsFor(order, stations).length === 0), [compatibleStationsFor, orders, stations]);
  const unscheduledReason = (order: Order) => {
    if (order.manufacturing_type === 'multi-step') return productionPieces.some((piece) => piece.production_order_id === order.id)
      ? 'Its pending pieces carry no station: assign one to every piece in Order Details'
      : 'No pending piece left to plan: review the pieces in Order Details';
    const stationCodes = (order.assigned_station ?? '').split(',').map((code) => code.trim()).filter(Boolean);
    if (stationCodes.length) {
      const elsewhere = [...new Set(stations.filter((station) => stationCodes.includes(station.code))
        .map((station) => centerById.get(station.work_center_id)?.code).filter(Boolean))];
      return elsewhere.length
        ? `Station ${stationCodes.join(', ')} lives in ${elsewhere.join(', ')}, not in ${order.assigned_work_center}`
        : `No station in this shop uses the code ${stationCodes.join(', ')}`;
    }
    const workCenterCode = (order.assigned_work_center ?? '').trim();
    if (workCenterCode) return `The work center ${workCenterCode} has no station yet`;
    return 'The order carries no station and no work center';
  };

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

  // Sending a card to the sister machine is a preference, not a one-off move: the
  // balancer keeps it there instead of pulling it back on the next pass.
  const swapToMirrorStation = async (item: QueueItem, target: Station) => {
    setSwappingItemId(item.id);
    const nextPosition = Math.max(0, ...queue.filter((queued) => queued.station_id === target.id).map((queued) => queued.position)) + 1;
    const { error: swapError } = await supabase
      .from('mes_production_schedule_queue')
      .update({ station_id: target.id, preferred_station_id: target.id, position: nextPosition })
      .eq('id', item.id)
      .eq('organization_id', organizationId);
    setSwappingItemId('');
    if (swapError) { setError(`${swapError.message}. Apply SQL migration 180.`); return; }
    setError('');
    await load(true);
  };

  const moveQueueItem = (stationId: string, itemId: string, direction: -1 | 1) => {
    const ids = queue.filter((item) => item.station_id === stationId).sort((a, b) => a.position - b.position).map((item) => item.id), index = ids.indexOf(itemId), target = index + direction;
    if (index < 0 || target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    void reorderStationQueue(stationId, ids);
  };

  const openOrderDetails = (orderNumber: string) => {
    window.sessionStorage.setItem(productionOrderDeepLinkKey, orderNumber);
    window.sessionStorage.setItem(productionOrderDetailsDeepLinkKey, orderNumber);
    setDetailOrderNumber(orderNumber);
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
    {activeAlerts.length ? <div className="statistics-alert-overlay" key={activeAlerts[0].id}>
      <StatisticsAlertSlider alerts={activeAlerts} onAcknowledge={acknowledgeAlert} onAcknowledgeAll={acknowledgeAllAlerts} />
    </div> : null}
    <div className="mes-screen-header production-schedule-header"><button className="academy-back-button engineering-back-button mes-workspace-back" type="button" onClick={() => onNavigate('/workspace/manufacturing-ops/aps')}><ArrowLeft size={16} /> APS</button><div className="mes-workspace-heading"><p className="eyebrow">APS / PRODUCTION SCHEDULE</p><h2>Production Schedule</h2><p>Build the production plan for each machine and coordinate scheduled work across the shop floor.</p></div></div>
    <div className="production-schedule-toolbar"><label><span>Workspace</span><div className={`production-workspace-dropdown${workspaceMenuOpen ? ' open' : ''}`} ref={workspaceDropdownRef}><button type="button" aria-haspopup="listbox" aria-expanded={workspaceMenuOpen} onClick={() => setWorkspaceMenuOpen((current) => !current)}><Factory size={17} /><strong>{selectedWorkCenter ? `${selectedWorkCenter.name} · ${selectedWorkCenter.code}` : 'All workspaces'}</strong><ChevronDown size={16} /></button>{workspaceMenuOpen ? <div className="production-workspace-menu" role="listbox"><button className={selectedWorkCenterId === 'all' ? 'selected' : ''} type="button" role="option" aria-selected={selectedWorkCenterId === 'all'} onClick={() => { setSelectedWorkCenterId('all'); setWorkspaceMenuOpen(false); }}><span><b>All workspaces</b><small>Show every production station</small></span>{selectedWorkCenterId === 'all' ? <Check size={16} /> : null}</button>{workCenters.map((center) => <button className={selectedWorkCenterId === center.id ? 'selected' : ''} type="button" role="option" aria-selected={selectedWorkCenterId === center.id} onClick={() => { setSelectedWorkCenterId(center.id); setWorkspaceMenuOpen(false); }} key={center.id}><span><b>{center.name}</b><small>{center.code}</small></span>{selectedWorkCenterId === center.id ? <Check size={16} /> : null}</button>)}</div> : null}</div></label><div className="production-schedule-toolbar-status"><p><strong>{visibleStations.length}</strong> station{visibleStations.length === 1 ? '' : 's'} shown</p><div className={`production-intelligent-scheduling${intelligentScheduling ? ' on' : ''}`}><div><button type="button" role="switch" aria-checked={intelligentScheduling} aria-label="Intelligent Scheduling" disabled={!intelligentAvailable || intelligentSaving} onClick={() => void toggleIntelligentScheduling()}><i /></button><span><Sparkles size={14} /> Intelligent Scheduling</span></div><small>{!intelligentAvailable ? 'Apply SQL migration 178' : autoPlanning ? 'Organizing queues…' : intelligentScheduling ? 'Queues sorted by urgency' : 'Manual planning'}</small></div><div className={`production-schedule-live-state ${liveState}`}><span><i /> {liveStateLabels[liveState]}</span><small>{lastUpdatedAt ? `Updated ${liveClockFormatter.format(new Date(lastUpdatedAt))}` : 'Waiting for data'}</small></div></div></div>
    {error ? <div className="production-schedule-message" role="alert">{error}</div> : null}
    {!loading && unscheduledOrders.length ? <div className="production-schedule-unscheduled"><header><AlertTriangle size={17} /><div><strong>{unscheduledOrders.length} active order{unscheduledOrders.length === 1 ? '' : 's'} cannot be scheduled</strong><span>No station in the shop can run them, so they stay out of every queue and out of the Add order picker.</span></div></header><ul>{unscheduledOrders.slice(0, unscheduledListLimit).map((order) => <li key={order.id}><button type="button" onClick={() => openOrderDetails(order.order_number)}><b>#{order.order_number}</b><span>{order.client_name || 'Customer not assigned'}</span><em>{unscheduledReason(order)}</em></button></li>)}{unscheduledOrders.length > unscheduledListLimit ? <li className="production-schedule-unscheduled-more">and {unscheduledOrders.length - unscheduledListLimit} more</li> : null}</ul></div> : null}
    {loading ? <div className="production-schedule-loading"><LoaderCircle size={24} /> Loading stations and orders…</div> : stations.length === 0 ? <div className="production-schedule-empty"><Factory size={28} /><strong>No stations are configured yet</strong><span>Create stations in MES Work Centers before building the production schedule.</span></div> : visibleStations.length === 0 ? <div className="production-schedule-empty"><Factory size={28} /><strong>No stations in this workspace</strong><span>Select another workspace to continue planning.</span></div> : <div className="production-schedule-board">{visibleStations.map((station) => {
      const stationQueue = queue.filter((item) => item.station_id === station.id).sort((a, b) => a.position - b.position), center = centerById.get(station.work_center_id), color = stationColorById.get(station.id) || '#ff8a1f';
      const stationIndex = visibleStations.findIndex((candidate) => candidate.id === station.id);
      return <section className={`production-station-lane${draggedStationId === station.id ? ' dragging' : ''}`} style={{ '--station-color': color } as React.CSSProperties} draggable={!reorderingStations} onDragStart={(event) => { if ((event.target as HTMLElement).closest('.production-queue-order')) { event.preventDefault(); return; } setDraggedStationId(station.id); }} onDragEnd={() => setDraggedStationId('')} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { if (!(event.target as HTMLElement).closest('.production-queue-order')) dropStation(station.id); }} key={station.id}><article className="production-station-card"><span className="production-station-color" /><div className="production-station-order-controls"><span><GripVertical size={15} /> Station {stationIndex + 1}</span><div><button type="button" disabled={stationIndex === 0 || reorderingStations} aria-label={`Move ${station.name} up`} onClick={() => moveStation(station.id, -1)}><ChevronDown size={15} /></button><button type="button" disabled={stationIndex === visibleStations.length - 1 || reorderingStations} aria-label={`Move ${station.name} down`} onClick={() => moveStation(station.id, 1)}><ChevronDown size={15} /></button></div></div><small>{center ? `${center.name} · ${center.code}` : 'Work center'}</small><strong>{station.name}</strong><b>{station.code}</b><em>{station.type}</em>{station.mirror_group_id ? <span className="production-station-mirror-tag"><Combine size={13} /> Mirror of {mirrorSiblingsOf(station).filter((sibling) => sibling.id !== station.id).map((sibling) => sibling.name).join(', ') || 'no machine yet'}</span> : null}<button className="production-station-mirror-button" type="button" disabled={!mirrorGroupsAvailable} title={mirrorGroupsAvailable ? 'Configure mirror machines' : 'Apply SQL migration 179 to configure mirror machines'} onClick={(event) => { event.stopPropagation(); openMirrorSetup(station); }}><Combine size={14} /> Mirror machines</button></article><div className="production-station-queue">{stationQueue.map((item) => {
        const order = orderById.get(item.production_order_id); if (!order) return null; const risk = getOrderRiskLevel(order.due_date);
        const stationPieceCount = order.manufacturing_type === 'multi-step' ? multiStepPieceCount(order.id, station.code) : Number(order.planned_quantity);
        const quarantineHold = stationQuarantineHold(order.id, station.code, order.manufacturing_type === 'multi-step');
        const mirrorTargets = mirrorSiblingsOf(station).filter((sibling) => sibling.id !== station.id);
        // With more than two sister machines the button walks through them in order.
        const mirrorTarget = mirrorTargets.length ? mirrorTargets[(mirrorTargets.findIndex((sibling) => sibling.id === item.preferred_station_id) + 1) % mirrorTargets.length] : null;
        const itemIndex = stationQueue.findIndex((candidate) => candidate.id === item.id);
        return <article className={`production-queue-order clickable${quarantineHold.held ? ' quarantined' : ''}`} role="button" tabIndex={0} aria-label={`Open production order ${order.order_number} details`} onClick={(event) => { if (!(event.target as HTMLElement).closest('button')) openOrderDetails(order.order_number); }} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openOrderDetails(order.order_number); } }} key={item.id}><div className="production-queue-order-controls"><span>Queue {itemIndex + 1}</span><div><button type="button" disabled={intelligentScheduling || itemIndex === 0 || reorderingStationId === station.id} title={intelligentScheduling ? 'Intelligent Scheduling controls this queue order' : undefined} aria-label={`Move order ${order.order_number} earlier`} onClick={(event) => { event.stopPropagation(); moveQueueItem(station.id, item.id, -1); }}><ChevronLeft size={15} /></button><button type="button" disabled={intelligentScheduling || itemIndex === stationQueue.length - 1 || reorderingStationId === station.id} title={intelligentScheduling ? 'Intelligent Scheduling controls this queue order' : undefined} aria-label={`Move order ${order.order_number} later`} onClick={(event) => { event.stopPropagation(); moveQueueItem(station.id, item.id, 1); }}><ChevronRight size={15} /></button>{mirrorTarget ? <button className={`production-queue-order-swap${item.preferred_station_id ? ' pinned' : ''}`} type="button" disabled={!mirrorPreferenceAvailable || swappingItemId === item.id} aria-label={`Move order ${order.order_number} to ${mirrorTarget.name}`} title={mirrorPreferenceAvailable ? `Work this order on ${mirrorTarget.name}` : 'Apply SQL migration 180 to choose a mirror machine'} onClick={(event) => { event.stopPropagation(); void swapToMirrorStation(item, mirrorTarget); }}><ArrowLeftRight size={15} /></button> : null}</div></div><header className={quarantineHold.held ? 'quarantine' : risk}><span>{quarantineHold.held ? <><Biohazard size={14} /> In quarantine</> : <><AlertTriangle size={14} /> {riskLabels[risk]}</>}</span><b>{deliveryDistance(order.due_date)}</b><time><CalendarDays size={13} /> {formatDate(order.due_date)}</time></header><div><small>Production order</small><strong>#{order.order_number}</strong><span>{order.client_name || 'Customer not assigned'}</span><dl>{item.preferred_station_id === station.id ? <div className="production-queue-order-pinned"><dt>Mirror choice</dt><dd>Kept on {station.name}</dd></div> : null}{quarantineHold.held ? <div className="production-queue-order-quarantine"><dt>Quarantine</dt><dd>{quarantineHold.quarantined === 1 ? '1 piece held' : `${quarantineHold.quarantined} pieces held`}</dd></div> : null}<div><dt>Part</dt><dd>{order.part_number || order.part_name || '—'}</dd></div>
{order.manufacturing_type === 'multi-step' ? <div className="production-multistep-piece-count"><dt>Multi-step</dt><dd>{stationPieceCount.toLocaleString()} pieces for this station</dd></div> : null}<div><dt>Pieces</dt><dd>{stationPieceCount.toLocaleString()}</dd></div><div className="production-queue-order-status"><dt>Status</dt><dd className={quarantineHold.held ? 'status-quarantine' : `status-${order.status}`}>{quarantineHold.held ? 'in quarantine' : order.status.replaceAll('-', ' ')}</dd></div>
<div><dt>Progress</dt><dd>{Number(order.completed_quantity).toLocaleString()} / {Number(order.planned_quantity).toLocaleString()}</dd></div><div><dt>Priority</dt><dd>{order.priority}</dd></div></dl></div></article>;
      })}<button className="production-queue-add" type="button" onClick={() => setSelectedStationId(station.id)}><Plus size={28} /><strong>Add order</strong><span>Place the next job in this station queue</span></button></div></section>;
    })}</div>}
    {selectedStation ? <div className="production-order-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedStationId(''); }}><section className="production-order-modal" role="dialog" aria-modal="true" aria-labelledby="production-order-picker-title"><header><div><span>Select production order</span><h3 id="production-order-picker-title">{selectedStation.name} · {selectedStation.code}</h3><p>Choose an available order assigned to this station.</p></div><button type="button" aria-label="Close" onClick={() => setSelectedStationId('')}><X size={20} /></button></header><div className="production-order-options">{availableOrders.length ? availableOrders.map((order) => {
const risk = getOrderRiskLevel(order.due_date);
const stationPieceCount = order.manufacturing_type === 'multi-step' ? multiStepPieceCount(order.id, selectedStation.code) : Number(order.planned_quantity);
const optionQuarantineHold = stationQuarantineHold(order.id, selectedStation.code, order.manufacturing_type === 'multi-step');
return <button type="button" disabled={Boolean(savingOrderId)} onClick={() => void addOrder(order)} key={order.id}><span className={`production-order-option-risk ${optionQuarantineHold.held ? 'quarantine' : risk}`}>{optionQuarantineHold.held ? <>In quarantine · {deliveryDistance(order.due_date)}</> : <>{riskLabels[risk]} · {deliveryDistance(order.due_date)}</>}</span><strong>#{order.order_number}</strong><b>{order.client_name || 'Customer not assigned'}</b><dl><div><dt>Part</dt><dd>{order.part_number || order.part_name || '—'}</dd></div>
{order.manufacturing_type === 'multi-step' ? <div className="production-multistep-piece-count"><dt>Multi-step</dt><dd>{stationPieceCount.toLocaleString()} pieces for this station</dd></div> : null}<div><dt>Pieces</dt><dd>{stationPieceCount.toLocaleString()}</dd></div>
<div><dt>Completed</dt><dd>{Number(order.completed_quantity).toLocaleString()}</dd></div><div><dt>Delivery</dt><dd>{formatDate(order.due_date)}</dd></div><div><dt>Status</dt><dd>{order.status}</dd></div><div><dt>Priority</dt><dd>{order.priority}</dd></div></dl>{savingOrderId === order.id ? <em><LoaderCircle size={15} /> Adding…</em> : <em>Add to queue <Plus size={15} /></em>}</button>; }) : <div className="production-order-options-empty"><PackageOpen size={26} /><strong>No available orders for this station</strong><span>Active orders assigned to this station will appear here.</span></div>}</div></section></div> : null}
    {mirrorStation ? <div className="production-order-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !mirrorSaving) setMirrorStationId(''); }}><section className="production-order-modal production-mirror-modal" role="dialog" aria-modal="true" aria-labelledby="production-mirror-title"><header><div><span>Mirror machines</span><h3 id="production-mirror-title">{mirrorStation.name} · {mirrorStation.code}</h3><p>Pick the sister machines that can run the same work. Intelligent Scheduling levels each urgency level across them.</p></div><button type="button" aria-label="Close" onClick={() => setMirrorStationId('')} disabled={mirrorSaving}><X size={20} /></button></header><div className="production-mirror-options">{stations.filter((station) => station.id !== mirrorStation.id).map((station) => {
      const center = centerById.get(station.work_center_id);
      const selected = mirrorSelection.includes(station.id);
      const takenBy = station.mirror_group_id && station.mirror_group_id !== mirrorStation.mirror_group_id ? stations.filter((candidate) => candidate.mirror_group_id === station.mirror_group_id && candidate.id !== station.id).map((candidate) => candidate.name).join(', ') : '';
      return <button className={selected ? 'selected' : ''} type="button" aria-pressed={selected} onClick={() => setMirrorSelection((current) => current.includes(station.id) ? current.filter((id) => id !== station.id) : [...current, station.id])} key={station.id}><span><strong>{station.name}</strong><b>{station.code}</b><small>{center ? `${center.name} · ${center.code}` : 'Work center'}{takenBy ? ` · currently mirroring ${takenBy}` : ''}</small></span>{selected ? <Check size={17} /> : <Plus size={17} />}</button>;
    })}{stations.length < 2 ? <div className="production-order-options-empty"><Factory size={26} /><strong>No other station to mirror</strong><span>Create another station in MES Work Centers first.</span></div> : null}</div><footer className="production-mirror-actions"><span>{mirrorSelection.length ? `${mirrorSelection.length + 1} machines in this mirror group` : 'No mirror: this machine plans alone'}</span><div><button type="button" className="secondary" onClick={() => setMirrorStationId('')} disabled={mirrorSaving}>Cancel</button><button type="button" onClick={() => void saveMirrorGroup()} disabled={mirrorSaving}><Combine size={16} /> {mirrorSaving ? 'Saving…' : 'Save mirror group'}</button></div></footer></section></div> : null}
    {detailOrderNumber ? <ProductionOrdersWorkspace organizationId={organizationId} onNavigate={onNavigate} modalOnly onModalClose={() => setDetailOrderNumber('')} /> : null}
  </section>;
}
