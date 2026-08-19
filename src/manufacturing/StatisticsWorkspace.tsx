import React from 'react';
import { ArrowLeft, BarChart3, Boxes, Check, ChevronDown, ChevronLeft, ChevronRight, CircleDollarSign, Factory, FileText, PackageCheck, RefreshCw, Target, TrendingUp, Users, WalletCards, X } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useSupabaseRealtimeRefresh } from '../lib/useSupabaseRealtimeRefresh';
import { ProductionMetricCards } from './statistics/ProductionMetricCards';
import { WeeklyProductionChart } from './statistics/WeeklyProductionChart';
import { WeeklyReceptionsChart, type DailyReceptionStat } from './statistics/WeeklyReceptionsChart';
import { formatIncome, IncomeSankeyChart, type IncomeProductionRow } from './statistics/IncomeSankeyChart';
import { ManualAlertDialog, StatisticsAlertHistory, StatisticsAlertSlider } from './statistics/StatisticsAlerts';
import { MesOrderDatePicker } from './MesWorkspaces';
import { buildAutomaticStatisticsAlerts, type StatisticsAlert, type StatisticsAlertType } from './statistics/statisticsAlerts';
import {
  addDays,
  buildWeeklyProductionStats,
  getWeekRange,
  type ProductionStatisticsEvent,
  type ProductionTargetOrder,
  toLocalDateInput,
} from './statistics/productionStatistics';
import './statisticsWorkspace.css';

type StatisticsWorkspaceProps = {
  onNavigate: (path: string) => void;
  organizationId: string;
  financialIncome?: boolean;
};

type StatisticsView = 'production' | 'receptions' | 'income';
type FinancialRangePreset = 'this-month' | 'last-month' | 'this-year' | 'custom';
type ReceptionVoucherStatRow = { id: string; expected_date: string | null; created_at: string };
type StatisticsWorkCenter = { code: string; name: string };
type StatisticsTargetSetting = { work_center_code: string; daily_production_target: number; production_work_days: number[] };
type ReceptionItemStatRow = {
  reception_voucher_id: string;
  customer_id: string;
  quantity: number;
  mes_customers: { customer_name: string } | Array<{ customer_name: string }> | null;
};

