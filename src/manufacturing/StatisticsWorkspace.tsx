import React from 'react';
import { ArrowLeft, BarChart3, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useSupabaseRealtimeRefresh } from '../lib/useSupabaseRealtimeRefresh';
import { ProductionMetricCards } from './statistics/ProductionMetricCards';
import { WeeklyProductionChart } from './statistics/WeeklyProductionChart';
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
};

export function StatisticsWorkspace({ onNavigate, organizationId }: StatisticsWorkspaceProps) {
  const today = React.useMemo(() => toLocalDateInput(new Date()), []);
  const [weekAnchor, setWeekAnchor] = React.useState(today);
  const [events, setEvents] = React.useState<ProductionStatisticsEvent[]>([]);
  const [targetOrders, setTargetOrders] = React.useState<ProductionTargetOrder[]>([]);
  const [selectedDate, setSelectedDate] = React.useState(today);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [lastUpdatedAt, setLastUpdatedAt] = React.useState('');
  const weekRange = React.useMemo(() => getWeekRange(weekAnchor), [weekAnchor]);

  const loadStatistics = React.useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const rangeStart = new Date(`${weekRange.from}T00:00:00`);
    const rangeEnd = new Date(`${weekRange.to}T00:00:00`);
    rangeEnd.setDate(rangeEnd.getDate() + 1);
    const [eventsResponse, targetResponse] = await Promise.all([
      supabase
        .from('mes_operator_terminal_events')
        .select('id, event_type, quantity, created_at')
        .eq('organization_id', organizationId)
        .in('event_type', ['production-good', 'production-scrap'])
        .gte('created_at', rangeStart.toISOString())
        .lt('created_at', rangeEnd.toISOString())
        .order('created_at', { ascending: true }),
      supabase
        .from('mes_production_orders')
        .select('planned_quantity, due_date')
        .eq('organization_id', organizationId)
        .neq('status', 'cancelled')
        .gte('due_date', weekRange.from)
        .lte('due_date', weekRange.to),
    ]);
    const queryError = eventsResponse.error || targetResponse.error;
    if (queryError) {
      setError(queryError.message);
      if (!silent) {
        setEvents([]);
        setTargetOrders([]);
      }
    } else {
      setEvents((eventsResponse.data ?? []) as ProductionStatisticsEvent[]);
      setTargetOrders((targetResponse.data ?? []) as ProductionTargetOrder[]);
      setError('');
      setLastUpdatedAt(new Date().toISOString());
    }
    setLoading(false);
  }, [organizationId, weekRange.from, weekRange.to]);

  React.useEffect(() => { void loadStatistics(); }, [loadStatistics]);
  React.useEffect(() => {
    const intervalId = window.setInterval(() => void loadStatistics(true), 30_000);
    return () => window.clearInterval(intervalId);
  }, [loadStatistics]);

  useSupabaseRealtimeRefresh({
    channelName: `mes-statistics-live:${organizationId}`,
    tables: [
      { table: 'mes_operator_terminal_events', filter: `organization_id=eq.${organizationId}` },
      { table: 'mes_production_orders', filter: `organization_id=eq.${organizationId}` },
    ],
    onRefresh: () => loadStatistics(true),
    enabled: Boolean(organizationId),
  });

  const stats = React.useMemo(
    () => buildWeeklyProductionStats(weekAnchor, events, targetOrders),
    [events, targetOrders, weekAnchor],
  );
  React.useEffect(() => {
    if (selectedDate >= weekRange.from && selectedDate <= weekRange.to) return;
    setSelectedDate(today >= weekRange.from && today <= weekRange.to ? today : weekRange.from);
  }, [selectedDate, today, weekRange.from, weekRange.to]);

  const moveWeek = (weeks: number) => setWeekAnchor((current) => addDays(current, weeks * 7));
  const weekLabel = `${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(`${weekRange.from}T12:00:00`))} — ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${weekRange.to}T12:00:00`))}`;

  return (
    <section className="mes-workspace-panel statistics-workspace">
      <div className="statistics-content">
        <section className="statistics-filter-bar">
          <button className="academy-back-button engineering-back-button mes-workspace-back statistics-back" type="button" onClick={() => onNavigate('/workspace/manufacturing-ops/mes')}>
            <ArrowLeft size={16} /> MES Applications
          </button>
          <div className="statistics-compact-heading">
            <p className="eyebrow">MES / Statistics</p>
            <h2>Statistics</h2>
            <span>Live weekly production overview</span>
          </div>
          <label className="statistics-week-picker"><span>Week containing</span><input type="date" value={weekAnchor} onChange={(event) => setWeekAnchor(event.target.value || today)} /></label>
          <div className="statistics-week-navigation">
            <button type="button" aria-label="Previous week" onClick={() => moveWeek(-1)}><ChevronLeft size={16} /></button>
            <strong>{weekLabel}</strong>
            <button type="button" aria-label="Next week" onClick={() => moveWeek(1)}><ChevronRight size={16} /></button>
          </div>
          <button type="button" className="statistics-this-week" onClick={() => setWeekAnchor(today)}>This Week</button>
          <button className="statistics-refresh" type="button" disabled={loading} onClick={() => void loadStatistics()}><RefreshCw size={16} className={loading ? 'spinning' : ''} /> Refresh</button>
          <div className="statistics-live-state"><span><i /> Live production</span><small>{lastUpdatedAt ? `Updated ${new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(new Date(lastUpdatedAt))}` : 'Connecting'}</small></div>
        </section>

        <ProductionMetricCards stats={stats} />

        <section className="statistics-production-panel">
          <div className="statistics-production-heading">
            <div><span className="statistics-heading-icon"><BarChart3 size={22} /></span><span><small>Weekly production trend</small><h3>{weekLabel}</h3></span></div>
            <div className="statistics-chart-key"><span className="actual"><i /> Production</span><span className="target"><i /> Daily target · 30</span><span className="trend"><i /> Production trend</span></div>
          </div>
          {error ? <div className="statistics-message error" role="alert">{error}</div> : null}
          {loading && !events.length ? <div className="statistics-chart-loading">Loading weekly production...</div> : <WeeklyProductionChart stats={stats} selectedDate={selectedDate} onSelectDate={setSelectedDate} />}
          <footer className="statistics-chart-footer">
            <span>Daily target is temporarily configured at 30 pieces (210 per week).</span>
            <em>Live updates every 30 seconds and when shop-floor events arrive.</em>
          </footer>
        </section>
      </div>
    </section>
  );
}
