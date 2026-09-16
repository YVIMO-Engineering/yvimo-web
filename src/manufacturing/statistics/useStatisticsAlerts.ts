import React from 'react';
import { supabase } from '../../lib/supabaseClient';
import { toLocalDateInput } from './productionStatistics';
import { buildAutomaticStatisticsAlerts, buildExpediteStatisticsAlerts, type ExpediteAlertOrder, type StatisticsAlert, type StatisticsAlertType } from './statisticsAlerts';
import { getDaysUntilDelivery, getDeliveryDistance, getElapsedHoursBetween, type DayCountMode } from '../DeliveryRiskTimeline';
import {
  buildExpediteRuleIndex,
  expediteToolIdsSelect,
  expediteToolIdsSelectWithoutStall,
  expediteToolIdsTable,
  governingExpediteRule,
  mapExpediteToolRuleRow,
  matchExpeditePiecesByOrder,
  type ExpediteSerialRow,
  type ExpediteToolRuleRow,
  type ExpediteTraceabilityRow,
} from '../expediteOrders';

// Repeated incidents of the same kind (an item below its minimum, an order overdue,
// a serial running too long) keep producing a fresh alert id on every refresh, so they
// are acknowledged by what they are about instead of by that id.
const getAlertAcknowledgementKey = (alert: StatisticsAlert) => {
  if (['inventory', 'overdue', 'overtime'].includes(alert.type)) {
    return `incident:${alert.type}:${alert.title.trim().toLowerCase()}`;
  }
  return alert.id;
};

