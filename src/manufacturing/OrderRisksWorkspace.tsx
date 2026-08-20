import React from 'react';
import { AlertOctagon, AlertTriangle, ArrowLeft, Check, CheckCircle2, ChevronDown, ChevronUp, Clock3, Eye, EyeOff, Factory, PackageOpen, PaintBucket, RefreshCw, Search, ShieldCheck, X } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useSupabaseRealtimeRefresh } from '../lib/useSupabaseRealtimeRefresh';
import type { ProductionOrderStatus } from './mesTypes';
import { ProductionOrdersWorkspace } from './MesWorkspaces';
import { DeliveryRiskTimeline, getDaysUntilDelivery, getDeliveryDistance, type DayCountMode } from './DeliveryRiskTimeline';
import './orderRisks.css';

type OrderRisksWorkspaceProps = {
  onNavigate: (path: string) => void;
  organizationId: string;
  languageCode: 'en' | 'es' | 'zh';
};

type OrderRiskRow = {
  id: string;
  order_number: string;
  client_name: string | null;
  planned_quantity: number;
  completed_quantity: number;
  scrap_quantity: number;
  due_date: string;
  status: ProductionOrderStatus;
  serialNumbers: string[];
  stationCodes: string[];
  assignedWorkCenter: string;
  createdAt: string;
};

type RiskLevel = 'overdue' | 'high' | 'moderate' | 'low';

type OrderSerialRow = { id: string; production_order_id: string; serial_number: string | null; tool_id: string | null; assigned_station: string | null };
type CoatingProgressRow = { reception_item_id: string; production_serial_id: string; coating_sent_at: string | null; coating_returned_at: string | null };
type CoatingSerialProgress = { id: string; serialNumber: string; toolId: string; coatingSentAt: string; coatingReturnedAt: string };
type StationRow = { code: string; name: string; work_center_id: string };
type WorkCenterRow = { id: string; code: string; name: string };
type CoatingTrackingRow = {
  id: string;
  productionOrderId: string;
  orderNumber: string;
  customerName: string;
  quantity: number;
  coatingSentAt: string;
  stationCodes: string[];
  assignedWorkCenter: string;
  serials: CoatingSerialProgress[];
};

const productionOrderDeepLinkKey = 'yvimo:mes:selectedProductionOrderNumber';
const productionOrderDetailsDeepLinkKey = 'yvimo:mes:openProductionOrderDetails';
const orderRisksFilterKeyPrefix = 'yvimo:order-risks:filters';

type SavedOrderRiskFilters = { client: string; workCenter: string; stations: string[]; search: string };

function loadSavedFilters(organizationId: string): SavedOrderRiskFilters {
  const fallback = { client: 'all', workCenter: 'all', stations: [], search: '' };
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(`${orderRisksFilterKeyPrefix}:${organizationId}`) ?? '{}') as Partial<SavedOrderRiskFilters>;
    return {
      client: typeof saved.client === 'string' ? saved.client : fallback.client,
      workCenter: typeof saved.workCenter === 'string' ? saved.workCenter : fallback.workCenter,
      stations: Array.isArray(saved.stations) ? saved.stations.filter((station): station is string => typeof station === 'string') : fallback.stations,
      search: typeof saved.search === 'string' ? saved.search : fallback.search,
    };
  } catch {
    return fallback;
  }
}

const activeStatuses: ProductionOrderStatus[] = ['planned', 'released', 'running', 'paused', 'waiting-inspection'];

function daysUntilDue(dueDate: string) {
  return getDaysUntilDelivery(dueDate);
}

function riskForOrder(order: OrderRiskRow, mode: DayCountMode = 'calendar', languageCode = 'en'): RiskLevel {
  const calendarDays = daysUntilDue(order.due_date);
  if (calendarDays < 0) return 'overdue';
  const days = getDeliveryDistance(calendarDays, mode, languageCode);
  if (days <= 1) return 'high';
  if (days <= 3) return 'moderate';
  return 'low';
}

