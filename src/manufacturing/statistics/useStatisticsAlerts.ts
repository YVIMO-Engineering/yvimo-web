import React from 'react';
import { supabase } from '../../lib/supabaseClient';
import { toLocalDateInput } from './productionStatistics';
import { buildAutomaticStatisticsAlerts, type StatisticsAlert, type StatisticsAlertType } from './statisticsAlerts';

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

  React.useEffect(() => {
    void loadAlerts();
    const intervalId = window.setInterval(() => { void loadAlerts(); }, 30_000);
    return () => window.clearInterval(intervalId);
  }, [loadAlerts]);

  const alertHistory = React.useMemo(() => {
    const byId = new Map<string, StatisticsAlert>();
    [...automaticAlerts, ...manualAlerts].forEach((alert) => byId.set(alert.id, alert));
    return [...byId.values()].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  }, [automaticAlerts, manualAlerts]);

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

  return { alertHistory, activeAlerts, acknowledgeAlert, acknowledgeAllAlerts, createManualAlert, reloadAlerts: loadAlerts };
}