// The production alarms, shared by every workspace that shows them. Acknowledgements
// live under the same storage key for all of them, so clearing an alarm in Statistics
// also clears it in the Production Schedule.
export function useStatisticsAlerts(organizationId: string) {
  const manualAlertsStorageKey = `yvimo:mes-statistics:manual-alerts:${organizationId}`;
  const acknowledgedAlertsStorageKey = `yvimo:mes-statistics:acknowledged-alerts:${organizationId}`;
  const today = React.useMemo(() => toLocalDateInput(new Date()), []);
  const [automaticAlerts, setAutomaticAlerts] = React.useState<StatisticsAlert[]>([]);
  const [expediteAlerts, setExpediteAlerts] = React.useState<StatisticsAlert[]>([]);
  const [manualAlerts, setManualAlerts] = React.useState<StatisticsAlert[]>(() => {
    try { return JSON.parse(window.localStorage.getItem(manualAlertsStorageKey) || '[]') as StatisticsAlert[]; } catch { return []; }
  });
  const [acknowledgedAlertIds, setAcknowledgedAlertIds] = React.useState<string[]>(() => {
    try { return JSON.parse(window.localStorage.getItem(acknowledgedAlertsStorageKey) || '[]') as string[]; } catch { return []; }
  });

  React.useEffect(() => {
    try { setManualAlerts(JSON.parse(window.localStorage.getItem(manualAlertsStorageKey) || '[]') as StatisticsAlert[]); } catch { setManualAlerts([]); }
  }, [manualAlertsStorageKey]);
  React.useEffect(() => {
    try { setAcknowledgedAlertIds(JSON.parse(window.localStorage.getItem(acknowledgedAlertsStorageKey) || '[]') as string[]); } catch { setAcknowledgedAlertIds([]); }
  }, [acknowledgedAlertsStorageKey]);

  const loadAlerts = React.useCallback(async () => {
    if (!organizationId) return;
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const [eventResponse, orderResponse, cycleResponse, inventoryResponse] = await Promise.all([
      supabase.from('mes_operator_terminal_events')
        .select('id, event_type, quantity, station_code, reason, comment, payload, created_at')
        .eq('organization_id', organizationId)
        .in('event_type', ['downtime-started', 'production-scrap', 'inventory-received', 'inventory-consumed'])
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false }),
      supabase.from('mes_production_orders')
        .select('id, order_number, client_name, status, due_date, planned_quantity')
        .eq('organization_id', organizationId)
        .eq('due_date', today)
        .not('status', 'in', '("completed","cancelled")'),
      supabase.from('mes_station_status_cycles')
        .select('id, station_code, order_number, serial_number, started_at')
        .eq('organization_id', organizationId)
        .eq('status', 'running')
        .is('ended_at', null),
      supabase.from('mes_inventory_items')
        .select('id, title, quantity, minimum_quantity, updated_at')
        .eq('organization_id', organizationId),
    ]);
    if (eventResponse.error || orderResponse.error || cycleResponse.error || inventoryResponse.error) return;
    setAutomaticAlerts(buildAutomaticStatisticsAlerts(
      (eventResponse.data ?? []) as Parameters<typeof buildAutomaticStatisticsAlerts>[0],
      (orderResponse.data ?? []) as Parameters<typeof buildAutomaticStatisticsAlerts>[1],
      (cycleResponse.data ?? []) as Parameters<typeof buildAutomaticStatisticsAlerts>[2],
      (inventoryResponse.data ?? []) as Parameters<typeof buildAutomaticStatisticsAlerts>[3],
      today,
    ));
  }, [organizationId, today]);

  // Expedite Orders raises two alarms of its own: an urgency that stopped moving, and an
  // urgency one working day from delivery. Detection reuses the same matcher the Expedite
  // Orders workspace uses, so an order already running is watched even though it never
  // went through the assignment modal.
  const loadExpediteAlerts = React.useCallback(async () => {
    if (!organizationId) return;
    const selectRules = (columns: string) => supabase
      .from(expediteToolIdsTable)
      .select(columns)
      .eq('organization_id', organizationId)
      .eq('is_active', true);
    let ruleResponse = await selectRules(expediteToolIdsSelect);
    // Migration 184 adds the stall threshold; a database still on 183 falls back to the
    // default, and one without migration 183 at all simply raises no expedite alarm.
    if (ruleResponse.error?.message?.includes('stall_alert_hours')) ruleResponse = await selectRules(expediteToolIdsSelectWithoutStall);
    if (ruleResponse.error) {
      setExpediteAlerts([]);
      return;
    }
    const rules = ((ruleResponse.data ?? []) as unknown as ExpediteToolRuleRow[]).map(mapExpediteToolRuleRow);
    const ruleIndex = buildExpediteRuleIndex(rules);
    if (!ruleIndex.size) {
      setExpediteAlerts([]);
      return;
    }
    const [settingsResponse, orderResponse] = await Promise.all([
      supabase.from('mes_order_risk_settings').select('day_count_mode').eq('organization_id', organizationId).maybeSingle(),
      supabase.from('mes_production_orders')
        .select('id, order_number, client_name, status, due_date, planned_quantity, completed_quantity, created_at, updated_at')
        .eq('organization_id', organizationId)
        .not('status', 'in', '(completed,cancelled)'),
    ]);
    if (orderResponse.error) {
      setExpediteAlerts([]);
      return;
    }
    const dayCountMode: DayCountMode = settingsResponse.data?.day_count_mode === 'business' ? 'business' : 'calendar';
    const openOrders = (orderResponse.data ?? []) as Array<{
      id: string; order_number: string; client_name: string | null; status: string; due_date: string;
      planned_quantity: number; completed_quantity: number; created_at: string | null; updated_at: string | null;
    }>;
    if (!openOrders.length) {
      setExpediteAlerts([]);
      return;
    }
    const openOrderIds = openOrders.map((order) => order.id);
    const [serialResponse, traceabilityResponse] = await Promise.all([
      supabase.from('mes_production_serials')
        .select('id, production_order_id, piece_sequence, serial_number, tool_id')
        .eq('organization_id', organizationId)
        .in('production_order_id', openOrderIds),
      supabase.from('mes_operator_terminal_traceability')
        .select('id, production_order_id, serial_number, tool_id, payload')
        .eq('organization_id', organizationId)
        .in('production_order_id', openOrderIds),
    ]);
    if (serialResponse.error) {
      setExpediteAlerts([]);
      return;
    }
    const serials = (serialResponse.data ?? []) as ExpediteSerialRow[];
    const piecesByOrder = matchExpeditePiecesByOrder(
      ruleIndex,
      serials,
      (traceabilityResponse.error ? [] : traceabilityResponse.data ?? []) as ExpediteTraceabilityRow[],
    );
    const expediteOrders = openOrders.filter((order) => piecesByOrder.has(order.id));
    if (!expediteOrders.length) {
      setExpediteAlerts([]);
      return;
    }
    // Movement is anything the shop can do to an order: a status or quantity change on the
    // order row, a shop-floor event, or a coating / delivery step on one of its serials.
    const expediteOrderIds = expediteOrders.map((order) => order.id);
    const expediteSerialIds = serials.filter((serial) => piecesByOrder.has(serial.production_order_id)).map((serial) => serial.id);
    const [eventResponse, progressResponse] = await Promise.all([
      supabase.from('mes_operator_terminal_events')
        .select('production_order_id, created_at')
        .eq('organization_id', organizationId)
        .in('production_order_id', expediteOrderIds)
        .order('created_at', { ascending: false })
        .limit(600),
      expediteSerialIds.length
        ? supabase.from('mes_customer_reception_serial_progress')
          .select('production_serial_id, updated_at')
          .eq('organization_id', organizationId)
          .in('production_serial_id', expediteSerialIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    const lastEventByOrder = new Map<string, string>();
    ((eventResponse.error ? [] : eventResponse.data ?? []) as Array<{ production_order_id: string | null; created_at: string }>)
      .forEach((event) => {
        if (!event.production_order_id || lastEventByOrder.has(event.production_order_id)) return;
        lastEventByOrder.set(event.production_order_id, event.created_at);
      });
    const orderBySerialId = new Map(serials.map((serial) => [serial.id, serial.production_order_id]));
    const lastProgressByOrder = new Map<string, string>();
    ((progressResponse.error ? [] : progressResponse.data ?? []) as Array<{ production_serial_id: string; updated_at: string | null }>)
      .forEach((progress) => {
        const orderId = orderBySerialId.get(progress.production_serial_id);
        if (!orderId || !progress.updated_at) return;
        const current = lastProgressByOrder.get(orderId);
        if (!current || progress.updated_at > current) lastProgressByOrder.set(orderId, progress.updated_at);
      });
    const now = new Date();
    const alertOrders: ExpediteAlertOrder[] = expediteOrders.map((order) => {
      const pieces = piecesByOrder.get(order.id) ?? [];
      const rule = governingExpediteRule(pieces);
      const movements: Array<{ at: string; label: string }> = [
        { at: order.updated_at ?? order.created_at ?? '', label: 'last order change' },
        { at: lastEventByOrder.get(order.id) ?? '', label: 'last shop-floor report' },
        { at: lastProgressByOrder.get(order.id) ?? '', label: 'last coating or delivery step' },
      ].filter((movement) => Boolean(movement.at));
      const latest = movements.sort((left, right) => right.at.localeCompare(left.at))[0];
      const idleHours = latest ? getElapsedHoursBetween(latest.at, now, dayCountMode) ?? 0 : 0;
      return {
        id: order.id,
        orderNumber: order.order_number,
        clientName: order.client_name ?? '',
        status: order.status,
        dueDate: order.due_date,
        plannedQuantity: Number(order.planned_quantity) || 0,
        completedQuantity: Number(order.completed_quantity) || 0,
        toolIds: [...new Set(pieces.map((piece) => piece.toolId).filter(Boolean))],
        leadTimeDays: rule?.leadTimeDays ?? 0,
        stallAlertHours: rule?.stallAlertHours ?? 0,
        lastMovementAt: latest?.at ?? '',
        lastMovementLabel: latest?.label ?? 'no movement recorded',
        idleHours,
        businessDaysLeft: getDeliveryDistance(getDaysUntilDelivery(order.due_date, now), dayCountMode, 'en'),
      };
    });
    setExpediteAlerts(buildExpediteStatisticsAlerts(alertOrders, today));
  }, [organizationId, today]);

  React.useEffect(() => {
    void loadAlerts();
    void loadExpediteAlerts();
    const intervalId = window.setInterval(() => {
      void loadAlerts();
      void loadExpediteAlerts();
    }, 30_000);
    return () => window.clearInterval(intervalId);
  }, [loadAlerts, loadExpediteAlerts]);

  const alertHistory = React.useMemo(() => {
    const byId = new Map<string, StatisticsAlert>();
    [...automaticAlerts, ...expediteAlerts, ...manualAlerts].forEach((alert) => byId.set(alert.id, alert));
    return [...byId.values()].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  }, [automaticAlerts, expediteAlerts, manualAlerts]);

  const activeAlerts = React.useMemo(() => {
    const acknowledged = new Set(acknowledgedAlertIds);
    return alertHistory.filter((alert) => !acknowledged.has(alert.id) && !acknowledged.has(getAlertAcknowledgementKey(alert)));
  }, [acknowledgedAlertIds, alertHistory]);

  const acknowledgeAlert = React.useCallback((id: string) => {
    const alert = alertHistory.find((candidate) => candidate.id === id);
    const acknowledgementKey = alert ? getAlertAcknowledgementKey(alert) : id;
    setAcknowledgedAlertIds((current) => {
      const next = [...new Set([id, acknowledgementKey, ...current])].slice(0, 500);
      window.localStorage.setItem(acknowledgedAlertsStorageKey, JSON.stringify(next));
      return next;
    });
  }, [acknowledgedAlertsStorageKey, alertHistory]);

  const acknowledgeAllAlerts = React.useCallback(() => {
    setAcknowledgedAlertIds((current) => {
      const allVisibleKeys = activeAlerts.flatMap((alert) => [alert.id, getAlertAcknowledgementKey(alert)]);
      const next = [...new Set([...allVisibleKeys, ...current])].slice(0, 500);
      window.localStorage.setItem(acknowledgedAlertsStorageKey, JSON.stringify(next));
      return next;
    });
  }, [acknowledgedAlertsStorageKey, activeAlerts]);

  const createManualAlert = React.useCallback((type: StatisticsAlertType, title: string, message: string) => {
    const nextAlert: StatisticsAlert = { id: `manual:${crypto.randomUUID()}`, type, severity: 'critical', title, message, source: 'Manual test', createdAt: new Date().toISOString() };
    setManualAlerts((current) => {
      const next = [nextAlert, ...current].slice(0, 100);
      window.localStorage.setItem(manualAlertsStorageKey, JSON.stringify(next));
      return next;
    });
  }, [manualAlertsStorageKey]);

  const reloadAlerts = React.useCallback(async () => {
    await Promise.all([loadAlerts(), loadExpediteAlerts()]);
  }, [loadAlerts, loadExpediteAlerts]);

  return { alertHistory, activeAlerts, acknowledgeAlert, acknowledgeAllAlerts, createManualAlert, reloadAlerts };
}
