import React from 'react';
import { AlertOctagon, AlertTriangle, ArrowLeft, Check, CheckCircle2, ChevronDown, Clock3, Factory, PackageOpen, RefreshCw, Search, ShieldCheck, X } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useSupabaseRealtimeRefresh } from '../lib/useSupabaseRealtimeRefresh';
import type { ProductionOrderStatus } from './mesTypes';
import { ProductionOrdersWorkspace } from './MesWorkspaces';
import './orderRisks.css';

type OrderRisksWorkspaceProps = {
  onNavigate: (path: string) => void;
  organizationId: string;
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

type OrderSerialRow = { production_order_id: string; serial_number: string | null; assigned_station: string | null };
type StationRow = { code: string; name: string; work_center_id: string };
type WorkCenterRow = { id: string; code: string; name: string };

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
  const due = new Date(`${dueDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
}

function riskForOrder(order: OrderRiskRow): RiskLevel {
  const days = daysUntilDue(order.due_date);
  if (days < 0) return 'overdue';
  if (days <= 1) return 'high';
  if (days <= 3) return 'moderate';
  return 'low';
}

function dueLabel(dueDate: string) {
  const days = daysUntilDue(dueDate);
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `${days} days left`;
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

const sections: Array<{ level: RiskLevel; title: string; range: string; icon: typeof AlertTriangle }> = [
  { level: 'overdue', title: 'Overdue', range: 'Delivery date has passed', icon: AlertOctagon },
  { level: 'high', title: 'High Risk', range: 'Due today or tomorrow', icon: AlertTriangle },
  { level: 'moderate', title: 'Moderate Risk', range: '2–3 days to delivery', icon: Clock3 },
  { level: 'low', title: 'Low Risk', range: '4 or more days to delivery', icon: ShieldCheck },
];

export function OrderRisksWorkspace({ onNavigate, organizationId }: OrderRisksWorkspaceProps) {
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

  const loadOrders = React.useCallback(async () => {
    const [{ data, error: loadError }, { data: serialData, error: serialError }, { data: stationData, error: stationError }, { data: workCenterData, error: workCenterError }] = await Promise.all([
      supabase
        .from('mes_production_orders')
        .select('id, order_number, client_name, planned_quantity, completed_quantity, scrap_quantity, due_date, status, assigned_station, assigned_work_center, created_at')
        .eq('organization_id', organizationId)
        .in('status', activeStatuses)
        .order('due_date', { ascending: true }),
      supabase
        .from('mes_production_serials')
        .select('production_order_id, serial_number, assigned_station')
        .eq('organization_id', organizationId),
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
    ]);

    if (loadError || serialError || stationError || workCenterError) {
      setError(loadError?.message ?? serialError?.message ?? stationError?.message ?? workCenterError?.message ?? 'Unable to load order risk data.');
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
      setError('');
    }
    setLoading(false);
  }, [organizationId]);

  React.useEffect(() => { void loadOrders(); }, [loadOrders]);
  useSupabaseRealtimeRefresh({
    channelName: `order-risks-${organizationId}`,
    tables: React.useMemo(() => [
      { table: 'mes_production_orders', filter: `organization_id=eq.${organizationId}` },
      { table: 'mes_production_serials', filter: `organization_id=eq.${organizationId}` },
      { table: 'mes_work_center_stations', filter: `organization_id=eq.${organizationId}` },
      { table: 'mes_work_centers', filter: `organization_id=eq.${organizationId}` },
    ], [organizationId]),
    onRefresh: loadOrders,
  });

  React.useEffect(() => {
    window.sessionStorage.setItem(`${orderRisksFilterKeyPrefix}:${organizationId}`, JSON.stringify({
      client: clientFilter,
      workCenter: workCenterFilter,
      stations: selectedStations,
      search: searchTerm,
    } satisfies SavedOrderRiskFilters));
  }, [clientFilter, organizationId, searchTerm, selectedStations, workCenterFilter]);

  const clientOptions = React.useMemo(() => Array.from(new Set(orders.map((order) => order.client_name?.trim()).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b)), [orders]);
  const normalizedSearch = searchTerm.trim().toLocaleLowerCase();
  const stationNameByCode = React.useMemo(() => new Map(stations.map((station) => [station.code, station.name])), [stations]);
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
  const toggleStation = (stationCode: string) => setSelectedStations((current) => current.includes(stationCode)
    ? current.filter((code) => code !== stationCode)
    : [...current, stationCode]);
  const openOrderDetails = (orderNumber: string) => {
    window.sessionStorage.setItem(productionOrderDeepLinkKey, orderNumber);
    window.sessionStorage.setItem(productionOrderDetailsDeepLinkKey, orderNumber);
    setDetailOrderNumber(orderNumber);
  };

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
                  <button type="button" role="option" aria-selected={workCenterFilter === center.code} key={center.code} onClick={() => { setWorkCenterFilter(center.code); setWorkCenterMenuOpen(false); }}>
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
            {stations.map((station) => (
              <label key={station.code}>
                <input type="checkbox" checked={selectedStations.includes(station.code)} onChange={() => toggleStation(station.code)} />
                <span className="order-risks-checkbox"><Check size={13} /></span>
                <span><strong>{station.name}</strong><small>{station.code}</small></span>
              </label>
            ))}
            {!loading && stations.length === 0 ? <em>No stations configured.</em> : null}
          </div>
          {selectedStations.length ? <button type="button" onClick={() => setSelectedStations([])}>Clear stations</button> : null}
        </fieldset>
      </section>

      <main className="order-risk-sections" aria-busy={loading}>
        {sections.map((section) => {
          const sectionOrders = filteredOrders.filter((order) => riskForOrder(order) === section.level);
          const Icon = section.icon;
          return (
            <section className={`order-risk-section ${section.level}`} key={section.level}>
              <div className="order-risk-section-heading">
                <span className="order-risk-section-icon"><Icon size={22} /></span>
                <span><h2>{section.title}</h2><p>{section.range}</p></span>
                <strong>{loading ? '—' : sectionOrders.length} {sectionOrders.length === 1 ? 'order' : 'orders'}</strong>
              </div>
              <div className="order-risk-card-grid">
                {loading ? [1, 2, 3].map((item) => <div className="order-risk-card skeleton" key={item} />) : null}
                {!loading && sectionOrders.length === 0 ? (
                  <div className="order-risk-empty"><CheckCircle2 size={22} /><span>No active orders in this risk level.</span></div>
                ) : null}
                {!loading && sectionOrders.map((order) => {
                  const progress = order.planned_quantity > 0 ? Math.min(100, Math.round((order.completed_quantity / order.planned_quantity) * 100)) : 0;
                  return (
                    <article
                      className="order-risk-card clickable"
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
                          <span className="order-risk-due-metric"><small>{dueMetricTitle(order.due_date)}</small><strong>{dueLabel(order.due_date)}</strong></span>
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
              </div>
            </section>
          );
        })}
        {!loading && filteredOrders.length === 0 && !error ? (
          <div className="order-risks-all-clear"><PackageOpen size={28} /><strong>{filtersActive ? 'No matching production orders' : 'No active production orders'}</strong><span>{filtersActive ? 'Try changing the client or search term.' : 'New active orders will appear here automatically.'}</span></div>
        ) : null}
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
