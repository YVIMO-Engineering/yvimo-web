import React from 'react';
import { Box, CalendarDays, ChevronDown, ChevronRight, ClipboardList, Clock3, FileCheck2, LoaderCircle, PackageCheck, Search, Truck, X } from 'lucide-react';
import { customerPortalSupabase as supabase } from '../lib/supabaseClient';
import { useSupabaseRealtimeRefresh } from '../lib/useSupabaseRealtimeRefresh';

type Props = { organizationId: string; customerId: string; supplierName: string; onOpenOrders: () => void; view?: 'dashboard' | 'orders' };
type OrderRow = { id: string; order_number: string; part_number: string; part_name: string; piece_type: string; planned_quantity: number; completed_quantity: number; scrap_quantity: number; status: string; priority: string; due_date: string; created_at: string; updated_at: string };
type ReceptionRow = { id: string; voucher_number: string; customer_reference: string; status: string; updated_at: string };
type ReceptionItemRow = { id: string; production_order_id: string | null; quantity: number; coating_sent_at: string | null; coating_returned_at: string | null; sent_at: string | null };
type SerialProgressRow = { id: string; reception_item_id: string; coating_sent_at: string | null; coating_returned_at: string | null; sent_at: string | null; updated_at: string };
type OrderSerialSummaryRow = { production_order_id: string; serial_count: number; tool_ids: string[] | null; serial_numbers: string[] | null };
type OrderSerialDetailRow = { production_order_id: string; production_serial_id: string; piece_sequence: number; serial_number: string; tool_id: string; result: string | null; reported_at: string | null; voucher_number: string | null; coating_sent_at: string | null; coating_returned_at: string | null; delivered_at: string | null };
type DocumentRow = { id: string; production_order_id: string; file_name: string; uploaded_at: string };
type ActivityTone = 'document' | 'shipment' | 'reception' | 'quality' | 'order';
type ActivityItem = { id: string; title: string; meta: string; at: string; icon: React.ComponentType<{ size?: number }>; tone: ActivityTone };

const statusLabels: Record<string, string> = { planned: 'Planned', released: 'Released', running: 'In process', paused: 'Paused', 'waiting-inspection': 'Quality check', completed: 'Completed', cancelled: 'Cancelled' };

function shortDate(value: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: '2-digit' }).format(new Date(`${value}T12:00:00`));
}

function relativeTime(value: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  if (seconds < 172800) return 'yesterday';
  return `${Math.floor(seconds / 86400)} days ago`;
}

