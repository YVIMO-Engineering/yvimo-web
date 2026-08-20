import React from 'react';
import { CalendarClock, Factory, PackageOpen } from 'lucide-react';
import type { ProductionOrderStatus } from './mesTypes';

export type DeliveryRiskLevel = 'overdue' | 'high' | 'moderate' | 'low';
export type DeliveryTimelineOrder = { id: string; orderNumber: string; clientName: string; deliveryDate: string; plannedQuantity: number; completedQuantity: number; scrapQuantity: number; stationLabels: string[]; status: ProductionOrderStatus; leadTime: string; risk: DeliveryRiskLevel };
type TimelineRange = { start: number; end: number };
const riskLabels: Record<DeliveryRiskLevel, string> = { overdue: 'Overdue', high: 'High Risk', moderate: 'Moderate Risk', low: 'Low Risk' };
const riskSeverity: Record<DeliveryRiskLevel, number> = { overdue: 0, high: 1, moderate: 2, low: 3 };

export function getDaysUntilDelivery(deliveryDate: string, now = new Date()) {
  const [year, month, day] = deliveryDate.split('-').map(Number);
  if (!year || !month || !day) return 0;
  return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86_400_000);
}
function getTimelinePosition(days: number, range: TimelineRange) { const value = Math.max(range.start, Math.min(range.end, days)); return ((value - range.start) / (range.end - range.start)) * 100; }
function formatDeliveryDistance(days: number) { if (days < 0) return `${Math.abs(days)}d overdue`; if (days === 0) return 'Due today'; return `${days}d left`; }
function shortDistance(days: number, range: TimelineRange) { if (days < range.start) return `${range.start}d−`; if (days > range.end) return `${range.end}d+`; return days > 0 ? `+${days}d` : `${days}d`; }
function statusLabel(status: ProductionOrderStatus) { return status.split('-').map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`).join(' '); }

function DeliveryTimelineMarker({ order, range, onOpen }: { order: DeliveryTimelineOrder; range: TimelineRange; onOpen: () => void }) {
  const days = getDaysUntilDelivery(order.deliveryDate);
  const progress = order.plannedQuantity > 0 ? Math.min(100, Math.round((order.completedQuantity / order.plannedQuantity) * 100)) : 0;
  return <button className={`delivery-timeline-marker ${order.risk}`} style={{ left: `${getTimelinePosition(days, range)}%` }} type="button" aria-label={`Open production order ${order.orderNumber}, ${formatDeliveryDistance(days)}, ${riskLabels[order.risk]}`} onClick={onOpen}>
    <i /><span>{shortDistance(days, range)}</span>
    <aside className="delivery-timeline-tooltip" role="tooltip"><strong>#{order.orderNumber}</strong><b>{order.clientName}</b><dl>
      <div><dt>Delivery</dt><dd>{new Date(`${order.deliveryDate}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</dd></div>
      <div><dt>Time remaining</dt><dd>{formatDeliveryDistance(days)}</dd></div><div><dt>Progress</dt><dd>{order.completedQuantity.toLocaleString()} / {order.plannedQuantity.toLocaleString()} · {progress}%</dd></div>
      <div><dt>Scrap</dt><dd>{order.scrapQuantity.toLocaleString()}</dd></div><div><dt>Lead Time</dt><dd>{order.leadTime}</dd></div><div><dt>Status</dt><dd>{statusLabel(order.status)}</dd></div><div><dt>Order Risk</dt><dd className={order.risk}>{riskLabels[order.risk]}</dd></div>
    </dl></aside>
  </button>;
}

