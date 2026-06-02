import React from 'react';
import { createPortal } from 'react-dom';
import { Activity, AlertTriangle, ArrowLeft, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Eye, Factory, Plus, RadioTower, Search, Timer } from 'lucide-react';
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
  productionFlow: string;
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

type MesOrderDropdownOption = {
  value: string;
  label: string;
};

type MesOrderDropdownProps = {
  id: string;
  value: string;
  options: MesOrderDropdownOption[];
  placeholder?: string;
  onChange: (value: string) => void;
};

type MesOrderDropdownMenuPosition = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

type MesOrderCalendarPosition = {
  top: number;
  left: number;
  width: number;
};

const formatLabel = (value: string) => value.replace(/-/g, ' ');

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(new Date(`${value}T12:00:00`));

const formatDateInputLabel = (value: string) =>
  new Intl.DateTimeFormat('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }).format(new Date(`${value}T12:00:00`));

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
const productionFlowOptions = [
  { id: 'standard-assembly-flow', name: 'Standard assembly flow' },
  { id: 'machining-inspection-flow', name: 'Machining + inspection flow' },
  { id: 'rush-production-flow', name: 'Rush production flow' },
];
const emptyProductionOrdersMessage = 'You do not have any Production Orders registered yet. Add new orders using the control panel on the right.';
const unavailableProductionOrdersMessage = 'Production Orders are not available right now. Add a new order from the control panel on the right or try again in a moment.';

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getMonthDates(displayDate: Date) {
  const year = displayDate.getFullYear();
  const month = displayDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const firstGridDate = new Date(year, month, 1 - firstDay.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstGridDate);
    date.setDate(firstGridDate.getDate() + index);
    return date;
  });
}

function MesOrderDatePicker({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  const selectedDate = React.useMemo(() => new Date(`${value}T12:00:00`), [value]);
  const [open, setOpen] = React.useState(false);
  const [displayDate, setDisplayDate] = React.useState(selectedDate);
  const [calendarPosition, setCalendarPosition] = React.useState<MesOrderCalendarPosition | null>(null);
  const triggerRef = React.useRef<HTMLDivElement | null>(null);
  const calendarRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    setDisplayDate(selectedDate);
  }, [selectedDate]);

  const updateCalendarPosition = React.useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 16;
    const calendarWidth = Math.min(Math.max(rect.width, 312), window.innerWidth - (viewportPadding * 2));
    const availableBelow = window.innerHeight - rect.bottom - viewportPadding;
    const availableAbove = rect.top - viewportPadding;
    const openUp = availableBelow < 332 && availableAbove > availableBelow;
    const left = Math.max(viewportPadding, Math.min(rect.left, window.innerWidth - calendarWidth - viewportPadding));

    setCalendarPosition({
      top: openUp ? Math.max(viewportPadding, rect.top - 326) : rect.bottom + 6,
      left,
      width: calendarWidth,
    });
  }, []);

  React.useLayoutEffect(() => {
    if (!open) return;
    updateCalendarPosition();
  }, [open, updateCalendarPosition]);

  React.useEffect(() => {
    if (!open) return undefined;

    const closeIfOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || calendarRef.current?.contains(target)) return;
      setOpen(false);
    };
    const reposition = () => updateCalendarPosition();

    document.addEventListener('mousedown', closeIfOutside);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);

    return () => {
      document.removeEventListener('mousedown', closeIfOutside);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, updateCalendarPosition]);

  const calendarDates = getMonthDates(displayDate);
  const selectedIsoDate = toIsoDate(selectedDate);
  const todayIsoDate = toIsoDate(new Date());
  const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(displayDate);
  const calendar = open && calendarPosition
    ? createPortal(
      <div
        className="mes-order-calendar"
        id={`${id}-calendar`}
        ref={calendarRef}
        style={{
          top: calendarPosition.top,
          left: calendarPosition.left,
          width: calendarPosition.width,
        }}
      >
        <div className="mes-order-calendar-header">
          <button type="button" onClick={() => setDisplayDate((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))} aria-label="Previous month">
            <ChevronLeft size={16} />
          </button>
          <strong>{monthLabel}</strong>
          <button type="button" onClick={() => setDisplayDate((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))} aria-label="Next month">
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="mes-order-calendar-weekdays" aria-hidden="true">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day}>{day}</span>)}
        </div>
        <div className="mes-order-calendar-grid">
          {calendarDates.map((date) => {
            const isoDate = toIsoDate(date);
            const outsideMonth = date.getMonth() !== displayDate.getMonth();
            return (
              <button
                className={[
                  outsideMonth ? 'outside-month' : '',
                  isoDate === selectedIsoDate ? 'selected' : '',
                  isoDate === todayIsoDate ? 'today' : '',
                ].filter(Boolean).join(' ')}
                type="button"
                key={isoDate}
                onClick={() => {
                  onChange(isoDate);
                  setOpen(false);
                }}
              >
                {date.getDate()}
              </button>
            );
          })}
        </div>
      </div>,
      document.body,
    )
    : null;

  return (
    <div
      className={['mes-order-date-picker', open ? 'open' : ''].filter(Boolean).join(' ')}
      ref={triggerRef}
      onBlur={(event) => {
        const nextFocusedElement = event.relatedTarget as Node | null;
        if (!event.currentTarget.contains(nextFocusedElement) && !calendarRef.current?.contains(nextFocusedElement)) {
          setOpen(false);
        }
      }}
    >
      <button type="button" aria-expanded={open} aria-controls={`${id}-calendar`} onClick={() => setOpen((current) => !current)}>
        <span>{formatDateInputLabel(value)}</span>
        <CalendarDays size={16} />
      </button>
      {calendar}
    </div>
  );
}

