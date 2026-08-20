import React from 'react';
import { AlertTriangle, ArrowLeft, CalendarDays, CircleDollarSign, Clock3, Factory, Gauge, RefreshCw, TrendingUp } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useSupabaseRealtimeRefresh } from '../lib/useSupabaseRealtimeRefresh';
import { StatisticsWorkspace } from './StatisticsWorkspace';
import './revenueOpportunity.css';
import './revenueOpportunitySankey.css';

type Props = { onNavigate: (path: string) => void; organizationId: string; activeSection: 'price-misalignment' | 'optimization' | 'income-flow' };
type SerialRow = { id: string; serial_number: string; production_order_id: string; reported_at: string; verified_quotation_price: number | null; mes_production_orders: { order_number: string; assigned_work_center: string; client_name: string } | null; mes_legacy_prices: { price: number; currency: string } | null; mes_quotations: { total_price: number; currency: string | null } | null };
type CycleRow = { id: string; work_center_code: string; station_code: string; status: string; started_at: string; ended_at: string | null };
type CenterRow = { code: string; name: string };
type RangePreset = 'current' | 'previous' | 'custom';

const money = (value: number, currency = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value || 0);
const pct = (value: number) => `${Number.isFinite(value) ? value.toFixed(1) : '0.0'}%`;
const priceOutcome = (recommendedMinusActual: number) => {
  if (Math.abs(recommendedMinusActual) <= .005) return money(0);
  return `${recommendedMinusActual < 0 ? '+' : '−'}${money(Math.abs(recommendedMinusActual))}`;
};
const dateInput = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const monthRange = (offset = 0) => { const now = new Date(); const from = new Date(now.getFullYear(), now.getMonth() + offset, 1); const to = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0); return { from: dateInput(from), to: dateInput(to) }; };
const relation = <T,>(value: T | T[] | null) => Array.isArray(value) ? value[0] ?? null : value;

type PriceFlow = { client: string; order: string; orderId: string; serials: number; legacy: number; quoted: number; delta: number };
type PriceHealth = { score: number; status: string; tone: 'risk' | 'aligned' | 'healthy'; totalOrders: number; analyzedOrders: number; nonLossOrders: number; coverage: number; nonLossRate: number; netMargin: number; netDifference: number };

