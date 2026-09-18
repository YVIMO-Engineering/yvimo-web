import React from 'react';
import { type DailyProductionStat, formatShiftTime, getProductionCompliance, type ShiftProduction } from './productionStatistics';

type ShiftTimes = Array<{ shiftNumber: number; startTime: string; endTime: string }>;

const shiftName = (shiftNumber: number | null) => shiftNumber === null ? 'Outside shifts' : `Shift ${shiftNumber}`;
const shiftClass = (shiftNumber: number | null) => shiftNumber === null ? 'shift-none' : `shift-${shiftNumber}`;

// Only the ends of a stacked bar are rounded, so the segments read as one bar.
const barSegmentPath = (x: number, y: number, width: number, height: number, roundTop: boolean, roundBottom: boolean) => {
  const topRadius = roundTop ? Math.min(7, height / 2, width / 2) : 0;
  const bottomRadius = roundBottom ? Math.min(7, height / 2, width / 2) : 0;
  const right = x + width;
  const bottom = y + height;
  return `M ${x} ${y + topRadius} Q ${x} ${y} ${x + topRadius} ${y} H ${right - topRadius} Q ${right} ${y} ${right} ${y + topRadius}`
    + ` V ${bottom - bottomRadius} Q ${right} ${bottom} ${right - bottomRadius} ${bottom} H ${x + bottomRadius} Q ${x} ${bottom} ${x} ${bottom - bottomRadius} Z`;
};

const buildSmoothPath = (points: Array<{ x: number; y: number }>) => {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  return points.slice(1).reduce((path, point, index) => {
    const previous = points[index];
    const controlX = (previous.x + point.x) / 2;
    return `${path} C ${controlX} ${previous.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`;
  }, `M ${points[0].x} ${points[0].y}`);
};