function dueLabel(dueDate: string, mode: DayCountMode = 'calendar', languageCode = 'en') {
  const calendarDays = daysUntilDue(dueDate);
  const days = getDeliveryDistance(calendarDays, mode, languageCode);
  if (calendarDays < 0) return `${Math.abs(days)}d overdue`;
  if (calendarDays === 0) return 'Due today';
  if (days === 1) return mode === 'business' ? '1 business day left' : 'Due tomorrow';
  return `${Math.abs(days)} ${mode === 'business' ? 'business days' : 'days'} left`;
}

function dueMetricTitle(dueDate: string) {
  return daysUntilDue(dueDate) < 0 ? 'Overdue' : 'Due';
}

function statusLabel(status: ProductionOrderStatus) {
  return status.split('-').map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`).join(' ');
}

function leadTimeLabel(createdAt: string) {
  if (!createdAt) return 'Not available';
  const start = new Date(createdAt);
  const end = new Date();
  if (Number.isNaN(start.getTime())) return 'Not available';
  const startDay = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  const days = Math.max(0, Math.round((endDay - startDay) / 86_400_000));
  return `${days} day${days === 1 ? '' : 's'}`;
}

function coatingElapsedLabel(sentAt: string, returnedAt = '') {
  const start = new Date(sentAt);
  if (Number.isNaN(start.getTime())) return 'Not available';
  const end = returnedAt ? new Date(returnedAt) : new Date();
  const hours = Math.max(0, (end.getTime() - start.getTime()) / 3_600_000);
  if (hours < 24) return `${Math.floor(hours)}h ${Math.floor((hours % 1) * 60)}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${Math.floor(hours % 24)}h`;
}

const sections: Array<{ level: RiskLevel; title: string; range: string; icon: typeof AlertTriangle }> = [
  { level: 'overdue', title: 'Overdue', range: 'Delivery date has passed', icon: AlertOctagon },
  { level: 'high', title: 'High Risk', range: 'Due today or tomorrow', icon: AlertTriangle },
  { level: 'moderate', title: 'Moderate Risk', range: '2–3 days to delivery', icon: Clock3 },
  { level: 'low', title: 'Low Risk', range: '4 or more days to delivery', icon: ShieldCheck },
];

export function OrderRisksWorkspace({ onNavigate, organizationId, languageCode }: OrderRisksWorkspaceProps) {
  const savedFilters = React.useMemo(() => loadSavedFilters(organizationId), [organizationId]);
  const [orders, setOrders] = React.useState<OrderRiskRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [clientFilter, setClientFilter] = React.useState(savedFilters.client);
  const [workCenterFilter, setWorkCenterFilter] = React.useState(savedFilters.workCenter);
  const [searchTerm, setSearchTerm] = React.useState(savedFilters.search);
  const [clientMenuOpen, setClientMenuOpen] = React.useState(false);
  const [workCenterMenuOpen, setWorkCenterMenuOpen] = React.useState(false);
  const [stations, setStations] = React.useState<StationRow[]>([]);
  const [workCenters, setWorkCenters] = React.useState<WorkCenterRow[]>([]);
  const [selectedStations, setSelectedStations] = React.useState<string[]>(savedFilters.stations);
  const [detailOrderNumber, setDetailOrderNumber] = React.useState('');
  const [highlightedOrderId, setHighlightedOrderId] = React.useState('');
  const [dayCountMode, setDayCountMode] = React.useState<DayCountMode>('calendar');
  const [coatingTrackings, setCoatingTrackings] = React.useState<CoatingTrackingRow[]>([]);
  const [expandedSections, setExpandedSections] = React.useState<Record<string, boolean>>({ overdue: true, high: true, moderate: true, low: true, coating: true });

  const loadOrders = React.useCallback(async () => {
    const [{ data, error: loadError }, { data: serialData, error: serialError }, { data: stationData, error: stationError }, { data: workCenterData, error: workCenterError }, { data: coatingData, error: coatingError }, { data: coatingProgressData, error: coatingProgressError }] = await Promise.all([
      supabase
        .from('mes_production_orders')
        .select('id, order_number, client_name, planned_quantity, completed_quantity, scrap_quantity, due_date, status, assigned_station, assigned_work_center, created_at')
        .eq('organization_id', organizationId)
        .in('status', activeStatuses)
        .order('due_date', { ascending: true }),
      supabase
        .from('mes_production_serials')
        .select('id, production_order_id, serial_number, tool_id, assigned_station')
        .eq('organization_id', organizationId)
        .eq('result', 'good'),
      supabase
        .from('mes_work_center_stations')
        .select('code, name, work_center_id')
        .eq('organization_id', organizationId)
        .order('name', { ascending: true }),
      supabase
        .from('mes_work_centers')
        .select('id, code, name')
        .eq('organization_id', organizationId)
        .order('name', { ascending: true }),
      supabase
        .from('mes_customer_reception_items')
        .select('id, production_order_id, production_order_number, customer_id, quantity, mes_customers(customer_name), mes_production_orders!production_order_id(assigned_station, assigned_work_center)')
        .eq('organization_id', organizationId)
        .not('production_order_id', 'is', null),
      supabase
        .from('mes_customer_reception_serial_progress')
        .select('reception_item_id, production_serial_id, coating_sent_at, coating_returned_at')
        .eq('organization_id', organizationId),
    ]);

    if (loadError || serialError || stationError || workCenterError || coatingError || coatingProgressError) {
      setError(loadError?.message ?? serialError?.message ?? stationError?.message ?? workCenterError?.message ?? coatingError?.message ?? coatingProgressError?.message ?? 'Unable to load order risk data.');
    } else {
      const serialsByOrder = ((serialData ?? []) as OrderSerialRow[]).reduce<Record<string, { serials: string[]; stations: string[] }>>((groups, serial) => {
        const group = groups[serial.production_order_id] ?? { serials: [], stations: [] };
        if (serial.serial_number && !group.serials.includes(serial.serial_number)) group.serials.push(serial.serial_number);
        if (serial.assigned_station && !group.stations.includes(serial.assigned_station)) group.stations.push(serial.assigned_station);
        groups[serial.production_order_id] = group;
        return groups;
      }, {});
      setOrders(((data ?? []) as Array<Omit<OrderRiskRow, 'serialNumbers' | 'stationCodes' | 'assignedWorkCenter' | 'createdAt'> & { assigned_station: string | null; assigned_work_center: string | null; created_at: string | null }>).map((order) => ({
        ...order,
        serialNumbers: serialsByOrder[order.id]?.serials ?? [],
        stationCodes: Array.from(new Set([order.assigned_station, ...(serialsByOrder[order.id]?.stations ?? [])].filter(Boolean) as string[])),
        assignedWorkCenter: order.assigned_work_center ?? '',
        createdAt: order.created_at ?? '',
      })));
      setStations((stationData ?? []) as StationRow[]);
      setWorkCenters((workCenterData ?? []) as WorkCenterRow[]);
      const serialById = new Map(((serialData ?? []) as OrderSerialRow[]).map((serial) => [serial.id, serial]));
      const progressByItem = ((coatingProgressData ?? []) as CoatingProgressRow[]).reduce<Record<string, CoatingProgressRow[]>>((groups, progress) => {
        (groups[progress.reception_item_id] ??= []).push(progress);
        return groups;
      }, {});
      setCoatingTrackings((coatingData ?? []).map((item) => {
        const customer = Array.isArray(item.mes_customers) ? item.mes_customers[0] : item.mes_customers;
        const productionOrder = Array.isArray(item.mes_production_orders) ? item.mes_production_orders[0] : item.mes_production_orders;
        const productionOrderId = item.production_order_id ?? '';
        const progressRows = progressByItem[item.id] ?? [];
        const serials = progressRows.map((progress) => {
          const serial = serialById.get(progress.production_serial_id);
          return { id: progress.production_serial_id, serialNumber: serial?.serial_number ?? 'Unknown', toolId: serial?.tool_id ?? '', coatingSentAt: progress.coating_sent_at ?? '', coatingReturnedAt: progress.coating_returned_at ?? '' };
        });
        const sentTimes = serials.map((serial) => serial.coatingSentAt).filter(Boolean).sort();
        return {
          id: item.id,
          productionOrderId,
          orderNumber: item.production_order_number ?? '',
          customerName: customer?.customer_name ?? 'Customer not assigned',
          quantity: Number(item.quantity) || 0,
          coatingSentAt: sentTimes[0] ?? '',
          stationCodes: Array.from(new Set([productionOrder?.assigned_station, ...(serialsByOrder[productionOrderId]?.stations ?? [])].filter(Boolean) as string[])),
          assignedWorkCenter: productionOrder?.assigned_work_center ?? '',
          serials,
        };
      }).filter((tracking) => tracking.coatingSentAt && tracking.serials.some((serial) => !serial.coatingReturnedAt)));
      setError('');
    }
    setLoading(false);
  }, [organizationId]);

  const loadDayCountMode = React.useCallback(async () => {
    const { data, error: settingsError } = await supabase
      .from('mes_order_risk_settings')
      .select('day_count_mode')
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (!settingsError) setDayCountMode(data?.day_count_mode === 'business' ? 'business' : 'calendar');
  }, [organizationId]);

  const updateDayCountMode = React.useCallback(async (mode: DayCountMode) => {
    setDayCountMode(mode);
    const { error: settingsError } = await supabase.from('mes_order_risk_settings').upsert({
      organization_id: organizationId,
      day_count_mode: mode,
      updated_by: (await supabase.auth.getUser()).data.user?.id ?? null,
    }, { onConflict: 'organization_id' });
    if (settingsError) {
      setError(settingsError.message);
      await loadDayCountMode();
    }
  }, [loadDayCountMode, organizationId]);

  React.useEffect(() => { void loadOrders(); void loadDayCountMode(); }, [loadDayCountMode, loadOrders]);
  useSupabaseRealtimeRefresh({
    channelName: `order-risks-${organizationId}`,
    tables: React.useMemo(() => [
      { table: 'mes_production_orders', filter: `organization_id=eq.${organizationId}` },
      { table: 'mes_production_serials', filter: `organization_id=eq.${organizationId}` },
      { table: 'mes_work_center_stations', filter: `organization_id=eq.${organizationId}` },
      { table: 'mes_work_centers', filter: `organization_id=eq.${organizationId}` },
      { table: 'mes_customer_reception_items', filter: `organization_id=eq.${organizationId}` },
      { table: 'mes_customer_reception_serial_progress', filter: `organization_id=eq.${organizationId}` },
      { table: 'mes_order_risk_settings', filter: `organization_id=eq.${organizationId}` },
    ], [organizationId]),
    onRefresh: () => { void loadOrders(); void loadDayCountMode(); },
  });

  React.useEffect(() => {
    window.sessionStorage.setItem(`${orderRisksFilterKeyPrefix}:${organizationId}`, JSON.stringify({
      client: clientFilter,
      workCenter: workCenterFilter,
      stations: selectedStations,
      search: searchTerm,
    } satisfies SavedOrderRiskFilters));
  }, [clientFilter, organizationId, searchTerm, selectedStations, workCenterFilter]);

  const clientOptions = React.useMemo(() => Array.from(new Set([...orders.map((order) => order.client_name?.trim()), ...coatingTrackings.map((tracking) => tracking.customerName.trim())].filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b)), [coatingTrackings, orders]);
  const normalizedSearch = searchTerm.trim().toLocaleLowerCase();
  const stationNameByCode = React.useMemo(() => new Map(stations.map((station) => [station.code, station.name])), [stations]);
  const visibleStations = React.useMemo(() => {
    if (workCenterFilter === 'all') return stations;
    const selectedWorkCenterId = workCenters.find((center) => center.code === workCenterFilter)?.id;
    return selectedWorkCenterId ? stations.filter((station) => station.work_center_id === selectedWorkCenterId) : [];
  }, [stations, workCenterFilter, workCenters]);
  const filteredOrders = orders.filter((order) => {
    const matchesClient = clientFilter === 'all' || order.client_name === clientFilter;
    const matchesWorkCenter = workCenterFilter === 'all' || order.assignedWorkCenter === workCenterFilter;
    const matchesStations = selectedStations.length === 0 || selectedStations.some((station) => order.stationCodes.includes(station));
    const matchesSearch = !normalizedSearch
      || order.order_number.toLocaleLowerCase().includes(normalizedSearch)
      || order.serialNumbers.some((serial) => serial.toLocaleLowerCase().includes(normalizedSearch));
    return matchesClient && matchesWorkCenter && matchesStations && matchesSearch;
  });
  const filtersActive = clientFilter !== 'all' || workCenterFilter !== 'all' || selectedStations.length > 0 || Boolean(normalizedSearch);
  const filteredCoatingTrackings = coatingTrackings.filter((tracking) => {
    const matchesClient = clientFilter === 'all' || tracking.customerName === clientFilter;
    const matchesWorkCenter = workCenterFilter === 'all' || tracking.assignedWorkCenter === workCenterFilter;
    const matchesStations = selectedStations.length === 0 || selectedStations.some((station) => tracking.stationCodes.includes(station));
    const matchesSearch = !normalizedSearch || tracking.orderNumber.toLocaleLowerCase().includes(normalizedSearch) || tracking.serials.some((serial) => serial.serialNumber.toLocaleLowerCase().includes(normalizedSearch) || serial.toolId.toLocaleLowerCase().includes(normalizedSearch));
    return matchesClient && matchesWorkCenter && matchesStations && matchesSearch;
  });
  const setAllSectionsExpanded = (expanded: boolean) => setExpandedSections({ overdue: expanded, high: expanded, moderate: expanded, low: expanded, coating: expanded });
  const toggleSection = (section: string) => setExpandedSections((current) => ({ ...current, [section]: !current[section] }));
  const toggleStation = (stationCode: string) => setSelectedStations((current) => current.includes(stationCode)
    ? current.filter((code) => code !== stationCode)
    : [...current, stationCode]);
  const openOrderDetails = (orderNumber: string) => {
    window.sessionStorage.setItem(productionOrderDeepLinkKey, orderNumber);
    window.sessionStorage.setItem(productionOrderDetailsDeepLinkKey, orderNumber);
    setDetailOrderNumber(orderNumber);
  };
  const focusOrderCard = (orderId: string) => {
    const order = filteredOrders.find((candidate) => candidate.id === orderId);
    if (!order) return;
    const level = riskForOrder(order, dayCountMode, languageCode);
    setExpandedSections((current) => ({ ...current, [level]: true }));
    setHighlightedOrderId(orderId);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      document.getElementById(`order-risk-card-${orderId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }));
  };
  React.useEffect(() => {
    if (!highlightedOrderId) return undefined;
    const timeout = window.setTimeout(() => setHighlightedOrderId(''), 3200);
    return () => window.clearTimeout(timeout);
  }, [highlightedOrderId]);
  const timelineOrders = filteredOrders.map((order) => ({ id: order.id, orderNumber: order.order_number, clientName: order.client_name || 'Customer not assigned', deliveryDate: order.due_date, plannedQuantity: order.planned_quantity, completedQuantity: order.completed_quantity, scrapQuantity: order.scrap_quantity, stationLabels: order.stationCodes.map((code) => stationNameByCode.get(code) ? `${stationNameByCode.get(code)} · ${code}` : code), status: order.status, leadTime: leadTimeLabel(order.createdAt), risk: riskForOrder(order, dayCountMode, languageCode) }));

  return (
    <div className="order-risks-workspace">
      <header className="order-risks-header mes-screen-header">
        <button className="academy-back-button engineering-back-button mes-workspace-back" type="button" onClick={() => onNavigate('/workspace/manufacturing-ops')}>
          <ArrowLeft size={17} /> Manufacturing Ops
        </button>
        <div className="mes-workspace-heading">
          <span className="eyebrow">Operations Intelligence · Live monitoring</span>
          <h1>Order Risks</h1>
          <p>Track active production orders by delivery urgency and spot late-delivery risk before it impacts your customers.</p>
        </div>
        <span className="order-risks-live"><i /> Live</span>
      </header>

      {error ? (
        <div className="order-risks-message error" role="alert">
          <AlertTriangle size={21} /><span><strong>Unable to load production orders</strong>{error}</span>
          <button type="button" onClick={() => void loadOrders()}><RefreshCw size={16} /> Retry</button>
        </div>
      ) : null}

      <section className="order-risks-filters" aria-label="Order risk filters">
        <label className="order-risks-client-filter">
          <span>Client</span>
          <div className={`order-risks-dropdown ${clientMenuOpen ? 'open' : ''}`}>
            <button type="button" aria-haspopup="listbox" aria-expanded={clientMenuOpen} onClick={() => setClientMenuOpen((open) => !open)}>
              <span>{clientFilter === 'all' ? 'All clients' : clientFilter}</span><ChevronDown size={17} />
            </button>
            {clientMenuOpen ? (
              <div className="order-risks-dropdown-menu" role="listbox">
                {['all', ...clientOptions].map((client) => (
                  <button type="button" role="option" aria-selected={clientFilter === client} key={client} onClick={() => { setClientFilter(client); setClientMenuOpen(false); }}>
                    <span>{client === 'all' ? 'All clients' : client}</span>{clientFilter === client ? <Check size={16} /> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </label>
        <label className="order-risks-work-center-filter">
          <span>Work Center</span>
          <div className={`order-risks-dropdown ${workCenterMenuOpen ? 'open' : ''}`}>
            <button type="button" aria-haspopup="listbox" aria-expanded={workCenterMenuOpen} onClick={() => setWorkCenterMenuOpen((open) => !open)}>
              <span>{workCenterFilter === 'all' ? 'All work centers' : workCenters.find((center) => center.code === workCenterFilter)?.name ?? workCenterFilter}</span><ChevronDown size={17} />
            </button>
            {workCenterMenuOpen ? (
              <div className="order-risks-dropdown-menu" role="listbox">
                {[{ id: 'all', code: 'all', name: 'All work centers' }, ...workCenters].map((center) => (
                  <button type="button" role="option" aria-selected={workCenterFilter === center.code} key={center.code} onClick={() => { setWorkCenterFilter(center.code); setSelectedStations([]); setWorkCenterMenuOpen(false); }}>
                    <span>{center.name}{center.code !== 'all' ? ` · ${center.code}` : ''}</span>{workCenterFilter === center.code ? <Check size={16} /> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </label>
        <label className="order-risks-search">
          <span>Search orders</span>
          <div><Search size={18} /><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search order or serial number..." />{searchTerm ? <button type="button" aria-label="Clear search" onClick={() => setSearchTerm('')}><X size={16} /></button> : null}</div>
        </label>
        <div className="order-risks-filter-result"><strong>{loading ? '—' : filteredOrders.length}</strong><span>matching orders</span></div>
        <fieldset className="order-risks-station-filters">
          <legend>Stations</legend>
          <div>
            {visibleStations.map((station) => (
              <label key={station.code}>
                <input type="checkbox" checked={selectedStations.includes(station.code)} onChange={() => toggleStation(station.code)} />
                <span className="order-risks-checkbox"><Check size={13} /></span>
                <span><strong>{station.name}</strong><small>{station.code}</small></span>
              </label>
            ))}
            {!loading && visibleStations.length === 0 ? <em>{workCenterFilter === 'all' ? 'No stations configured.' : 'No stations configured for this work center.'}</em> : null}
          </div>
          {selectedStations.length ? <button type="button" onClick={() => setSelectedStations([])}>Clear stations</button> : null}
        </fieldset>
      </section>

      <DeliveryRiskTimeline orders={timelineOrders} loading={loading} languageCode={languageCode} dayCountMode={dayCountMode} onDayCountModeChange={(mode) => void updateDayCountMode(mode)} onOpenOrder={openOrderDetails} onFocusOrder={focusOrderCard} />

      <div className="order-risk-visibility-controls">
        <span>Section visibility</span>
        <button type="button" onClick={() => setAllSectionsExpanded(false)}><EyeOff size={15} /> Hide All</button>
        <button type="button" onClick={() => setAllSectionsExpanded(true)}><Eye size={15} /> Show All</button>
      </div>

      <main className="order-risk-sections" aria-busy={loading}>
        {sections.map((section) => {
          const sectionOrders = filteredOrders.filter((order) => riskForOrder(order, dayCountMode, languageCode) === section.level);
          const Icon = section.icon;
          return (
            <section className={`order-risk-section ${section.level}`} key={section.level}>
              <div className="order-risk-section-heading">
                <span className="order-risk-section-icon"><Icon size={22} /></span>
                <span><h2>{section.title}</h2><p>{section.range}</p></span>
                <strong>{loading ? '—' : sectionOrders.length} {sectionOrders.length === 1 ? 'order' : 'orders'}</strong>
                <button className="order-risk-section-toggle" type="button" aria-expanded={expandedSections[section.level]} onClick={() => toggleSection(section.level)}>{expandedSections[section.level] ? <ChevronUp size={18} /> : <ChevronDown size={18} />}<span>{expandedSections[section.level] ? 'Collapse' : 'Expand'}</span></button>
              </div>
              {expandedSections[section.level] ? <div className="order-risk-card-grid">
                {loading ? [1, 2, 3].map((item) => <div className="order-risk-card skeleton" key={item} />) : null}
                {!loading && sectionOrders.length === 0 ? (
                  <div className="order-risk-empty"><CheckCircle2 size={22} /><span>No active orders in this risk level.</span></div>
                ) : null}
                {!loading && sectionOrders.map((order) => {
                  const progress = order.planned_quantity > 0 ? Math.min(100, Math.round((order.completed_quantity / order.planned_quantity) * 100)) : 0;
                  return (
                    <article
                      className={`order-risk-card clickable${highlightedOrderId === order.id ? ' timeline-highlighted' : ''}`}
                      id={`order-risk-card-${order.id}`}
                      key={order.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`Open details for production order ${order.order_number}`}
                      onClick={() => openOrderDetails(order.order_number)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openOrderDetails(order.order_number);
                        }
                      }}
                    >
                      <div className="order-risk-card-top">
                        <span><small>Production order</small><strong>#{order.order_number}</strong></span>
                        <div className="order-risk-card-badges">
                          <span className={`mes-status-badge status-${order.status}`}>{statusLabel(order.status)}</span>
                          <span className="order-risk-due-metric"><small>{dueMetricTitle(order.due_date)}</small><strong>{dueLabel(order.due_date, dayCountMode, languageCode)}</strong></span>
                          <span className="order-risk-lead-time"><small>Lead Time</small><strong>{leadTimeLabel(order.createdAt)}</strong></span>
                        </div>
                      </div>
                      <p className="order-risk-client">{order.client_name || 'Customer not assigned'}</p>
                      <div className="order-risk-machines">
                        <span><Factory size={14} /> Machines</span>
                        <div>{order.stationCodes.length ? order.stationCodes.map((code) => <em key={code}>{stationNameByCode.get(code) ? `${stationNameByCode.get(code)} · ${code}` : code}</em>) : <small>Not assigned</small>}</div>
                      </div>
                      <div className="order-risk-progress-label"><span>Production progress</span><strong>{progress}%</strong></div>
                      <div className="order-risk-progress"><i style={{ width: `${progress}%` }} /></div>
                      <div className="order-risk-quantities">
                        <span><small>Total</small><strong>{order.planned_quantity.toLocaleString()}</strong></span>
                        <span><small>Produced</small><strong>{order.completed_quantity.toLocaleString()}</strong></span>
                        <span className="scrap"><small>Scrap</small><strong>{order.scrap_quantity.toLocaleString()}</strong></span>
                      </div>
                    </article>
                  );
                })}
              </div> : null}
            </section>
          );
        })}
        {!loading && filteredOrders.length === 0 && !error ? (
          <div className="order-risks-all-clear"><PackageOpen size={28} /><strong>{filtersActive ? 'No matching production orders' : 'No active production orders'}</strong><span>{filtersActive ? 'Try changing the client or search term.' : 'New active orders will appear here automatically.'}</span></div>
        ) : null}

        <div className="order-risk-subtracking-divider"><span>Sub-trackings</span><p>Special process monitoring independent from delivery risk categories</p></div>
        <section className="order-risk-section coating">
          <div className="order-risk-section-heading">
            <span className="order-risk-section-icon"><PaintBucket size={22} /></span>
            <span><h2>Coating</h2><p>Time at the external coating supplier</p></span>
            <strong>{loading ? '—' : filteredCoatingTrackings.length} {filteredCoatingTrackings.length === 1 ? 'sub-reception' : 'sub-receptions'}</strong>
            <button className="order-risk-section-toggle" type="button" aria-expanded={expandedSections.coating} onClick={() => toggleSection('coating')}>{expandedSections.coating ? <ChevronUp size={18} /> : <ChevronDown size={18} />}<span>{expandedSections.coating ? 'Collapse' : 'Expand'}</span></button>
          </div>
          {expandedSections.coating ? <div className="order-risk-card-grid">
            {loading ? [1, 2, 3].map((item) => <div className="order-risk-card skeleton" key={item} />) : null}
            {!loading && filteredCoatingTrackings.length === 0 ? <div className="order-risk-empty"><CheckCircle2 size={22} /><span>No sub-receptions are currently at the coating supplier.</span></div> : null}
            {!loading && filteredCoatingTrackings.map((tracking) => <article className={`order-risk-card coating-card${tracking.orderNumber ? ' clickable' : ''}`} key={tracking.id} role={tracking.orderNumber ? 'button' : undefined} tabIndex={tracking.orderNumber ? 0 : undefined} onClick={() => tracking.orderNumber && openOrderDetails(tracking.orderNumber)} onKeyDown={(event) => { if (tracking.orderNumber && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openOrderDetails(tracking.orderNumber); } }}>
              <div className="order-risk-card-top"><span><small>Production order</small><strong>{tracking.orderNumber ? `#${tracking.orderNumber}` : 'Not assigned'}</strong></span><div className="order-risk-card-badges"><span className="order-risk-coating-status">At supplier</span><span className="order-risk-coating-time"><small>Elapsed Time</small><strong>{coatingElapsedLabel(tracking.coatingSentAt)}</strong></span></div></div>
              <p className="order-risk-client">{tracking.customerName}</p>
              <div className="order-risk-machines"><span><Factory size={14} /> Machines</span><div>{tracking.stationCodes.length ? tracking.stationCodes.map((code) => <em key={code}>{stationNameByCode.get(code) ? `${stationNameByCode.get(code)} · ${code}` : code}</em>) : <small>Not assigned</small>}</div></div>
              <div className="order-risk-coating-timeline"><span className="done"><Check size={14} /><b>Order coating started</b><time>{new Date(tracking.coatingSentAt).toLocaleString()}</time></span><i /><span><Clock3 size={14} /><b>Order still in process</b><small>{tracking.serials.filter((serial) => Boolean(serial.coatingReturnedAt)).length} of {tracking.serials.length} serials returned</small></span></div>
              <div className="order-risk-coating-serials">
                <header><strong>Serial coating tracking</strong><span>{tracking.serials.length} serials in order</span></header>
                <div>{tracking.serials.map((serial) => <section className={!serial.coatingSentAt ? 'pending' : serial.coatingReturnedAt ? 'returned' : 'active'} key={serial.id}>
                  <span><small>Serial number</small><strong>{serial.serialNumber}</strong>{serial.toolId ? <em>{serial.toolId}</em> : null}</span>
                  <span><small>Sent to coating</small>{serial.coatingSentAt ? <time>{new Date(serial.coatingSentAt).toLocaleString()}</time> : <b>Not sent yet</b>}</span>
                  <span><small>Coating return</small>{serial.coatingReturnedAt ? <time>{new Date(serial.coatingReturnedAt).toLocaleString()}</time> : serial.coatingSentAt ? <b>In process</b> : <b>Waiting for dispatch</b>}</span>
                  <span><small>Serial coating time</small><strong>{serial.coatingSentAt ? coatingElapsedLabel(serial.coatingSentAt, serial.coatingReturnedAt) : '—'}</strong></span>
                </section>)}</div>
              </div>
              <div className="order-risk-quantities"><span><small>Sub-reception Qty.</small><strong>{tracking.quantity.toLocaleString()}</strong></span><span><small>Serials</small><strong>{tracking.serials.length}</strong></span><span><small>Order elapsed</small><strong>{coatingElapsedLabel(tracking.coatingSentAt)}</strong></span></div>
            </article>)}
          </div> : null}
        </section>
      </main>
      {detailOrderNumber ? (
        <ProductionOrdersWorkspace
          organizationId={organizationId}
          onNavigate={onNavigate}
          modalOnly
          onModalClose={() => setDetailOrderNumber('')}
        />
      ) : null}
    </div>
  );
}