function detailDate(value: string | null) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en', { month: 'short', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function orderJourney(order: OrderRow, items: ReceptionItemRow[], serialProgress: SerialProgressRow[]) {
  const orderItems = items.filter((item) => item.production_order_id === order.id);
  const itemIds = new Set(orderItems.map((item) => item.id));
  const pieces = serialProgress.filter((piece) => itemIds.has(piece.reception_item_id));
  const expectedPieces = Math.max(order.planned_quantity || 0, ...orderItems.map((item) => item.quantity || 0), pieces.length);
  const counts = pieces.reduce((result, piece) => {
    if (piece.sent_at) result.delivered += 1;
    else if (piece.coating_returned_at) result.ready += 1;
    else if (piece.coating_sent_at) result.coating += 1;
    else result.quality += 1;
    return result;
  }, { delivered: 0, ready: 0, coating: 0, quality: 0 });
  const scrapCount = Math.max(0, order.scrap_quantity || 0);
  const representedPieces = pieces.length;
  const manufacturingPieces = Math.max(0, expectedPieces - representedPieces);
  const productionRatio = order.planned_quantity ? Math.min(1, order.completed_quantity / order.planned_quantity) : 0;
  const weightedProgress = counts.delivered * 100 + counts.ready * 85 + counts.coating * 70 + counts.quality * 55 + manufacturingPieces * productionRatio * 45;
  const progress = expectedPieces ? Math.min(100, Math.round(weightedProgress / expectedPieces)) : Math.round(productionRatio * 45);
  const stages = [
    scrapCount ? `${scrapCount} scrap` : '',
    counts.delivered ? `${counts.delivered} delivered` : '',
    counts.ready ? `${counts.ready} ready to deliver` : '',
    counts.coating ? `${counts.coating} in coating` : '',
    counts.quality ? `${counts.quality} in quality check` : '',
    manufacturingPieces ? `${manufacturingPieces} in production` : '',
  ].filter(Boolean);
  const fullyDelivered = expectedPieces > 0 && counts.delivered >= expectedPieces;
  const producedPieces = Math.min(expectedPieces, Math.max(0, order.completed_quantity || representedPieces));
  let label = statusLabels[order.status] ?? order.status;
  let badges: Array<{ text: string; tone: 'production' | 'quality' | 'coating' | 'ready' | 'delivered' | 'scrap' }> = [];
  if (scrapCount) badges.push({ text: `${scrapCount} scrap`, tone: 'scrap' });
  if (counts.delivered) badges.push({ text: `${counts.delivered} delivered`, tone: 'delivered' });
  if (counts.ready) badges.push({ text: `${counts.ready} ready to deliver`, tone: 'ready' });
  if (counts.coating) badges.push({ text: `${counts.coating} in coating`, tone: 'coating' });
  if (counts.quality) badges.push({ text: `${counts.quality} in quality`, tone: 'quality' });
  if (manufacturingPieces) badges.push({ text: `${producedPieces} of ${expectedPieces} produced`, tone: 'production' });
  if (stages.length > 1) label = 'Mixed serial progress';
  else if (counts.delivered) label = 'Delivery completed';
  else if (counts.ready) label = 'Ready for delivery';
  else if (counts.coating) label = 'Coating in progress';
  else if (counts.quality || order.status === 'waiting-inspection') {
    label = 'Quality inspection';
    badges = [...(scrapCount ? [{ text: `${scrapCount} scrap`, tone: 'scrap' as const }] : []), { text: `${counts.quality || expectedPieces} in quality`, tone: 'quality' }, { text: 'Next: Coating', tone: 'coating' }];
  }
  else if (manufacturingPieces && productionRatio >= 1) {
    label = 'Production completed';
    badges = [...(scrapCount ? [{ text: `${scrapCount} scrap`, tone: 'scrap' as const }] : []), { text: `${producedPieces} of ${expectedPieces} produced`, tone: 'production' }, { text: 'Next: Quality inspection', tone: 'quality' }];
  } else if (manufacturingPieces) {
    label = 'Production in progress';
    badges = [...(scrapCount ? [{ text: `${scrapCount} scrap`, tone: 'scrap' as const }] : []), { text: `${producedPieces} of ${expectedPieces} produced`, tone: 'production' }];
  }
  return { progress, label, badges, fullyDelivered, deliveredPieces: counts.delivered };
}

