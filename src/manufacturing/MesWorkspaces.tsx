import React from 'react';
import { Activity, AlertTriangle, ArrowLeft, Check, Eye, Factory, Pause, Play, Plus, RadioTower, Search, Timer, Wrench } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { mockTraceabilityEvents, mockWorkCenters } from './mesMockData';
import type { ProductionOrder, ProductionOrderPriority, ProductionOrderStatus, TraceabilityEvent, WorkCenterStatus } from './mesTypes';

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

type ProductionOrderFormState = {
  orderNumber: string;
  partNumber: string;
  partName: string;
  plannedQuantity: string;
  completedQuantity: string;
  scrapQuantity: string;
  status: ProductionOrderStatus;
  priority: ProductionOrderPriority;
  dueDate: string;
  assignedWorkCenter: string;
};

type ProductionOrderRow = {
  id: string;
  order_number: string;
  part_number: string;
  part_name: string;
  planned_quantity: number;
  completed_quantity: number;
  scrap_quantity: number;
  status: ProductionOrderStatus;
  priority: ProductionOrderPriority;
  due_date: string;
  assigned_work_center: string;
};

type ConfirmationState = {
  title: string;
  message: string;
  confirmLabel: string;
  tone: 'primary' | 'danger';
  onConfirm: () => Promise<void> | void;
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

const productionOrderStatuses: ProductionOrderStatus[] = ['planned', 'released', 'running', 'paused', 'completed', 'cancelled'];
const productionOrderPriorities: ProductionOrderPriority[] = ['low', 'normal', 'high', 'expedite'];

function mapProductionOrderRow(row: ProductionOrderRow): ProductionOrder {
  return {
    id: row.id,
    orderNumber: row.order_number,
    partNumber: row.part_number,
    partName: row.part_name,
    plannedQuantity: row.planned_quantity,
    completedQuantity: row.completed_quantity,
    scrapQuantity: row.scrap_quantity,
    status: row.status,
    priority: row.priority,
    dueDate: row.due_date,
    assignedWorkCenter: row.assigned_work_center,
  };
}

function toProductionOrderPayload(order: ProductionOrder | Omit<ProductionOrder, 'id'>) {
  return {
    order_number: order.orderNumber,
    part_number: order.partNumber,
    part_name: order.partName,
    planned_quantity: order.plannedQuantity,
    completed_quantity: order.completedQuantity,
    scrap_quantity: order.scrapQuantity,
    status: order.status,
    priority: order.priority,
    due_date: order.dueDate,
    assigned_work_center: order.assignedWorkCenter,
  };
}

function toFormState(order?: ProductionOrder): ProductionOrderFormState {
  return {
    orderNumber: order?.orderNumber ?? '',
    partNumber: order?.partNumber ?? '',
    partName: order?.partName ?? '',
    plannedQuantity: String(order?.plannedQuantity ?? 0),
    completedQuantity: String(order?.completedQuantity ?? 0),
    scrapQuantity: String(order?.scrapQuantity ?? 0),
    status: order?.status ?? 'planned',
    priority: order?.priority ?? 'normal',
    dueDate: order?.dueDate ?? new Date().toISOString().slice(0, 10),
    assignedWorkCenter: order?.assignedWorkCenter ?? '',
  };
}

function formStateToProductionOrder(formState: ProductionOrderFormState, id?: string): ProductionOrder {
  return {
    id: id ?? `po-${Date.now()}`,
    orderNumber: formState.orderNumber.trim(),
    partNumber: formState.partNumber.trim(),
    partName: formState.partName.trim(),
    plannedQuantity: Number(formState.plannedQuantity) || 0,
    completedQuantity: Number(formState.completedQuantity) || 0,
    scrapQuantity: Number(formState.scrapQuantity) || 0,
    status: formState.status,
    priority: formState.priority,
    dueDate: formState.dueDate,
    assignedWorkCenter: formState.assignedWorkCenter.trim(),
  };
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
  const [orders, setOrders] = React.useState<ProductionOrder[]>([]);
  const [selectedOrderNumber, setSelectedOrderNumber] = React.useState('');
  const [searchTerm, setSearchTerm] = React.useState('');
  const [orderView, setOrderView] = React.useState<'all' | 'in-progress' | 'completed'>('all');
  const [sortByPriority, setSortByPriority] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [formMode, setFormMode] = React.useState<'create' | 'edit' | null>(null);
  const [formState, setFormState] = React.useState<ProductionOrderFormState>(() => toFormState());
  const [tableMessage, setTableMessage] = React.useState<string | null>('Loading production orders...');
  const [savingOrder, setSavingOrder] = React.useState(false);
  const [confirmation, setConfirmation] = React.useState<ConfirmationState | null>(null);

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
  const tableEmptyMessage = tableMessage ?? (orders.length > 0 && visibleOrders.length === 0
    ? 'No Production Orders match the current filters.'
    : null);
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(visibleOrders.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const paginatedOrders = visibleOrders.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const currentOrders = orders.filter((order) => ['released', 'running', 'paused'].includes(order.status)).length;
  const completedOrders = orders.filter((order) => order.status === 'completed').length;
  const todayTotalProduction = orders.reduce((total, order) => total + order.completedQuantity, 0);
  const selectedOrderProgress = selectedOrder && selectedOrder.plannedQuantity > 0
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

  React.useEffect(() => {
    let active = true;
    const loadProductionOrders = async () => {
      const { data, error } = await supabase
        .from('mes_production_orders')
        .select('*')
        .order('due_date', { ascending: true });

      if (!active) return;
      if (error) {
        setOrders([]);
        setSelectedOrderNumber('');
        setTableMessage('Production Orders are not available right now. Add a new order from the control panel on the right or try again in a moment.');
        return;
      }
      const nextOrders = ((data ?? []) as ProductionOrderRow[]).map(mapProductionOrderRow);
      setOrders(nextOrders);
      setSelectedOrderNumber(nextOrders[0]?.orderNumber ?? '');
      setTableMessage(nextOrders.length === 0 ? 'You do not have any Production Orders registered yet. Add new orders using the control panel on the right.' : null);
    };

    void loadProductionOrders();

    return () => {
      active = false;
    };
  }, []);

  const persistOrder = async (order: ProductionOrder) => {
    const { error } = await supabase
      .from('mes_production_orders')
      .update(toProductionOrderPayload(order))
      .eq('id', order.id);
    if (error) {
      setTableMessage('This Production Order could not be synced right now. Try again in a moment.');
    }
  };

  const updateOrder = (orderNumber: string, action: string) => {
    let updatedOrder: ProductionOrder | null = null;
    setOrders((currentOrders) =>
      currentOrders.map((order) => {
        if (order.orderNumber !== orderNumber) return order;
        if (action === 'production') {
          const nextCompleted = Math.min(order.plannedQuantity, order.completedQuantity + 24);
          updatedOrder = {
            ...order,
            completedQuantity: nextCompleted,
            status: nextCompleted >= order.plannedQuantity ? 'completed' : order.status,
          };
          return updatedOrder;
        }
        if (action === 'scrap') {
          updatedOrder = { ...order, scrapQuantity: order.scrapQuantity + 2 };
          return updatedOrder;
        }
        updatedOrder = { ...order, status: actionStatus(order.status, action) };
        return updatedOrder;
      }),
    );
    window.setTimeout(() => {
      if (updatedOrder) void persistOrder(updatedOrder);
    }, 0);
  };

  const openCreateOrderForm = () => {
    setFormState(toFormState({
      id: '',
      orderNumber: `MO-24${orders.length + 26}`,
      partNumber: '',
      partName: '',
      plannedQuantity: 0,
      completedQuantity: 0,
      scrapQuantity: 0,
      status: 'planned',
      priority: 'normal',
      dueDate: new Date().toISOString().slice(0, 10),
      assignedWorkCenter: '',
    }));
    setFormMode('create');
  };

  const openEditOrderForm = () => {
    if (!selectedOrder) return;
    setFormState(toFormState(selectedOrder));
    setFormMode('edit');
  };

  const closeOrderForm = () => {
    setFormMode(null);
    setSavingOrder(false);
  };

  const saveOrderForm = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formState.orderNumber.trim() || !formState.partNumber.trim() || !formState.partName.trim()) return;
    const orderFromForm = formStateToProductionOrder(formState, formMode === 'edit' ? selectedOrder?.id : undefined);

    if (formMode === 'edit' && selectedOrder) {
      setConfirmation({
        title: 'Save production order changes?',
        message: `This will update ${selectedOrder.orderNumber} with the values currently entered in the form.`,
        confirmLabel: 'Save changes',
        tone: 'primary',
        onConfirm: async () => {
          setSavingOrder(true);
          setOrders((currentOrders) => currentOrders.map((order) => (order.id === selectedOrder.id ? orderFromForm : order)));
          setSelectedOrderNumber(orderFromForm.orderNumber);
          const { error } = await supabase
            .from('mes_production_orders')
            .update(toProductionOrderPayload(orderFromForm))
            .eq('id', selectedOrder.id);
          if (error) setTableMessage('This Production Order could not be updated right now. Try again in a moment.');
          closeOrderForm();
        },
      });
      return;
    }

    setConfirmation({
      title: 'Create production order?',
      message: `This will create ${orderFromForm.orderNumber} and add it to the Production Orders workspace.`,
      confirmLabel: 'Create order',
      tone: 'primary',
      onConfirm: async () => {
        setSavingOrder(true);
        const { data, error } = await supabase
          .from('mes_production_orders')
          .insert(toProductionOrderPayload(orderFromForm))
          .select('*')
          .single();
        const nextOrder = error ? orderFromForm : mapProductionOrderRow(data as ProductionOrderRow);
        if (error) setTableMessage('This Production Order could not be created right now. Try again in a moment.');
        if (!error) setTableMessage(null);
        setOrders((currentOrders) => [nextOrder, ...currentOrders]);
        setSelectedOrderNumber(nextOrder.orderNumber);
        closeOrderForm();
      },
    });
  };

  const deleteSelectedOrder = async () => {
    if (!selectedOrder) return;
    setConfirmation({
      title: 'Delete production order?',
      message: `This will delete ${selectedOrder.orderNumber}. This action cannot be undone.`,
      confirmLabel: 'Delete order',
      tone: 'danger',
      onConfirm: async () => {
        const nextOrders = orders.filter((order) => order.id !== selectedOrder.id);
        setOrders(nextOrders);
        setSelectedOrderNumber(nextOrders[0]?.orderNumber ?? '');
        const { error } = await supabase.from('mes_production_orders').delete().eq('id', selectedOrder.id);
        if (error) setTableMessage('This Production Order could not be deleted right now. Try again in a moment.');
        if (!error && nextOrders.length === 0) setTableMessage('You do not have any Production Orders registered yet. Add new orders using the control panel on the right.');
      },
    });
  };

  const confirmPendingAction = async () => {
    if (!confirmation) return;
    const pendingConfirmation = confirmation;
    setConfirmation(null);
    await pendingConfirmation.onConfirm();
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
                {tableEmptyMessage ? (
                  <tr>
                    <td className="production-orders-table-empty" colSpan={9}>
                      <div>
                        <span>{tableMessage === 'Loading production orders...' ? 'Loading' : 'Production Orders'}</span>
                        <strong>{tableEmptyMessage}</strong>
                      </div>
                    </td>
                  </tr>
                ) : paginatedOrders.map((order) => {
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
          {visibleOrders.length > 0 ? (
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
          ) : null}
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
          <button className="mes-primary-action production-orders-create" type="button" onClick={openCreateOrderForm}>
            <Plus size={16} />
            Add new production order
          </button>
          <div className="production-orders-manage-actions">
            <button type="button" onClick={openEditOrderForm} disabled={!selectedOrder}>
              Edit
            </button>
            <button type="button" onClick={deleteSelectedOrder} disabled={!selectedOrder}>
              Delete
            </button>
          </div>
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
      {formMode ? (
        <div className="mes-modal-backdrop" role="presentation">
          <section className="mes-order-modal" role="dialog" aria-modal="true" aria-labelledby="production-order-form-title">
            <div>
              <p className="eyebrow">Production Order</p>
              <h3 id="production-order-form-title">{formMode === 'create' ? 'Add new production order' : 'Edit production order'}</h3>
            </div>
            <form className="mes-order-form" onSubmit={saveOrderForm}>
              <label>
                Order number
                <input value={formState.orderNumber} onChange={(event) => setFormState((current) => ({ ...current, orderNumber: event.target.value }))} required />
              </label>
              <label>
                Part number
                <input value={formState.partNumber} onChange={(event) => setFormState((current) => ({ ...current, partNumber: event.target.value }))} required />
              </label>
              <label>
                Part name
                <input value={formState.partName} onChange={(event) => setFormState((current) => ({ ...current, partName: event.target.value }))} required />
              </label>
              <label>
                Planned quantity
                <input type="number" min="0" value={formState.plannedQuantity} onChange={(event) => setFormState((current) => ({ ...current, plannedQuantity: event.target.value }))} required />
              </label>
              <label>
                Completed quantity
                <input type="number" min="0" value={formState.completedQuantity} onChange={(event) => setFormState((current) => ({ ...current, completedQuantity: event.target.value }))} required />
              </label>
              <label>
                Scrap quantity
                <input type="number" min="0" value={formState.scrapQuantity} onChange={(event) => setFormState((current) => ({ ...current, scrapQuantity: event.target.value }))} required />
              </label>
              <label>
                Status
                <select value={formState.status} onChange={(event) => setFormState((current) => ({ ...current, status: event.target.value as ProductionOrderStatus }))}>
                  {productionOrderStatuses.map((status) => <option value={status} key={status}>{formatLabel(status)}</option>)}
                </select>
              </label>
              <label>
                Priority
                <select value={formState.priority} onChange={(event) => setFormState((current) => ({ ...current, priority: event.target.value as ProductionOrderPriority }))}>
                  {productionOrderPriorities.map((priority) => <option value={priority} key={priority}>{formatLabel(priority)}</option>)}
                </select>
              </label>
              <label>
                Due date
                <input type="date" value={formState.dueDate} onChange={(event) => setFormState((current) => ({ ...current, dueDate: event.target.value }))} required />
              </label>
              <label>
                Assigned work center
                <input value={formState.assignedWorkCenter} onChange={(event) => setFormState((current) => ({ ...current, assignedWorkCenter: event.target.value }))} required />
              </label>
              <div className="mes-order-form-actions">
                <button type="button" onClick={closeOrderForm}>Cancel</button>
                <button type="submit" disabled={savingOrder}>{savingOrder ? 'Saving...' : 'Save order'}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
      {confirmation ? (
        <div className="mes-modal-backdrop" role="presentation">
          <section
            className={['mes-confirm-modal', confirmation.tone === 'danger' ? 'danger' : ''].filter(Boolean).join(' ')}
            role="dialog"
            aria-modal="true"
            aria-labelledby="production-order-confirm-title"
          >
            <div className="mes-confirm-mark" aria-hidden="true">
              {confirmation.tone === 'danger' ? <AlertTriangle size={24} /> : <Check size={24} />}
            </div>
            <div>
              <p className="eyebrow">Production Order</p>
              <h3 id="production-order-confirm-title">{confirmation.title}</h3>
              <p>{confirmation.message}</p>
            </div>
            <div className="mes-confirm-actions">
              <button type="button" onClick={() => setConfirmation(null)}>
                Cancel
              </button>
              <button type="button" onClick={() => void confirmPendingAction()}>
                {confirmation.confirmLabel}
              </button>
            </div>
          </section>
        </div>
      ) : null}
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