function MesOrderDropdown({ id, value, options, placeholder = 'Select option', onChange }: MesOrderDropdownProps) {
  const [open, setOpen] = React.useState(false);
  const [menuPosition, setMenuPosition] = React.useState<MesOrderDropdownMenuPosition | null>(null);
  const triggerRef = React.useRef<HTMLDivElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const selectedOption = options.find((option) => option.value === value);

  const updateMenuPosition = React.useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 16;
    const availableBelow = window.innerHeight - rect.bottom - viewportPadding;
    const availableAbove = rect.top - viewportPadding;
    const openUp = availableBelow < 180 && availableAbove > availableBelow;
    const maxHeight = Math.max(132, Math.min(220, openUp ? availableAbove - 6 : availableBelow - 6));

    setMenuPosition({
      top: openUp ? Math.max(viewportPadding, rect.top - maxHeight - 6) : rect.bottom + 6,
      left: rect.left,
      width: rect.width,
      maxHeight,
    });
  }, []);

  React.useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();
  }, [open, updateMenuPosition]);

  React.useEffect(() => {
    if (!open) return undefined;

    const closeIfOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const reposition = () => updateMenuPosition();

    document.addEventListener('mousedown', closeIfOutside);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);

    return () => {
      document.removeEventListener('mousedown', closeIfOutside);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, updateMenuPosition]);

  const dropdownMenu = open && menuPosition
    ? createPortal(
      <div
        className="mes-order-dropdown-menu"
        id={`${id}-listbox`}
        role="listbox"
        ref={menuRef}
        style={{
          top: menuPosition.top,
          left: menuPosition.left,
          width: menuPosition.width,
          maxHeight: menuPosition.maxHeight,
        }}
      >
        {options.map((option) => (
          <button
            className={option.value === value ? 'selected' : ''}
            type="button"
            role="option"
            aria-selected={option.value === value}
            key={option.value}
            onClick={() => {
              onChange(option.value);
              setOpen(false);
            }}
          >
            {option.label}
          </button>
        ))}
      </div>,
      document.body,
    )
    : null;

  return (
    <div
      className={['mes-order-dropdown', open ? 'open' : ''].filter(Boolean).join(' ')}
      ref={triggerRef}
      onBlur={(event) => {
        const nextFocusedElement = event.relatedTarget as Node | null;
        if (!event.currentTarget.contains(nextFocusedElement) && !menuRef.current?.contains(nextFocusedElement)) {
          setOpen(false);
        }
      }}
    >
      <button
        className={!selectedOption ? 'placeholder' : ''}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selectedOption?.label ?? placeholder}</span>
        <ChevronDown size={16} />
      </button>
      {dropdownMenu}
    </div>
  );
}

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
    productionFlow: productionFlowOptions[0]?.id ?? '',
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
  const tableEmptyMessage = visibleOrders.length === 0
    ? tableMessage ?? (orders.length > 0 ? 'No Production Orders match the current filters.' : null)
    : null;
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
        console.error('Unable to load MES production orders', error);
        setOrders([]);
        setSelectedOrderNumber('');
        setTableMessage(unavailableProductionOrdersMessage);
        return;
      }
      const nextOrders = ((data ?? []) as ProductionOrderRow[]).map(mapProductionOrderRow);
      setOrders(nextOrders);
      setSelectedOrderNumber(nextOrders[0]?.orderNumber ?? '');
      setTableMessage(nextOrders.length === 0 ? emptyProductionOrdersMessage : null);
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
      console.error('Unable to sync MES production order', error);
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
    if (!formState.orderNumber.trim() || !formState.partNumber.trim() || !formState.partName.trim() || !formState.assignedWorkCenter.trim()) return;
    const orderFromForm = formStateToProductionOrder(formState, formMode === 'edit' ? selectedOrder?.id : undefined);

    if (formMode === 'edit' && selectedOrder) {
      setConfirmation({
        title: 'Save production order changes?',
        message: `This will update ${selectedOrder.orderNumber} with the values currently entered in the form.`,
        confirmLabel: 'Save changes',
        tone: 'primary',
        onConfirm: async () => {
          setSavingOrder(true);
          const { error } = await supabase
            .from('mes_production_orders')
            .update(toProductionOrderPayload(orderFromForm))
            .eq('id', selectedOrder.id);
          if (error) {
            console.error('Unable to update MES production order', error);
            setTableMessage('This Production Order could not be updated right now. Try again in a moment.');
            setSavingOrder(false);
            return;
          }
          setOrders((currentOrders) => currentOrders.map((order) => (order.id === selectedOrder.id ? orderFromForm : order)));
          setSelectedOrderNumber(orderFromForm.orderNumber);
          setTableMessage(null);
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
        if (error) {
          console.error('Unable to create MES production order', error);
          setTableMessage('This Production Order could not be created right now. Try again in a moment.');
          setSavingOrder(false);
          return;
        }
        const nextOrder = mapProductionOrderRow(data as ProductionOrderRow);
        setTableMessage(null);
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
        const { error } = await supabase.from('mes_production_orders').delete().eq('id', selectedOrder.id);
        if (error) {
          console.error('Unable to delete MES production order', error);
          setTableMessage('This Production Order could not be deleted right now. Try again in a moment.');
          return;
        }
        setOrders(nextOrders);
        setSelectedOrderNumber(nextOrders[0]?.orderNumber ?? '');
        setTableMessage(nextOrders.length === 0 ? emptyProductionOrdersMessage : null);
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
                <MesOrderDropdown
                  id="production-order-status"
                  value={formState.status}
                  options={productionOrderStatuses.map((status) => ({ value: status, label: formatLabel(status) }))}
                  onChange={(status) => setFormState((current) => ({ ...current, status: status as ProductionOrderStatus }))}
                />
              </label>
              <fieldset className="mes-order-priority-field">
                <legend>Priority</legend>
                <div className="mes-priority-switch" role="radiogroup" aria-label="Production order priority">
                  {productionOrderPriorities.map((priority) => (
                    <button
                      className={[
                        'mes-priority-switch-option',
                        `priority-${priority}`,
                        formState.priority === priority ? 'active' : '',
                      ].filter(Boolean).join(' ')}
                      type="button"
                      role="radio"
                      aria-checked={formState.priority === priority}
                      key={priority}
                      onClick={() => setFormState((current) => ({ ...current, priority }))}
                    >
                      {formatLabel(priority)}
                    </button>
                  ))}
                </div>
              </fieldset>
              <label>
                Due date
                <MesOrderDatePicker
                  id="production-order-due-date"
                  value={formState.dueDate}
                  onChange={(dueDate) => setFormState((current) => ({ ...current, dueDate }))}
                />
              </label>
              <label>
                Assigned work center
                <MesOrderDropdown
                  id="production-order-work-center"
                  value={formState.assignedWorkCenter}
                  placeholder="Select work center"
                  options={mockWorkCenters.map((workCenter) => ({ value: workCenter.code, label: `${workCenter.code} - ${workCenter.name}` }))}
                  onChange={(assignedWorkCenter) => setFormState((current) => ({ ...current, assignedWorkCenter }))}
                />
              </label>
              <label className="mes-order-form-wide">
                Production flow
                <MesOrderDropdown
                  id="production-order-flow"
                  value={formState.productionFlow}
                  options={productionFlowOptions.map((flow) => ({ value: flow.id, label: flow.name }))}
                  onChange={(productionFlow) => setFormState((current) => ({ ...current, productionFlow }))}
                />
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

type WorkCenterQueueJob = {
  orderId: string;
  product: string;
  priority: ProductionOrderPriority;
  dueDate: string;
  estimatedMinutes: number;
  status: string;
};

type WorkCenterEvent = {
  timestamp: string;
  eventType: string;
  relatedOrder: string;
  operator: string;
  notes: string;
};

type MesWorkCenter = {
  id: string;
  code: string;
  name: string;
  type: string;
  plant: string;
  area: string;
  address: string;
  latitude: number;
  longitude: number;
  status: WorkCenterStatus;
  description: string;
  currentJob: string | null;
  currentOperator: string;
  currentStep: string;
  queueCount: number;
  wipCount: number;
  utilization: number;
  lastEvent: string;
  activeDowntime: boolean;
  downtimeTodayMinutes: number;
  nextAvailable: string;
  capacityMode: string;
  defaultCycleTime: string;
  unitOfMeasure: string;
  queueCapacity: number;
  wipCapacity: number;
  requiresOperator: boolean;
  bottleneckCandidate: boolean;
  maintenanceStatus: string;
  maintenanceInterval: string;
  lastMaintenanceDate: string;
  nextMaintenanceDate: string;
  maintenanceNotes: string;
  capabilities: string[];
  queue: WorkCenterQueueJob[];
  events: WorkCenterEvent[];
};

type WorkCenterStation = {
  id: string;
  code: string;
  name: string;
  type: string;
  status: WorkCenterStatus;
  currentJob: string | null;
  operator: string;
  processStep: string;
  queueCount: number;
  wipCount: number;
  utilization: number;
  dueRisk: 'low' | 'medium' | 'high';
  maintenanceStatus: string;
  capabilities: string[];
  lastEvent: string;
};

type WorkCenterFormState = {
  name: string;
  code: string;
  type: string;
  plant: string;
  area: string;
  address: string;
  latitude: string;
  longitude: string;
  description: string;
  status: WorkCenterStatus;
  capacityMode: string;
  defaultCycleTime: string;
  unitOfMeasure: string;
  queueCapacity: string;
  wipCapacity: string;
  requiresOperator: boolean;
  bottleneckCandidate: boolean;
  capabilities: string;
  maintenanceStatus: string;
  maintenanceInterval: string;
  lastMaintenanceDate: string;
  maintenanceNotes: string;
};

const workCenterTypes = ['Manufacturing Site', 'Production Area', 'Grinding Cell', 'Quality Area', 'Receiving / Shipping Center', 'External Branch'];
const stationTypes = ['Machine', 'Manual Station', 'Inspection Station', 'Assembly Cell', 'Grinding Machine', 'Packaging Station', 'Storage / Buffer', 'Resource Group'];
const workCenterStatuses: WorkCenterStatus[] = ['running', 'idle', 'setup', 'down', 'maintenance', 'offline'];
const workCenterPlants = ['Main Plant', 'Tooling Shop', 'Distribution Dock'];
const workCenterAreas = ['Receiving', 'Inspection', 'Grinding', 'Finishing', 'Quality', 'Shipping'];
const workCenterCapabilityTags = ['Hob Grinding', 'Skiving Grinding', 'Incoming Inspection', 'Final QC', 'Assembly', 'Packaging', 'Rework', 'CNC', 'Deburr'];
const maintenanceStatuses = ['Healthy', 'Due soon', 'Maintenance required', 'In maintenance'];
const plantCoordinateDefaults: Record<string, { address: string; latitude: number; longitude: number }> = {
  'Main Plant': { address: '500 Woodward Ave, Detroit, MI 48226', latitude: 42.3299, longitude: -83.0398 },
  'Tooling Shop': { address: '461 Burroughs St, Detroit, MI 48202', latitude: 42.3678, longitude: -83.0736 },
  'Distribution Dock': { address: '3400 E Lafayette St, Detroit, MI 48207', latitude: 42.3428, longitude: -83.0174 },
};

function getWorkCenterMapBounds(workCenters: MesWorkCenter[]) {
  const latitudes = workCenters.map((workCenter) => workCenter.latitude);
  const longitudes = workCenters.map((workCenter) => workCenter.longitude);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);
  const latitudePadding = Math.max(0.01, (maxLatitude - minLatitude) * 0.32);
  const longitudePadding = Math.max(0.01, (maxLongitude - minLongitude) * 0.32);

  return {
    south: minLatitude - latitudePadding,
    north: maxLatitude + latitudePadding,
    west: minLongitude - longitudePadding,
    east: maxLongitude + longitudePadding,
  };
}

function getWorkCenterPinPosition(workCenter: MesWorkCenter, bounds: ReturnType<typeof getWorkCenterMapBounds>) {
  const x = ((workCenter.longitude - bounds.west) / (bounds.east - bounds.west)) * 100;
  const y = ((bounds.north - workCenter.latitude) / (bounds.north - bounds.south)) * 100;

  return {
    x: Math.min(96, Math.max(4, x)),
    y: Math.min(96, Math.max(4, y)),
  };
}

function getWorkCenterMapPinGroups(workCenters: MesWorkCenter[], bounds: ReturnType<typeof getWorkCenterMapBounds>) {
  const overlapThreshold = 9;
  const groups: Array<{ id: string; x: number; y: number; workCenters: MesWorkCenter[] }> = [];

  workCenters.forEach((workCenter) => {
    const position = getWorkCenterPinPosition(workCenter, bounds);
    const matchingGroup = groups.find((group) => {
      const distance = Math.hypot(group.x - position.x, group.y - position.y);
      return distance < overlapThreshold;
    });

    if (matchingGroup) {
      matchingGroup.workCenters.push(workCenter);
      matchingGroup.x = matchingGroup.workCenters.reduce((total, item) => total + getWorkCenterPinPosition(item, bounds).x, 0) / matchingGroup.workCenters.length;
      matchingGroup.y = matchingGroup.workCenters.reduce((total, item) => total + getWorkCenterPinPosition(item, bounds).y, 0) / matchingGroup.workCenters.length;
      return;
    }

    groups.push({ id: workCenter.id, x: position.x, y: position.y, workCenters: [workCenter] });
  });

  return groups;
}

function getWorkCenterMapPinLayouts(workCenters: MesWorkCenter[], bounds: ReturnType<typeof getWorkCenterMapBounds>) {
  const groups = getWorkCenterMapPinGroups(workCenters, bounds);
  const labelGap = 1.6;
  const labelsOverlap = (
    candidate: { x: number; y: number; width: number; height: number },
    layout: { labelX: number; labelY: number; labelWidth: number; labelHeight: number },
  ) => !(
    candidate.x + candidate.width + labelGap < layout.labelX
    || layout.labelX + layout.labelWidth + labelGap < candidate.x
    || candidate.y + candidate.height + labelGap < layout.labelY
    || layout.labelY + layout.labelHeight + labelGap < candidate.y
  );
  const labelCoversPin = (
    candidate: { x: number; y: number; width: number; height: number },
    pin: { x: number; y: number },
  ) => (
    pin.x >= candidate.x - labelGap
    && pin.x <= candidate.x + candidate.width + labelGap
    && pin.y >= candidate.y - labelGap
    && pin.y <= candidate.y + candidate.height + labelGap
  );
  const placedLayouts: Array<{
    id: string;
    x: number;
    y: number;
    labelX: number;
    labelY: number;
    labelWidth: number;
    labelHeight: number;
    workCenters: MesWorkCenter[];
  }> = [];

  groups
    .sort((firstGroup, secondGroup) => firstGroup.y - secondGroup.y || firstGroup.x - secondGroup.x)
    .forEach((group) => {
      const labelWidth = group.workCenters.length > 1 ? 44 : 34;
      const labelHeight = Math.max(8, group.workCenters.length * 7.2);
      const clampCandidate = (candidate: { x: number; y: number }) => ({
        x: Math.min(96 - labelWidth, Math.max(4, candidate.x)),
        y: Math.min(96 - labelHeight, Math.max(4, candidate.y)),
      });
      const fitsCandidate = (candidate: { x: number; y: number }) => placedLayouts.every((layout) => !labelsOverlap({
        x: candidate.x,
        y: candidate.y,
        width: labelWidth,
        height: labelHeight,
      }, layout)) && !labelCoversPin({
        x: candidate.x,
        y: candidate.y,
        width: labelWidth,
        height: labelHeight,
      }, group);
      const candidates = [
        { x: group.x - (labelWidth / 2), y: group.y - labelHeight - 8 },
        { x: group.x + 5, y: group.y - labelHeight - 4 },
        { x: group.x - labelWidth - 5, y: group.y - labelHeight - 4 },
        { x: group.x + 5, y: group.y + 5 },
        { x: group.x - labelWidth - 5, y: group.y + 5 },
        { x: group.x - (labelWidth / 2), y: group.y + 7 },
        { x: group.x - (labelWidth / 2), y: group.y - labelHeight - 18 },
        { x: group.x + 9, y: group.y - (labelHeight / 2) },
        { x: group.x - labelWidth - 9, y: group.y - (labelHeight / 2) },
      ];

      const positionedCandidate = candidates
        .map(clampCandidate)
        .find(fitsCandidate) ?? Array.from({ length: 16 }, (_, rowIndex) => rowIndex)
          .flatMap((rowIndex) => Array.from({ length: 7 }, (_, columnIndex) => ({
            x: 4 + (columnIndex * 14),
            y: 4 + (rowIndex * 6),
          })))
          .find((candidate) => (
            candidate.x + labelWidth <= 96
            && candidate.y + labelHeight <= 96
            && fitsCandidate(candidate)
          )) ?? {
          x: Math.min(96 - labelWidth, Math.max(4, group.x - (labelWidth / 2))),
          y: Math.min(96 - labelHeight, Math.max(4, group.y - labelHeight - 8)),
        };

      placedLayouts.push({
        ...group,
        labelX: positionedCandidate.x,
        labelY: positionedCandidate.y,
        labelWidth,
        labelHeight,
      });
    });

  return placedLayouts;
}

// Future integration: Work Center capabilities should drive Production Flow allowed resources,
// Production Orders should assign queued jobs, Operator Terminal should publish live operations,
// Downtime/Production Events should update status and logs, and MES Dashboard/Traceability should
// consume queue, WIP, utilization, bottleneck, serial, lot, and event data from this model.
const mockMesWorkCenters: MesWorkCenter[] = [
  {
    id: 'wc-receiving-dock',
    code: 'WC-RCV-DOCK',
    name: 'Receiving Dock',
    type: 'Receiving / Shipping Center',
    plant: 'Main Plant',
    area: 'Receiving',
    address: '500 Woodward Ave, Detroit, MI 48226',
    latitude: 42.3299,
    longitude: -83.0398,
    status: 'idle',
    description: 'Inbound material and tooling receiving point for production intake.',
    currentJob: null,
    currentOperator: 'Unassigned',
    currentStep: 'Dock intake',
    queueCount: 3,
    wipCount: 0,
    utilization: 38,
    lastEvent: '12 min ago',
    activeDowntime: false,
    downtimeTodayMinutes: 0,
    nextAvailable: 'Available now',
    capacityMode: 'Queue based',
    defaultCycleTime: '12 min / receipt',
    unitOfMeasure: 'Receipt',
    queueCapacity: 12,
    wipCapacity: 4,
    requiresOperator: true,
    bottleneckCandidate: false,
    maintenanceStatus: 'Healthy',
    maintenanceInterval: 'Weekly 5S audit',
    lastMaintenanceDate: '2026-05-28',
    nextMaintenanceDate: '2026-06-05',
    maintenanceNotes: 'Dock scale calibrated and clear.',
    capabilities: ['Receiving', 'Packaging'],
    queue: [
      { orderId: 'PO-10491', product: 'Carbide hob blanks', priority: 'normal', dueDate: '2026-06-03', estimatedMinutes: 18, status: 'Waiting receipt' },
      { orderId: 'PO-10477', product: 'Rework return tote', priority: 'high', dueDate: '2026-06-02', estimatedMinutes: 10, status: 'Queued' },
    ],
    events: [
      { timestamp: '12 min ago', eventType: 'JOB_ASSIGNED', relatedOrder: 'PO-10491', operator: 'A. Rivera', notes: 'Inbound tote staged.' },
      { timestamp: '47 min ago', eventType: 'OPERATION_COMPLETED', relatedOrder: 'PO-10473', operator: 'A. Rivera', notes: 'Receipt closed.' },
    ],
  },
  {
    id: 'wc-incoming-inspection-01',
    code: 'WC-INSP-IN-01',
    name: 'Incoming Inspection Area',
    type: 'Quality Area',
    plant: 'Main Plant',
    area: 'Inspection',
    address: '505 Woodward Ave, Detroit, MI 48226',
    latitude: 42.3315,
    longitude: -83.0412,
    status: 'running',
    description: 'Bench inspection for inbound tooling, blanks, gauges, and customer returns.',
    currentJob: 'PO-10482',
    currentOperator: 'M. Chen',
    currentStep: 'Incoming dimensional check',
    queueCount: 4,
    wipCount: 1,
    utilization: 76,
    lastEvent: '42 sec ago',
    activeDowntime: false,
    downtimeTodayMinutes: 0,
    nextAvailable: '24 min',
    capacityMode: 'Operator paced',
    defaultCycleTime: '8 min / lot',
    unitOfMeasure: 'Lot',
    queueCapacity: 10,
    wipCapacity: 2,
    requiresOperator: true,
    bottleneckCandidate: false,
    maintenanceStatus: 'Healthy',
    maintenanceInterval: 'Monthly gauge review',
    lastMaintenanceDate: '2026-05-17',
    nextMaintenanceDate: '2026-06-17',
    maintenanceNotes: 'Gauge blocks verified.',
    capabilities: ['Incoming Inspection', 'Final QC'],
    queue: [
      { orderId: 'PO-10473', product: 'Skiving cutter inspection', priority: 'high', dueDate: '2026-06-02', estimatedMinutes: 22, status: 'Waiting inspection' },
      { orderId: 'PO-10491', product: 'Hob blank hardness check', priority: 'normal', dueDate: '2026-06-03', estimatedMinutes: 16, status: 'Queued' },
    ],
    events: [
      { timestamp: '42 sec ago', eventType: 'OPERATION_STARTED', relatedOrder: 'PO-10482', operator: 'M. Chen', notes: 'Inspection started.' },
      { timestamp: '19 min ago', eventType: 'JOB_ASSIGNED', relatedOrder: 'PO-10482', operator: 'M. Chen', notes: 'Priority moved from queue.' },
    ],
  },
  {
    id: 'wc-hob-grinder-01',
    code: 'WC-GR-HOB-01',
    name: 'Hob Grinding Cell 01',
    type: 'Grinding Cell',
    plant: 'Tooling Shop',
    area: 'Grinding',
    address: '461 Burroughs St, Detroit, MI 48202',
    latitude: 42.3678,
    longitude: -83.0736,
    status: 'setup',
    description: 'Primary hob grinding machine for standard profile and resharpen work.',
    currentJob: 'PO-10473',
    currentOperator: 'J. Patel',
    currentStep: 'Wheel dress and fixture setup',
    queueCount: 5,
    wipCount: 1,
    utilization: 64,
    lastEvent: '6 min ago',
    activeDowntime: false,
    downtimeTodayMinutes: 18,
    nextAvailable: '52 min',
    capacityMode: 'Cycle time',
    defaultCycleTime: '34 min / tool',
    unitOfMeasure: 'Tool',
    queueCapacity: 8,
    wipCapacity: 1,
    requiresOperator: true,
    bottleneckCandidate: true,
    maintenanceStatus: 'Due soon',
    maintenanceInterval: 'Every 120 spindle hours',
    lastMaintenanceDate: '2026-05-22',
    nextMaintenanceDate: '2026-06-06',
    maintenanceNotes: 'Check coolant concentration before next shift.',
    capabilities: ['Hob Grinding', 'Rework', 'CNC'],
    queue: [
      { orderId: 'PO-10482', product: 'PM hob resharpen', priority: 'expedite', dueDate: '2026-06-02', estimatedMinutes: 38, status: 'Queued' },
      { orderId: 'PO-10491', product: 'New hob grind', priority: 'normal', dueDate: '2026-06-04', estimatedMinutes: 42, status: 'Queued' },
    ],
    events: [
      { timestamp: '6 min ago', eventType: 'SETUP_STARTED', relatedOrder: 'PO-10473', operator: 'J. Patel', notes: 'Setup started for hob fixture.' },
      { timestamp: '38 min ago', eventType: 'DOWNTIME_ENDED', relatedOrder: 'PO-10473', operator: 'J. Patel', notes: 'Coolant alarm cleared.' },
    ],
  },
  {
    id: 'wc-hob-grinder-02',
    code: 'WC-GR-HOB-02',
    name: 'Hob Grinding Cell 02',
    type: 'Grinding Cell',
    plant: 'Tooling Shop',
    area: 'Grinding',
    address: '5919 Second Ave, Detroit, MI 48202',
    latitude: 42.3664,
    longitude: -83.0758,
    status: 'running',
    description: 'High-volume hob grinder used for CNC rework and standard finishing.',
    currentJob: 'PO-10482',
    currentOperator: 'S. Moreno',
    currentStep: 'Hob grinding pass 2',
    queueCount: 5,
    wipCount: 1,
    utilization: 82,
    lastEvent: '42 sec ago',
    activeDowntime: false,
    downtimeTodayMinutes: 0,
    nextAvailable: '31 min',
    capacityMode: 'Cycle time',
    defaultCycleTime: '29 min / tool',
    unitOfMeasure: 'Tool',
    queueCapacity: 8,
    wipCapacity: 1,
    requiresOperator: true,
    bottleneckCandidate: true,
    maintenanceStatus: 'Healthy',
    maintenanceInterval: 'Every 120 spindle hours',
    lastMaintenanceDate: '2026-05-26',
    nextMaintenanceDate: '2026-06-10',
    maintenanceNotes: 'Running clean after wheel change.',
    capabilities: ['Hob Grinding', 'Rework', 'CNC'],
    queue: [
      { orderId: 'PO-10491', product: 'Hob finishing', priority: 'normal', dueDate: '2026-06-03', estimatedMinutes: 31, status: 'Queued' },
      { orderId: 'PO-10477', product: 'Rework grind', priority: 'high', dueDate: '2026-06-02', estimatedMinutes: 26, status: 'Queued' },
    ],
    events: [
      { timestamp: '42 sec ago', eventType: 'OPERATION_STARTED', relatedOrder: 'PO-10482', operator: 'S. Moreno', notes: 'Second pass started.' },
      { timestamp: '21 min ago', eventType: 'SETUP_COMPLETED', relatedOrder: 'PO-10482', operator: 'S. Moreno', notes: 'Wheel offset accepted.' },
    ],
  },
  {
    id: 'wc-skiving-grinder-01',
    code: 'WC-GR-SKV-01',
    name: 'Skiving Grinding Cell',
    type: 'Grinding Cell',
    plant: 'Tooling Shop',
    area: 'Grinding',
    address: '6130 Cass Ave, Detroit, MI 48202',
    latitude: 42.3669,
    longitude: -83.0699,
    status: 'down',
    description: 'Dedicated skiving cutter grinder for profile correction and production support.',
    currentJob: 'PO-10477',
    currentOperator: 'D. Nguyen',
    currentStep: 'Troubleshooting spindle alarm',
    queueCount: 3,
    wipCount: 1,
    utilization: 18,
    lastEvent: '14 min ago',
    activeDowntime: true,
    downtimeTodayMinutes: 74,
    nextAvailable: 'Maintenance review',
    capacityMode: 'Cycle time',
    defaultCycleTime: '41 min / tool',
    unitOfMeasure: 'Tool',
    queueCapacity: 6,
    wipCapacity: 1,
    requiresOperator: true,
    bottleneckCandidate: true,
    maintenanceStatus: 'Maintenance required',
    maintenanceInterval: 'Every 90 spindle hours',
    lastMaintenanceDate: '2026-05-18',
    nextMaintenanceDate: '2026-06-02',
    maintenanceNotes: 'Spindle vibration alarm open.',
    capabilities: ['Skiving Grinding', 'Rework', 'CNC'],
    queue: [
      { orderId: 'PO-10473', product: 'Skiving cutter finish', priority: 'expedite', dueDate: '2026-06-02', estimatedMinutes: 45, status: 'Blocked' },
    ],
    events: [
      { timestamp: '14 min ago', eventType: 'DOWNTIME_STARTED', relatedOrder: 'PO-10477', operator: 'D. Nguyen', notes: 'Spindle vibration alarm.' },
      { timestamp: '53 min ago', eventType: 'OPERATION_STARTED', relatedOrder: 'PO-10477', operator: 'D. Nguyen', notes: 'Grinding operation started.' },
    ],
  },
  {
    id: 'wc-universal-grinder-01',
    code: 'WC-GR-UNI-01',
    name: 'Universal Grinding Cell',
    type: 'Grinding Cell',
    plant: 'Tooling Shop',
    area: 'Grinding',
    address: '3011 W Grand Blvd, Detroit, MI 48202',
    latitude: 42.3692,
    longitude: -83.0772,
    status: 'maintenance',
    description: 'Universal grinder for special tooling, repair work, and low-volume jobs.',
    currentJob: null,
    currentOperator: 'Maintenance',
    currentStep: 'Preventive maintenance',
    queueCount: 2,
    wipCount: 0,
    utilization: 0,
    lastEvent: '31 min ago',
    activeDowntime: true,
    downtimeTodayMinutes: 96,
    nextAvailable: 'Today 2:30 PM',
    capacityMode: 'Manual estimate',
    defaultCycleTime: '55 min / tool',
    unitOfMeasure: 'Tool',
    queueCapacity: 5,
    wipCapacity: 1,
    requiresOperator: true,
    bottleneckCandidate: false,
    maintenanceStatus: 'In maintenance',
    maintenanceInterval: 'Biweekly inspection',
    lastMaintenanceDate: '2026-06-02',
    nextMaintenanceDate: '2026-06-16',
    maintenanceNotes: 'Preventive inspection in progress.',
    capabilities: ['Rework', 'CNC'],
    queue: [
      { orderId: 'PO-10491', product: 'Special relief grind', priority: 'normal', dueDate: '2026-06-04', estimatedMinutes: 62, status: 'Waiting maintenance' },
    ],
    events: [
      { timestamp: '31 min ago', eventType: 'MAINTENANCE_REQUIRED', relatedOrder: 'N/A', operator: 'R. Stone', notes: 'Preventive maintenance started.' },
    ],
  },
  {
    id: 'wc-deburr-01',
    code: 'WC-FIN-DBR-01',
    name: 'Finishing Cell',
    type: 'Production Area',
    plant: 'Main Plant',
    area: 'Finishing',
    address: '1001 Woodward Ave, Detroit, MI 48226',
    latitude: 42.3337,
    longitude: -83.0479,
    status: 'running',
    description: 'Manual deburr and edge finishing station before profile inspection.',
    currentJob: 'PO-10491',
    currentOperator: 'L. Walker',
    currentStep: 'Manual deburr',
    queueCount: 4,
    wipCount: 2,
    utilization: 71,
    lastEvent: '4 min ago',
    activeDowntime: false,
    downtimeTodayMinutes: 0,
    nextAvailable: '18 min',
    capacityMode: 'Operator paced',
    defaultCycleTime: '14 min / tool',
    unitOfMeasure: 'Tool',
    queueCapacity: 10,
    wipCapacity: 3,
    requiresOperator: true,
    bottleneckCandidate: false,
    maintenanceStatus: 'Healthy',
    maintenanceInterval: 'Weekly bench audit',
    lastMaintenanceDate: '2026-05-29',
    nextMaintenanceDate: '2026-06-05',
    maintenanceNotes: 'Burr tools stocked.',
    capabilities: ['Deburr', 'Rework'],
    queue: [
      { orderId: 'PO-10482', product: 'Hob edge cleanup', priority: 'high', dueDate: '2026-06-02', estimatedMinutes: 18, status: 'Queued' },
    ],
    events: [
      { timestamp: '4 min ago', eventType: 'OPERATION_STARTED', relatedOrder: 'PO-10491', operator: 'L. Walker', notes: 'Deburr started.' },
    ],
  },
  {
    id: 'wc-profile-inspection',
    code: 'WC-QA-PROFILE',
    name: 'Profile Inspection Area',
    type: 'Quality Area',
    plant: 'Main Plant',
    area: 'Quality',
    address: '1 Campus Martius, Detroit, MI 48226',
    latitude: 42.3291,
    longitude: -83.0467,
    status: 'idle',
    description: 'Profile verification station for finished tooling and rework lots.',
    currentJob: null,
    currentOperator: 'Unassigned',
    currentStep: 'Ready for next inspection',
    queueCount: 1,
    wipCount: 0,
    utilization: 44,
    lastEvent: '22 min ago',
    activeDowntime: false,
    downtimeTodayMinutes: 0,
    nextAvailable: 'Available now',
    capacityMode: 'Inspection time',
    defaultCycleTime: '24 min / tool',
    unitOfMeasure: 'Tool',
    queueCapacity: 6,
    wipCapacity: 1,
    requiresOperator: true,
    bottleneckCandidate: false,
    maintenanceStatus: 'Healthy',
    maintenanceInterval: 'Monthly calibration',
    lastMaintenanceDate: '2026-05-20',
    nextMaintenanceDate: '2026-06-20',
    maintenanceNotes: 'Probe calibration current.',
    capabilities: ['Final QC', 'Incoming Inspection'],
    queue: [
      { orderId: 'PO-10473', product: 'Profile verification', priority: 'high', dueDate: '2026-06-02', estimatedMinutes: 26, status: 'Queued' },
    ],
    events: [
      { timestamp: '22 min ago', eventType: 'OPERATION_COMPLETED', relatedOrder: 'PO-10482', operator: 'M. Chen', notes: 'Profile accepted.' },
    ],
  },
  {
    id: 'wc-final-qc',
    code: 'WC-QA-FINAL',
    name: 'Final QC Area',
    type: 'Quality Area',
    plant: 'Main Plant',
    area: 'Quality',
    address: '150 W Jefferson Ave, Detroit, MI 48226',
    latitude: 42.3284,
    longitude: -83.0480,
    status: 'running',
    description: 'Final release inspection and documentation station.',
    currentJob: 'PO-10473',
    currentOperator: 'T. Brooks',
    currentStep: 'Final QC signoff',
    queueCount: 2,
    wipCount: 1,
    utilization: 69,
    lastEvent: '9 min ago',
    activeDowntime: false,
    downtimeTodayMinutes: 0,
    nextAvailable: '20 min',
    capacityMode: 'Inspection time',
    defaultCycleTime: '19 min / order',
    unitOfMeasure: 'Order',
    queueCapacity: 8,
    wipCapacity: 2,
    requiresOperator: true,
    bottleneckCandidate: false,
    maintenanceStatus: 'Healthy',
    maintenanceInterval: 'Monthly document audit',
    lastMaintenanceDate: '2026-05-21',
    nextMaintenanceDate: '2026-06-21',
    maintenanceNotes: 'Release checklist updated.',
    capabilities: ['Final QC', 'Packaging'],
    queue: [
      { orderId: 'PO-10482', product: 'Final dimensional signoff', priority: 'expedite', dueDate: '2026-06-02', estimatedMinutes: 20, status: 'Queued' },
    ],
    events: [
      { timestamp: '9 min ago', eventType: 'OPERATION_STARTED', relatedOrder: 'PO-10473', operator: 'T. Brooks', notes: 'Final QC started.' },
    ],
  },
  {
    id: 'wc-shipping-area',
    code: 'WC-SHP-AREA',
    name: 'Shipping Area',
    type: 'Receiving / Shipping Center',
    plant: 'Distribution Dock',
    area: 'Shipping',
    address: '3400 E Lafayette St, Detroit, MI 48207',
    latitude: 42.3428,
    longitude: -83.0174,
    status: 'offline',
    description: 'Packout, documentation, and customer shipment staging.',
    currentJob: null,
    currentOperator: 'Unassigned',
    currentStep: 'Shift closed',
    queueCount: 0,
    wipCount: 0,
    utilization: 0,
    lastEvent: '1 hr ago',
    activeDowntime: false,
    downtimeTodayMinutes: 0,
    nextAvailable: 'Next shift',
    capacityMode: 'Queue based',
    defaultCycleTime: '16 min / shipment',
    unitOfMeasure: 'Shipment',
    queueCapacity: 12,
    wipCapacity: 4,
    requiresOperator: true,
    bottleneckCandidate: false,
    maintenanceStatus: 'Healthy',
    maintenanceInterval: 'Weekly packing audit',
    lastMaintenanceDate: '2026-05-30',
    nextMaintenanceDate: '2026-06-06',
    maintenanceNotes: 'Packaging labels stocked.',
    capabilities: ['Packaging'],
    queue: [],
    events: [
      { timestamp: '1 hr ago', eventType: 'WORK_CENTER_STATUS_CHANGED', relatedOrder: 'N/A', operator: 'L. Walker', notes: 'Marked offline after shift close.' },
    ],
  },
];

function createWorkCenterFormState(): WorkCenterFormState {
  return {
    name: '',
    code: '',
    type: workCenterTypes[0],
    plant: workCenterPlants[0],
    area: workCenterAreas[0],
    address: plantCoordinateDefaults[workCenterPlants[0]].address,
    latitude: String(plantCoordinateDefaults[workCenterPlants[0]].latitude),
    longitude: String(plantCoordinateDefaults[workCenterPlants[0]].longitude),
    description: '',
    status: 'idle',
    capacityMode: 'Cycle time',
    defaultCycleTime: '',
    unitOfMeasure: 'Tool',
    queueCapacity: '6',
    wipCapacity: '1',
    requiresOperator: true,
    bottleneckCandidate: false,
    capabilities: '',
    maintenanceStatus: maintenanceStatuses[0],
    maintenanceInterval: '',
    lastMaintenanceDate: new Date().toISOString().slice(0, 10),
    maintenanceNotes: '',
  };
}

function getWorkCenterStations(workCenter: MesWorkCenter): WorkCenterStation[] {
  const baseStationsByArea: Record<string, Array<Pick<WorkCenterStation, 'name' | 'type' | 'capabilities' | 'processStep'>>> = {
    Receiving: [
      { name: 'Dock Intake Lane 01', type: 'Manual Station', capabilities: ['Receiving'], processStep: 'Inbound intake' },
      { name: 'Material Staging Buffer', type: 'Storage / Buffer', capabilities: ['Receiving', 'Packaging'], processStep: 'Staging' },
    ],
    Inspection: [
      { name: 'Inspection Bench 01', type: 'Inspection Station', capabilities: ['Incoming Inspection'], processStep: 'Dimensional check' },
      { name: 'Gauge Verification Desk', type: 'Inspection Station', capabilities: ['Incoming Inspection', 'Final QC'], processStep: 'Gauge verification' },
    ],
    Grinding: [
      { name: 'Primary Grinding Spindle', type: 'Grinding Machine', capabilities: workCenter.capabilities, processStep: workCenter.currentStep },
      { name: 'Wheel Dressing Station', type: 'Manual Station', capabilities: ['CNC', 'Rework'], processStep: 'Wheel prep' },
      { name: 'Coolant & Wash Station', type: 'Manual Station', capabilities: ['Rework'], processStep: 'Post-grind wash' },
    ],
    Finishing: [
      { name: 'Deburr Bench A', type: 'Manual Station', capabilities: ['Deburr', 'Rework'], processStep: 'Manual deburr' },
      { name: 'Edge Polish Bench', type: 'Manual Station', capabilities: ['Deburr'], processStep: 'Edge finishing' },
    ],
    Quality: [
      { name: 'Profile Measurement Cell', type: 'Inspection Station', capabilities: ['Final QC'], processStep: 'Profile check' },
      { name: 'Release Documentation Desk', type: 'Manual Station', capabilities: ['Final QC', 'Packaging'], processStep: 'Release package' },
    ],
    Shipping: [
      { name: 'Packout Lane 01', type: 'Packaging Station', capabilities: ['Packaging'], processStep: 'Packout' },
      { name: 'Shipment Staging Buffer', type: 'Storage / Buffer', capabilities: ['Packaging'], processStep: 'Ship staging' },
    ],
  };
  const stationTemplates = baseStationsByArea[workCenter.area] ?? baseStationsByArea.Grinding;

  return stationTemplates.map((template, index) => {
    const isPrimary = index === 0;
    const status = isPrimary ? workCenter.status : (workCenter.status === 'down' ? 'idle' : index === 1 ? 'idle' : 'maintenance') as WorkCenterStatus;
    return {
      id: `${workCenter.id}-station-${index + 1}`,
      code: `${workCenter.code}-ST${index + 1}`,
      name: template.name,
      type: template.type,
      status,
      currentJob: isPrimary ? workCenter.currentJob : null,
      operator: isPrimary ? workCenter.currentOperator : 'Unassigned',
      processStep: template.processStep,
      queueCount: Math.max(0, workCenter.queueCount - index),
      wipCount: isPrimary ? workCenter.wipCount : 0,
      utilization: Math.max(0, Math.min(100, workCenter.utilization - (index * 18))),
      dueRisk: workCenter.queueCount > 4 ? 'high' : workCenter.queueCount > 1 ? 'medium' : 'low',
      maintenanceStatus: isPrimary ? workCenter.maintenanceStatus : 'Healthy',
      capabilities: template.capabilities,
      lastEvent: isPrimary ? workCenter.lastEvent : 'No recent activity',
    };
  });
}

export function WorkCentersWorkspace({ onNavigate }: WorkspaceProps) {
  const [workCenters, setWorkCenters] = React.useState<MesWorkCenter[]>(mockMesWorkCenters);
  const [selectedWorkCenterId, setSelectedWorkCenterId] = React.useState(mockMesWorkCenters[0]?.id ?? '');
  const [filters, setFilters] = React.useState({
    search: '',
    plant: '',
    area: '',
    type: '',
    status: '',
    capability: '',
  });
  const [stationFilters, setStationFilters] = React.useState({
    search: '',
    type: '',
    status: '',
    capability: '',
  });
  const [workCenterMapOpacityMode, setWorkCenterMapOpacityMode] = React.useState(false);
  const [showAddForm, setShowAddForm] = React.useState(false);
  const [showDetailModal, setShowDetailModal] = React.useState(false);
  const [formState, setFormState] = React.useState<WorkCenterFormState>(() => createWorkCenterFormState());

  const selectedWorkCenter = workCenters.find((workCenter) => workCenter.id === selectedWorkCenterId) ?? workCenters[0] ?? null;
  const selectedStations = selectedWorkCenter ? getWorkCenterStations(selectedWorkCenter) : [];
  const filteredStations = selectedStations.filter((station) => {
    const stationHaystack = [
      station.name,
      station.code,
      station.type,
      station.currentJob ?? '',
      station.processStep,
      station.capabilities.join(' '),
    ].join(' ').toLowerCase();

    return (!stationFilters.search || stationHaystack.includes(stationFilters.search.trim().toLowerCase()))
      && (!stationFilters.type || station.type === stationFilters.type)
      && (!stationFilters.status || station.status === stationFilters.status)
      && (!stationFilters.capability || station.capabilities.includes(stationFilters.capability));
  });
  const filteredWorkCenters = workCenters.filter((workCenter) => {
    const searchHaystack = [
      workCenter.name,
      workCenter.code,
      workCenter.area,
      workCenter.type,
      workCenter.currentJob ?? '',
      workCenter.capabilities.join(' '),
    ].join(' ').toLowerCase();

    return (!filters.search || searchHaystack.includes(filters.search.trim().toLowerCase()))
      && (!filters.plant || workCenter.plant === filters.plant)
      && (!filters.area || workCenter.area === filters.area)
      && (!filters.type || workCenter.type === filters.type)
      && (!filters.status || workCenter.status === filters.status)
      && (!filters.capability || workCenter.capabilities.includes(filters.capability));
  });

  const totalWorkCenters = workCenters.length;
  const idleWorkCenters = workCenters.filter((workCenter) => ['idle', 'available'].includes(workCenter.status)).length;
  const activeJobOrders = workCenters.filter((workCenter) => workCenter.currentJob).length;
  const dueRiskWorkCenters = workCenters.filter((workCenter) => workCenter.queueCount >= 4 || workCenter.activeDowntime).length;
  const stationTotal = selectedStations.length;
  const stationRunning = selectedStations.filter((station) => station.status === 'running').length;
  const stationIdle = selectedStations.filter((station) => ['idle', 'available'].includes(station.status)).length;
  const stationDown = selectedStations.filter((station) => station.status === 'down').length;
  const stationMaintenance = selectedStations.filter((station) => station.status === 'maintenance').length;
  const mapBounds = getWorkCenterMapBounds(workCenters);
  const mapSource = `https://www.openstreetmap.org/export/embed.html?bbox=${mapBounds.west}%2C${mapBounds.south}%2C${mapBounds.east}%2C${mapBounds.north}&layer=mapnik`;
  const mapPinLayouts = getWorkCenterMapPinLayouts(workCenters, mapBounds);
  const workCenterNumberById = React.useMemo(
    () => new Map(workCenters.map((workCenter, index) => [workCenter.id, index + 1])),
    [workCenters],
  );

  const setFilter = (key: keyof typeof filters, value: string) => {
    setFilters((currentFilters) => ({ ...currentFilters, [key]: value }));
  };

  const setStationFilter = (key: keyof typeof stationFilters, value: string) => {
    setStationFilters((currentFilters) => ({ ...currentFilters, [key]: value }));
  };

  const openAddWorkCenterForm = () => {
    setFormState(createWorkCenterFormState());
    setShowAddForm(true);
  };

  const saveWorkCenterForm = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formState.name.trim() || !formState.code.trim()) return;

    // Future integration: persist Work Centers to Supabase and expose capabilities to Production Flows.
    const capabilities = formState.capabilities
      .split(',')
      .map((capability) => capability.trim())
      .filter(Boolean);
    const nextWorkCenter: MesWorkCenter = {
      id: `wc-${Date.now()}`,
      code: formState.code.trim(),
      name: formState.name.trim(),
      type: formState.type,
      plant: formState.plant,
      area: formState.area,
      address: formState.address.trim() || plantCoordinateDefaults[formState.plant]?.address || 'Address not configured',
      latitude: Number(formState.latitude) || plantCoordinateDefaults[formState.plant]?.latitude || 42.3299,
      longitude: Number(formState.longitude) || plantCoordinateDefaults[formState.plant]?.longitude || -83.0398,
      status: formState.status,
      description: formState.description.trim() || 'New Work Center ready for MES configuration.',
      currentJob: null,
      currentOperator: formState.requiresOperator ? 'Unassigned' : 'Automatic',
      currentStep: 'Ready for assignment',
      queueCount: 0,
      wipCount: 0,
      utilization: 0,
      lastEvent: 'Just now',
      activeDowntime: ['down', 'maintenance'].includes(formState.status),
      downtimeTodayMinutes: 0,
      nextAvailable: formState.status === 'idle' ? 'Available now' : 'Pending status review',
      capacityMode: formState.capacityMode,
      defaultCycleTime: formState.defaultCycleTime.trim() || 'Not configured',
      unitOfMeasure: formState.unitOfMeasure.trim() || 'Unit',
      queueCapacity: Number(formState.queueCapacity) || 0,
      wipCapacity: Number(formState.wipCapacity) || 0,
      requiresOperator: formState.requiresOperator,
      bottleneckCandidate: formState.bottleneckCandidate,
      maintenanceStatus: formState.maintenanceStatus,
      maintenanceInterval: formState.maintenanceInterval.trim() || 'Not configured',
      lastMaintenanceDate: formState.lastMaintenanceDate,
      nextMaintenanceDate: formState.lastMaintenanceDate,
      maintenanceNotes: formState.maintenanceNotes.trim() || 'No maintenance notes yet.',
      capabilities,
      queue: [],
      events: [
        {
          timestamp: 'Just now',
          eventType: 'WORK_CENTER_CREATED',
          relatedOrder: 'N/A',
          operator: 'MES Admin',
          notes: 'Work Center created from local draft form.',
        },
      ],
    };

    setWorkCenters((currentWorkCenters) => [nextWorkCenter, ...currentWorkCenters]);
    setSelectedWorkCenterId(nextWorkCenter.id);
    setShowAddForm(false);
  };

  const updateSelectedStatus = (status: WorkCenterStatus) => {
    if (!selectedWorkCenter) return;
    // Future integration: Downtime Events and Operator Terminal should own live status transitions.
    setWorkCenters((currentWorkCenters) =>
      currentWorkCenters.map((workCenter) => (
        workCenter.id === selectedWorkCenter.id
          ? {
            ...workCenter,
            status,
            activeDowntime: ['down', 'maintenance'].includes(status),
            lastEvent: 'Just now',
            events: [
              {
                timestamp: 'Just now',
                eventType: 'WORK_CENTER_STATUS_CHANGED',
                relatedOrder: workCenter.currentJob ?? 'N/A',
                operator: 'MES Admin',
                notes: `Status changed to ${formatLabel(status)}.`,
              },
              ...workCenter.events,
            ],
          }
          : workCenter
      )),
    );
  };

  return (
    <section className="mes-workspace-panel work-centers-workspace">
      <div className="work-centers-header">
        <button className="academy-back-button engineering-back-button mes-workspace-back" type="button" onClick={() => onNavigate('/workspace/manufacturing-ops/mes')}>
          <ArrowLeft size={16} />
          MES Applications
        </button>
        <div className="work-centers-heading">
          <p className="eyebrow">MES / Work Centers</p>
          <h2>Work Centers</h2>
          <p>Create, organize, and monitor manufacturing locations, work cells, branches, and the stations inside them.</p>
        </div>
        <div className="work-centers-actions">
          <button type="button" onClick={openAddWorkCenterForm}><Plus size={16} /> Add Work Center</button>
          <button type="button">Import</button>
          <button type="button">Export</button>
          <button type="button">Refresh</button>
        </div>
      </div>

      <div className="work-centers-operations-layout">
        <aside className="work-centers-location-rail">
          <section className="work-center-location-map" aria-label="Configured Work Center locations">
            <div className="work-center-map-header">
              <span>Locations</span>
              <div className="work-center-map-header-actions">
                <button
                  className={workCenterMapOpacityMode ? 'active' : ''}
                  type="button"
                  aria-label={workCenterMapOpacityMode ? 'Show solid location pins' : 'Show transparent location pins'}
                  title={workCenterMapOpacityMode ? 'Solid pins' : 'Transparent pins'}
                  onClick={() => setWorkCenterMapOpacityMode((current) => !current)}
                >
                  <Eye size={16} />
                </button>
                <strong>{workCenters.length}</strong>
              </div>
            </div>
            <div className={['work-center-map-canvas', workCenterMapOpacityMode ? 'opacity-mode' : ''].filter(Boolean).join(' ')}>
              <iframe
                title="Work Center locations map"
                src={mapSource}
                loading="lazy"
                tabIndex={-1}
                referrerPolicy="no-referrer-when-downgrade"
              />
              <svg className="work-center-map-connectors" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                {mapPinLayouts.map((layout) => {
                  const labelCenterX = layout.labelX + (layout.labelWidth / 2);
                  const labelCenterY = layout.labelY + (layout.labelHeight / 2);
                  const connectorInset = 0;
                  const pinIsHorizontal = layout.x < layout.labelX || layout.x > layout.labelX + layout.labelWidth;
                  const connectorStartX = pinIsHorizontal
                    ? (layout.x < labelCenterX ? layout.labelX + connectorInset : layout.labelX + layout.labelWidth - connectorInset)
                    : Math.min(layout.labelX + layout.labelWidth - 2, Math.max(layout.labelX + 2, layout.x));
                  const connectorStartY = pinIsHorizontal
                    ? Math.min(layout.labelY + layout.labelHeight - 2, Math.max(layout.labelY + 2, layout.y))
                    : (layout.y < labelCenterY ? layout.labelY + connectorInset : layout.labelY + layout.labelHeight - connectorInset);
                  return (
                    <React.Fragment key={layout.id}>
                      <line
                        className="work-center-map-pin-tail-outline"
                        x1={connectorStartX}
                        y1={connectorStartY}
                        x2={layout.x}
                        y2={layout.y}
                      />
                      <line
                        className="work-center-map-pin-tail"
                        x1={connectorStartX}
                        y1={connectorStartY}
                        x2={layout.x}
                        y2={layout.y}
                      />
                      <circle className="work-center-map-pin-tip" cx={layout.x} cy={layout.y} r="1.05" />
                    </React.Fragment>
                  );
                })}
              </svg>
              {mapPinLayouts.map((layout) => {
                const selected = layout.workCenters.some((workCenter) => workCenter.id === selectedWorkCenter?.id);
                const alert = layout.workCenters.some((workCenter) => workCenter.activeDowntime);
                return (
                  <div
                    className={['work-center-map-pin-table', layout.workCenters.length === 1 ? 'single' : '', selected ? 'selected' : '', alert ? 'alert' : ''].filter(Boolean).join(' ')}
                    key={layout.id}
                    style={{
                      left: `${layout.labelX}%`,
                      top: `${layout.labelY}%`,
                      width: `${layout.labelWidth}%`,
                      height: `${layout.labelHeight}%`,
                    }}
                  >
                    <div className="work-center-map-pin-table-card">
                      {layout.workCenters.map((workCenter, index) => (
                        <button
                          className={workCenter.id === selectedWorkCenter?.id ? 'selected' : ''}
                          type="button"
                          key={workCenter.id}
                          onClick={() => setSelectedWorkCenterId(workCenter.id)}
                        >
                          <span>{workCenterNumberById.get(workCenter.id) ?? index + 1}</span>
                          <strong>{workCenter.name}</strong>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="work-center-map-note">Map view auto-fits all configured Work Center pins from their saved addresses and coordinates.</p>
          </section>

          {selectedWorkCenter ? (
            <>
              <section className="work-center-selected-card">
                <p className="eyebrow">Selected Work Center</p>
                <h3>{selectedWorkCenter.name}</h3>
                <strong>{selectedWorkCenter.code}</strong>
                <span>{selectedWorkCenter.area} / {selectedWorkCenter.plant}</span>
                <small>{selectedWorkCenter.address}</small>
                <MesStatusBadge value={selectedWorkCenter.status} />
              </section>
              <section className="work-center-detail-panel" aria-label="Selected Work Center summary">
                <div className="work-center-detail-heading">
                  <div>
                    <p className="eyebrow">Details</p>
                    <h3>{selectedWorkCenter.area}</h3>
                  </div>
                  <button type="button" onClick={() => setShowDetailModal(true)}>View Details</button>
                </div>
                <dl className="work-center-detail-list">
                  <div><dt>Stations</dt><dd>{selectedStations.length}</dd></div>
                  <div><dt>Active jobs</dt><dd>{selectedStations.filter((station) => station.currentJob).length}</dd></div>
                  <div><dt>Station availability</dt><dd>{stationIdle} idle</dd></div>
                  <div><dt>WIP load</dt><dd>{selectedWorkCenter.wipCount}</dd></div>
                  <div><dt>Queue</dt><dd>{selectedWorkCenter.queueCount} jobs</dd></div>
                  <div><dt>Due risk</dt><dd>{selectedWorkCenter.queueCount >= 4 ? 'High' : selectedWorkCenter.queueCount > 1 ? 'Medium' : 'Low'}</dd></div>
                  <div><dt>Maintenance</dt><dd>{selectedWorkCenter.maintenanceStatus}</dd></div>
                  <div><dt>Last event</dt><dd>{selectedWorkCenter.lastEvent}</dd></div>
                </dl>
                <p>{selectedWorkCenter.description}</p>
                <div className="work-center-detail-tags">
                  {selectedWorkCenter.capabilities.map((capability) => <span key={capability}>{capability}</span>)}
                </div>
                <div className="work-center-quick-actions">
                  <button type="button">Assign Job</button>
                  <button type="button" onClick={() => updateSelectedStatus('setup')}>Start Setup</button>
                  <button type="button" onClick={() => updateSelectedStatus('down')}>Mark Down</button>
                  <button type="button" onClick={() => updateSelectedStatus('idle')}>Mark Available</button>
                  <button type="button">Open Downtime</button>
                  <button type="button" onClick={() => setShowDetailModal(true)}>View Events</button>
                </div>
              </section>
            </>
          ) : null}
        </aside>

        <main className="work-centers-operations-main">
          <section className="work-centers-management-panel">
            <div className="work-centers-panel-heading">
              <div>
                <p className="eyebrow">Work Centers</p>
                <h3>Locations of manufacturing, receiving, quality, and shipping operations</h3>
              </div>
              <span>{filteredWorkCenters.length} showing / {workCenters.length} total</span>
            </div>
            <div className="work-centers-kpi-grid compact">
              <article><span>Total</span><strong>{totalWorkCenters}</strong></article>
              <article><span>Station Availability</span><strong>{idleWorkCenters}</strong></article>
              <article><span>Active Job Orders</span><strong>{activeJobOrders}</strong></article>
              <article><span>WIP Load</span><strong>{workCenters.reduce((total, workCenter) => total + workCenter.wipCount, 0)}</strong></article>
              <article><span>Due Risk</span><strong>{dueRiskWorkCenters}</strong></article>
            </div>
            <div className="work-centers-filter-bar compact">
              <label>
                <span>Search</span>
                <input value={filters.search} onChange={(event) => setFilter('search', event.target.value)} placeholder="Name, code, area, type, job" />
              </label>
              <label>
                <span>Plant / Site</span>
                <MesOrderDropdown id="work-center-plant-filter" value={filters.plant} placeholder="All plants" options={[{ value: '', label: 'All plants' }, ...workCenterPlants.map((plant) => ({ value: plant, label: plant }))]} onChange={(value) => setFilter('plant', value)} />
              </label>
              <label>
                <span>Status</span>
                <MesOrderDropdown id="work-center-status-filter" value={filters.status} placeholder="All statuses" options={[{ value: '', label: 'All statuses' }, ...workCenterStatuses.map((status) => ({ value: status, label: formatLabel(status) }))]} onChange={(value) => setFilter('status', value)} />
              </label>
              <label>
                <span>Capability</span>
                <MesOrderDropdown id="work-center-capability-filter" value={filters.capability} placeholder="All capabilities" options={[{ value: '', label: 'All capabilities' }, ...workCenterCapabilityTags.map((capability) => ({ value: capability, label: capability }))]} onChange={(value) => setFilter('capability', value)} />
              </label>
            </div>
            <div className="work-centers-table" role="table" aria-label="Work Centers">
              <div className="work-centers-table-row header" role="row">
                <span>Work Center</span>
                <span>Location</span>
                <span>Stations</span>
                <span>Active Jobs</span>
                <span>WIP</span>
                <span>Risk</span>
              </div>
              {filteredWorkCenters.map((workCenter) => {
                const stations = getWorkCenterStations(workCenter);
                const selected = workCenter.id === selectedWorkCenter?.id;
                return (
                  <button
                    className={['work-centers-table-row', selected ? 'selected' : ''].filter(Boolean).join(' ')}
                    type="button"
                    role="row"
                    key={workCenter.id}
                    onClick={() => setSelectedWorkCenterId(workCenter.id)}
                  >
                    <span className="work-center-table-identity">
                      <span className="work-center-index-badge">{workCenterNumberById.get(workCenter.id)}</span>
                      <span><strong>{workCenter.name}</strong><em>{workCenter.code}</em></span>
                    </span>
                    <span>{workCenter.area} / {workCenter.plant}</span>
                    <span>{stations.length}</span>
                    <span>{stations.filter((station) => station.currentJob).length}</span>
                    <span>{workCenter.wipCount}</span>
                    <span>{workCenter.queueCount >= 4 ? 'High' : workCenter.queueCount > 1 ? 'Medium' : 'Low'}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="stations-management-panel">
            <div className="work-centers-panel-heading">
              <div>
                <p className="eyebrow">Stations</p>
                <h3>Individual machines and process steps inside {selectedWorkCenter?.name ?? 'the selected Work Center'}</h3>
              </div>
              <span>{filteredStations.length} showing / {selectedStations.length} total</span>
            </div>
            <div className="station-kpi-grid">
              <article><span>Total</span><strong>{stationTotal}</strong></article>
              <article><span>Running</span><strong>{stationRunning}</strong></article>
              <article><span>Idle</span><strong>{stationIdle}</strong></article>
              <article><span>Down</span><strong>{stationDown}</strong></article>
              <article><span>Maintenance</span><strong>{stationMaintenance}</strong></article>
            </div>
            <div className="station-filter-bar">
              <label>
                <span>Search</span>
                <input value={stationFilters.search} onChange={(event) => setStationFilter('search', event.target.value)} placeholder="Station, process, job" />
              </label>
              <label>
                <span>Type</span>
                <MesOrderDropdown id="station-type-filter" value={stationFilters.type} placeholder="All types" options={[{ value: '', label: 'All types' }, ...stationTypes.map((type) => ({ value: type, label: type }))]} onChange={(value) => setStationFilter('type', value)} />
              </label>
              <label>
                <span>Status</span>
                <MesOrderDropdown id="station-status-filter" value={stationFilters.status} placeholder="All statuses" options={[{ value: '', label: 'All statuses' }, ...workCenterStatuses.map((status) => ({ value: status, label: formatLabel(status) }))]} onChange={(value) => setStationFilter('status', value)} />
              </label>
              <label>
                <span>Capability</span>
                <MesOrderDropdown id="station-capability-filter" value={stationFilters.capability} placeholder="All capabilities" options={[{ value: '', label: 'All capabilities' }, ...workCenterCapabilityTags.map((capability) => ({ value: capability, label: capability }))]} onChange={(value) => setStationFilter('capability', value)} />
              </label>
            </div>
            <div className="station-card-grid">
              {filteredStations.map((station) => (
                <article className="station-card" key={station.id}>
                  <div className="station-card-header">
                    <div>
                      <h4>{station.name}</h4>
                      <span>{station.code}</span>
                    </div>
                    <MesStatusBadge value={station.status} />
                  </div>
                  <dl>
                    <div><dt>Type</dt><dd>{station.type}</dd></div>
                    <div><dt>Process</dt><dd>{station.processStep}</dd></div>
                    <div><dt>Current Job</dt><dd>{station.currentJob ?? 'Unassigned'}</dd></div>
                    <div><dt>Operator</dt><dd>{station.operator}</dd></div>
                    <div><dt>Queue</dt><dd>{station.queueCount}</dd></div>
                    <div><dt>WIP</dt><dd>{station.wipCount}</dd></div>
                  </dl>
                  <div className="work-center-utilization" aria-hidden="true"><span style={{ width: `${station.utilization}%` }} /></div>
                  <div className="station-card-footer">
                    <span>{station.utilization}% utilization</span>
                    <strong className={`risk-${station.dueRisk}`}>{station.dueRisk} risk</strong>
                  </div>
                  <div className="work-center-tags">
                    {station.capabilities.map((capability) => <span key={capability}>{capability}</span>)}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </main>
      </div>

      {showAddForm ? (
        <div className="mes-modal-backdrop" role="presentation">
          <section className="mes-order-modal work-center-form-modal" role="dialog" aria-modal="true" aria-labelledby="work-center-form-title">
            <div>
              <p className="eyebrow">Work Center</p>
              <h3 id="work-center-form-title">Add Work Center</h3>
            </div>
            <form className="mes-order-form" onSubmit={saveWorkCenterForm}>
              <label>Work Center Name<input value={formState.name} onChange={(event) => setFormState((current) => ({ ...current, name: event.target.value }))} required /></label>
              <label>Work Center Code<input value={formState.code} onChange={(event) => setFormState((current) => ({ ...current, code: event.target.value }))} required /></label>
              <label>Type<MesOrderDropdown id="work-center-form-type" value={formState.type} options={workCenterTypes.map((type) => ({ value: type, label: type }))} onChange={(type) => setFormState((current) => ({ ...current, type }))} /></label>
              <label>Plant / Site<MesOrderDropdown id="work-center-form-plant" value={formState.plant} options={workCenterPlants.map((plant) => ({ value: plant, label: plant }))} onChange={(plant) => setFormState((current) => ({ ...current, plant, address: plantCoordinateDefaults[plant]?.address ?? current.address, latitude: String(plantCoordinateDefaults[plant]?.latitude ?? current.latitude), longitude: String(plantCoordinateDefaults[plant]?.longitude ?? current.longitude) }))} /></label>
              <label>Area<MesOrderDropdown id="work-center-form-area" value={formState.area} options={workCenterAreas.map((area) => ({ value: area, label: area }))} onChange={(area) => setFormState((current) => ({ ...current, area }))} /></label>
              <label>Status<MesOrderDropdown id="work-center-form-status" value={formState.status} options={workCenterStatuses.map((status) => ({ value: status, label: formatLabel(status) }))} onChange={(status) => setFormState((current) => ({ ...current, status: status as WorkCenterStatus }))} /></label>
              <label className="mes-order-form-wide">Address<input value={formState.address} onChange={(event) => setFormState((current) => ({ ...current, address: event.target.value }))} placeholder="Street, city, state, country" /></label>
              <label>Latitude<input type="number" step="0.000001" value={formState.latitude} onChange={(event) => setFormState((current) => ({ ...current, latitude: event.target.value }))} /></label>
              <label>Longitude<input type="number" step="0.000001" value={formState.longitude} onChange={(event) => setFormState((current) => ({ ...current, longitude: event.target.value }))} /></label>
              <label className="mes-order-form-wide">Description<input value={formState.description} onChange={(event) => setFormState((current) => ({ ...current, description: event.target.value }))} /></label>
              <label>Capacity Mode<input value={formState.capacityMode} onChange={(event) => setFormState((current) => ({ ...current, capacityMode: event.target.value }))} /></label>
              <label>Default Cycle Time<input value={formState.defaultCycleTime} onChange={(event) => setFormState((current) => ({ ...current, defaultCycleTime: event.target.value }))} placeholder="34 min / tool" /></label>
              <label>Unit of Measure<input value={formState.unitOfMeasure} onChange={(event) => setFormState((current) => ({ ...current, unitOfMeasure: event.target.value }))} /></label>
              <label>Queue Capacity<input type="number" min="0" value={formState.queueCapacity} onChange={(event) => setFormState((current) => ({ ...current, queueCapacity: event.target.value }))} /></label>
              <label>WIP Capacity<input type="number" min="0" value={formState.wipCapacity} onChange={(event) => setFormState((current) => ({ ...current, wipCapacity: event.target.value }))} /></label>
              <label>Maintenance Status<MesOrderDropdown id="work-center-form-maintenance" value={formState.maintenanceStatus} options={maintenanceStatuses.map((status) => ({ value: status, label: status }))} onChange={(maintenanceStatus) => setFormState((current) => ({ ...current, maintenanceStatus }))} /></label>
              <label>Maintenance Interval<input value={formState.maintenanceInterval} onChange={(event) => setFormState((current) => ({ ...current, maintenanceInterval: event.target.value }))} /></label>
              <label>Last Maintenance Date<MesOrderDatePicker id="work-center-last-maintenance" value={formState.lastMaintenanceDate} onChange={(lastMaintenanceDate) => setFormState((current) => ({ ...current, lastMaintenanceDate }))} /></label>
              <label className="mes-order-form-wide">Process Tags / Compatible Steps<input value={formState.capabilities} onChange={(event) => setFormState((current) => ({ ...current, capabilities: event.target.value }))} placeholder="Hob Grinding, Rework, CNC" /></label>
              <label className="mes-order-form-wide">Maintenance Notes<input value={formState.maintenanceNotes} onChange={(event) => setFormState((current) => ({ ...current, maintenanceNotes: event.target.value }))} /></label>
              <div className="work-center-form-toggles">
                <label><input type="checkbox" checked={formState.requiresOperator} onChange={(event) => setFormState((current) => ({ ...current, requiresOperator: event.target.checked }))} /> Requires operator</label>
                <label><input type="checkbox" checked={formState.bottleneckCandidate} onChange={(event) => setFormState((current) => ({ ...current, bottleneckCandidate: event.target.checked }))} /> Bottleneck candidate</label>
              </div>
              <div className="mes-order-form-actions">
                <button type="button" onClick={() => setShowAddForm(false)}>Cancel</button>
                <button type="submit">Save Work Center</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {showDetailModal && selectedWorkCenter ? (
        <div className="mes-modal-backdrop" role="presentation">
          <section className="work-center-detail-modal" role="dialog" aria-modal="true" aria-labelledby="work-center-detail-title">
            <div className="work-center-detail-modal-header">
              <div>
                <p className="eyebrow">Work Center Detail</p>
                <h3 id="work-center-detail-title">{selectedWorkCenter.name}</h3>
                <span>{selectedWorkCenter.code} / {selectedWorkCenter.type}</span>
              </div>
              <button type="button" onClick={() => setShowDetailModal(false)}>Close</button>
            </div>
            <div className="work-center-detail-modal-grid">
              <section><h4>Overview</h4><p>{selectedWorkCenter.description}</p><dl><div><dt>Plant</dt><dd>{selectedWorkCenter.plant}</dd></div><div><dt>Area</dt><dd>{selectedWorkCenter.area}</dd></div><div><dt>Status</dt><dd>{formatLabel(selectedWorkCenter.status)}</dd></div></dl><div className="work-center-detail-tags">{selectedWorkCenter.capabilities.map((capability) => <span key={capability}>{capability}</span>)}</div></section>
              <section><h4>Live Status</h4><dl><div><dt>Current job</dt><dd>{selectedWorkCenter.currentJob ?? 'Unassigned'}</dd></div><div><dt>Operator</dt><dd>{selectedWorkCenter.currentOperator}</dd></div><div><dt>Step</dt><dd>{selectedWorkCenter.currentStep}</dd></div><div><dt>Queue / WIP</dt><dd>{selectedWorkCenter.queueCount} / {selectedWorkCenter.wipCount}</dd></div><div><dt>Last event</dt><dd>{selectedWorkCenter.lastEvent}</dd></div><div><dt>Downtime</dt><dd>{selectedWorkCenter.activeDowntime ? 'Active' : 'None active'}</dd></div></dl></section>
              <section><h4>Queue</h4>{selectedWorkCenter.queue.length > 0 ? selectedWorkCenter.queue.map((job) => <article className="work-center-list-row" key={job.orderId}><strong>{job.orderId}</strong><span>{job.product}</span><em>{formatLabel(job.priority)} / {formatDate(job.dueDate)} / {job.estimatedMinutes} min</em></article>) : <p>No queued jobs.</p>}</section>
              <section><h4>Events</h4>{selectedWorkCenter.events.map((event) => <article className="work-center-list-row" key={`${event.timestamp}-${event.eventType}`}><strong>{event.eventType}</strong><span>{event.relatedOrder} / {event.operator}</span><em>{event.timestamp} - {event.notes}</em></article>)}</section>
              <section><h4>Maintenance</h4><dl><div><dt>Status</dt><dd>{selectedWorkCenter.maintenanceStatus}</dd></div><div><dt>Last</dt><dd>{formatDate(selectedWorkCenter.lastMaintenanceDate)}</dd></div><div><dt>Next</dt><dd>{formatDate(selectedWorkCenter.nextMaintenanceDate)}</dd></div><div><dt>Today / Week</dt><dd>{selectedWorkCenter.downtimeTodayMinutes} min / {selectedWorkCenter.downtimeTodayMinutes + 42} min</dd></div></dl><p>{selectedWorkCenter.maintenanceNotes}</p></section>
            </div>
          </section>
        </div>
      ) : null}
    </section>
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