export function WeeklyProductionChart({ stats, shiftTimes, selectedDate, dailyTarget, canEditTarget, onSelectDate, onEditTarget }: {
  stats: DailyProductionStat[];
  shiftTimes: ShiftTimes | null;
  selectedDate: string;
  dailyTarget: number;
  canEditTarget: boolean;
  onSelectDate: (date: string) => void;
  onEditTarget: () => void;
}) {
  const chart = { width: 1200, height: 620, left: 72, right: 28, top: 38, bottom: 112 };
  const plotWidth = chart.width - chart.left - chart.right;
  const plotHeight = chart.height - chart.top - chart.bottom;
  const slotWidth = plotWidth / 7;
  const maxValue = Math.max(5, dailyTarget * 1.25, ...stats.map((stat) => stat.actualProduction));
  const valueY = (value: number) => chart.top + plotHeight - (value / maxValue * plotHeight);
  const points = stats.map((stat, index) => ({ x: chart.left + slotWidth * index + slotWidth / 2, y: valueY(stat.actualProduction) }));
  const selected = stats.find((stat) => stat.date === selectedDate) ?? stats.find((stat) => stat.isToday) ?? stats[0];
  const selectedTarget = dailyTarget;
  const selectedCompliance = getProductionCompliance(selected.actualProduction, selectedTarget);
  const difference = selectedTarget === null ? null : selected.actualProduction - selectedTarget;
  const selectedShifts = selected.shiftProduction.filter((shift) => shift.shiftNumber !== null || shift.quantity > 0);
  const describeShift = (shift: ShiftProduction) => {
    const times = shiftTimes?.find((candidate) => candidate.shiftNumber === shift.shiftNumber);
    return `${shiftName(shift.shiftNumber)} · ${shift.quantity} ${shift.quantity === 1 ? 'piece' : 'pieces'}${times ? ` (${formatShiftTime(times.startTime)}–${formatShiftTime(times.endTime)})` : ''}`;
  };

  return (
    <div className="statistics-weekly-chart-layout">
      <div className="statistics-chart-wrap">
        <svg className="statistics-production-chart" viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label="Weekly production from Monday to Sunday">
          {[0, .25, .5, .75, 1].map((ratio) => {
            const y = chart.top + plotHeight * (1 - ratio);
            return <g key={ratio}><line x1={chart.left} x2={chart.width - chart.right} y1={y} y2={y} className="statistics-grid-line" /><text x={chart.left - 13} y={y + 4} textAnchor="end" className="statistics-axis-value">{Math.round(maxValue * ratio)}</text></g>;
          })}
          <g className="statistics-weekly-target">
            <line x1={chart.left} x2={chart.width - chart.right} y1={valueY(dailyTarget)} y2={valueY(dailyTarget)} />
            <rect x={chart.left + 12} y={valueY(dailyTarget) - 29} width="120" height="22" rx="7" />
            <text x={chart.left + 72} y={valueY(dailyTarget) - 14} textAnchor="middle">DAILY TARGET · {dailyTarget}</text>
          </g>
          {stats.map((stat, index) => {
            const x = chart.left + slotWidth * index + slotWidth / 2;
            const barWidth = Math.min(64, slotWidth * .42);
            const segments = stat.shiftProduction.filter((shift) => shift.quantity > 0);
            let stackedValue = 0;
            const status = stat.isFuture ? 'future' : stat.actualProduction >= dailyTarget ? 'achieved' : stat.isToday ? 'live' : 'below';
            return (
              <g className={`statistics-day-column ${status}${selectedDate === stat.date ? ' selected' : ''}`} key={stat.date} role="button" tabIndex={0}
                onClick={() => onSelectDate(stat.date)}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelectDate(stat.date); }}>
                <rect x={chart.left + slotWidth * index + 5} y={chart.top - 10} width={slotWidth - 10} height={plotHeight + 20} rx="10" className="statistics-day-hit-area" />
                {stat.isToday && selectedDate !== stat.date ? <rect x={chart.left + slotWidth * index + 6} y={chart.top - 9} width={slotWidth - 12} height={plotHeight + 18} rx="9" className="statistics-live-column" /> : null}
                <g className="statistics-actual-bar" aria-label={`${stat.dayLabel}: ${segments.map(describeShift).join(', ') || 'no production'}`}>
                  {segments.map((segment, segmentIndex) => {
                    const segmentBottom = valueY(stackedValue);
                    stackedValue += segment.quantity;
                    const segmentTop = valueY(stackedValue);
                    const segmentHeight = Math.max(3, segmentBottom - segmentTop);
                    return (
                      <g key={segment.shiftNumber ?? 'none'}>
                        <path d={barSegmentPath(x - barWidth / 2, segmentBottom - segmentHeight, barWidth, segmentHeight, segmentIndex === segments.length - 1, segmentIndex === 0)} className={`statistics-shift-segment ${shiftClass(segment.shiftNumber)}`}>
                          <title>{describeShift(segment)}</title>
                        </path>
                        {segmentHeight >= 22 ? <text x={x} y={segmentBottom - segmentHeight / 2 + 4} textAnchor="middle" className="statistics-shift-segment-value">{segment.quantity}</text> : null}
                      </g>
                    );
                  })}
                </g>
                <text x={x} y={chart.height - 82} textAnchor="middle" className={stat.isToday ? 'statistics-axis-label live' : 'statistics-axis-label'}>{stat.dayLabel}</text>
                <text x={x} y={chart.height - 65} textAnchor="middle" className="statistics-axis-date">{stat.dateLabel}</text>
                <rect x={x - 36} y={chart.height - 56} width="72" height="38" rx="9" className="statistics-current-box" />
                <text x={x} y={chart.height - 30} textAnchor="middle" className="statistics-current-value">{stat.actualProduction}</text>
                {stat.isToday ? <text x={x} y={chart.height - 8} textAnchor="middle" className="statistics-current-label">CURRENT · LIVE</text> : null}
              </g>
            );
          })}
          <path d={buildSmoothPath(points)} className="statistics-trend-line" />
          {points.map((point, index) => <circle cx={point.x} cy={point.y} r={stats[index].isToday ? 7 : 5} className={stats[index].isToday ? 'statistics-trend-point live' : 'statistics-trend-point'} key={stats[index].date} />)}
          {/* Drawn after the trend line so the badge stays readable where the line crosses it. */}
          {stats.map((stat, index) => !stat.isFuture && stat.actualProduction >= dailyTarget ? (
            <g className="statistics-target-met" key={`target-met-${stat.date}`} transform={`translate(${points[index].x} ${Math.max(14, points[index].y - 26)})`}>
              <title>Daily target met</title>
              <circle r="11" />
              <path d="M -5 0.5 L -1.5 4 L 5.5 -3.5" />
            </g>
          ) : null)}
          <line x1={chart.left} x2={chart.width - chart.right} y1={chart.top + plotHeight} y2={chart.top + plotHeight} className="statistics-axis-line" />
        </svg>
      </div>
      <aside className={`statistics-day-tooltip ${selected.actualProduction >= dailyTarget ? 'achieved' : selected.isToday ? 'live' : 'below'}`}>
        <small>Selected day</small><h4>{selected.dayLabel}, {selected.dateLabel}</h4>
        <dl className="statistics-day-information">
          <div className="production"><dt>Production</dt><dd>{selected.actualProduction}</dd><span>good pieces</span>
            <span className="statistics-shift-breakdown" aria-label="Production by shift">
              {selectedShifts.map((shift) => <span key={shift.shiftNumber ?? 'none'} title={describeShift(shift)}><i className={shiftClass(shift.shiftNumber)} />{shift.shiftNumber === null ? 'Outside' : `S${shift.shiftNumber}`}<b>{shift.quantity}</b></span>)}
            </span>
          </div>
          <button className="target statistics-edit-target-card" type="button" disabled={!canEditTarget} onClick={onEditTarget}>
            <dt>Daily target</dt><dd>{dailyTarget}</dd><span>{canEditTarget ? 'Click to change target' : 'Select a work center to edit'}</span>
          </button>
          <div className={difference !== null && difference >= 0 ? 'positive' : 'negative'}><dt>Difference</dt><dd>{difference === null ? '—' : `${difference > 0 ? '+' : ''}${difference}`}</dd><span>against target</span></div>
          <div><dt>Compliance</dt><dd>{selectedCompliance === null ? '—' : `${Math.round(selectedCompliance)}%`}</dd><span>weekly progress</span></div>
          <div><dt>Scrap</dt><dd>{selected.scrap}</dd><span>reported pieces</span></div>
        </dl>
        <p>Day selected. Hourly production detail can be connected here in the next iteration.</p>
      </aside>
    </div>
  );
}
