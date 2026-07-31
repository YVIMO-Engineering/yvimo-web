import React from 'react';

export type ReceptionClientSegment = {
  customerId: string;
  customerName: string;
  quantity: number;
  color: string;
};

export type DailyReceptionStat = {
  date: string;
  dayLabel: string;
  dateLabel: string;
  isToday: boolean;
  totalPieces: number;
  voucherCount: number;
  segments: ReceptionClientSegment[];
};

export function WeeklyReceptionsChart({ stats, selectedDate, onSelectDate }: {
  stats: DailyReceptionStat[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
}) {
  const chart = { width: 1200, height: 620, left: 72, right: 28, top: 38, bottom: 112 };
  const plotWidth = chart.width - chart.left - chart.right;
  const plotHeight = chart.height - chart.top - chart.bottom;
  const slotWidth = plotWidth / 7;
  const maxTotal = Math.max(5, ...stats.map((stat) => stat.totalPieces));
  const maxValue = Math.max(5, Math.ceil(maxTotal * 1.2));
  const valueHeight = (value: number) => value / maxValue * plotHeight;
  const selected = stats.find((stat) => stat.date === selectedDate) ?? stats.find((stat) => stat.isToday) ?? stats[0];
  const clientTrends = Array.from(new Map(
    stats.flatMap((stat) => stat.segments).map((segment) => [segment.customerId, segment]),
  ).values()).map((client) => {
    const points = stats.map((stat, dayIndex) => {
      const segmentIndex = stat.segments.findIndex((segment) => segment.customerId === client.customerId);
      if (segmentIndex < 0) return null;
      const quantityBefore = stat.segments
        .slice(0, segmentIndex)
        .reduce((total, segment) => total + segment.quantity, 0);
      const segment = stat.segments[segmentIndex];
      return {
        dayIndex,
        x: chart.left + slotWidth * dayIndex + slotWidth / 2,
        y: chart.top + plotHeight - valueHeight(quantityBefore + segment.quantity / 2),
        quantity: segment.quantity,
      };
    });

    const runs: Array<Array<NonNullable<(typeof points)[number]>>> = [];
    points.forEach((point) => {
      if (!point) return;
      const currentRun = runs[runs.length - 1];
      if (!currentRun || currentRun[currentRun.length - 1].dayIndex !== point.dayIndex - 1) runs.push([point]);
      else currentRun.push(point);
    });

    return { ...client, points: points.filter(Boolean) as Array<NonNullable<(typeof points)[number]>>, runs: runs.filter((run) => run.length > 1) };
  });

  const trendPath = (points: Array<{ x: number; y: number }>) => points.slice(1).reduce((path, point, index) => {
    const previous = points[index];
    const midpoint = (previous.x + point.x) / 2;
    return `${path} C ${midpoint} ${previous.y}, ${midpoint} ${point.y}, ${point.x} ${point.y}`;
  }, `M ${points[0].x} ${points[0].y}`);

  return (
    <div className="statistics-weekly-chart-layout statistics-receptions-chart-layout">
      <div className="statistics-chart-wrap">
        <svg className="statistics-production-chart statistics-receptions-chart" viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label="Weekly received pieces grouped by client">
          {[0, .25, .5, .75, 1].map((ratio) => {
            const y = chart.top + plotHeight * (1 - ratio);
            return <g key={ratio}><line x1={chart.left} x2={chart.width - chart.right} y1={y} y2={y} className="statistics-grid-line" /><text x={chart.left - 13} y={y + 4} textAnchor="end" className="statistics-axis-value">{Math.round(maxValue * ratio)}</text></g>;
          })}
          {stats.map((stat, index) => {
            const x = chart.left + slotWidth * index + slotWidth / 2;
            const barWidth = Math.min(78, slotWidth * .5);
            let accumulatedHeight = 0;
            return (
              <g
                className={`statistics-day-column reception${selectedDate === stat.date ? ' selected' : ''}${stat.isToday ? ' live' : ''}`}
                key={stat.date}
                role="button"
                tabIndex={0}
                onClick={() => onSelectDate(stat.date)}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelectDate(stat.date); }}
              >
                <rect x={chart.left + slotWidth * index + 5} y={chart.top - 10} width={slotWidth - 10} height={plotHeight + 20} rx="10" className="statistics-day-hit-area" />
                {stat.isToday && selectedDate !== stat.date ? <rect x={chart.left + slotWidth * index + 6} y={chart.top - 9} width={slotWidth - 12} height={plotHeight + 18} rx="9" className="statistics-live-column" /> : null}
                {stat.segments.map((segment, segmentIndex) => {
                  const segmentHeight = valueHeight(segment.quantity);
                  accumulatedHeight += segmentHeight;
                  const segmentY = chart.top + plotHeight - accumulatedHeight;
                  const isTop = segmentIndex === stat.segments.length - 1;
                  return (
                    <rect
                      x={x - barWidth / 2}
                      y={segmentY}
                      width={barWidth}
                      height={Math.max(segmentHeight, segment.quantity ? 2 : 0)}
                      rx={isTop ? 7 : 0}
                      fill={segment.color}
                      className="statistics-reception-segment"
                      key={segment.customerId}
                    />
                  );
                })}
                <text x={x} y={chart.height - 82} textAnchor="middle" className={stat.isToday ? 'statistics-axis-label live' : 'statistics-axis-label'}>{stat.dayLabel}</text>
                <text x={x} y={chart.height - 65} textAnchor="middle" className="statistics-axis-date">{stat.dateLabel}</text>
                <rect x={x - 36} y={chart.height - 56} width="72" height="38" rx="9" className="statistics-current-box reception" />
                <text x={x} y={chart.height - 30} textAnchor="middle" className="statistics-current-value reception">{stat.totalPieces}</text>
                {stat.isToday ? <text x={x} y={chart.height - 8} textAnchor="middle" className="statistics-current-label">TODAY · LIVE</text> : null}
              </g>
            );
          })}
          <g className="statistics-client-trends" aria-label="Daily trend by client">
            {clientTrends.flatMap((client) => client.runs.map((run, runIndex) => (
              <g key={`${client.customerId}-${runIndex}`}>
                <path d={trendPath(run)} className="statistics-client-trend-halo" />
                <path d={trendPath(run)} stroke={client.color} className="statistics-client-trend-line" />
              </g>
            )))}
            {clientTrends.flatMap((client) => client.points.map((point) => {
              const boxWidth = Math.max(28, String(point.quantity).length * 9 + 15);
              return (
                <g key={`${client.customerId}-${point.dayIndex}`} className="statistics-client-trend-value">
                  <rect
                    x={point.x - boxWidth / 2}
                    y={point.y - 12}
                    width={boxWidth}
                    height="24"
                    rx="8"
                    stroke={client.color}
                  />
                  <text x={point.x} y={point.y + 5} textAnchor="middle" fill={client.color}>
                    {point.quantity}
                  </text>
                </g>
              );
            }))}
          </g>
          <line x1={chart.left} x2={chart.width - chart.right} y1={chart.top + plotHeight} y2={chart.top + plotHeight} className="statistics-axis-line" />
        </svg>
      </div>
      <aside className="statistics-day-tooltip statistics-reception-tooltip">
        <small>Selected day</small>
        <h4>{selected.dayLabel}, {selected.dateLabel}</h4>
        <div className="statistics-reception-summary">
          <span><small>Received pieces</small><strong>{selected.totalPieces}</strong></span>
          <span><small>Reception vouchers</small><strong>{selected.voucherCount}</strong></span>
        </div>
        <div className="statistics-reception-client-key">
          <header><strong>Clients</strong><span>{selected.segments.length}</span></header>
          {selected.segments.length ? selected.segments.map((segment) => (
            <article key={segment.customerId}>
              <i style={{ backgroundColor: segment.color }} />
              <span><strong>{segment.customerName}</strong><small>{selected.totalPieces ? Math.round(segment.quantity / selected.totalPieces * 100) : 0}% of the day</small></span>
              <b>{segment.quantity}</b>
            </article>
          )) : <p>No received pieces were registered for this day.</p>}
        </div>
      </aside>
    </div>
  );
}
