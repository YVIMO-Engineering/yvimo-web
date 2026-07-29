import React from 'react';
import { type DailyProductionStat, getDailyProductionStatus, getProductionCompliance, TEMPORARY_DAILY_TARGET } from './productionStatistics';

const buildSmoothPath = (points: Array<{ x: number; y: number }>) => {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  return points.slice(1).reduce((path, point, index) => {
    const previous = points[index];
    const controlX = (previous.x + point.x) / 2;
    return `${path} C ${controlX} ${previous.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`;
  }, `M ${points[0].x} ${points[0].y}`);
};

export function WeeklyProductionChart({ stats, selectedDate, onSelectDate }: {
  stats: DailyProductionStat[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
}) {
  const chart = { width: 1200, height: 620, left: 72, right: 28, top: 38, bottom: 112 };
  const plotWidth = chart.width - chart.left - chart.right;
  const plotHeight = chart.height - chart.top - chart.bottom;
  const slotWidth = plotWidth / 7;
  const maxValue = Math.max(5, TEMPORARY_DAILY_TARGET * 1.25, ...stats.map((stat) => stat.actualProduction));
  const valueY = (value: number) => chart.top + plotHeight - (value / maxValue * plotHeight);
  const points = stats.map((stat, index) => ({ x: chart.left + slotWidth * index + slotWidth / 2, y: valueY(stat.actualProduction) }));
  const selected = stats.find((stat) => stat.date === selectedDate) ?? stats.find((stat) => stat.isToday) ?? stats[0];
  const selectedTarget = TEMPORARY_DAILY_TARGET;
  const selectedCompliance = getProductionCompliance(selected.actualProduction, selectedTarget);
  const difference = selectedTarget === null ? null : selected.actualProduction - selectedTarget;

  return (
    <div className="statistics-weekly-chart-layout">
      <div className="statistics-chart-wrap">
        <svg className="statistics-production-chart" viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label="Weekly production from Monday to Sunday">
          <defs>
            <linearGradient id="weekly-achieved-bar" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--statistics-achieved-top)" /><stop offset="100%" stopColor="var(--statistics-achieved-bottom)" /></linearGradient>
            <linearGradient id="weekly-below-bar" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--statistics-primary-soft)" /><stop offset="100%" stopColor="var(--statistics-primary)" /></linearGradient>
          </defs>
          {[0, .25, .5, .75, 1].map((ratio) => {
            const y = chart.top + plotHeight * (1 - ratio);
            return <g key={ratio}><line x1={chart.left} x2={chart.width - chart.right} y1={y} y2={y} className="statistics-grid-line" /><text x={chart.left - 13} y={y + 4} textAnchor="end" className="statistics-axis-value">{Math.round(maxValue * ratio)}</text></g>;
          })}
          <g className="statistics-weekly-target">
            <line x1={chart.left} x2={chart.width - chart.right} y1={valueY(TEMPORARY_DAILY_TARGET)} y2={valueY(TEMPORARY_DAILY_TARGET)} />
            <rect x={chart.left + 12} y={valueY(TEMPORARY_DAILY_TARGET) - 29} width="120" height="22" rx="7" />
            <text x={chart.left + 72} y={valueY(TEMPORARY_DAILY_TARGET) - 14} textAnchor="middle">DAILY TARGET · {TEMPORARY_DAILY_TARGET}</text>
          </g>
          {stats.map((stat, index) => {
            const x = chart.left + slotWidth * index + slotWidth / 2;
            const barWidth = Math.min(64, slotWidth * .42);
            const barY = valueY(stat.actualProduction);
            const barHeight = Math.max(stat.actualProduction ? 3 : 0, chart.top + plotHeight - barY);
            const status = getDailyProductionStatus(stat);
            return (
              <g className={`statistics-day-column ${status}${selectedDate === stat.date ? ' selected' : ''}`} key={stat.date} role="button" tabIndex={0}
                onClick={() => onSelectDate(stat.date)}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelectDate(stat.date); }}>
                <rect x={chart.left + slotWidth * index + 5} y={chart.top - 10} width={slotWidth - 10} height={plotHeight + 20} rx="10" className="statistics-day-hit-area" />
                {stat.isToday && selectedDate !== stat.date ? <rect x={chart.left + slotWidth * index + 6} y={chart.top - 9} width={slotWidth - 12} height={plotHeight + 18} rx="9" className="statistics-live-column" /> : null}
                <rect x={x - barWidth / 2} y={barY} width={barWidth} height={barHeight} rx="7" fill={status === 'achieved' ? 'url(#weekly-achieved-bar)' : 'url(#weekly-below-bar)'} className="statistics-actual-bar" />
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
          <line x1={chart.left} x2={chart.width - chart.right} y1={chart.top + plotHeight} y2={chart.top + plotHeight} className="statistics-axis-line" />
        </svg>
      </div>
      <aside className={`statistics-day-tooltip ${getDailyProductionStatus(selected)}`}>
        <small>Selected day</small><h4>{selected.dayLabel}, {selected.dateLabel}</h4>
        <dl className="statistics-day-information">
          <div className="production"><dt>Production</dt><dd>{selected.actualProduction}</dd><span>good pieces</span></div>
          <div className="target"><dt>Daily target</dt><dd>{TEMPORARY_DAILY_TARGET}</dd><span>temporary daily goal</span></div>
          <div className={difference !== null && difference >= 0 ? 'positive' : 'negative'}><dt>Difference</dt><dd>{difference === null ? '—' : `${difference > 0 ? '+' : ''}${difference}`}</dd><span>against target</span></div>
          <div><dt>Compliance</dt><dd>{selectedCompliance === null ? '—' : `${Math.round(selectedCompliance)}%`}</dd><span>weekly progress</span></div>
          <div><dt>Scrap</dt><dd>{selected.scrap}</dd><span>reported pieces</span></div>
        </dl>
        <p>Day selected. Hourly production detail can be connected here in the next iteration.</p>
      </aside>
    </div>
  );
}