function DeliveryTimelineAxis({ range }: { range: TimelineRange }) {
  const ticks = Array.from(new Set([range.start, -7, -3, 0, 1, 3, 7, 14, range.end].filter((day) => day >= range.start && day <= range.end))).sort((a, b) => a - b);
  const zone = (start: number, end: number) => ({ left: `${getTimelinePosition(start, range)}%`, width: `${getTimelinePosition(end, range) - getTimelinePosition(start, range)}%` });
  return <div className="delivery-timeline-axis"><div className="delivery-timeline-zones" aria-hidden="true"><i className="overdue" style={zone(range.start, 0)} /><i className="high" style={zone(0, 2)} /><i className="moderate" style={zone(2, 4)} /><i className="future" style={zone(4, range.end)} /></div>{ticks.map((day) => <span className={day === 0 ? 'today' : ''} style={{ left: `${getTimelinePosition(day, range)}%` }} key={day}>{day === 0 ? 'TODAY' : day > 0 ? `+${day}` : day}</span>)}<i className="delivery-timeline-today-line" style={{ left: `${getTimelinePosition(0, range)}%` }} /></div>;
}

export function DeliveryRiskTimeline({ orders, loading, onOpenOrder, onFocusOrder }: { orders: DeliveryTimelineOrder[]; loading: boolean; onOpenOrder: (orderNumber: string) => void; onFocusOrder: (orderId: string) => void }) {
  const sortedOrders = React.useMemo(() => [...orders].sort((a, b) => getDaysUntilDelivery(a.deliveryDate) - getDaysUntilDelivery(b.deliveryDate) || riskSeverity[a.risk] - riskSeverity[b.risk] || a.orderNumber.localeCompare(b.orderNumber)), [orders]);
  const range = React.useMemo<TimelineRange>(() => { const days = orders.map((order) => getDaysUntilDelivery(order.deliveryDate)); return { start: Math.max(-14, Math.min(-7, ...days)), end: Math.min(30, Math.max(14, ...days)) }; }, [orders]);
  const counts = React.useMemo(() => orders.reduce<Record<DeliveryRiskLevel, number>>((result, order) => { result[order.risk] += 1; return result; }, { overdue: 0, high: 0, moderate: 0, low: 0 }), [orders]);
  return <section className="delivery-risk-timeline" aria-labelledby="delivery-risk-timeline-title" aria-busy={loading}>
    <header><span className="delivery-risk-timeline-icon"><CalendarClock size={21} /></span><div><h2 id="delivery-risk-timeline-title">Delivery Risk Timeline</h2><p>Active orders positioned by days remaining until delivery</p></div><div className="delivery-risk-timeline-summary"><strong>{loading ? '—' : orders.length} active orders</strong><span>{counts.overdue} overdue · {counts.high} high risk · {counts.moderate} moderate · {counts.low} low risk</span></div></header>
    {loading ? <div className="delivery-timeline-loading" /> : orders.length === 0 ? <div className="delivery-timeline-empty"><PackageOpen size={24} /><strong>No active orders match the current filters.</strong></div> : <div className="delivery-timeline-scroll-x"><div className="delivery-timeline-layout"><div className="delivery-timeline-label-heading">Production order</div><div className="delivery-timeline-sticky-axis"><DeliveryTimelineAxis range={range} /></div><div className="delivery-timeline-rows">{sortedOrders.map((order) => { const progress = order.plannedQuantity > 0 ? Math.min(100, Math.round((order.completedQuantity / order.plannedQuantity) * 100)) : 0; return <React.Fragment key={order.id}><button className="delivery-timeline-order-info" type="button" aria-label={`Go to production order ${order.orderNumber} card`} onClick={() => onFocusOrder(order.id)}><strong>#{order.orderNumber}</strong><span>{order.clientName}</span><small><Factory size={11} /> {order.stationLabels.join(' · ') || 'Not assigned'}</small><em className={`mes-status-badge status-${order.status}`}>{statusLabel(order.status)}</em><b>{progress}%</b></button><div className="delivery-timeline-track"><div className="delivery-timeline-row-zones"><DeliveryTimelineAxis range={range} /></div><DeliveryTimelineMarker order={order} range={range} onOpen={() => onOpenOrder(order.orderNumber)} /></div></React.Fragment>; })}</div></div></div>}
  </section>;
}
