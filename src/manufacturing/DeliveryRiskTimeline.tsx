import React from 'react';
import { CalendarClock, Factory, PackageOpen } from 'lucide-react';
import type { ProductionOrderStatus } from './mesTypes';

export type DeliveryRiskLevel = 'overdue' | 'high' | 'moderate' | 'low';
export type DeliveryTimelineOrder = { id: string; orderNumber: string; clientName: string; deliveryDate: string; plannedQuantity: number; completedQuantity: number; scrapQuantity: number; stationLabels: string[]; status: ProductionOrderStatus; leadTime: string; risk: DeliveryRiskLevel };
type TimelineRange = { start: number; end: number };
export type DayCountMode = 'calendar' | 'business';
const riskLabels: Record<DeliveryRiskLevel, string> = { overdue: 'Overdue', high: 'High Risk', moderate: 'Moderate Risk', low: 'Low Risk' };
const riskSeverity: Record<DeliveryRiskLevel, number> = { overdue: 0, high: 1, moderate: 2, low: 3 };

export function getDaysUntilDelivery(deliveryDate: string, now = new Date()) {
  const [year, month, day] = deliveryDate.split('-').map(Number);
  if (!year || !month || !day) return 0;
  return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86_400_000);
}
function getTimelinePosition(days: number, range: TimelineRange) { const value = Math.max(range.start, Math.min(range.end, days)); return ((value - range.start) / (range.end - range.start)) * 100; }
function formatDeliveryDistance(days: number, calendarDays = days) { if (calendarDays < 0) return `${Math.abs(days)}d overdue`; if (calendarDays === 0) return 'Due today'; return `${Math.abs(days)}d left`; }
function shortDistance(days: number, range: TimelineRange, calendarDays = days) { if (calendarDays < range.start) return `${Math.abs(days)}d−`; if (calendarDays > range.end) return `${Math.abs(days)}d+`; return calendarDays > 0 ? `+${Math.abs(days)}d` : calendarDays < 0 ? `-${Math.abs(days)}d` : '0d'; }
function statusLabel(status: ProductionOrderStatus) { return status.split('-').map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`).join(' '); }

function calendarDateAtOffset(offset: number, now = new Date()) { return new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset); }
function mondayOccurrence(date: Date) { return Math.floor((date.getDate() - 1) / 7) + 1; }
function mexicanHolidayName(date: Date, languageCode: string) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = date.getFullYear();
  const monday = date.getDay() === 1;
  const spanish = languageCode === 'es';
  if (month === 1 && day === 1) return spanish ? 'Año Nuevo' : "New Year's Day";
  if (month === 2 && monday && mondayOccurrence(date) === 1) return spanish ? 'Día de la Constitución' : 'Constitution Day';
  if (month === 3 && monday && mondayOccurrence(date) === 3) return spanish ? 'Natalicio de Benito Juárez' : "Benito Juárez's Birthday";
  if (month === 5 && day === 1) return spanish ? 'Día del Trabajo' : 'Labor Day';
  if (month === 9 && day === 16) return spanish ? 'Día de la Independencia' : 'Independence Day';
  if (month === 10 && day === 1 && (year - 2024) % 6 === 0) return spanish ? 'Transmisión del Poder Ejecutivo Federal' : 'Federal Executive Transition';
  if (month === 11 && monday && mondayOccurrence(date) === 3) return spanish ? 'Día de la Revolución' : 'Revolution Day';
  if (month === 12 && day === 25) return spanish ? 'Navidad' : 'Christmas Day';
  return '';
}
function nonWorkingDay(date: Date, languageCode: string) {
  const holiday = mexicanHolidayName(date, languageCode);
  if (holiday) return holiday;
  if (date.getDay() === 0 || date.getDay() === 6) return languageCode === 'es' ? 'Fin de semana' : 'Weekend';
  return '';
}

export function getDeliveryDistance(calendarDays: number, mode: DayCountMode, languageCode: string) {
  if (mode === 'calendar' || calendarDays === 0) return calendarDays;
  const direction = calendarDays > 0 ? 1 : -1;
  let workingDays = 0;
  for (let offset = direction; direction > 0 ? offset <= calendarDays : offset >= calendarDays; offset += direction) {
    if (!nonWorkingDay(calendarDateAtOffset(offset), languageCode)) workingDays += direction;
  }
  return workingDays;
}

function DeliveryTimelineMarker({ order, range, mode, languageCode, onOpen }: { order: DeliveryTimelineOrder; range: TimelineRange; mode: DayCountMode; languageCode: string; onOpen: () => void }) {
  const calendarDays = getDaysUntilDelivery(order.deliveryDate);
  const days = getDeliveryDistance(calendarDays, mode, languageCode);
  const progress = order.plannedQuantity > 0 ? Math.min(100, Math.round((order.completedQuantity / order.plannedQuantity) * 100)) : 0;
  return <button className={`delivery-timeline-marker ${order.risk}`} style={{ left: `${getTimelinePosition(calendarDays, range)}%` }} type="button" aria-label={`Open production order ${order.orderNumber}, ${formatDeliveryDistance(days, calendarDays)}, ${riskLabels[order.risk]}`} onClick={onOpen}>
    <i /><span>{shortDistance(days, range, calendarDays)}</span>
    <aside className="delivery-timeline-tooltip" role="tooltip"><strong>#{order.orderNumber}</strong><b>{order.clientName}</b><dl>
      <div><dt>Delivery</dt><dd>{new Date(`${order.deliveryDate}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</dd></div>
      <div><dt>{mode === 'business' ? (languageCode === 'es' ? 'Tiempo hábil restante' : 'Business time remaining') : (languageCode === 'es' ? 'Tiempo restante' : 'Time remaining')}</dt><dd>{formatDeliveryDistance(days, calendarDays)}</dd></div><div><dt>Progress</dt><dd>{order.completedQuantity.toLocaleString()} / {order.plannedQuantity.toLocaleString()} · {progress}%</dd></div>
      <div><dt>Scrap</dt><dd>{order.scrapQuantity.toLocaleString()}</dd></div><div><dt>Lead Time</dt><dd>{order.leadTime}</dd></div><div><dt>Status</dt><dd>{statusLabel(order.status)}</dd></div><div><dt>Order Risk</dt><dd className={order.risk}>{riskLabels[order.risk]}</dd></div>
    </dl></aside>
  </button>;
}

