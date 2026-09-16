export type StatisticsAlertType = 'downtime' | 'scrap' | 'inventory' | 'overdue' | 'overtime' | 'expedite-stalled' | 'expedite-due' | 'manual';
export type StatisticsAlertSeverity = 'critical' | 'warning';

export type StatisticsAlert = {
  id: string;
  type: StatisticsAlertType;
  severity: StatisticsAlertSeverity;
  title: string;
  message: string;
  source: string;
  createdAt: string;
};

type AlertEventRow = {
  id: string;
  event_type: string;
  quantity: number | null;
  station_code: string | null;
  reason: string | null;
  comment: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

type AlertOrderRow = {
  id: string;
  order_number: string;
  client_name: string | null;
  status: string;
  due_date: string;
  planned_quantity: number;
};

type AlertCycleRow = {
  id: string;
  station_code: string;
  order_number: string | null;
  serial_number: string | null;
  started_at: string;
};

type AlertInventoryRow = {
  id: string;
  title: string;
  quantity: number;
  minimum_quantity: number;
  updated_at: string;
};

const payloadNumber = (payload: Record<string, unknown> | null, key: string) => {
  const value = Number(payload?.[key]);
  return Number.isFinite(value) ? value : null;
};

const payloadText = (payload: Record<string, unknown> | null, key: string) => (
  typeof payload?.[key] === 'string' ? String(payload[key]) : ''
);

export function buildAutomaticStatisticsAlerts(
  events: AlertEventRow[],
  orders: AlertOrderRow[],
  cycles: AlertCycleRow[],
  inventoryItems: AlertInventoryRow[],
  today: string,
  now = new Date(),
): StatisticsAlert[] {
  const alerts: StatisticsAlert[] = [];
  events.forEach((event) => {
    if (event.event_type === 'downtime-started') {
      alerts.push({
        id: `downtime:${event.id}`,
        type: 'downtime',
        severity: 'critical',
        title: `Downtime registered · ${event.station_code || 'Station'}`,
        message: event.reason || event.comment || 'A station entered downtime.',
        source: 'Operator Terminal',
        createdAt: event.created_at,
      });
    }
    if (event.event_type === 'production-scrap') {
      alerts.push({
        id: `scrap:${event.id}`,
        type: 'scrap',
        severity: 'warning',
        title: `Scrap registered · ${event.station_code || 'Station'}`,
        message: `${Math.max(1, Number(event.quantity) || 1)} piece(s). ${event.reason || event.comment || 'Production scrap was reported.'}`,
        source: 'Operator Terminal',
        createdAt: event.created_at,
      });
    }
    if (event.event_type === 'inventory-consumed' || event.event_type === 'inventory-received') {
      const previous = payloadNumber(event.payload, 'previous_quantity');
      const current = payloadNumber(event.payload, 'new_quantity');
      const minimum = payloadNumber(event.payload, 'minimum_quantity');
      if (previous !== null && current !== null && minimum !== null && previous >= minimum && current < minimum) {
        const item = payloadText(event.payload, 'inventory_item_title') || 'Inventory item';
        alerts.push({
          id: `inventory:${event.id}`,
          type: 'inventory',
          severity: 'critical',
          title: `Critical inventory · ${item}`,
          message: `Stock dropped to ${current}; minimum is ${minimum}.`,
          source: 'Inventory',
          createdAt: event.created_at,
        });
      }
    }
  });
  orders.forEach((order) => {
    if (order.due_date !== today || ['completed', 'cancelled'].includes(order.status)) return;
    alerts.push({
      id: `overdue:${today}:${order.id}`,
      type: 'overdue',
      severity: 'critical',
      title: `Order at risk · ${order.order_number}`,
      message: `Due today for ${order.client_name || 'client'} and still ${order.status}. Planned quantity: ${order.planned_quantity}.`,
      source: 'Production Orders',
      createdAt: `${today}T00:00:00`,
    });
  });
  cycles.forEach((cycle) => {
    const elapsedHours = (now.getTime() - new Date(cycle.started_at).getTime()) / 3_600_000;
    if (!cycle.serial_number || elapsedHours <= 5) return;
    alerts.push({
      id: `overtime:${cycle.id}`,
      type: 'overtime',
      severity: 'critical',
      title: `Serial overtime · ${cycle.serial_number}`,
      message: `${cycle.station_code} has been running this serial for ${elapsedHours.toFixed(1)} hours${cycle.order_number ? ` on order ${cycle.order_number}` : ''}.`,
      source: 'Work Centers',
      createdAt: new Date(new Date(cycle.started_at).getTime() + 5 * 3_600_000).toISOString(),
    });
  });
  inventoryItems.forEach((item) => {
    if (Number(item.quantity) >= Number(item.minimum_quantity)) return;
    alerts.push({
      id: `inventory-current:${item.id}:${item.updated_at}`,
      type: 'inventory',
      severity: 'critical',
      title: `Critical inventory · ${item.title}`,
      message: `Current stock is ${item.quantity}; minimum is ${item.minimum_quantity}.`,
      source: 'Inventory',
      createdAt: item.updated_at,
    });
  });
  return alerts.sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

export type ExpediteAlertOrder = {
  id: string;
  orderNumber: string;
  clientName: string;
  status: string;
  dueDate: string;
  plannedQuantity: number;
  completedQuantity: number;
  toolIds: string[];
  leadTimeDays: number;
  stallAlertHours: number;
  // The most recent sign of life on this order: a status or quantity change, a shop-floor
  // event, a coating step or a delivery step. Empty when nothing has ever moved.
  lastMovementAt: string;
  lastMovementLabel: string;
  // Hours of working time since that last movement, already counted with the organization
  // day count mode so a weekend never trips the alarm.
  idleHours: number;
  // Working days left until the committed delivery date.
  businessDaysLeft: number;
};

// Two things go wrong with an urgency: it quietly stops moving, or it reaches the day
// before delivery. Both raise the same production alarm the other monitors use.
export function buildExpediteStatisticsAlerts(orders: ExpediteAlertOrder[], today: string): StatisticsAlert[] {
  const alerts: StatisticsAlert[] = [];
  orders.forEach((order) => {
    const tools = order.toolIds.join(', ');
    if (order.stallAlertHours > 0 && order.idleHours >= order.stallAlertHours) {
      alerts.push({
        // The id carries the movement it is complaining about, so the alarm comes back on
        // its own if the order moves and then stalls again.
        id: `expedite-stalled:${order.id}:${order.lastMovementAt || 'never'}`,
        type: 'expedite-stalled',
        severity: 'critical',
        title: `Expedite not moving · ${order.orderNumber}`,
        message: `${tools} for ${order.clientName || 'client'} has had no movement in ${Math.floor(order.idleHours)}h (${order.lastMovementLabel}). Still ${order.status.replaceAll('-', ' ')} at ${order.completedQuantity}/${order.plannedQuantity}, due ${order.dueDate}.`,
        source: 'Expedite Orders',
        // Stamped at the moment the threshold was crossed, not at every refresh, so the
        // alarm keeps a stable position in the slider while it stays unacknowledged.
        createdAt: order.lastMovementAt
          ? new Date(new Date(order.lastMovementAt).getTime() + order.stallAlertHours * 3_600_000).toISOString()
          : new Date().toISOString(),
      });
    }
    if (order.businessDaysLeft === 1) {
      alerts.push({
        id: `expedite-due:${today}:${order.id}`,
        type: 'expedite-due',
        severity: 'critical',
        title: `Expedite due tomorrow · ${order.orderNumber}`,
        message: `${tools} for ${order.clientName || 'client'} delivers ${order.dueDate}, one working day away. Still ${order.status.replaceAll('-', ' ')} at ${order.completedQuantity}/${order.plannedQuantity}.`,
        source: 'Expedite Orders',
        createdAt: `${today}T00:00:00`,
      });
    }
  });
  return alerts;
}
