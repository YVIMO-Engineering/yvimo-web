export type StatisticsAlertType = 'downtime' | 'scrap' | 'inventory' | 'overdue' | 'overtime' | 'manual';
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
