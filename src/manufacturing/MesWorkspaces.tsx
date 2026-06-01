import React from 'react';
import { Activity, AlertTriangle, ArrowLeft, Check, Eye, Factory, Pause, Play, Plus, RadioTower, Search, Timer, Wrench } from 'lucide-react';
import { mockProductionOrders, mockTraceabilityEvents, mockWorkCenters } from './mesMockData';
import type { ProductionOrder, ProductionOrderStatus, TraceabilityEvent, WorkCenterStatus } from './mesTypes';

type WorkspaceProps = {
  onNavigate: (path: string) => void;
};

type StatusBadgeProps = {
  value: string;
  tone?: 'status' | 'priority' | 'event';
};

type ProductionOrderAction = {
  label: string;
  action?: string;
  tone: 'success' | 'danger' | 'info' | 'warning';
  traceability?: boolean;
};

const formatLabel = (value: string) => value.replace(/-/g, ' ');

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(new Date(`${value}T12:00:00`));

const formatTimestamp = (value: string) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));

export function MesStatusBadge({ value, tone = 'status' }: StatusBadgeProps) {
  return <span className={`mes-status-badge ${tone}-${value}`}>{formatLabel(value)}</span>;
}

function MesWorkspaceShell({ title, eyebrow, description, children }: React.PropsWithChildren<{
  title: string;
  eyebrow: string;
  description: string;
  onBack?: () => void;
}>) {
  return (
    <section className="mes-workspace-panel">
      <div className="mes-screen-header">
        {onBack ? (
          <button className="academy-back-button engineering-back-button mes-workspace-back" type="button" onClick={onBack}>
          <ArrowLeft size={16} />
          MES Applications
        </button>
        ) : <span />}
        <div className="mes-workspace-heading">
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function actionStatus(currentStatus: ProductionOrderStatus, action: string): ProductionOrderStatus {
  if (action === 'release' && currentStatus === 'planned') return 'released';
  if (action === 'start' && ['released', 'paused'].includes(currentStatus)) return 'running';
  if (action === 'pause' && currentStatus === 'running') return 'paused';
  if (action === 'complete') return 'completed';
  return currentStatus;
}

function getProductionOrderActions(status: ProductionOrderStatus): ProductionOrderAction[] {
  const traceabilityAction: ProductionOrderAction = { label: 'Traceability', tone: 'info', traceability: true };
  if (status === 'planned') {
    return [
      { label: 'Release', action: 'release', tone: 'success' },
      traceabilityAction,
    ];
  }
  if (status === 'released') {
    return [
      { label: 'Start', action: 'start', tone: 'success' },
      traceabilityAction,
    ];
  }
  if (status === 'running') {
    return [
      { label: 'Pause', action: 'pause', tone: 'info' },
      { label: 'Report production', action: 'production', tone: 'warning' },
      { label: 'Report scrap', action: 'scrap', tone: 'danger' },
      { label: 'Complete', action: 'complete', tone: 'success' },
      traceabilityAction,
    ];
  }
  if (status === 'paused') {
    return [
      { label: 'Resume', action: 'start', tone: 'success' },
      { label: 'Report scrap', action: 'scrap', tone: 'danger' },
      { label: 'Complete', action: 'complete', tone: 'success' },
      traceabilityAction,
    ];
  }
  return [traceabilityAction];
}

export function ProductionOrdersWorkspace({ onNavigate }: WorkspaceProps) {
  const [orders, setOrders] = React.useState<ProductionOrder[]>(mockProductionOrders);
  const [selectedOrderNumber, setSelectedOrderNumber] = React.useState(mockProductionOrders[0]?.orderNumber ?? '');
  const [searchTerm, setSearchTerm] = React.useState('');
  const [orderView, setOrderView] = React.useState<'all' | 'in-progress' | 'completed'>('all');
  const [sortByPriority, setSortByPriority] = React.useState(false);
  const [page, setPage] = React.useState(1);

  const selectedOrder = orders.find((order) => order.orderNumber === selectedOrderNumber) ?? null;
  const filteredOrders = orders.filter((order) => {
    const haystack = [
      order.orderNumber,
      order.partNumber,
      order.partName,
      order.status,
      order.priority,
      order.assignedWorkCenter,
    ].join(' ').toLowerCase();
    const matchesSearch = haystack.includes(searchTerm.trim().toLowerCase());
    const matchesView = orderView === 'all'
      || (orderView === 'in-progress' && ['released', 'running', 'paused'].includes(order.status))
      || (orderView === 'completed' && order.status === 'completed');
    return matchesSearch && matchesView;
  });
  const priorityRank = {
    expedite: 0,
    high: 1,
    normal: 2,
    low: 3,
  };
  const visibleOrders = sortByPriority
    ? [...filteredOrders].sort((firstOrder, secondOrder) => {
      const priorityDifference = priorityRank[firstOrder.priority] - priorityRank[secondOrder.priority];
      if (priorityDifference !== 0) return priorityDifference;
      return new Date(firstOrder.dueDate).getTime() - new Date(secondOrder.dueDate).getTime();
    })
    : filteredOrders;
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(visibleOrders.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const paginatedOrders = visibleOrders.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const currentOrders = orders.filter((order) => ['released', 'running', 'paused'].includes(order.status)).length;
  const completedOrders = orders.filter((order) => order.status === 'completed').length;
  const todayTotalProduction = orders.reduce((total, order) => total + order.completedQuantity, 0);
  const selectedOrderProgress = selectedOrder
    ? Math.min(100, Math.round((selectedOrder.completedQuantity / selectedOrder.plannedQuantity) * 100))
    : 0;
  const selectedOrderProgressTone = selectedOrderProgress >= 100
    ? 'complete'
    : selectedOrderProgress >= 67
      ? 'high'
      : selectedOrderProgress >= 34
        ? 'mid'
        : 'low';

  React.useEffect(() => {
    setPage(1);
  }, [searchTerm, orderView]);

  const updateOrder = (orderNumber: string, action: string) => {
    setOrders((currentOrders) =>
      currentOrders.map((order) => {
        if (order.orderNumber !== orderNumber) return order;
        if (action === 'production') {
          const nextCompleted = Math.min(order.plannedQuantity, order.completedQuantity + 24);
          return {
            ...order,
            completedQuantity: nextCompleted,
            status: nextCompleted >= order.plannedQuantity ? 'completed' : order.status,
          };
        }
        if (action === 'scrap') {
          return { ...order, scrapQuantity: order.scrapQuantity + 2 };
        }
        return { ...order, status: actionStatus(order.status, action) };
      }),
    );
  };

  const createOrder = () => {
    const nextOrder: ProductionOrder = {
      id: `po-${Date.now()}`,
      orderNumber: `MO-24${orders.length + 26}`,
      partNumber: 'YN-7001-A',
      partName: 'New production kit',
      plannedQuantity: 250,
      completedQuantity: 0,
      scrapQuantity: 0,
      status: 'planned',
      priority: 'normal',
      dueDate: '2026-06-18',
      assignedWorkCenter: 'CNC-03',
    };
    setOrders((currentOrders) => [nextOrder, ...currentOrders]);
    setSelectedOrderNumber(nextOrder.orderNumber);
  };

  return (
    <section className="mes-workspace-panel production-orders-workspace">
      <div className="production-orders-layout">
        <div className="production-orders-main-panel">
          <div className="mes-screen-header production-orders-heading">
            <button className="academy-back-button engineering-back-button mes-workspace-back" type="button" onClick={() => onNavigate('/workspace/manufacturing-ops/mes')}>
              <ArrowLeft size={16} />
              MES Applications
            </button>
            <div className="mes-workspace-heading">
              <p className="eyebrow">MES / Production Orders</p>
              <h2>Production Orders</h2>
              <p>Create, release, execute, and close orders with live quantities and shop-floor actions.</p>
            </div>
          </div>
          <div className="production-orders-panel-title">
            <strong>Production orders</strong>
            <div className="production-orders-view-toggle" aria-label="Production order view">
              <button className={orderView === 'all' ? 'active' : ''} type="button" onClick={() => setOrderView('all')}>
                All
              </button>
              <button className={orderView === 'in-progress' ? 'active' : ''} type="button" onClick={() => setOrderView('in-progress')}>
                In progress
              </button>
              <button className={orderView === 'completed' ? 'active' : ''} type="button" onClick={() => setOrderView('completed')}>
                Completed
              </button>
              <button className={sortByPriority ? 'active' : ''} type="button" onClick={() => setSortByPriority((value) => !value)}>
                Priority
              </button>
            </div>
            <span>{paginatedOrders.length} showing / {visibleOrders.length} visible / {orders.length} total</span>
          </div>
          <div className="mes-table-wrap production-orders-table-wrap">
            <table className="mes-table production-orders-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Part</th>
                  <th>Planned</th>
                  <th>Completed</th>
                  <th>Scrap</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Due</th>
                  <th>Work center</th>
                </tr>
              </thead>
              <tbody>
                {paginatedOrders.map((order) => {
                  const selected = order.orderNumber === selectedOrderNumber;
                  return (
                    <tr
                      className={selected ? 'selected' : ''}
                      key={order.id}
                      tabIndex={0}
                      onClick={() => setSelectedOrderNumber(order.orderNumber)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedOrderNumber(order.orderNumber);
                        }
                      }}
                    >
                      <td><strong>{order.orderNumber}</strong></td>
                      <td>
                        <strong>{order.partNumber}</strong>
                        <span>{order.partName}</span>
                      </td>
                      <td className="production-order-number-cell">{order.plannedQuantity.toLocaleString()}</td>
                      <td className="production-order-number-cell">{order.completedQuantity.toLocaleString()}</td>
                      <td className="production-order-number-cell">{order.scrapQuantity.toLocaleString()}</td>
                      <td><MesStatusBadge value={order.status} /></td>
                      <td><MesStatusBadge value={order.priority} tone="priority" /></td>
                      <td>{formatDate(order.dueDate)}</td>
                      <td>{order.assignedWorkCenter}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="production-orders-pagination">
            <span>Page {currentPage} of {pageCount}</span>
            <div>
              <button type="button" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                Previous
              </button>
              {Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => (
                <button
                  className={pageNumber === currentPage ? 'active' : ''}
                  type="button"
                  key={pageNumber}
                  onClick={() => setPage(pageNumber)}
                >
                  {pageNumber}
                </button>
              ))}
              <button type="button" disabled={currentPage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>
                Next
              </button>
            </div>
          </div>
        </div>

        <aside className="production-orders-side-panel" aria-label="Production order controls">
          <div className="production-orders-metric-grid">
            <article>
              <span>Current</span>
              <strong>{currentOrders}</strong>
            </article>
            <article>
              <span>Completed</span>
              <strong>{completedOrders}</strong>
            </article>
          </div>
          <article className="production-orders-total">
            <span>Today expected production</span>
            <strong>{todayTotalProduction.toLocaleString()}</strong>
          </article>
          <label className="production-orders-search">
            <span>Search</span>
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Order, part, status, work center"
            />
          </label>
          <button className="mes-primary-action production-orders-create" type="button" onClick={createOrder}>
            <Plus size={16} />
            Add new production order
          </button>
          {selectedOrder ? (
            <div className="production-orders-selection-card">
              <div>
                <div className="production-orders-selection-heading">
                  <span>Selected order</span>
                  <MesStatusBadge value={selectedOrder.priority} tone="priority" />
                </div>
                <strong>{selectedOrder.orderNumber}</strong>
                <em>{selectedOrder.partNumber} / {selectedOrder.assignedWorkCenter}</em>
              </div>
              <div className="production-order-progress">
                <p>
                  <strong>{selectedOrder.completedQuantity.toLocaleString()}</strong>
                  {' / '}
                  {selectedOrder.plannedQuantity.toLocaleString()} completed
                </p>
                <p>{selectedOrder.scrapQuantity.toLocaleString()} scrap</p>
                <div>
                  <span>Progress</span>
                  <strong>{selectedOrderProgress}%</strong>
                </div>
                <div className={`production-order-progress-track progress-${selectedOrderProgressTone}`} aria-hidden="true">
                  <span style={{ width: `${selectedOrderProgress}%` }} />
                </div>
                <p>Due {formatDate(selectedOrder.dueDate)}</p>
              </div>
              <div className="mes-action-grid">
                {getProductionOrderActions(selectedOrder.status).map((orderAction) => (
                  <button
                    className={`mes-action-${orderAction.tone}`}
                    type="button"
                    key={orderAction.label}
                    onClick={() => {
                      if (orderAction.traceability) {
                        onNavigate('/workspace/manufacturing-ops/mes/traceability');
                        return;
                      }
                      if (orderAction.action) {
                        updateOrder(selectedOrder.orderNumber, orderAction.action);
                      }
                    }}
                  >
                    {orderAction.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="production-orders-empty-state">Select a production order to enable actions.</div>
          )}
        </aside>
      </div>
    </section>
  );
}

const workCenterIconByStatus: Record<WorkCenterStatus, React.ComponentType<{ size?: number }>> = {
  available: Check,
  running: Play,
  down: AlertTriangle,
  maintenance: Wrench,
  offline: Pause,
};

export function WorkCentersWorkspace({ onNavigate }: WorkspaceProps) {
  return (
    <MesWorkspaceShell
      eyebrow="MES / Work Centers"
      title="Work Centers"
      description="Monitor machines, cells, stations, capacity, and current production state from the floor."
      onBack={() => onNavigate('/workspace/manufacturing-ops/mes')}
    >
      <div className="mes-work-center-grid">
        {mockWorkCenters.map((workCenter) => {
          const Icon = workCenterIconByStatus[workCenter.status];
          return (
            <article className="mes-work-center-card" key={workCenter.id}>
              <div className="mes-card-topline">
                <span className="mes-card-icon"><Icon size={18} /></span>
                <MesStatusBadge value={workCenter.status} />
              </div>
              <h3>{workCenter.code}</h3>
              <p>{workCenter.name}</p>
              <dl>
                <div><dt>Type</dt><dd>{workCenter.type}</dd></div>
                <div><dt>Current order</dt><dd>{workCenter.currentOrder ?? 'Unassigned'}</dd></div>
                <div><dt>Capacity / hour</dt><dd>{workCenter.capacityPerHour}</dd></div>
                <div><dt>Location</dt><dd>{workCenter.location}</dd></div>
                <div><dt>Last activity</dt><dd>{workCenter.lastActivity}</dd></div>
              </dl>
            </article>
          );
        })}
      </div>
    </MesWorkspaceShell>
  );
}

function uniqueValues(events: TraceabilityEvent[], key: keyof TraceabilityEvent) {
  return Array.from(new Set(events.map((event) => event[key]).filter(Boolean) as string[]));
}

export function TraceabilityWorkspace({ onNavigate }: WorkspaceProps) {
  const [filters, setFilters] = React.useState({
    productionOrder: '',
    partNumber: '',
    serialNumber: '',
    lotNumber: '',
    workCenter: '',
    eventType: '',
    dateFrom: '',
    dateTo: '',
  });

  const filteredEvents = mockTraceabilityEvents.filter((event) => {
    const eventDate = event.timestamp.slice(0, 10);
    return (!filters.productionOrder || event.productionOrder === filters.productionOrder)
      && (!filters.partNumber || event.partNumber === filters.partNumber)
      && (!filters.serialNumber || event.serialNumber === filters.serialNumber)
      && (!filters.lotNumber || event.lotNumber === filters.lotNumber)
      && (!filters.workCenter || event.workCenter === filters.workCenter)
      && (!filters.eventType || event.eventType === filters.eventType)
      && (!filters.dateFrom || eventDate >= filters.dateFrom)
      && (!filters.dateTo || eventDate <= filters.dateTo);
  });

  const setFilter = (key: keyof typeof filters, value: string) => {
    setFilters((currentFilters) => ({ ...currentFilters, [key]: value }));
  };

  return (
    <MesWorkspaceShell
      eyebrow="MES / Traceability"
      title="Traceability"
      description="Search production history by order, part, serial, lot, work center, event type, and date range."
      onBack={() => onNavigate('/workspace/manufacturing-ops/mes')}
    >
      <div className="mes-filter-panel">
        <label>
          Production order
          <select value={filters.productionOrder} onChange={(event) => setFilter('productionOrder', event.target.value)}>
            <option value="">All orders</option>
            {uniqueValues(mockTraceabilityEvents, 'productionOrder').map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label>
          Part number
          <select value={filters.partNumber} onChange={(event) => setFilter('partNumber', event.target.value)}>
            <option value="">All parts</option>
            {uniqueValues(mockTraceabilityEvents, 'partNumber').map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label>
          Serial number
          <select value={filters.serialNumber} onChange={(event) => setFilter('serialNumber', event.target.value)}>
            <option value="">All serials</option>
            {uniqueValues(mockTraceabilityEvents, 'serialNumber').map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label>
          Lot number
          <select value={filters.lotNumber} onChange={(event) => setFilter('lotNumber', event.target.value)}>
            <option value="">All lots</option>
            {uniqueValues(mockTraceabilityEvents, 'lotNumber').map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label>
          Work center
          <select value={filters.workCenter} onChange={(event) => setFilter('workCenter', event.target.value)}>
            <option value="">All centers</option>
            {uniqueValues(mockTraceabilityEvents, 'workCenter').map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label>
          Event type
          <select value={filters.eventType} onChange={(event) => setFilter('eventType', event.target.value)}>
            <option value="">All events</option>
            {uniqueValues(mockTraceabilityEvents, 'eventType').map((value) => <option key={value} value={value}>{formatLabel(value)}</option>)}
          </select>
        </label>
        <label>
          From
          <input type="date" value={filters.dateFrom} onChange={(event) => setFilter('dateFrom', event.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={filters.dateTo} onChange={(event) => setFilter('dateTo', event.target.value)} />
        </label>
      </div>
      <div className="mes-toolbar">
        <span><Search size={15} /> {filteredEvents.length} matching events</span>
      </div>
      <div className="mes-event-timeline">
        {filteredEvents.map((event) => (
          <article className="mes-event-row" key={event.id}>
            <span className="mes-event-marker"><RadioTower size={16} /></span>
            <div>
              <div className="mes-event-heading">
                <strong>{formatTimestamp(event.timestamp)}</strong>
                <MesStatusBadge value={event.eventType} tone="event" />
              </div>
              <p>{event.notes}</p>
              <div className="mes-event-meta">
                <span><Factory size={14} /> {event.productionOrder} / {event.workCenter}</span>
                <span><Activity size={14} /> Qty {event.quantity}</span>
                <span><Eye size={14} /> {event.operator}</span>
                <span><Timer size={14} /> {event.serialNumber ?? 'No serial'} / {event.lotNumber ?? 'No lot'}</span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </MesWorkspaceShell>
  );
}