const receptionClientColors = ['#2563eb', '#f97316', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4', '#eab308', '#ef4444', '#14b8a6', '#6366f1', '#84cc16', '#f43f5e'];
const productionWeekDays = [
  { value: 1, short: 'Mon', label: 'Monday' }, { value: 2, short: 'Tue', label: 'Tuesday' },
  { value: 3, short: 'Wed', label: 'Wednesday' }, { value: 4, short: 'Thu', label: 'Thursday' },
  { value: 5, short: 'Fri', label: 'Friday' }, { value: 6, short: 'Sat', label: 'Saturday' },
  { value: 7, short: 'Sun', label: 'Sunday' },
];
const defaultProductionWorkDays = [1, 2, 3, 4, 5, 6];

const getAlertAcknowledgementKey = (alert: StatisticsAlert) => {
  if (['inventory', 'overdue', 'overtime'].includes(alert.type)) {
    return `incident:${alert.type}:${alert.title.trim().toLowerCase()}`;
  }
  return alert.id;
};

export function StatisticsWorkspace({ onNavigate, organizationId, financialIncome = false }: StatisticsWorkspaceProps) {
  const workCenterStorageKey = `yvimo:mes-statistics:work-center:${organizationId}`;
  const manualAlertsStorageKey = `yvimo:mes-statistics:manual-alerts:${organizationId}`;
  const acknowledgedAlertsStorageKey = `yvimo:mes-statistics:acknowledged-alerts:${organizationId}`;
  const today = React.useMemo(() => toLocalDateInput(new Date()), []);
  const [weekAnchor, setWeekAnchor] = React.useState(today);
  const [financialPreset, setFinancialPreset] = React.useState<FinancialRangePreset>('this-month');
  const [financialRange, setFinancialRange] = React.useState(() => {
    const now = new Date(`${today}T12:00:00`);
    return {
      from: toLocalDateInput(new Date(now.getFullYear(), now.getMonth(), 1)),
      to: toLocalDateInput(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    };
  });
  const [activeView, setActiveView] = React.useState<StatisticsView>(financialIncome ? 'income' : 'production');
  const [events, setEvents] = React.useState<ProductionStatisticsEvent[]>([]);
  const [workCenters, setWorkCenters] = React.useState<StatisticsWorkCenter[]>([]);
  const [selectedWorkCenter, setSelectedWorkCenter] = React.useState(() => window.localStorage.getItem(workCenterStorageKey) || 'all');
  const [workCenterMenuOpen, setWorkCenterMenuOpen] = React.useState(false);
  const workCenterMenuRef = React.useRef<HTMLDivElement>(null);
  const [targetOrders, setTargetOrders] = React.useState<ProductionTargetOrder[]>([]);
  const [receptionVouchers, setReceptionVouchers] = React.useState<ReceptionVoucherStatRow[]>([]);
  const [receptionItems, setReceptionItems] = React.useState<ReceptionItemStatRow[]>([]);
  const [incomeRows, setIncomeRows] = React.useState<IncomeProductionRow[]>([]);
  const [selectedDate, setSelectedDate] = React.useState(today);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [lastUpdatedAt, setLastUpdatedAt] = React.useState('');
  const [dailyTarget, setDailyTarget] = React.useState(30);
  const [productionWorkDays, setProductionWorkDays] = React.useState<number[]>(defaultProductionWorkDays);
  const [targetSettings, setTargetSettings] = React.useState<StatisticsTargetSetting[]>([]);
  const [targetDialogOpen, setTargetDialogOpen] = React.useState(false);
  const [targetDraft, setTargetDraft] = React.useState('30');
  const [workDaysDraft, setWorkDaysDraft] = React.useState<number[]>(defaultProductionWorkDays);
  const [targetSaving, setTargetSaving] = React.useState(false);
  const [targetSaveError, setTargetSaveError] = React.useState('');
  const [automaticAlerts, setAutomaticAlerts] = React.useState<StatisticsAlert[]>([]);
  const [manualAlerts, setManualAlerts] = React.useState<StatisticsAlert[]>(() => {
    try { return JSON.parse(window.localStorage.getItem(manualAlertsStorageKey) || '[]') as StatisticsAlert[]; } catch { return []; }
  });
  const [manualAlertDialogOpen, setManualAlertDialogOpen] = React.useState(false);
  const [acknowledgedAlertIds, setAcknowledgedAlertIds] = React.useState<string[]>(() => {
    try { return JSON.parse(window.localStorage.getItem(acknowledgedAlertsStorageKey) || '[]') as string[]; } catch { return []; }
  });
  const weekRange = React.useMemo(() => getWeekRange(weekAnchor), [weekAnchor]);
  const analysisRange = financialIncome ? financialRange : weekRange;

  React.useEffect(() => {
    setSelectedWorkCenter(window.localStorage.getItem(workCenterStorageKey) || 'all');
  }, [workCenterStorageKey]);
  React.useEffect(() => {
    if (!workCenterMenuOpen) return;
    const closeMenu = (event: MouseEvent) => {
      if (!workCenterMenuRef.current?.contains(event.target as Node)) setWorkCenterMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setWorkCenterMenuOpen(false); };
    document.addEventListener('mousedown', closeMenu);
    document.addEventListener('keydown', closeOnEscape);
    return () => { document.removeEventListener('mousedown', closeMenu); document.removeEventListener('keydown', closeOnEscape); };
  }, [workCenterMenuOpen]);
  React.useEffect(() => {
    try { setManualAlerts(JSON.parse(window.localStorage.getItem(manualAlertsStorageKey) || '[]') as StatisticsAlert[]); } catch { setManualAlerts([]); }
  }, [manualAlertsStorageKey]);
  React.useEffect(() => {
    try { setAcknowledgedAlertIds(JSON.parse(window.localStorage.getItem(acknowledgedAlertsStorageKey) || '[]') as string[]); } catch { setAcknowledgedAlertIds([]); }
  }, [acknowledgedAlertsStorageKey]);

  const openTargetDialog = () => {
    if (selectedWorkCenter === 'all') return;
    setTargetDraft(String(dailyTarget));
    setWorkDaysDraft(productionWorkDays);
    setTargetSaveError('');
    setTargetDialogOpen(true);
  };
  const saveTarget = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextTarget = Math.max(1, Math.round(Number(targetDraft)));
    if (!Number.isFinite(nextTarget) || !workDaysDraft.length) return;
    setTargetSaving(true);
    setTargetSaveError('');
    const nextWorkDays = [...workDaysDraft].sort((left, right) => left - right);
    const { error: saveError } = await supabase.from('mes_statistics_settings').upsert({
      organization_id: organizationId,
      work_center_code: selectedWorkCenter,
      daily_production_target: nextTarget,
      production_work_days: nextWorkDays,
      updated_by: (await supabase.auth.getUser()).data.user?.id ?? null,
    }, { onConflict: 'organization_id,work_center_code' });
    setTargetSaving(false);
    if (saveError) { setTargetSaveError(saveError.message); return; }
    setDailyTarget(nextTarget);
    setProductionWorkDays(nextWorkDays);
    setTargetSettings((current) => [...current.filter((setting) => setting.work_center_code !== selectedWorkCenter), { work_center_code: selectedWorkCenter, daily_production_target: nextTarget, production_work_days: nextWorkDays }]);
    setTargetDialogOpen(false);
  };

  const loadStatistics = React.useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const rangeStart = new Date(`${analysisRange.from}T00:00:00`);
    const rangeEnd = new Date(`${analysisRange.to}T00:00:00`);
    rangeEnd.setDate(rangeEnd.getDate() + 1);
    let eventsQuery = supabase
        .from('mes_operator_terminal_events')
        .select('id, event_type, quantity, work_center_code, created_at')
        .eq('organization_id', organizationId)
        .in('event_type', ['production-good', 'production-scrap'])
        .gte('created_at', rangeStart.toISOString())
        .lt('created_at', rangeEnd.toISOString())
        .order('created_at', { ascending: true });
    let targetQuery = supabase
        .from('mes_production_orders')
        .select('planned_quantity, due_date, assigned_work_center')
        .eq('organization_id', organizationId)
        .neq('status', 'cancelled')
        .gte('due_date', analysisRange.from)
        .lte('due_date', analysisRange.to);
    if (selectedWorkCenter !== 'all') {
      eventsQuery = eventsQuery.eq('work_center_code', selectedWorkCenter);
      targetQuery = targetQuery.eq('assigned_work_center', selectedWorkCenter);
    }
    const [eventsResponse, targetResponse, receptionResponse, incomeResponse, workCentersResponse, settingsResponse] = await Promise.all([
      eventsQuery,
      targetQuery,
      supabase
        .from('mes_customer_reception_vouchers')
        .select('id, expected_date, created_at')
        .eq('organization_id', organizationId)
        .gte('expected_date', analysisRange.from)
        .lte('expected_date', analysisRange.to)
        .order('expected_date', { ascending: true }),
      supabase
        .from('mes_production_serials')
        .select('id, serial_number, production_order_id, quotation_id, reported_at, verified_quotation_price, mes_production_orders(order_number, assigned_work_center), mes_quotations(quotation_number, client_name, total_price, currency)')
        .eq('organization_id', organizationId)
        .eq('result', 'good')
        .not('quotation_id', 'is', null)
        .gte('reported_at', rangeStart.toISOString())
        .lt('reported_at', rangeEnd.toISOString())
        .order('reported_at', { ascending: true }),
      supabase.from('mes_work_centers').select('code, name').eq('organization_id', organizationId).order('name', { ascending: true }),
      supabase.from('mes_statistics_settings').select('work_center_code, daily_production_target, production_work_days').eq('organization_id', organizationId),
    ]);
    const receptionIds = (receptionResponse.data ?? []).map((voucher) => voucher.id);
    const receptionItemsResponse = receptionIds.length
      ? await supabase
        .from('mes_customer_reception_items')
        .select('reception_voucher_id, customer_id, quantity, mes_customers(customer_name)')
        .in('reception_voucher_id', receptionIds)
      : { data: [], error: null };
    // Statistics remain usable while a new deployment is between frontend and
    // database migration; saving clearly reports a missing settings table.
    const queryError = eventsResponse.error || targetResponse.error || receptionResponse.error || receptionItemsResponse.error || incomeResponse.error || workCentersResponse.error;
    if (queryError) {
      setError(queryError.message);
      if (!silent) {
        setEvents([]);
        setTargetOrders([]);
        setReceptionVouchers([]);
        setReceptionItems([]);
        setIncomeRows([]);
      }
    } else {
      setEvents((eventsResponse.data ?? []) as ProductionStatisticsEvent[]);
      setTargetOrders((targetResponse.data ?? []) as ProductionTargetOrder[]);
      setReceptionVouchers((receptionResponse.data ?? []) as ReceptionVoucherStatRow[]);
      setReceptionItems((receptionItemsResponse.data ?? []) as ReceptionItemStatRow[]);
      setIncomeRows((incomeResponse.data ?? []) as unknown as IncomeProductionRow[]);
      setWorkCenters((workCentersResponse.data ?? []) as StatisticsWorkCenter[]);
      setTargetSettings((settingsResponse.data ?? []) as StatisticsTargetSetting[]);
      setError('');
      setLastUpdatedAt(new Date().toISOString());
    }
    setLoading(false);
  }, [analysisRange.from, analysisRange.to, organizationId, selectedWorkCenter]);

  React.useEffect(() => {
    const configured = targetSettings.find((setting) => setting.work_center_code === selectedWorkCenter);
    if (selectedWorkCenter !== 'all') {
      setDailyTarget(Number(configured?.daily_production_target) || 30);
      setProductionWorkDays(configured?.production_work_days?.length ? configured.production_work_days : defaultProductionWorkDays);
      return;
    }
    const settingsByCenter = new Map(targetSettings.map((setting) => [setting.work_center_code, setting]));
    const aggregate = workCenters.map((center) => settingsByCenter.get(center.code) ?? { work_center_code: center.code, daily_production_target: 30, production_work_days: defaultProductionWorkDays });
    setDailyTarget(aggregate.reduce((sum, setting) => sum + Number(setting.daily_production_target), 0) || 30);
    setProductionWorkDays([...new Set(aggregate.flatMap((setting) => setting.production_work_days))].sort((left, right) => left - right));
  }, [selectedWorkCenter, targetSettings, workCenters]);

  const loadAlerts = React.useCallback(async () => {
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

  React.useEffect(() => { void loadStatistics(); void loadAlerts(); }, [loadAlerts, loadStatistics]);
  React.useEffect(() => {
    const intervalId = window.setInterval(() => { void loadStatistics(true); void loadAlerts(); }, 30_000);
    return () => window.clearInterval(intervalId);
  }, [loadAlerts, loadStatistics]);

  useSupabaseRealtimeRefresh({
    channelName: `mes-statistics-live:${organizationId}`,
    tables: [
      { table: 'mes_operator_terminal_events', filter: `organization_id=eq.${organizationId}` },
      { table: 'mes_production_orders', filter: `organization_id=eq.${organizationId}` },
      { table: 'mes_inventory_items', filter: `organization_id=eq.${organizationId}` },
      { table: 'mes_station_status_cycles', filter: `organization_id=eq.${organizationId}` },
      { table: 'mes_customer_reception_vouchers', filter: `organization_id=eq.${organizationId}` },
      { table: 'mes_customer_reception_items' },
      { table: 'mes_production_serials', filter: `organization_id=eq.${organizationId}` },
      { table: 'mes_quotations', filter: `organization_id=eq.${organizationId}` },
      { table: 'mes_statistics_settings', filter: `organization_id=eq.${organizationId}` },
    ],
    onRefresh: () => { void loadStatistics(true); void loadAlerts(); },
    enabled: Boolean(organizationId),
  });

  const stats = React.useMemo(
    () => buildWeeklyProductionStats(weekAnchor, events, targetOrders),
    [events, targetOrders, weekAnchor],
  );
  const weeklyProductionTarget = React.useMemo(() => {
    if (selectedWorkCenter !== 'all') return dailyTarget * productionWorkDays.length;
    const settingsByCenter = new Map(targetSettings.map((setting) => [setting.work_center_code, setting]));
    return workCenters.reduce((sum, center) => {
      const setting = settingsByCenter.get(center.code);
      return sum + (Number(setting?.daily_production_target) || 30) * (setting?.production_work_days?.length || defaultProductionWorkDays.length);
    }, 0);
  }, [dailyTarget, productionWorkDays.length, selectedWorkCenter, targetSettings, workCenters]);
  const receptionStats = React.useMemo<DailyReceptionStat[]>(() => {
    const customerIds = [...new Set(receptionItems.map((item) => item.customer_id))].sort();
    const colorByCustomer = new Map(customerIds.map((customerId, index) => [
      customerId,
      receptionClientColors[index] ?? `hsl(${Math.round(index * 137.508) % 360} 72% 48%)`,
    ]));
    const voucherById = new Map(receptionVouchers.map((voucher) => [voucher.id, voucher]));
    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(weekRange.from, index);
      const dayVouchers = receptionVouchers.filter((voucher) => voucher.expected_date === date);
      const dayVoucherIds = new Set(dayVouchers.map((voucher) => voucher.id));
      const clients = new Map<string, { customerName: string; quantity: number }>();
      receptionItems.forEach((item) => {
        if (!dayVoucherIds.has(item.reception_voucher_id) || !voucherById.has(item.reception_voucher_id)) return;
        const customer = Array.isArray(item.mes_customers) ? item.mes_customers[0] : item.mes_customers;
        const current = clients.get(item.customer_id) ?? { customerName: customer?.customer_name ?? 'Unknown client', quantity: 0 };
        current.quantity += Number(item.quantity) || 0;
        clients.set(item.customer_id, current);
      });
      const displayDate = new Date(`${date}T12:00:00`);
      const segments = [...clients.entries()].map(([customerId, client]) => ({
        customerId,
        customerName: client.customerName,
        quantity: client.quantity,
        color: colorByCustomer.get(customerId) ?? '#64748b',
      })).sort((left, right) => right.quantity - left.quantity);
      return {
        date,
        dayLabel: new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(displayDate),
        dateLabel: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(displayDate),
        isToday: date === today,
        totalPieces: segments.reduce((sum, segment) => sum + segment.quantity, 0),
        voucherCount: dayVouchers.length,
        segments,
      };
    });
  }, [receptionItems, receptionVouchers, today, weekRange.from]);
  const weeklyReceptionPieces = receptionStats.reduce((sum, day) => sum + day.totalPieces, 0);
  const weeklyReceptionVouchers = receptionStats.reduce((sum, day) => sum + day.voucherCount, 0);
  const weeklyReceptionClients = new Set(receptionStats.flatMap((day) => day.segments.map((segment) => segment.customerId))).size;
  const todayReceptionPieces = receptionStats.find((day) => day.isToday)?.totalPieces ?? 0;
  const filteredIncomeRows = React.useMemo(() => incomeRows.filter((row) => {
    if (financialIncome || selectedWorkCenter === 'all') return true;
    const order = Array.isArray(row.mes_production_orders) ? row.mes_production_orders[0] : row.mes_production_orders;
    return order?.assigned_work_center === selectedWorkCenter;
  }), [financialIncome, incomeRows, selectedWorkCenter]);
  const incomeCurrency = React.useMemo(() => {
    const currencies = filteredIncomeRows.map((row) => {
      const quotation = Array.isArray(row.mes_quotations) ? row.mes_quotations[0] : row.mes_quotations;
      return quotation?.currency || 'USD';
    });
    return currencies[0] ?? 'USD';
  }, [filteredIncomeRows]);
  const incomeSummary = React.useMemo(() => {
    let total = 0;
    let todayTotal = 0;
    const quotations = new Set<string>();
    const clients = new Set<string>();
    filteredIncomeRows.forEach((row) => {
      const quotation = Array.isArray(row.mes_quotations) ? row.mes_quotations[0] : row.mes_quotations;
      if (!quotation) return;
      const value = Math.max(0, Number(row.verified_quotation_price ?? quotation.total_price) || 0);
      total += value;
      if (toLocalDateInput(new Date(row.reported_at)) === today) todayTotal += value;
      quotations.add(row.quotation_id);
      clients.add(quotation.client_name);
    });
    return { total, todayTotal, quotations: quotations.size, clients: clients.size, pieces: filteredIncomeRows.length };
  }, [filteredIncomeRows, today]);
  const alertHistory = React.useMemo(() => {
    const byId = new Map<string, StatisticsAlert>();
    [...automaticAlerts, ...manualAlerts].forEach((alert) => byId.set(alert.id, alert));
    return [...byId.values()].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  }, [automaticAlerts, manualAlerts]);
  const activeAlerts = React.useMemo(() => {
    const acknowledged = new Set(acknowledgedAlertIds);
    return alertHistory.filter((alert) => !acknowledged.has(alert.id) && !acknowledged.has(getAlertAcknowledgementKey(alert)));
  }, [acknowledgedAlertIds, alertHistory]);
  const acknowledgeAlert = (id: string) => {
    const alert = alertHistory.find((candidate) => candidate.id === id);
    const acknowledgementKey = alert ? getAlertAcknowledgementKey(alert) : id;
    setAcknowledgedAlertIds((current) => {
      const next = [...new Set([id, acknowledgementKey, ...current])].slice(0, 500);
      window.localStorage.setItem(acknowledgedAlertsStorageKey, JSON.stringify(next));
      return next;
    });
  };
  const createManualAlert = (type: StatisticsAlertType, title: string, message: string) => {
    const nextAlert: StatisticsAlert = { id: `manual:${crypto.randomUUID()}`, type, severity: 'critical', title, message, source: 'Manual test', createdAt: new Date().toISOString() };
    setManualAlerts((current) => {
      const next = [nextAlert, ...current].slice(0, 100);
      window.localStorage.setItem(manualAlertsStorageKey, JSON.stringify(next));
      return next;
    });
    setManualAlertDialogOpen(false);
  };
  React.useEffect(() => {
    if (selectedDate >= weekRange.from && selectedDate <= weekRange.to) return;
    setSelectedDate(today >= weekRange.from && today <= weekRange.to ? today : weekRange.from);
  }, [selectedDate, today, weekRange.from, weekRange.to]);

  const moveWeek = (weeks: number) => setWeekAnchor((current) => addDays(current, weeks * 7));
  const formatRangeDate = (value: string, includeYear = false) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', ...(includeYear ? { year: 'numeric' as const } : {}) }).format(new Date(`${value}T12:00:00`));
  const weekLabel = `${formatRangeDate(analysisRange.from)} — ${formatRangeDate(analysisRange.to, true)}`;
  const setFinancialQuickRange = (preset: Exclude<FinancialRangePreset, 'custom'>) => {
    const now = new Date(`${today}T12:00:00`);
    const range = preset === 'this-month'
      ? { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now.getFullYear(), now.getMonth() + 1, 0) }
      : preset === 'last-month'
        ? { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: new Date(now.getFullYear(), now.getMonth(), 0) }
        : { from: new Date(now.getFullYear(), 0, 1), to: new Date(now.getFullYear(), 11, 31) };
    setFinancialPreset(preset);
    setFinancialRange({ from: toLocalDateInput(range.from), to: toLocalDateInput(range.to) });
  };

  return (
    <section className={`mes-workspace-panel statistics-workspace${financialIncome ? ' financial-income-workspace' : ''}`}>
      {!financialIncome && activeAlerts.length ? (
        <div className="statistics-alert-overlay" key={activeAlerts[0].id}>
          <StatisticsAlertSlider alerts={activeAlerts} onAcknowledge={acknowledgeAlert} />
        </div>
      ) : null}
      <div className="statistics-content">
        <section className="statistics-filter-bar">
          <button className="academy-back-button engineering-back-button mes-workspace-back statistics-back" type="button" onClick={() => onNavigate(financialIncome ? '/workspace/manufacturing-ops/intelligence' : '/workspace/manufacturing-ops/mes')}>
            <ArrowLeft size={16} /> {financialIncome ? 'Ops Intelligence' : 'MES Applications'}
          </button>
          <div className="statistics-compact-heading">
            <p className="eyebrow">{financialIncome ? 'OPS INTELLIGENCE / FINANCE' : 'MES / Statistics'}</p>
            <h2>{financialIncome ? 'Income Flow' : 'Statistics'}</h2>
            <span>{activeView === 'production' ? 'Live weekly production overview' : activeView === 'receptions' ? 'Live weekly reception overview' : financialIncome ? 'Live income overview by selected period' : 'Live weekly income overview'}</span>
          </div>
          {financialIncome ? <div className="statistics-financial-period-tabs">
            <button type="button" className={financialPreset === 'this-month' ? 'active' : ''} onClick={() => setFinancialQuickRange('this-month')}>This Month</button>
            <button type="button" className={financialPreset === 'last-month' ? 'active' : ''} onClick={() => setFinancialQuickRange('last-month')}>Last Month</button>
            <button type="button" className={financialPreset === 'this-year' ? 'active' : ''} onClick={() => setFinancialQuickRange('this-year')}>This Year</button>
            <button type="button" className={financialPreset === 'custom' ? 'active' : ''} onClick={() => setFinancialPreset('custom')}>Custom</button>
          </div> : <label className="statistics-week-picker"><span>Week containing</span><input type="date" value={weekAnchor} onChange={(event) => setWeekAnchor(event.target.value || today)} /></label>}
          {financialIncome ? <>
            <label className="statistics-financial-date"><span>From</span><MesOrderDatePicker id="financial-income-date-from" value={financialRange.from} onChange={(from) => { setFinancialPreset('custom'); setFinancialRange((current) => ({ ...current, from })); }} onQuickRange={(range) => { setFinancialPreset('custom'); setFinancialRange(range); }} /></label>
            <label className="statistics-financial-date"><span>To</span><MesOrderDatePicker id="financial-income-date-to" value={financialRange.to} onChange={(to) => { setFinancialPreset('custom'); setFinancialRange((current) => ({ ...current, to })); }} onQuickRange={(range) => { setFinancialPreset('custom'); setFinancialRange(range); }} /></label>
          </> : <div className="statistics-week-navigation">
            <button type="button" aria-label="Previous week" onClick={() => moveWeek(-1)}><ChevronLeft size={16} /></button>
            <strong>{weekLabel}</strong>
            <button type="button" aria-label="Next week" onClick={() => moveWeek(1)}><ChevronRight size={16} /></button>
          </div>}
          {!financialIncome ? <button type="button" className="statistics-this-week" onClick={() => setWeekAnchor(today)}>This Week</button> : null}
          <button className="statistics-refresh" type="button" disabled={loading} onClick={() => { void loadStatistics(); void loadAlerts(); }}><RefreshCw size={16} className={loading ? 'spinning' : ''} /> Refresh</button>
          {!financialIncome ? <nav className="statistics-view-tabs" aria-label="Statistics view">
            <button type="button" className={activeView === 'production' ? 'active' : ''} aria-pressed={activeView === 'production'} onClick={() => setActiveView('production')}><BarChart3 size={16} /> Production</button>
            <button type="button" className={activeView === 'receptions' ? 'active' : ''} aria-pressed={activeView === 'receptions'} onClick={() => setActiveView('receptions')}><PackageCheck size={16} /> Receptions</button>
            <button type="button" className={activeView === 'income' ? 'active income' : 'income'} aria-pressed={activeView === 'income'} onClick={() => setActiveView('income')}><CircleDollarSign size={16} /> Income</button>
          </nav> : null}
          <div className="statistics-live-state"><span><i /> Live {activeView}</span><small>{lastUpdatedAt ? `Updated ${new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(new Date(lastUpdatedAt))}` : 'Connecting'}</small></div>
        </section>

        {activeView === 'production' ? (
          <>
            <ProductionMetricCards stats={stats} dailyTarget={dailyTarget} weeklyTarget={weeklyProductionTarget} weeklyTargetDetail={selectedWorkCenter === 'all' ? `combined target for ${workCenters.length} work centers` : `${dailyTarget} pieces × ${productionWorkDays.length} days`} workCenterSelector={(
              <div className="statistics-workcenter-card">
                <Factory size={24} strokeWidth={2.2} />
                <span><small>Work center</small><div className={`statistics-workcenter-dropdown${workCenterMenuOpen ? ' open' : ''}`} ref={workCenterMenuRef}><button type="button" aria-haspopup="listbox" aria-expanded={workCenterMenuOpen} onClick={() => setWorkCenterMenuOpen((open) => !open)}><span>{selectedWorkCenter === 'all' ? 'All work centers' : workCenters.find((center) => center.code === selectedWorkCenter)?.name ?? selectedWorkCenter}</span><ChevronDown size={15} /></button>{workCenterMenuOpen ? <div className="statistics-workcenter-menu" role="listbox">{[{ code: 'all', name: 'All work centers' }, ...workCenters].map((center) => <button type="button" role="option" aria-selected={selectedWorkCenter === center.code} key={center.code} onClick={() => { setSelectedWorkCenter(center.code); window.localStorage.setItem(workCenterStorageKey, center.code); setWorkCenterMenuOpen(false); }}><span>{center.name}{center.code !== 'all' ? <small>{center.code}</small> : null}</span>{selectedWorkCenter === center.code ? <Check size={15} /> : null}</button>)}</div> : null}</div></span>
              </div>
            )} />
            <section className="statistics-production-panel">
              <div className="statistics-production-heading">
                <div><span className="statistics-heading-icon"><BarChart3 size={22} /></span><span><small>Weekly production trend</small><h3>{weekLabel}</h3></span></div>
                <div className="statistics-chart-key"><span className="actual"><i /> Production</span><span className="target"><i /> Daily target · {dailyTarget}</span><span className="trend"><i /> Production trend</span></div>
              </div>
              {error ? <div className="statistics-message error" role="alert">{error}</div> : null}
              {loading && !events.length ? <div className="statistics-chart-loading">Loading weekly production...</div> : <WeeklyProductionChart stats={stats} selectedDate={selectedDate} dailyTarget={dailyTarget} canEditTarget={selectedWorkCenter !== 'all'} onSelectDate={setSelectedDate} onEditTarget={openTargetDialog} />}
              <footer className="statistics-chart-footer">
                <span>{selectedWorkCenter === 'all' ? `Combined weekly target: ${weeklyProductionTarget} pieces across ${workCenters.length} work centers.` : `Daily target is ${dailyTarget} pieces for ${selectedWorkCenter} (${weeklyProductionTarget} per week).`}</span>
                <em>Live updates every 30 seconds and when shop-floor events arrive.</em>
              </footer>
            </section>
          </>
        ) : activeView === 'receptions' ? (
          <>
            <div className="statistics-metric-cards statistics-reception-metrics">
              <article><Boxes size={25} /><span><small>Weekly received</small><strong>{weeklyReceptionPieces}</strong><em>pieces across all clients</em></span></article>
              <article className="blue"><PackageCheck size={25} /><span><small>Reception vouchers</small><strong>{weeklyReceptionVouchers}</strong><em>registered this week</em></span></article>
              <article className="green"><Users size={25} /><span><small>Clients received</small><strong>{weeklyReceptionClients}</strong><em>unique clients this week</em></span></article>
              <article><PackageCheck size={25} /><span><small>Received today</small><strong>{todayReceptionPieces}</strong><em>pieces received today</em></span></article>
            </div>
            <section className="statistics-production-panel statistics-receptions-panel">
              <div className="statistics-production-heading">
                <div><span className="statistics-heading-icon reception"><Boxes size={22} /></span><span><small>Weekly receptions by client</small><h3>{weekLabel}</h3></span></div>
                <div className="statistics-chart-key">
                  <span className="reception-stack"><i /> Received pieces by client</span>
                  <span className="reception-trend"><i /> Client trend</span>
                </div>
              </div>
              {error ? <div className="statistics-message error" role="alert">{error}</div> : null}
              {loading && !receptionVouchers.length ? <div className="statistics-chart-loading">Loading weekly receptions...</div> : <WeeklyReceptionsChart stats={receptionStats} selectedDate={selectedDate} onSelectDate={setSelectedDate} />}
              <footer className="statistics-chart-footer">
                <span>Bars show received pieces by client; matching lines connect each client's next reception, even across inactive days.</span>
                <em>Live updates every 30 seconds and when reception vouchers change.</em>
              </footer>
            </section>
          </>
        ) : (
          <>
            <div className="statistics-metric-cards statistics-income-metrics">
              <article className="green"><CircleDollarSign size={25} /><span><small>{financialIncome ? 'Period income' : 'Weekly income'}</small><strong>{formatIncome(incomeSummary.total, incomeCurrency)}</strong><em>from {incomeSummary.pieces} produced pieces</em></span></article>
              <article className="green"><TrendingUp size={25} /><span><small>Income today</small><strong>{formatIncome(incomeSummary.todayTotal, incomeCurrency)}</strong><em>recognized as pieces are produced</em></span></article>
              <article className="green"><FileText size={25} /><span><small>Source quotations</small><strong>{incomeSummary.quotations}</strong><em>linked quotations {financialIncome ? 'in this period' : 'this week'}</em></span></article>
              <article className="green"><WalletCards size={25} /><span><small>Income clients</small><strong>{incomeSummary.clients}</strong><em>revenue-generating clients</em></span></article>
            </div>
            <section className="statistics-production-panel statistics-income-panel">
              <div className="statistics-production-heading">
                <div><span className="statistics-heading-icon income"><CircleDollarSign size={22} /></span><span><small>{financialIncome ? 'Realized income flow' : 'Weekly realized income flow'}</small><h3>{weekLabel}</h3></span></div>
                <div className="statistics-chart-key"><span className="income-flow"><i /> Income value</span><span>Client → Quotation → Production order</span></div>
              </div>
              {error ? <div className="statistics-message error" role="alert">{error}</div> : null}
              {loading && !filteredIncomeRows.length ? <div className="statistics-chart-loading">Loading weekly income...</div> : <IncomeSankeyChart rows={filteredIncomeRows} currency={incomeCurrency} />}
              <footer className="statistics-chart-footer">
                <span>Income is recognized when a good serialized piece linked to a quotation is reported.</span>
                <em>Live updates every 30 seconds and when production or quotations change.</em>
              </footer>
            </section>
          </>
        )}
        {!financialIncome ? <StatisticsAlertHistory alerts={alertHistory} onOpenManual={() => setManualAlertDialogOpen(true)} /> : null}
      </div>
      {!financialIncome && targetDialogOpen ? (
        <div className="statistics-target-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setTargetDialogOpen(false); }}>
          <form className="statistics-target-modal" onSubmit={saveTarget}>
            <button className="statistics-target-modal-close" type="button" aria-label="Close" onClick={() => setTargetDialogOpen(false)}><X size={20} /></button>
            <span className="statistics-target-modal-icon"><Target size={24} /></span>
            <p className="eyebrow">Production target</p>
            <h3>Change target · {workCenters.find((center) => center.code === selectedWorkCenter)?.name ?? selectedWorkCenter}</h3>
            <p>Set the organization-wide production target and the days that count toward the weekly goal.</p>
            <label className="statistics-target-quantity"><span>Pieces per day</span><input type="number" min="1" step="1" autoFocus value={targetDraft} onChange={(event) => setTargetDraft(event.target.value)} /></label>
            <fieldset className="statistics-target-days"><legend>Days included in weekly target</legend><div>{productionWeekDays.map((day) => { const checked = workDaysDraft.includes(day.value); return <label className={checked ? 'checked' : ''} key={day.value}><input type="checkbox" checked={checked} onChange={() => setWorkDaysDraft((current) => checked ? current.filter((value) => value !== day.value) : [...current, day.value])} /><span><Check size={15} /><b>{day.short}</b><small>{day.label}</small></span></label>; })}</div><p>{workDaysDraft.length ? `${Number(targetDraft) || 0} × ${workDaysDraft.length} days = ${(Number(targetDraft) || 0) * workDaysDraft.length} pieces per week` : 'Select at least one work day.'}</p></fieldset>
            {targetSaveError ? <p className="statistics-target-save-error" role="alert">{targetSaveError}</p> : null}
            <div className="statistics-target-actions"><button type="button" disabled={targetSaving} onClick={() => setTargetDialogOpen(false)}>Cancel</button><button type="submit" disabled={targetSaving || !workDaysDraft.length}>{targetSaving ? 'Saving...' : 'Save target'}</button></div>
          </form>
        </div>
      ) : null}
      {!financialIncome && manualAlertDialogOpen ? <ManualAlertDialog onClose={() => setManualAlertDialogOpen(false)} onCreate={createManualAlert} /> : null}
    </section>
  );
}