function PriceMisalignmentSankey({ flows }: { flows: PriceFlow[] }) {
  const model = React.useMemo(() => {
    const clientTotals = new Map<string, number>();
    flows.forEach((flow) => clientTotals.set(flow.client, (clientTotals.get(flow.client) ?? 0) + Math.max(1, Math.abs(flow.delta))));
    const visibleClients = new Set([...clientTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([client]) => client));
    const normalized = flows.map((flow) => visibleClients.has(flow.client) ? flow : { ...flow, client: 'Other clients', order: `${flow.client} · ${flow.order}` });
    const clients = [...new Set(normalized.map((flow) => flow.client))];
    const clientBalances = new Map<string, number>();
    normalized.forEach((flow) => clientBalances.set(flow.client, (clientBalances.get(flow.client) ?? 0) + flow.delta));
    const orders = normalized.map((flow) => ({ ...flow, id: `${flow.client}|${flow.order}` }));
    const results = ['Revenue Lost', 'Aligned', 'Above Recommendation'];
    // Keep every order card readable at full chart width. The SVG may grow
    // vertically; scrolling is preferable to shrinking a dense graph.
    const height = Math.max(520, Math.max(clients.length, orders.length, 3) * 72 + 80);
    const distribute = (count: number) => Array.from({ length: count }, (_, index) => 76 + index * ((height - 142) / Math.max(1, count - 1)));
    const clientY = distribute(clients.length); const orderY = distribute(orders.length); const resultY = distribute(3);
    const nodes = [
      ...clients.map((label, index) => ({ id: `c:${label}`, label, x: 35, y: clientY[index], type: 'client', balance: clientBalances.get(label) ?? 0 })),
      ...orders.map((flow, index) => ({ id: `o:${flow.id}`, label: flow.order, x: 500, y: orderY[index], type: 'order', flow })),
      ...results.map((label, index) => ({ id: `r:${label}`, label, x: 965, y: resultY[index], type: 'result' })),
    ];
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const links = orders.flatMap((flow, index) => {
      const result = flow.delta > .005 ? 'Revenue Lost' : flow.delta < -.005 ? 'Above Recommendation' : 'Aligned';
      const value = Math.max(1, Math.abs(flow.delta));
      return [
        { id: `co:${flow.id}`, pathId: `price-band-${index}`, source: byId.get(`c:${flow.client}`)!, target: byId.get(`o:${flow.id}`)!, value, flow, showLabel: true },
        { id: `or:${flow.id}`, pathId: `price-result-band-${index}`, source: byId.get(`o:${flow.id}`)!, target: byId.get(`r:${result}`)!, value, flow, showLabel: false },
      ];
    });
    const maxValue = Math.max(1, ...links.map((link) => link.value));
    return { height, nodes, links, maxValue };
  }, [flows]);
  if (!flows.length) return <p className="price-empty">No produced pieces have both a Legacy Price and Source Quotation for this workcenter and period.</p>;
  return <div className="price-sankey-scroll"><svg className="price-sankey" viewBox={`0 0 1200 ${model.height}`} role="img" aria-label="Price misalignment flow by client and production order">
    <text x="35" y="22" className="column-title">CLIENTS</text><text x="500" y="22" className="column-title">PRODUCTION ORDERS</text><text x="965" y="22" className="column-title">PRICE RESULT</text>
    <g className="links">{model.links.map((link) => { const thickness = Math.max(3, link.value / model.maxValue * 28); const color = link.flow.delta > .005 ? '#ef4444' : link.flow.delta < -.005 ? '#10b981' : '#2563eb'; const sourceX = link.source.x + (link.source.type === 'client' ? 180 : 190); return <path id={link.pathId} key={link.id} d={`M ${sourceX} ${link.source.y} C ${sourceX + 145} ${link.source.y}, ${link.target.x - 145} ${link.target.y}, ${link.target.x} ${link.target.y}`} stroke={color} strokeWidth={thickness}><title>{`${link.flow.client} · ${link.flow.order}: ${link.flow.serials} serials · ${money(Math.abs(link.flow.delta))}`}</title></path>; })}</g>
    <g className="nodes">{model.nodes.map((node) => { const flow = 'flow' in node ? node.flow as PriceFlow : null; const balance = 'balance' in node ? Number(node.balance) : null; const amount = flow?.delta ?? balance; const status = amount !== null && amount > .005 ? 'loss' : amount !== null && amount < -.005 ? 'gain' : 'aligned'; const resultColor = node.label === 'Revenue Lost' ? '#ef4444' : node.label === 'Above Recommendation' ? '#10b981' : '#2563eb'; if (node.type === 'result') return <g key={node.id} transform={`translate(${node.x} ${node.y - 17})`}><rect width="20" height="34" rx="5" fill={resultColor} /><text x="30" y="21" className="node-label">{node.label}</text></g>; return <g key={node.id} className={`price-node-card ${node.type} ${status}`} transform={`translate(${node.x} ${node.y - 28})`}><rect className="card-bg" width={node.type === 'client' ? 180 : 190} height="56" rx="8" /><rect className="card-accent" width="5" height="56" rx="3" /><text x="15" y="20" className="node-label">{node.label}</text>{flow ? <><text x="15" y="42" className="node-detail">{flow.serials} serial{flow.serials === 1 ? '' : 's'}</text><text x="180" y="42" textAnchor="end" className="node-amount">{status === 'loss' ? 'Lost' : status === 'gain' ? 'Gained' : 'Aligned'} {money(Math.abs(flow.delta))}</text></> : <text x="15" y="42" className="node-amount">{status === 'loss' ? 'Lost' : status === 'gain' ? 'Gained' : 'Aligned'} {money(Math.abs(balance ?? 0))}</text>}</g>; })}</g>
  </svg></div>;
}