function DeliveryTimelineAxis({ range, languageCode, mode }: { range: TimelineRange; languageCode: string; mode: DayCountMode }) {
  const ticks = Array.from(new Set([range.start, -7, -3, 0, 1, 3, 7, 14, range.end].filter((day) => day >= range.start && day <= range.end))).sort((a, b) => a - b);
  const zone = (start: number, end: number) => ({ left: `${getTimelinePosition(start, range)}%`, width: `${getTimelinePosition(end, range) - getTimelinePosition(start, range)}%` });
  const calendarDays = Array.from({ length: range.end - range.start + 1 }, (_, index) => range.start + index);
  const locale = languageCode === 'es' ? 'es-MX' : languageCode === 'zh' ? 'zh-CN' : 'en-US';
  const riskForDistance = (calendarOffset: number) => { if (calendarOffset < 0) return 'overdue'; const distance = getDeliveryDistance(calendarOffset, mode, languageCode); if (distance <= 1) return 'high'; if (distance <= 3) return 'moderate'; return 'future'; };
  return <div className="delivery-timeline-axis"><div className={`delivery-timeline-zones ${mode}`} aria-hidden="true">{mode === 'calendar' ? <><i className="overdue" style={zone(range.start, -.5)} /><i className="high" style={zone(-.5, 1.5)} /><i className="moderate" style={zone(1.5, 3.5)} /><i className="future" style={zone(3.5, range.end)} /></> : calendarDays.map((offset) => <i className={riskForDistance(offset)} style={zone(Math.max(range.start, offset - .5), Math.min(range.end, offset + .5))} key={offset} />)}</div><div className="delivery-timeline-nonworking" aria-hidden="true">{calendarDays.map((offset) => { const date = calendarDateAtOffset(offset); const reason = nonWorkingDay(date, languageCode); return reason ? <i className={mexicanHolidayName(date, languageCode) ? 'holiday' : 'weekend'} title={reason} style={zone(Math.max(range.start, offset - .5), Math.min(range.end, offset + .5))} key={offset} /> : null; })}</div><div className="delivery-timeline-calendar">{calendarDays.map((offset) => { const date = calendarDateAtOffset(offset); const reason = nonWorkingDay(date, languageCode); return <time className={reason ? 'nonworking' : ''} dateTime={date.toISOString().slice(0, 10)} title={`${new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(date)}${reason ? ` · ${reason}` : ''}`} style={{ left: `${getTimelinePosition(offset, range)}%`, width: `${100 / (range.end - range.start)}%` }} key={offset}><b>{new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date)}</b><small>{new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(date)}</small></time>; })}</div><div className="delivery-timeline-distance">{ticks.map((day) => { const displayedDays = getDeliveryDistance(day, mode, languageCode); return <span className={day === 0 ? 'today' : ''} style={{ left: `${getTimelinePosition(day, range)}%` }} key={day}>{day === 0 ? (languageCode === 'es' ? 'HOY' : 'TODAY') : displayedDays > 0 ? `+${displayedDays}` : displayedDays}</span>; })}</div><i className="delivery-timeline-today-line" style={{ left: `${getTimelinePosition(0, range)}%` }} /></div>;
}