export function CustomerPortalDashboard({ organizationId, customerId, supplierName, onOpenOrders, view = 'dashboard' }: Props) {
  const [orders, setOrders] = React.useState<OrderRow[]>([]);
  const [receptions, setReceptions] = React.useState<ReceptionRow[]>([]);
  const [receptionItems, setReceptionItems] = React.useState<ReceptionItemRow[]>([]);
  const [serialProgress, setSerialProgress] = React.useState<SerialProgressRow[]>([]);
  const [orderSerialSummaries, setOrderSerialSummaries] = React.useState<OrderSerialSummaryRow[]>([]);
  const [orderSerialDetails, setOrderSerialDetails] = React.useState<OrderSerialDetailRow[]>([]);
  const [expandedOrderId, setExpandedOrderId] = React.useState('');
  const [documents, setDocuments] = React.useState<DocumentRow[]>([]);
  const [orderSearch, setOrderSearch] = React.useState('');
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');
  const [partType, setPartType] = React.useState('all');
  const [partTypeOpen, setPartTypeOpen] = React.useState(false);
  const partTypeFilterRef = React.useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  const loadDashboard = React.useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const [orderResult, receptionResult, receptionItemResult, serialProgressResult, productionSerialResult, productionSerialDetailResult, documentResult] = await Promise.all([
      supabase.from('mes_production_orders').select('id, order_number, part_number, part_name, piece_type, planned_quantity, completed_quantity, scrap_quantity, status, priority, due_date, created_at, updated_at').eq('organization_id', organizationId).eq('customer_id', customerId).order('updated_at', { ascending: false }),
      supabase.from('mes_customer_reception_vouchers').select('id, voucher_number, customer_reference, status, updated_at').eq('organization_id', organizationId).eq('customer_id', customerId).order('updated_at', { ascending: false }).limit(20),
      supabase.from('mes_customer_reception_items').select('id, production_order_id, quantity, coating_sent_at, coating_returned_at, sent_at').eq('organization_id', organizationId).eq('customer_id', customerId),
      supabase.from('mes_customer_reception_serial_progress').select('id, reception_item_id, coating_sent_at, coating_returned_at, sent_at, updated_at').eq('organization_id', organizationId),
      supabase.rpc('get_customer_portal_order_serial_summary', { p_organization_id: organizationId, p_customer_id: customerId }),
      supabase.rpc('get_customer_portal_order_serial_details', { p_organization_id: organizationId, p_customer_id: customerId }),
      supabase.from('mes_quality_inspection_documents').select('id, production_order_id, file_name, uploaded_at').eq('organization_id', organizationId).order('uploaded_at', { ascending: false }).limit(20),
    ]);
    const firstError = orderResult.error ?? receptionResult.error ?? receptionItemResult.error ?? serialProgressResult.error ?? productionSerialResult.error ?? productionSerialDetailResult.error ?? documentResult.error;
    setError(firstError?.message ?? '');
    setOrders((orderResult.data ?? []) as OrderRow[]);
    setReceptions((receptionResult.data ?? []) as ReceptionRow[]);
    setReceptionItems((receptionItemResult.data ?? []) as ReceptionItemRow[]);
    setSerialProgress((serialProgressResult.data ?? []) as SerialProgressRow[]);
    setOrderSerialSummaries((productionSerialResult.data ?? []) as OrderSerialSummaryRow[]);
    setOrderSerialDetails((productionSerialDetailResult.data ?? []) as OrderSerialDetailRow[]);
    setDocuments((documentResult.data ?? []) as DocumentRow[]);
    setLoading(false);
  }, [customerId, organizationId]);

  React.useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  React.useEffect(() => {
    if (!partTypeOpen) return undefined;
    const close = (event: MouseEvent) => {
      if (!partTypeFilterRef.current?.contains(event.target as Node)) setPartTypeOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [partTypeOpen]);

  const realtimeTables = React.useMemo(() => [
    { table: 'mes_production_orders', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_customer_reception_vouchers', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_customer_reception_items', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_customer_reception_serial_progress', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_production_serials', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_quality_inspection_documents', filter: `organization_id=eq.${organizationId}` },
  ], [organizationId]);

  useSupabaseRealtimeRefresh({
    client: supabase,
    channelName: `customer-portal-dashboard:${organizationId}:${customerId}`,
    tables: realtimeTables,
    onRefresh: () => loadDashboard(true),
    debounceMs: 180,
  });

  const journeyByOrderId = new Map(orders.map((order) => [order.id, orderJourney(order, receptionItems, serialProgress)]));
  const activeOrders = orders.filter((order) => order.status !== 'cancelled' && !journeyByOrderId.get(order.id)?.fullyDelivered);
  const serialSummaryByOrderId = new Map(orderSerialSummaries.map((summary) => [summary.production_order_id, summary]));
  const today = new Date().toISOString().slice(0, 10);
  const toolsInProcess = activeOrders.reduce((total, order) => {
    const serialCount = Number(serialSummaryByOrderId.get(order.id)?.serial_count ?? 0);
    const deliveredCount = journeyByOrderId.get(order.id)?.deliveredPieces ?? 0;
    return total + Math.max(0, serialCount - deliveredCount);
  }, 0);
  const upcoming = activeOrders.filter((order) => order.due_date >= today).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const attention = activeOrders.filter((order) => order.due_date < today || order.status === 'paused').length;
  const orderById = new Map(orders.map((order) => [order.id, order]));
  const activities: ActivityItem[] = [
    ...documents.map((document) => ({ id: `document-${document.id}`, title: 'Document available', meta: `${orderById.get(document.production_order_id)?.order_number ?? document.file_name} · ${relativeTime(document.uploaded_at)}`, at: document.uploaded_at, icon: FileCheck2, tone: 'document' as const })),
    ...receptions.map((reception) => ({ id: `reception-${reception.id}`, title: reception.status === 'sent' ? 'Order dispatched' : `Reception ${reception.status.replaceAll('-', ' ')}`, meta: `${reception.customer_reference || reception.voucher_number} · ${relativeTime(reception.updated_at)}`, at: reception.updated_at, icon: reception.status === 'sent' ? Truck : PackageCheck, tone: reception.status === 'sent' ? 'shipment' as const : 'reception' as const })),
    ...orders.map((order) => ({ id: `order-${order.id}`, title: `Order ${statusLabels[order.status] ?? order.status}`, meta: `${order.order_number} · ${relativeTime(order.updated_at)}`, at: order.updated_at, icon: order.status === 'waiting-inspection' ? ClipboardList : Box, tone: order.status === 'waiting-inspection' ? 'quality' as const : 'order' as const })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5);
  const visibleOrders = activeOrders.slice().sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 4);
  const allOrders = activeOrders.slice().sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const partTypeKpis = Array.from(allOrders.reduce((counts, order) => {
    const type = order.piece_type?.trim() || 'Unspecified';
    counts.set(type, (counts.get(type) ?? 0) + 1);
    return counts;
  }, new Map<string, number>())).sort((a, b) => b[1] - a[1]);
  const partTypes = Array.from(new Set(orders.map((order) => order.piece_type?.trim()).filter(Boolean))).sort();
  const normalizedSearch = orderSearch.trim().toLowerCase();
  const filteredOrders = allOrders.filter((order) => {
    const serialSummary = serialSummaryByOrderId.get(order.id);
    const searchable = [order.order_number, order.part_number, order.part_name, ...(serialSummary?.tool_ids ?? []), ...(serialSummary?.serial_numbers ?? [])].join(' ').toLowerCase();
    return (!normalizedSearch || searchable.includes(normalizedSearch))
      && (!dateFrom || order.due_date >= dateFrom)
      && (!dateTo || order.due_date <= dateTo)
      && (partType === 'all' || order.piece_type === partType);
  });
  const hasOrderFilters = Boolean(normalizedSearch || dateFrom || dateTo || partType !== 'all');

  const renderOrder = (order: OrderRow, index: number) => {
    const journey = journeyByOrderId.get(order.id) ?? { progress: 0, label: statusLabels[order.status] ?? order.status, badges: [] };
    const serialSummary = serialSummaryByOrderId.get(order.id);
    const toolIds = serialSummary?.tool_ids ?? [];
    const serialDetails = orderSerialDetails.filter((serial) => serial.production_order_id === order.id).sort((a, b) => a.piece_sequence - b.piece_sequence);
    const expanded = expandedOrderId === order.id;
    return <React.Fragment key={order.id}>
      <article className={expanded ? 'expanded' : ''}><span className={`cp-order-icon order-${index % 4}`}><Box size={19} /></span><span><small>ORDER</small><strong>{order.order_number}</strong><em>{order.part_number || order.part_name}</em></span><span className="cp-order-tools"><small>TOOL ID{toolIds.length > 1 ? 'S' : ''}</small><strong>{toolIds.length ? toolIds.map((toolId) => <b key={toolId}>{toolId}</b>) : 'Not assigned'}</strong></span><span className="cp-order-serial-count"><small>SERIAL NUMBERS</small><strong>{Number(serialSummary?.serial_count ?? 0)}</strong></span><span className="cp-order-journey"><b>{journey.label}</b><span className="cp-journey-badges">{journey.badges.map((badge) => <em className={`tone-${badge.tone}`} key={`${badge.tone}-${badge.text}`}>{badge.text}</em>)}</span><span className="cp-journey-progress"><strong>{journey.progress}%</strong><i><em style={{ width: `${journey.progress}%` }} /></i></span></span><span><small>EXPECTED DELIVERY</small><strong>{shortDate(order.due_date)}</strong></span><button className="cp-order-expand" type="button" aria-expanded={expanded} aria-label={`${expanded ? 'Close' : 'Open'} details for order ${order.order_number}`} onClick={() => setExpandedOrderId(expanded ? '' : order.id)}><ChevronRight size={18} /></button></article>
      {expanded ? <div className="cp-order-detail"><header><div><strong>Serial progress for order {order.order_number}</strong><small>{serialDetails.length} serial{serialDetails.length === 1 ? '' : 's'} · Read-only customer view</small></div><span>{journey.progress}% overall progress</span></header>{serialDetails.length ? <div className="cp-order-detail-list">{serialDetails.map((serial) => {
        const produced = serial.result === 'good';
        const scrapped = serial.result === 'scrap';
        return <article className={scrapped ? 'scrapped' : ''} key={serial.production_serial_id}><span><small>SERIAL NUMBER</small><strong>{serial.serial_number || `Piece ${serial.piece_sequence}`}</strong><em className={scrapped ? 'scrap' : produced ? 'complete' : 'pending'}>{scrapped ? 'Scrap' : produced ? 'Produced' : 'Pending production'}</em></span><span><small>TOOL ID</small><strong>{serial.tool_id || 'Not assigned'}</strong>{serial.voucher_number ? <em>Reception {serial.voucher_number}</em> : null}</span>{scrapped ? <span className="cp-serial-scrap-state"><small>FINAL PIECE STATUS</small><strong>Scrap</strong><em>{detailDate(serial.reported_at)}</em></span> : <><span className={serial.coating_sent_at ? 'done' : 'waiting'}><small>COATING DISPATCH</small><strong>{serial.coating_sent_at ? 'Sent' : produced ? 'Awaiting dispatch' : 'Awaiting production'}</strong><em>{detailDate(serial.coating_sent_at)}</em></span><span className={serial.coating_returned_at ? 'done' : 'waiting'}><small>COATING RETURN</small><strong>{serial.coating_returned_at ? 'Received' : serial.coating_sent_at ? 'Awaiting return' : 'Not started'}</strong><em>{detailDate(serial.coating_returned_at)}</em></span><span className={serial.delivered_at ? 'done' : 'waiting'}><small>DELIVERY</small><strong>{serial.delivered_at ? 'Delivered' : serial.coating_returned_at ? 'Ready to deliver' : 'Not ready'}</strong><em>{detailDate(serial.delivered_at)}</em></span></>}</article>;
      })}</div> : <div className="cp-card-empty">No serial details are available for this order yet.</div>}</div> : null}
    </React.Fragment>;
  };

  if (loading) return <div className="cp-dashboard-state"><LoaderCircle className="cp-spin" size={25} /><strong>Loading customer dashboard…</strong></div>;

  if (view === 'orders') return <div className="cp-orders-page">
    <section className="cp-orders-page-heading"><div><small>CUSTOMER PORTAL</small><h1>My Active Orders</h1><p>Every order that still has work or deliveries in progress.</p></div><div className="cp-orders-heading-kpis"><span className="total"><strong>{allOrders.length}</strong><small>ACTIVE ORDERS</small></span>{partTypeKpis.map(([type, count], index) => <span className={`type-${index % 5}`} key={type}><strong>{count}</strong><small>{type}</small></span>)}</div></section>
    <section className="cp-orders-filters">
      <label className="cp-orders-search"><Search size={17} /><input value={orderSearch} onChange={(event) => setOrderSearch(event.target.value)} placeholder="Search order, serial or Tool ID" />{orderSearch ? <button type="button" onClick={() => setOrderSearch('')} aria-label="Clear search"><X size={15} /></button> : null}</label>
      <div className="cp-orders-date"><CalendarDays size={16} /><label><small>FROM</small><input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label><i /><label><small>TO</small><input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} /></label></div>
      <div className="cp-orders-part-filter" ref={partTypeFilterRef}><button type="button" onClick={() => setPartTypeOpen((open) => !open)}><span><small>PART TYPE</small><strong>{partType === 'all' ? 'All part types' : partType}</strong></span><ChevronDown size={16} /></button>{partTypeOpen ? <div>{['all', ...partTypes].map((type) => <button className={partType === type ? 'active' : ''} type="button" key={type} onClick={() => { setPartType(type); setPartTypeOpen(false); }}>{type === 'all' ? 'All part types' : type}</button>)}</div> : null}</div>
      {hasOrderFilters ? <button className="cp-orders-clear" type="button" onClick={() => { setOrderSearch(''); setDateFrom(''); setDateTo(''); setPartType('all'); }}><X size={14} /> Clear</button> : null}
    </section>
    {error ? <div className="cp-dashboard-warning">Some order information could not be loaded: {error}</div> : null}
    <section className="cp-orders-card cp-orders-all"><header><div><h2>Active orders</h2><p>Live progress across production, quality, coating and delivery</p></div><span>{filteredOrders.length} results</span></header>{filteredOrders.length ? filteredOrders.map(renderOrder) : <div className="cp-card-empty">No active orders match the selected filters.</div>}</section>
  </div>;

  return <div className="cp-dashboard">
    <section className="cp-welcome"><div><span><PackageCheck size={16} /> Secure customer view</span><h1>Your work, clearly in view.</h1><p>Track orders, tools, documents, and upcoming deliveries from {supplierName}.</p></div><div className="cp-welcome-kpis"><span className="active"><strong>{activeOrders.length}</strong><small>ACTIVE ORDERS</small></span><span className="tools"><strong>{toolsInProcess}</strong><small>TOOLS IN PROCESS</small></span><span className="deliveries"><strong>{upcoming.length}</strong><small>UPCOMING DELIVERIES</small></span><span className="attention"><strong>{attention}</strong><small>REQUIRES ATTENTION</small></span></div></section>
    {error ? <div className="cp-dashboard-warning">Some dashboard information could not be loaded: {error}</div> : null}
    <div className="cp-dashboard-grid">
      <section className="cp-orders-card">
        <header><div><h2>Active orders</h2><p>Progress across production and delivery</p></div><button onClick={onOpenOrders}>View all <ChevronRight size={16} /></button></header>
        {visibleOrders.length ? visibleOrders.map(renderOrder) : <div className="cp-card-empty">No active orders for this customer.</div>}
      </section>
      <aside className="cp-activity-card"><header><div><h2>Recent activity</h2><p>Your latest updates</p></div><Clock3 size={19} /></header>{activities.length ? activities.map((activity) => <article key={activity.id}><span><activity.icon size={17} /></span><div><strong>{activity.title}</strong><small>{activity.meta}</small></div></article>) : <div className="cp-card-empty">No recent customer activity.</div>}</aside>
    </div>
  </div>;
}