function PriceHealthGauge({ health }: { health: PriceHealth }) {
  const angle = Math.PI - (Math.PI * health.score / 100);
  const needleX = 120 + Math.cos(angle) * 61;
  const needleY = 108 - Math.sin(angle) * 61;
  const netTone = health.netDifference > .005 ? 'loss' : health.netDifference < -.005 ? 'gain' : 'aligned';
  return <aside className={`price-misalignment-summary price-health-panel ${health.tone}`}>
    <header><small>Price health</small><h2>Overall pricing score</h2></header>
    <div className="price-health-gauge">
      <svg viewBox="0 0 240 132" role="img" aria-label={`Price health score ${health.score} out of 100`}>
        <path className="gauge-track risk" d="M 30 108 A 90 90 0 0 1 75 30.1" />
        <path className="gauge-track aligned" d="M 75 30.1 A 90 90 0 0 1 165 30.1" />
        <path className="gauge-track healthy" d="M 165 30.1 A 90 90 0 0 1 210 108" />
        <line className="gauge-needle" x1="120" y1="108" x2={needleX} y2={needleY} />
        <circle className="gauge-hub" cx="120" cy="108" r="8" />
      </svg>
      <div className="price-health-score"><strong>{health.score}</strong><span>/ 100</span></div>
      <div className="price-health-gauge-labels"><span>Risk</span><span>Aligned</span><span>Healthy</span></div>
      <b className="price-health-status">{health.status}</b>
    </div>
    <div className={`price-health-net ${netTone}`}><span>Net pricing result</span><strong>{priceOutcome(health.netDifference)}</strong><small>{health.netMargin >= 0 ? '+' : ''}{health.netMargin.toFixed(1)}% vs. recommended</small></div>
    <dl className="price-health-metrics">
      <div><dt>Orders analyzed</dt><dd>{health.analyzedOrders} / {health.totalOrders}</dd><small>{pct(health.coverage)} coverage</small></div>
      <div><dt>Orders without loss</dt><dd>{health.nonLossOrders} / {health.analyzedOrders}</dd><small>{pct(health.nonLossRate)} of analyzed</small></div>
    </dl>
    <p className="price-health-method">Score composition: <strong>40%</strong> order coverage · <strong>40%</strong> orders without loss · <strong>20%</strong> net result.</p>
  </aside>;
}

