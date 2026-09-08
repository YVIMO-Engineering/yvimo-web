import React from 'react';
import { customerPortalSupabase as supabase } from '../lib/supabaseClient';
import { useSupabaseRealtimeRefresh } from '../lib/useSupabaseRealtimeRefresh';

export type PortalNotification = {
  key: string;
  kind: 'delay' | 'scrap';
  title: string;
  orderNumber: string;
  meta: string;
  detail: string;
  at: string;
  acknowledged: boolean;
};

const feedLimit = 200;

function feedDate(value: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: '2-digit' }).format(new Date(`${value}T12:00:00`));
}

export function useCustomerPortalNotifications(organizationId: string, customerId: string, userId: string) {
  const [notifications, setNotifications] = React.useState<PortalNotification[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  const load = React.useCallback(async (silent = false) => {
    if (!organizationId || !customerId) { setNotifications([]); setLoading(false); return; }
    if (!silent) setLoading(true);
    const [orderResult, delayResult, serialResult, readResult] = await Promise.all([
      supabase.from('mes_production_orders').select('id, order_number').eq('organization_id', organizationId).eq('customer_id', customerId),
      supabase.from('mes_order_delivery_delays').select('id, production_order_id, original_due_date, new_due_date, reason, created_at').eq('organization_id', organizationId).eq('customer_id', customerId).order('created_at', { ascending: false }).limit(feedLimit),
      supabase.rpc('get_customer_portal_order_serial_details', { p_organization_id: organizationId, p_customer_id: customerId }),
      supabase.from('customer_portal_notification_reads').select('notification_key').eq('organization_id', organizationId).eq('customer_id', customerId),
    ]);
    setError((orderResult.error ?? delayResult.error ?? serialResult.error ?? readResult.error)?.message ?? '');
    const orderNumbers = new Map((orderResult.data ?? []).map((row) => [String(row.id), String(row.order_number)]));
    const acknowledged = new Set((readResult.data ?? []).map((row) => String(row.notification_key)));
    const delayEvents: PortalNotification[] = (delayResult.data ?? []).map((row) => ({
      key: `delay:${row.id}`,
      kind: 'delay' as const,
      title: 'Delivery rescheduled',
      orderNumber: orderNumbers.get(String(row.production_order_id)) ?? 'Order',
      meta: `${feedDate(String(row.original_due_date))} → ${feedDate(String(row.new_due_date))}`,
      detail: String(row.reason ?? ''),
      at: String(row.created_at),
      acknowledged: acknowledged.has(`delay:${row.id}`),
    }));
    const scrapEvents: PortalNotification[] = (serialResult.data ?? [])
      .filter((row: { result: string | null; reported_at: string | null }) => row.result === 'scrap' && row.reported_at)
      .map((row: { production_serial_id: string; production_order_id: string; serial_number: string; tool_id: string; piece_sequence: number; reported_at: string; scrap_reason: string | null; scrap_notes: string | null }) => ({
        key: `scrap:${row.production_serial_id}`,
        kind: 'scrap' as const,
        title: 'Piece scrapped',
        orderNumber: orderNumbers.get(String(row.production_order_id)) ?? 'Order',
        meta: [row.serial_number || `Piece ${row.piece_sequence}`, row.tool_id].filter(Boolean).join(' · '),
        detail: [row.scrap_reason, row.scrap_notes].filter(Boolean).join(' — ') || 'Reason not registered',
        at: String(row.reported_at),
        acknowledged: acknowledged.has(`scrap:${row.production_serial_id}`),
      }));
    setNotifications([...delayEvents, ...scrapEvents].sort((a, b) => b.at.localeCompare(a.at)).slice(0, feedLimit));
    setLoading(false);
  }, [customerId, organizationId]);

  React.useEffect(() => { void load(); }, [load]);

  const realtimeTables = React.useMemo(() => [
    { table: 'mes_order_delivery_delays', filter: `organization_id=eq.${organizationId}` },
    { table: 'mes_production_serials', filter: `organization_id=eq.${organizationId}` },
  ], [organizationId]);

  useSupabaseRealtimeRefresh({
    client: supabase,
    channelName: `customer-portal-notifications:${organizationId}:${customerId}`,
    tables: realtimeTables,
    onRefresh: () => load(true),
    enabled: Boolean(organizationId && customerId),
    debounceMs: 200,
    refreshOnFocus: true,
    pollMs: 60_000,
  });

  const acknowledge = React.useCallback(async (key: string) => {
    if (!organizationId || !customerId || !userId) return;
    setNotifications((current) => current.map((notification) => (notification.key === key ? { ...notification, acknowledged: true } : notification)));
    const { error: acknowledgeError } = await supabase.from('customer_portal_notification_reads').upsert({ user_id: userId, organization_id: organizationId, customer_id: customerId, notification_key: key }, { onConflict: 'user_id,notification_key' });
    if (!acknowledgeError) return;
    setError(acknowledgeError.message);
    setNotifications((current) => current.map((notification) => (notification.key === key ? { ...notification, acknowledged: false } : notification)));
  }, [customerId, organizationId, userId]);

  const unread = notifications.filter((notification) => !notification.acknowledged).length;

  return { notifications, unread, loading, error, acknowledge };
}