export function DeliveryRiskTimeline({ orders, loading, languageCode, dayCountMode, onDayCountModeChange, onOpenOrder, onFocusOrder }: { orders: DeliveryTimelineOrder[]; loading: boolean; languageCode: string; dayCountMode: DayCountMode; onDayCountModeChange: (mode: DayCountMode) => void; onOpenOrder: (orderNumber: string) => void; onFocusOrder: (orderId: string) => void }) {
  const sortedOrders = React.useMemo(() => [...orders].sort((a, b) => getDaysUntilDelivery(a.deliveryDate) - getDaysUntilDelivery(b.deliveryDate) || riskSeverity[a.risk] - riskSeverity[b.risk] || a.orderNumber.localeCompare(b.orderNumber)), [orders]);
  const range = React.useMemo<TimelineRange>(() => { const days = orders.map((order) => getDaysUntilDelivery(order.deliveryDate)); return { start: Math.max(-14, Math.min(-7, ...days)), end: Math.min(30, Math.max(14, ...days)) }; }, [orders]);
  const counts = React.useMemo(() => orders.reduce<Record<DeliveryRiskLevel, number>>((result, order) => { result[order.risk] += 1; return result; }, { overdue: 0, high: 0, moderate: 0, low: 0 }), [orders]);
  return <section className="delivery-risk-timeline" aria-labelledby="delivery-risk-timeline-title" aria-busy={loading}>
    <header><span className="delivery-risk-timeline-icon"><CalendarClock size={21} /></span><div><h2 id="delivery-risk-timeline-title">Delivery Risk Timeline</h2><p>Active orders positioned by days remaining until delivery</p></div><div className="delivery-risk-timeline-header-actions"><div className="delivery-timeline-day-mode" role="group" aria-label={languageCode === 'es' ? 'Tipo de conteo de días' : 'Day count type'}><button className={dayCountMode === 'calendar' ? 'active' : ''} type="button" aria-pressed={dayCountMode === 'calendar'} onClick={() => onDayCountModeChange('calendar')}>{languageCode === 'es' ? 'Días calendario' : 'Calendar days'}</button><button className={dayCountMode === 'business' ? 'active' : ''} type="button" aria-pressed={dayCountMode === 'business'} onClick={() => onDayCountModeChange('business')}>{languageCode === 'es' ? 'Días hábiles' : 'Business days'}</button></div><div className="delivery-risk-timeline-summary"><strong>{loading ? '—' : orders.length} active orders</strong><span>{counts.overdue} overdue · {counts.high} high risk · {counts.moderate} moderate · {counts.low} low risk</span></div></div></header>
    {loading ? <div className="delivery-timeline-loading" /> : orders.length === 0 ? <div className="delivery-timeline-empty"><PackageOpen size={24} /><strong>No active orders match the current filters.</strong></div> : <div className="delivery-timeline-scroll-x"><div className="delivery-timeline-layout"><div className="delivery-timeline-label-heading">Production order</div><div className="delivery-timeline-sticky-axis"><DeliveryTimelineAxis range={range} languageCode={languageCode} mode={dayCountMode} /></div><div className="delivery-timeline-rows">{sortedOrders.map((order) => { const progress = order.plannedQuantity > 0 ? Math.min(100, Math.round((order.completedQuantity / order.plannedQuantity) * 100)) : 0; return <React.Fragment key={order.id}><button className="delivery-timeline-order-info" type="button" aria-label={`Go to production order ${order.orderNumber} card`} onClick={() => onFocusOrder(order.id)}><strong>#{order.orderNumber}</strong><span>{order.clientName}</span><small><Factory size={11} /> {order.stationLabels.join(' · ') || 'Not assigned'}</small><em className={`mes-status-badge status-${order.status}`}>{statusLabel(order.status)}</em><b>{progress}%</b></button><div className="delivery-timeline-track"><div className="delivery-timeline-row-zones"><DeliveryTimelineAxis range={range} languageCode={languageCode} mode={dayCountMode} /></div><DeliveryTimelineMarker order={order} range={range} mode={dayCountMode} languageCode={languageCode} onOpen={() => onOpenOrder(order.orderNumber)} /></div></React.Fragment>; })}</div></div></div>}
  </section>;
}