export function RevenueOpportunityWorkspace({ onNavigate, organizationId, activeSection }: Props) {
  const initial = React.useMemo(() => monthRange(), []);
  const [preset, setPreset] = React.useState<RangePreset>('current');
  const [range, setRange] = React.useState(initial);
  const [serials, setSerials] = React.useState<SerialRow[]>([]);
  const [cycles, setCycles] = React.useState<CycleRow[]>([]);
  const [centers, setCenters] = React.useState<CenterRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [updatedAt, setUpdatedAt] = React.useState('');
  const [idleRecovery, setIdleRecovery] = React.useState(50);
  const [downtimeRecovery, setDowntimeRecovery] = React.useState(30);
  const [realization, setRealization] = React.useState(70);
  const [variableCost, setVariableCost] = React.useState(0);
  const [workCenterFilter, setWorkCenterFilter] = React.useState('');

  const load = React.useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const from = new Date(`${range.from}T00:00:00`).toISOString();
    const end = new Date(`${range.to}T00:00:00`); end.setDate(end.getDate() + 1); const to = end.toISOString();
    const [serialResult, cycleResult, centerResult] = await Promise.all([
      supabase.from('mes_production_serials').select('id, serial_number, production_order_id, reported_at, verified_quotation_price, mes_production_orders!inner(order_number, assigned_work_center, client_name), mes_legacy_prices(price, currency), mes_quotations(total_price, currency)').eq('organization_id', organizationId).eq('result', 'good').gte('reported_at', from).lt('reported_at', to),
      supabase.from('mes_station_status_cycles').select('id, work_center_code, station_code, status, started_at, ended_at').eq('organization_id', organizationId).lt('started_at', to).or(`ended_at.is.null,ended_at.gt.${from}`),
      supabase.from('mes_work_centers').select('code, name').eq('organization_id', organizationId).order('name'),
    ]);
    const queryError = serialResult.error || cycleResult.error || centerResult.error;
    if (queryError) setError(queryError.message); else {
      setSerials((serialResult.data ?? []).map((row) => ({ ...row, mes_production_orders: relation(row.mes_production_orders), mes_legacy_prices: relation(row.mes_legacy_prices), mes_quotations: relation(row.mes_quotations) })) as unknown as SerialRow[]);
      setCycles((cycleResult.data ?? []) as CycleRow[]); setCenters((centerResult.data ?? []) as CenterRow[]); setError(''); setUpdatedAt(new Date().toISOString());
    }
    setLoading(false);
  }, [organizationId, range.from, range.to]);
  React.useEffect(() => { if (activeSection !== 'income-flow') void load(); }, [activeSection, load]);
  React.useEffect(() => { if (!workCenterFilter && centers.length) setWorkCenterFilter(centers[0].code); }, [centers, workCenterFilter]);
  useSupabaseRealtimeRefresh({ channelName: `revenue-opportunity:${organizationId}`, tables: [{ table: 'mes_production_serials', filter: `organization_id=eq.${organizationId}` }, { table: 'mes_legacy_prices', filter: `organization_id=eq.${organizationId}` }, { table: 'mes_quotations', filter: `organization_id=eq.${organizationId}` }, { table: 'mes_station_status_cycles', filter: `organization_id=eq.${organizationId}` }], onRefresh: () => void load(true), enabled: activeSection !== 'income-flow' });

  const analysis = React.useMemo(() => {
    const startMs = new Date(`${range.from}T00:00:00`).getTime(); const endDate = new Date(`${range.to}T00:00:00`); endDate.setDate(endDate.getDate() + 1); const endMs = Math.min(endDate.getTime(), Date.now());
    const byCenter = new Map<string, { current: number; quoted: number; comparableLegacy: number; comparableQuoted: number; pricingGap: number; overpricing: number; pieces: number; matched: number; productive: number; idle: number; downtime: number; stations: Set<string> }>();
    const getCenter = (code: string) => { const current = byCenter.get(code) ?? { current: 0, quoted: 0, comparableLegacy: 0, comparableQuoted: 0, pricingGap: 0, overpricing: 0, pieces: 0, matched: 0, productive: 0, idle: 0, downtime: 0, stations: new Set<string>() }; byCenter.set(code, current); return current; };
    serials.forEach((serial) => { const order = relation(serial.mes_production_orders); if (!order || (workCenterFilter && order.assigned_work_center !== workCenterFilter)) return; const item = getCenter(order.assigned_work_center || 'Unassigned'); const legacy = relation(serial.mes_legacy_prices); const quote = relation(serial.mes_quotations); const verifiedQuoteValue = quote ? Number(serial.verified_quotation_price ?? quote.total_price) || 0 : 0; item.pieces += 1; if (legacy) item.current += Number(legacy.price) || 0; if (quote) item.quoted += verifiedQuoteValue; if (legacy && quote) { const legacyValue = Number(legacy.price) || 0; const quoteValue = verifiedQuoteValue; item.matched += 1; item.comparableLegacy += legacyValue; item.comparableQuoted += quoteValue; item.pricingGap += Math.max(0, quoteValue - legacyValue); item.overpricing += Math.max(0, legacyValue - quoteValue); } });
    cycles.forEach((cycle) => { if (workCenterFilter && cycle.work_center_code !== workCenterFilter) return; const item = getCenter(cycle.work_center_code || 'Unassigned'); item.stations.add(cycle.station_code); const from = Math.max(startMs, new Date(cycle.started_at).getTime()); const to = Math.min(endMs, cycle.ended_at ? new Date(cycle.ended_at).getTime() : Date.now()); const hours = Math.max(0, to - from) / 3600000; if (cycle.status === 'running') item.productive += hours; else if (cycle.status === 'down') item.downtime += hours; else if (cycle.status === 'idle' || cycle.status === 'available') item.idle += hours; });
    const rows = [...byCenter.entries()].map(([code, data]) => { const rate = data.productive > 0 ? data.current / data.productive : 0; const pricing = data.pricingGap; const idle = data.idle * idleRecovery / 100 * rate; const downtime = data.downtime * downtimeRecovery / 100 * rate; const theoreticalGross = pricing + idle + downtime; const realisticGross = theoreticalGross * realization / 100; const cost = realisticGross * variableCost / 100; const net = realisticGross - cost; return { code, name: centers.find((center) => center.code === code)?.name ?? code, ...data, rate, pricing, idleOpportunity: idle, downtimeOpportunity: downtime, theoreticalGross, net, potential: data.current + net, uplift: data.current > 0 ? net / data.current * 100 : 0, utilization: data.productive + data.idle + data.downtime > 0 ? data.productive / (data.productive + data.idle + data.downtime) * 100 : 0 }; }).sort((a, b) => b.net - a.net);
    const total = rows.reduce((sum, row) => ({ current: sum.current + row.current, quoted: sum.quoted + row.quoted, comparableLegacy: sum.comparableLegacy + row.comparableLegacy, comparableQuoted: sum.comparableQuoted + row.comparableQuoted, pricing: sum.pricing + row.pricing, overpricing: sum.overpricing + row.overpricing, idle: sum.idle + row.idleOpportunity, downtime: sum.downtime + row.downtimeOpportunity, productive: sum.productive + row.productive, idleHours: sum.idleHours + row.idle, downtimeHours: sum.downtimeHours + row.downtime, pieces: sum.pieces + row.pieces, matched: sum.matched + row.matched }), { current: 0, quoted: 0, comparableLegacy: 0, comparableQuoted: 0, pricing: 0, overpricing: 0, idle: 0, downtime: 0, productive: 0, idleHours: 0, downtimeHours: 0, pieces: 0, matched: 0 });
    const theoreticalOpportunity = total.pricing + total.idle + total.downtime; const realisticGross = theoreticalOpportunity * realization / 100; const cost = realisticGross * variableCost / 100; const net = realisticGross - cost;
    return { rows, ...total, netPriceDifference: total.comparableQuoted - total.comparableLegacy, theoreticalOpportunity, realisticGross, cost, net, potential: total.current + net, theoreticalPotential: total.current + theoreticalOpportunity, uplift: total.current > 0 ? net / total.current * 100 : 0, coverage: total.pieces ? total.matched / total.pieces * 100 : 0, confidence: total.pieces && total.matched === total.pieces && total.productive > 0 ? 'High' : total.matched > 0 ? 'Medium' : 'Low' };
  }, [centers, cycles, downtimeRecovery, idleRecovery, range.from, range.to, realization, serials, variableCost, workCenterFilter]);
  const priceFlows = React.useMemo<PriceFlow[]>(() => {
    const grouped = new Map<string, PriceFlow>();
    serials.forEach((serial) => {
      const order = relation(serial.mes_production_orders); const legacy = relation(serial.mes_legacy_prices); const quote = relation(serial.mes_quotations);
      if (!order || !legacy || !quote || (workCenterFilter && order.assigned_work_center !== workCenterFilter)) return;
      const client = order.client_name || 'Unknown client'; const key = `${client}|${order.order_number}`;
      const current = grouped.get(key) ?? { client, order: order.order_number, orderId: serial.production_order_id, serials: 0, legacy: 0, quoted: 0, delta: 0 };
      current.serials += 1; current.legacy += Number(legacy.price) || 0; current.quoted += Number(serial.verified_quotation_price ?? quote.total_price) || 0; current.delta = current.quoted - current.legacy; grouped.set(key, current);
    });
    return [...grouped.values()].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }, [serials, workCenterFilter]);
  const waterfall = React.useMemo(() => ({
    legacy: priceFlows.reduce((sum, flow) => sum + flow.legacy, 0),
    quoted: priceFlows.reduce((sum, flow) => sum + flow.quoted, 0),
  }), [priceFlows]);
  const priceHealth = React.useMemo<PriceHealth>(() => {
    const totalOrderIds = new Set<string>();
    serials.forEach((serial) => {
      const order = relation(serial.mes_production_orders);
      if (order && (!workCenterFilter || order.assigned_work_center === workCenterFilter)) totalOrderIds.add(serial.production_order_id);
    });
    const analyzedOrderIds = new Set(priceFlows.map((flow) => flow.orderId));
    const nonLossOrderIds = new Set(priceFlows.filter((flow) => flow.delta <= .005).map((flow) => flow.orderId));
    const totalOrders = totalOrderIds.size;
    const analyzedOrders = analyzedOrderIds.size;
    const nonLossOrders = nonLossOrderIds.size;
    const coverage = totalOrders ? analyzedOrders / totalOrders * 100 : 0;
    const nonLossRate = analyzedOrders ? nonLossOrders / analyzedOrders * 100 : 0;
    const netMargin = analysis.comparableQuoted ? (analysis.comparableLegacy - analysis.comparableQuoted) / analysis.comparableQuoted * 100 : 0;
    const netScore = Math.max(0, Math.min(100, (netMargin + 10) / 20 * 100));
    const score = analyzedOrders ? Math.round(coverage * .4 + nonLossRate * .4 + netScore * .2) : 0;
    const tone = score >= 67 ? 'healthy' : score >= 34 ? 'aligned' : 'risk';
    const status = !analyzedOrders ? 'Insufficient data' : tone === 'healthy' ? 'Healthy pricing' : tone === 'aligned' ? 'Needs attention' : 'At risk';
    return { score, status, tone, totalOrders, analyzedOrders, nonLossOrders, coverage, nonLossRate, netMargin, netDifference: analysis.netPriceDifference };
  }, [analysis.comparableLegacy, analysis.comparableQuoted, analysis.netPriceDifference, priceFlows, serials, workCenterFilter]);
  const opportunities = [
    { name: 'Pricing alignment', value: analysis.pricing, color: '#10b981', detail: `${analysis.matched} pieces with comparable legacy and YVIMO prices`, available: analysis.matched > 0 },
    { name: 'Idle capacity', value: analysis.idle, color: '#34d399', detail: `${analysis.idleHours.toFixed(1)} idle hours × ${idleRecovery}% recovery`, available: analysis.productive > 0 },
    { name: 'Downtime recovery', value: analysis.downtime, color: '#0d9488', detail: `${analysis.downtimeHours.toFixed(1)} downtime hours × ${downtimeRecovery}% recovery`, available: analysis.productive > 0 },
    { name: 'Scheduling optimization', value: 0, color: '#65a30d', detail: 'Insufficient machine-compatibility history for a defensible estimate', available: false },
    { name: 'Additional orders', value: 0, color: '#84cc16', detail: 'Unavailable until pending-order cycle estimates are complete', available: false },
  ];
  const maxOpportunity = Math.max(1, ...opportunities.map((item) => item.value));
  const setPresetRange = (next: RangePreset) => { setPreset(next); if (next === 'current') setRange(monthRange()); if (next === 'previous') setRange(monthRange(-1)); };

  if (activeSection === 'income-flow') {
    return <StatisticsWorkspace onNavigate={onNavigate} organizationId={organizationId} financialIncome />;
  }

  return <section className="revenue-opportunity-workspace">
    <header className="revenue-header"><button className="academy-back-button engineering-back-button mes-workspace-back revenue-back" type="button" onClick={() => onNavigate('/workspace/manufacturing-ops/intelligence')}><ArrowLeft size={16} /> Ops Intelligence</button><div className="revenue-compact-heading"><span>OPS INTELLIGENCE / FINANCE</span><h1>{activeSection === 'price-misalignment' ? 'Price Misalignment' : 'Revenue Optimization'}</h1><p>{activeSection === 'price-misalignment' ? 'Legacy vs. YVIMO pricing' : 'Operational earning potential'}</p></div><section className="revenue-controls"><label className="revenue-workcenter-filter"><span>Workcenter</span><select value={workCenterFilter} onChange={(event) => setWorkCenterFilter(event.target.value)}>{centers.map((center) => <option value={center.code} key={center.code}>{center.name}</option>)}</select></label><div className="revenue-period-tabs">{(['current', 'previous', 'custom'] as const).map((item) => <button className={preset === item ? 'active' : ''} type="button" key={item} onClick={() => setPresetRange(item)}>{item === 'current' ? 'Current month' : item === 'previous' ? 'Previous month' : 'Custom'}</button>)}</div><label><span>From</span><input type="date" value={range.from} onChange={(event) => { setPreset('custom'); setRange((current) => ({ ...current, from: event.target.value })); }} /></label><label><span>To</span><input type="date" value={range.to} onChange={(event) => { setPreset('custom'); setRange((current) => ({ ...current, to: event.target.value })); }} /></label><button className="revenue-refresh" type="button" disabled={loading} onClick={() => void load()}><RefreshCw size={15} className={loading ? 'spinning' : ''} /> Refresh</button></section><span className="revenue-live"><span><i /> Live analysis</span><small>{updatedAt ? new Date(updatedAt).toLocaleTimeString() : 'Connecting'}</small></span></header>
    {error ? <div className="revenue-error"><AlertTriangle size={18} />{error}</div> : null}
    {activeSection === 'price-misalignment' ? <>
      <section className="revenue-kpis price-misalignment-kpis"><article><CircleDollarSign /><span><small>Actually Charged</small><strong>{money(analysis.comparableLegacy)}</strong><em>legacy price · comparable produced pieces</em></span></article><article className="potential"><CircleDollarSign /><span><small>Should Have Charged</small><strong>{money(analysis.comparableQuoted)}</strong><em>linked YVIMO source quotations</em></span></article><article className="loss"><TrendingUp /><span><small>Revenue Being Lost</small><strong>{money(analysis.pricing)}</strong><em>pieces priced below YVIMO recommendation</em></span></article><article className="over"><TrendingUp /><span><small>Revenue Above Recommendation</small><strong>{money(analysis.overpricing)}</strong><em>pieces priced above YVIMO recommendation</em></span></article><article className={analysis.netPriceDifference > .005 ? 'loss' : analysis.netPriceDifference < -.005 ? 'over' : 'potential'}><Gauge /><span><small>Net Price Difference</small><strong>{priceOutcome(analysis.netPriceDifference)}</strong><em>{analysis.netPriceDifference > .005 ? 'revenue below recommendation' : analysis.netPriceDifference < -.005 ? 'revenue above recommendation' : 'aligned with recommendation'}</em></span></article></section>
      <section className="price-comparison-grid"><article className="revenue-chart-panel price-comparison-chart"><header><span><small>Price flow by client and order</small><h2>Clients → Production Orders → Price Result</h2></span><strong>{analysis.matched} matched pieces · {pct(analysis.coverage)} coverage</strong></header><div className="price-sankey-layout"><div className="price-mini-bridge"><span><small>Legacy charged</small><strong>{money(waterfall.legacy)}</strong></span><i className={waterfall.quoted >= waterfall.legacy ? 'loss' : 'gain'}>{waterfall.quoted >= waterfall.legacy ? '+' : '−'}{money(Math.abs(waterfall.quoted - waterfall.legacy))}</i><span><small>YVIMO recommended</small><strong>{money(waterfall.quoted)}</strong></span></div><PriceMisalignmentSankey flows={priceFlows} /></div></article><PriceHealthGauge health={priceHealth} /></section>
      <section className="revenue-workcenters price-detail-table"><header><span><small>Price comparison detail</small><h2>Misalignment by workcenter</h2></span><span>Produced pieces only</span></header><div className="revenue-table-wrap"><table><thead><tr><th>Workcenter</th><th>Compared Pieces</th><th>Legacy Revenue</th><th>YVIMO Revenue</th><th>Revenue Lost</th><th>Above Recommendation</th><th>Net Difference</th><th>Coverage</th></tr></thead><tbody>{analysis.rows.map((row) => { const difference = row.comparableQuoted - row.comparableLegacy; return <tr key={row.code}><td><strong>{row.name}</strong><small>{row.code}</small></td><td>{row.matched} / {row.pieces}</td><td>{money(row.comparableLegacy)}</td><td>{money(row.comparableQuoted)}</td><td><strong className="price-loss">{money(row.pricing)}</strong></td><td><strong className="price-gain">{money(row.overpricing)}</strong></td><td><strong className={difference > .005 ? 'price-loss' : difference < -.005 ? 'price-gain' : ''}>{priceOutcome(difference)}</strong></td><td>{pct(row.pieces ? row.matched / row.pieces * 100 : 0)}</td></tr>; })}</tbody></table></div></section>
      <section className="revenue-methodology"><CircleDollarSign size={20} /><span><strong>Strict price-comparison scope</strong><p>Actual revenue is the Legacy Price currently charged. Recommended revenue is the linked YVIMO Source Quotation. Revenue Being Lost sums only positive quote-minus-legacy differences; Revenue Above Recommendation is kept separate so favorable and unfavorable pricing do not conceal each other.</p></span><span className={`confidence ${analysis.matched && analysis.coverage === 100 ? 'high' : analysis.matched ? 'medium' : 'low'}`}>{pct(analysis.coverage)} coverage</span></section>
    </> : <>
    <section className="revenue-kpis"><article><CircleDollarSign /><span><small>Current Revenue</small><strong>{money(analysis.current)}</strong><em>legacy prices · {analysis.pieces} produced pieces</em></span></article><article className="potential"><TrendingUp /><span><small>Realistic Potential Revenue</small><strong>{money(analysis.potential)}</strong><em>recommended scenario</em></span></article><article className="opportunity"><Gauge /><span><small>Net Revenue Opportunity</small><strong>{money(analysis.net)}</strong><em>{money(analysis.theoreticalOpportunity)} theoretical gross</em></span></article><article><TrendingUp /><span><small>Potential Uplift</small><strong>{pct(analysis.uplift)}</strong><em>{analysis.confidence} confidence · {pct(analysis.coverage)} price coverage</em></span></article></section>
    <section className="revenue-main-grid"><article className="revenue-chart-panel"><header><span><small>Revenue bridge</small><h2>Current vs. potential revenue</h2></span><div><b>Realistic</b><em>Theoretical {money(analysis.theoreticalPotential)}</em></div></header><div className="revenue-bridge"><div className="revenue-bridge-scale"><span>{money(analysis.potential)}</span><span>{money(analysis.current)}</span><span>$0</span></div><div className="revenue-bridge-columns"><div><i style={{ height: `${analysis.potential ? analysis.current / analysis.potential * 100 : 0}%` }} /><strong>{money(analysis.current)}</strong><span>Current revenue</span></div><div className="gap"><i style={{ height: `${analysis.potential ? analysis.net / analysis.potential * 100 : 0}%` }} /><strong>+{money(analysis.net)}</strong><span>Net opportunity</span></div><div className="potential"><i style={{ height: '100%' }} /><strong>{money(analysis.potential)}</strong><span>Realistic potential</span></div></div></div></article><aside className="revenue-assumptions"><header><small>Scenario assumptions</small><h2>Recovery factors</h2></header>{[["Idle capacity", idleRecovery, setIdleRecovery], ["Downtime", downtimeRecovery, setDowntimeRecovery], ["Realization", realization, setRealization], ["Variable cost", variableCost, setVariableCost]].map(([label, value, setter]) => <label key={label as string}><span><b>{label as string}</b><strong>{value as number}%</strong></span><input type="range" min="0" max="100" step="5" value={value as number} onChange={(event) => (setter as React.Dispatch<React.SetStateAction<number>>)(Number(event.target.value))} /></label>)}<p>Potential Revenue uses the realistic net opportunity. No operating cost is assumed until a variable-cost factor is configured.</p></aside></section>
    <section className="revenue-opportunity-panel"><header><span><small>Opportunity decomposition</small><h2>Where the upside comes from</h2></span><strong>{money(analysis.theoreticalOpportunity)} theoretical</strong></header><div>{opportunities.map((item) => <article className={!item.available ? 'unavailable' : ''} key={item.name}><span><b>{item.name}</b><em>{item.detail}</em></span><div><i style={{ width: `${item.available ? item.value / maxOpportunity * 100 : 0}%`, background: item.color }} /></div><strong>{item.available ? money(item.value) : 'Insufficient data'}</strong></article>)}</div><footer>Gross realistic opportunity {money(analysis.realisticGross)} − Additional operating cost {money(analysis.cost)} = <strong>{money(analysis.net)} net opportunity</strong></footer></section>
    <section className="revenue-workcenters"><header><span><small>Workcenter breakdown</small><h2>Revenue opportunity by workcenter</h2></span><span>Highest impact first</span></header><div className="revenue-table-wrap"><table><thead><tr><th>Workcenter</th><th>Current Revenue</th><th>Productive / Available</th><th>Utilization</th><th>Downtime</th><th>Revenue / Hour</th><th>Main Opportunity</th><th>Potential Revenue</th><th>Uplift</th></tr></thead><tbody>{analysis.rows.map((row) => { const sources = [{ label: 'Pricing alignment', value: row.pricing }, { label: 'Idle capacity', value: row.idleOpportunity }, { label: 'Downtime', value: row.downtimeOpportunity }].sort((a, b) => b.value - a.value); return <tr key={row.code}><td><strong>{row.name}</strong><small>{row.code}</small></td><td>{money(row.current)}</td><td>{row.productive.toFixed(1)}h / {(row.productive + row.idle + row.downtime).toFixed(1)}h</td><td><span className="revenue-utilization"><i style={{ width: `${row.utilization}%` }} /></span>{pct(row.utilization)}</td><td>{row.downtime.toFixed(1)}h</td><td>{row.rate ? money(row.rate) : 'Unavailable'}</td><td><b className="revenue-source">{sources[0].value > 0 ? sources[0].label : 'Insufficient data'}</b></td><td><strong>{money(row.potential)}</strong><small>+{money(row.net)}</small></td><td><strong className="positive">{pct(row.uplift)}</strong></td></tr>; })}{!analysis.rows.length ? <tr><td colSpan={9} className="empty">{loading ? 'Loading financial production data…' : 'No produced pieces or machine activity in this period.'}</td></tr> : null}</tbody></table></div></section>
    <section className="revenue-methodology"><CalendarDays size={20} /><span><strong>Calculation scope</strong><p>Current Revenue uses legacy prices attached to good serialized pieces produced inside the selected period. Pricing Alignment compares those same pieces with their linked YVIMO quotations. Idle and downtime opportunities use observed station-cycle hours and realized revenue per productive hour. Scheduling and Additional Orders remain unavailable until the system has sufficient compatibility and cycle-estimate coverage.</p></span><span className={`confidence ${analysis.confidence.toLowerCase()}`}>{analysis.confidence} confidence</span></section>
    </>}
  </section>;
}
