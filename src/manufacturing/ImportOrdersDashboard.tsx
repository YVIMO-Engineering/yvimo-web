import React from 'react';
import { Coins, Gauge, Package, Percent, Scale, TrendingUp } from 'lucide-react';
import { costComposition, filterByPeriod, landingFactorPoints, periodRange, marginByClient, marginByOrder, monthlyTrend, summarizeImports, type DateRange, type ImportOrderRecord, type ImportPeriod } from './importOrdersAnalytics';
import './importOrdersDashboard.css';

type Props = { records: ImportOrderRecord[]; loading: boolean; selectedId: string; onSelect: (id: string) => void; currency?: string; currencyNote?: string };

const periods: Array<{ value: ImportPeriod; label: string }> = [{ value: 'month', label: 'This month' }, { value: 'ytd', label: 'Year to date' }, { value: '12m', label: 'Last 12 months' }, { value: 'all', label: 'All time' }, { value: 'custom', label: 'Custom range' }];
// Every amount on the dashboard is shown in the display currency chosen for the module.
const CurrencyContext = React.createContext('MXN');
function useMoney() {
  const currency = React.useContext(CurrencyContext);
  return React.useMemo(() => {
    const mxn = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: currency === 'JPY' ? 0 : 2 }).format(value);
    const compact = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: Math.abs(value) >= 1000 ? 1 : 0 }).format(value);
    const signed = (value: number) => `${value > .005 ? '+' : ''}${compact(value)}`;
    return { currency, mxn, compact, signed };
  }, [currency]);
}
const pct = (value: number | null) => value === null ? '—' : `${value.toFixed(1)}%`;
const factor = (value: number | null) => value === null ? '—' : `×${value.toFixed(2)}`;
const tone = (value: number) => value < -.005 ? 'loss' : value > .005 ? 'profit' : 'neutral';
const dayLabel = (date: string) => { const [year, month, day] = date.split('-').map(Number); return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
const rangeLabel = ({ from, to }: DateRange) => from && to ? `${dayLabel(from)} – ${dayLabel(to)}` : from ? `Since ${dayLabel(from)}` : to ? `Until ${dayLabel(to)}` : 'All dates';
const monthLabel = (month: string) => { const [year, index] = month.split('-').map(Number); return `${new Date(year, index - 1, 1).toLocaleDateString('en-US', { month: 'short' })} ${String(year).slice(2)}`; };

// Clean axis ticks: 1, 2 or 5 times a power of ten.
function niceScale(min: number, max: number, count = 4) {
  if (max === min) max = min + 1;
  const raw = (max - min) / count, magnitude = 10 ** Math.floor(Math.log10(raw)), normalized = raw / magnitude;
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
  const low = Math.floor(min / step) * step, high = Math.ceil(max / step) * step, ticks: number[] = [];
  for (let value = low; value <= high + step / 2; value += step) ticks.push(Math.round(value / step) * step);
  return { low, high, ticks };
}
// Bars are square at the baseline and rounded only at the data end.
function horizontalBar(x0: number, x1: number, y: number, height: number) {
  const radius = Math.min(4, Math.abs(x1 - x0), height / 2), direction = x1 >= x0 ? 1 : -1;
  if (!radius) return '';
  return `M${x0},${y}H${x1 - direction * radius}Q${x1},${y} ${x1},${y + radius}V${y + height - radius}Q${x1},${y + height} ${x1 - direction * radius},${y + height}H${x0}Z`;
}
function column(x: number, width: number, base: number, top: number) {
  const radius = Math.min(4, base - top, width / 2);
  if (base - top <= 0) return '';
  return `M${x},${base}V${top + radius}Q${x},${top} ${x + radius},${top}H${x + width - radius}Q${x + width},${top} ${x + width},${top + radius}V${base}Z`;
}

type Tip = { x: number; y: number; flip: boolean; title: string; lines: string[] } | null;
function useTooltip() {
  const ref = React.useRef<HTMLDivElement>(null);
  const [tip, setTip] = React.useState<Tip>(null);
  const show = (event: React.MouseEvent, title: string, lines: string[]) => {
    const rect = ref.current?.getBoundingClientRect();
    if (rect) setTip({ x: event.clientX - rect.left, y: event.clientY - rect.top, flip: event.clientX - rect.left > rect.width / 2, title, lines });
  };
  return { ref, tip, show, hide: () => setTip(null) };
}
type Tooltip = ReturnType<typeof useTooltip>;

function ChartCard({ title, subtitle, legend, tooltip, footnote, className = '', children }: { title: string; subtitle: string; legend?: React.ReactNode; tooltip?: Tooltip; footnote?: string; className?: string; children: React.ReactNode }) {
  return <article className={`io-chart ${className}`.trim()}>
    <header><div><h4>{title}</h4><p>{subtitle}</p></div>{legend ? <div className="io-legend">{legend}</div> : null}</header>
    <div className="io-chart-plot" ref={tooltip?.ref} onMouseLeave={tooltip?.hide}>
      {children}
      {tooltip?.tip ? <div className={`io-tooltip${tooltip.tip.flip ? ' flip' : ''}`} style={{ left: tooltip.tip.x, top: tooltip.tip.y }} role="status"><b>{tooltip.tip.title}</b>{tooltip.tip.lines.map((line) => <span key={line}>{line}</span>)}</div> : null}
    </div>
    {footnote ? <small className="io-footnote">{footnote}</small> : null}
  </article>;
}
const Key = ({ swatch, label }: { swatch: string; label: string }) => <span><i className={swatch} />{label}</span>;

function KpiTiles({ summary, periodLabel }: { summary: ReturnType<typeof summarizeImports>; periodLabel: string }) {
  const { mxn, compact, signed } = useMoney();
  const decided = summary.profitCount + summary.lossCount;
  const tiles = [
    { label: 'Total landed cost', value: compact(summary.totalLanded), detail: `${summary.orderCount} order${summary.orderCount === 1 ? '' : 's'} · ${periodLabel}`, icon: Package, className: '' },
    { label: 'Net margin', value: signed(summary.netMargin), detail: `On ${compact(summary.totalSale)} of customer sales`, icon: Coins, className: tone(summary.netMargin) },
    { label: 'Weighted margin', value: pct(summary.weightedMarginPercent), detail: 'Total margin ÷ total sales', icon: Percent, className: summary.weightedMarginPercent === null ? '' : tone(summary.weightedMarginPercent) },
    { label: 'Orders with profit / loss', value: `${summary.profitCount} / ${summary.lossCount}`, detail: summary.breakEvenCount ? `${summary.breakEvenCount} at break-even` : 'Profit orders / loss orders', icon: Scale, className: '', split: decided ? summary.profitCount / decided * 100 : null },
    { label: 'Landing factor', value: factor(summary.landingFactor), detail: summary.excludedFromFactor ? `Landed cost ÷ merchandise value · ${summary.excludedFromFactor} warranty order${summary.excludedFromFactor === 1 ? '' : 's'} excluded` : 'Landed cost ÷ merchandise value', icon: Gauge, className: '' },
    { label: 'Average landed cost', value: compact(summary.averageLanded), detail: 'Per import order', icon: TrendingUp, className: '' },
  ];
  return <section className="io-kpis" aria-label="Import order indicators">
    {tiles.map(({ label, value, detail, icon: Icon, className, split }) => <article key={label} className={className}>
      <span className="io-kpi-label"><Icon size={16} />{label}</span>
      <strong>{value}</strong>
      {split !== undefined && split !== null ? <span className="io-split" aria-hidden="true"><i className="profit" style={{ width: `${split}%` }} /><i className="loss" style={{ width: `${100 - split}%` }} /></span> : null}
      <small>{detail}</small>
    </article>)}
  </section>;
}

const ORDER_LIMIT = 24;
function OrderMarginChart({ records, selectedId, onSelect }: { records: ImportOrderRecord[]; selectedId: string; onSelect: (id: string) => void }) {
  const { mxn, compact, signed } = useMoney();
  const tooltip = useTooltip();
  const all = marginByOrder(records);
  // Past the limit, the worst and the best orders stay visible and the middle collapses to one row.
  const hidden = Math.max(0, all.length - ORDER_LIMIT);
  const rows: Array<ReturnType<typeof marginByOrder>[number] | null> = hidden ? [...all.slice(0, ORDER_LIMIT / 2), null, ...all.slice(-ORDER_LIMIT / 2)] : all;
  const width = 560, labelWidth = 96, rowHeight = 22, barHeight = 12, top = 6, axisHeight = 24, labelRoom = 62;
  const values = all.map((row) => row.profitLoss), scale = niceScale(Math.min(0, ...values), Math.max(0, ...values));
  const plotLeft = labelWidth + labelRoom, plotRight = width - labelRoom;
  const x = (value: number) => plotLeft + (value - scale.low) / (scale.high - scale.low) * (plotRight - plotLeft);
  const height = top + rows.length * rowHeight + axisHeight;
  const labelled = new Set([...all.slice(0, 3), ...all.slice(-3)].map((row) => row.id));
  return <ChartCard title="Margin by order" subtitle="Profit / loss per order, worst to best" tooltip={tooltip} legend={<><Key swatch="loss" label="Loss" /><Key swatch="profit" label="Profit" /></>} footnote={hidden ? `${hidden} orders in the middle of the range are collapsed. Select a bar to open the order details.` : 'Select a bar to open the order details.'}>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Diverging bars of profit or loss per import order">
      {scale.ticks.map((tick) => <g key={tick}><line className={tick === 0 ? 'io-baseline' : 'io-grid'} x1={x(tick)} x2={x(tick)} y1={top} y2={height - axisHeight} /><text className="io-axis" x={x(tick)} y={height - 8} textAnchor="middle">{compact(tick)}</text></g>)}
      {rows.map((row, index) => {
        const y = top + index * rowHeight;
        if (!row) return <text key="gap" className="io-axis" x={labelWidth} y={y + rowHeight / 2 + 4} textAnchor="end">… {hidden} more</text>;
        const end = x(row.profitLoss), zero = x(0), selected = row.id === selectedId, margin = row.sale > 0 ? row.profitLoss / row.sale * 100 : null;
        const describe = (event: React.MouseEvent) => tooltip.show(event, row.reference, [row.client, `Landed cost ${mxn(row.landed)}`, `Customer sale ${mxn(row.sale)}`, `Profit / loss ${mxn(row.profitLoss)}`, `Margin ${pct(margin)}`]);
        return <g key={row.id} className={`io-order${selected ? ' selected' : ''}`} onClick={() => onSelect(row.id)} onMouseMove={describe}>
          <rect className="io-hit" x={0} y={y} width={width} height={rowHeight} />
          <text className="io-row-label" x={labelWidth} y={y + rowHeight / 2 + 4} textAnchor="end">{row.reference}</text>
          <path className={tone(row.profitLoss)} d={horizontalBar(zero, end, y + (rowHeight - barHeight) / 2, barHeight)} />
          {labelled.has(row.id) || selected ? <text className="io-value" x={end + (row.profitLoss < 0 ? -6 : 6)} y={y + rowHeight / 2 + 4} textAnchor={row.profitLoss < 0 ? 'end' : 'start'}>{signed(row.profitLoss)}</text> : null}
        </g>;
      })}
    </svg>
  </ChartCard>;
}

const CLIENT_LIMIT = 8;
function ClientMarginChart({ records }: { records: ImportOrderRecord[] }) {
  const { mxn, compact, signed } = useMoney();
  const tooltip = useTooltip();
  const all = marginByClient(records);
  const rows = all.length > CLIENT_LIMIT ? [...all.slice(0, CLIENT_LIMIT - 1), all.slice(CLIENT_LIMIT - 1).reduce((other, client) => ({ ...other, orders: other.orders + client.orders, landed: other.landed + client.landed, sale: other.sale + client.sale, profitLoss: other.profitLoss + client.profitLoss, saleShare: other.saleShare + client.saleShare }), { client: `${all.length - CLIENT_LIMIT + 1} other clients`, orders: 0, landed: 0, sale: 0, profitLoss: 0, marginPercent: null as number | null, saleShare: 0 })].map((row) => ({ ...row, marginPercent: row.sale > 0 ? row.profitLoss / row.sale * 100 : null })) : all;
  const width = 560, labelWidth = 150, rowHeight = 44, barHeight = 14, top = 4, axisHeight = 24, labelRoom = 96;
  const scale = niceScale(Math.min(0, ...rows.map((row) => row.profitLoss)), Math.max(0, ...rows.map((row) => row.profitLoss)));
  const plotLeft = labelWidth + labelRoom, plotRight = width - labelRoom;
  const x = (value: number) => plotLeft + (value - scale.low) / (scale.high - scale.low) * (plotRight - plotLeft);
  const height = top + rows.length * rowHeight + axisHeight;
  return <ChartCard title="Margin by client" subtitle="Net margin per client, ordered by landed cost" tooltip={tooltip} legend={<><Key swatch="loss" label="Loss" /><Key swatch="profit" label="Profit" /></>}>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Net margin per client">
      {scale.ticks.map((tick) => <g key={tick}><line className={tick === 0 ? 'io-baseline' : 'io-grid'} x1={x(tick)} x2={x(tick)} y1={top} y2={height - axisHeight} /><text className="io-axis" x={x(tick)} y={height - 8} textAnchor="middle">{compact(tick)}</text></g>)}
      {rows.map((row, index) => {
        const y = top + index * rowHeight, end = x(row.profitLoss), middle = y + rowHeight / 2;
        return <g key={row.client} onMouseMove={(event) => tooltip.show(event, row.client, [`${row.orders} order${row.orders === 1 ? '' : 's'} · ${row.saleShare.toFixed(1)}% of sales`, `Landed cost ${mxn(row.landed)}`, `Customer sale ${mxn(row.sale)}`, `Net margin ${mxn(row.profitLoss)}`, `Margin ${pct(row.marginPercent)}`])}>
          <rect className="io-hit" x={0} y={y} width={width} height={rowHeight} />
          <text className="io-row-label strong" x={0} y={middle - 3}>{row.client.length > 22 ? `${row.client.slice(0, 21)}…` : row.client}</text>
          <text className="io-axis" x={0} y={middle + 12}>{row.orders} order{row.orders === 1 ? '' : 's'} · {row.saleShare.toFixed(0)}% of sales</text>
          <path className={tone(row.profitLoss)} d={horizontalBar(x(0), end, middle - barHeight / 2, barHeight)} />
          <text className="io-value" x={end + (row.profitLoss < 0 ? -6 : 6)} y={middle + 4} textAnchor={row.profitLoss < 0 ? 'end' : 'start'}>{signed(row.profitLoss)} · {pct(row.marginPercent)}</text>
        </g>;
      })}
    </svg>
  </ChartCard>;
}

function CostCompositionChart({ records }: { records: ImportOrderRecord[] }) {
  const { mxn, compact, signed } = useMoney();
  const tooltip = useTooltip();
  const composition = costComposition(records);
  const merchandiseShare = composition.total > 0 ? composition.merchandise / composition.total * 100 : 0;
  const components = composition.components.filter((component) => component.amount > .005);
  const largest = Math.max(1, ...components.map((component) => component.amount));
  return <ChartCard title="Landed cost composition" subtitle="Where the landed cost comes from" tooltip={tooltip} legend={<><Key swatch="series-1" label="Merchandise" /><Key swatch="series-2" label="Logistics" /></>} footnote="IVA is a recoverable tax credit and is not part of the landed cost. IGI and DTA have no field of their own; they count under whichever cost they were captured in.">
    <div className="io-split-bar" aria-label={`Merchandise ${merchandiseShare.toFixed(1)}%, logistics ${(100 - merchandiseShare).toFixed(1)}% of landed cost`}>
      {merchandiseShare > 0 ? <i className="series-1" style={{ flexGrow: merchandiseShare }} onMouseMove={(event) => tooltip.show(event, 'Merchandise', [mxn(composition.merchandise), `${merchandiseShare.toFixed(1)}% of landed cost`])} /> : null}
      {merchandiseShare < 100 ? <i className="series-2" style={{ flexGrow: 100 - merchandiseShare }} onMouseMove={(event) => tooltip.show(event, 'Logistics', [mxn(composition.logistics), `${(100 - merchandiseShare).toFixed(1)}% of landed cost`])} /> : null}
    </div>
    <div className="io-split-values"><span><b>{merchandiseShare.toFixed(1)}%</b> merchandise · {compact(composition.merchandise)}</span><span><b>{(100 - merchandiseShare).toFixed(1)}%</b> logistics · {compact(composition.logistics)}</span></div>
    <h5 className="io-subhead">Logistics breakdown</h5>
    {components.length ? <div className="io-components">{components.map((component) => <div key={component.key} onMouseMove={(event) => tooltip.show(event, component.label, [mxn(component.amount), `${component.shareOfLanded.toFixed(2)}% of landed cost`, `${composition.logistics > 0 ? (component.amount / composition.logistics * 100).toFixed(1) : '0.0'}% of logistics`])}>
      <span>{component.label}</span>
      <span className="io-track"><i style={{ width: `${component.amount / largest * 100}%` }} /></span>
      <span className="io-component-value">{compact(component.amount)} <em>{component.shareOfLanded.toFixed(1)}%</em></span>
    </div>)}</div> : <p className="io-empty-note">No logistics costs recorded in this period.</p>}
  </ChartCard>;
}

function MonthlyTrendChart({ records }: { records: ImportOrderRecord[] }) {
  const { mxn, compact, signed } = useMoney();
  const tooltip = useTooltip();
  const [active, setActive] = React.useState<number | null>(null);
  const months = monthlyTrend(records);
  const width = 560, left = 60, right = 12, plotWidth = width - left - right, band = plotWidth / Math.max(1, months.length);
  const barWidth = Math.max(3, Math.min(24, (band * .72 - 2) / 2));
  const labelEvery = Math.ceil(months.length / 12);
  const money = niceScale(0, Math.max(1, ...months.flatMap((month) => [month.landed, month.sale])));
  const moneyTop = 10, moneyHeight = 190, moneyBase = moneyTop + moneyHeight - 22;
  const y = (value: number) => moneyBase - value / money.high * (moneyBase - moneyTop);
  const margins = months.map((month) => month.marginPercent).filter((value): value is number => value !== null);
  const marginScale = niceScale(Math.min(0, ...margins), Math.max(0, ...margins), 3);
  const marginTop = 10, marginHeight = 118, marginBase = marginHeight - 24;
  const ym = (value: number) => marginBase - (value - marginScale.low) / (marginScale.high - marginScale.low) * (marginBase - marginTop);
  const cx = (index: number) => left + band * index + band / 2;
  // Months without sales have no margin, so the line breaks there instead of drawing through zero.
  const path = months.reduce((d, month, index) => month.marginPercent === null ? d : `${d}${index > 0 && months[index - 1].marginPercent !== null ? 'L' : 'M'}${cx(index)},${ym(month.marginPercent)}`, '');
  const describe = (event: React.MouseEvent, index: number) => { const month = months[index]; setActive(index); tooltip.show(event, monthLabel(month.month), [`${month.orders} order${month.orders === 1 ? '' : 's'}`, `Landed cost ${mxn(month.landed)}`, `Customer sale ${mxn(month.sale)}`, `Net margin ${mxn(month.profitLoss)}`, `Margin ${pct(month.marginPercent)}`]); };
  const hits = (top: number, bottom: number) => months.map((month, index) => <rect key={month.month} className={`io-hit${active === index ? ' active' : ''}`} x={left + band * index} y={top} width={band} height={bottom - top} onMouseMove={(event) => describe(event, index)} />);
  const monthAxis = (base: number) => months.map((month, index) => index % labelEvery ? null : <text key={month.month} className="io-axis" x={cx(index)} y={base + 16} textAnchor="middle">{monthLabel(month.month)}</text>);
  return <ChartCard title="Monthly trend" subtitle="Landed cost vs customer sales, with the weighted margin below" tooltip={tooltip} legend={<><Key swatch="series-1" label="Landed cost" /><Key swatch="series-2" label="Customer sale" /></>}>
    <div onMouseLeave={() => setActive(null)}>
      <svg viewBox={`0 0 ${width} ${moneyHeight}`} role="img" aria-label="Monthly landed cost and customer sales">
        {hits(moneyTop, moneyBase)}
        {money.ticks.map((tick) => <g key={tick}><line className={tick === 0 ? 'io-baseline' : 'io-grid'} x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} /><text className="io-axis" x={left - 8} y={y(tick) + 4} textAnchor="end">{compact(tick)}</text></g>)}
        {months.map((month, index) => <g key={month.month} className="io-passive">
          <path className="series-1" d={column(cx(index) - barWidth - 1, barWidth, moneyBase, y(month.landed))} />
          <path className="series-2" d={column(cx(index) + 1, barWidth, moneyBase, y(month.sale))} />
        </g>)}
        {monthAxis(moneyBase)}
      </svg>
      <h5 className="io-subhead">Weighted margin %</h5>
      <svg viewBox={`0 0 ${width} ${marginHeight}`} role="img" aria-label="Monthly weighted margin percent">
        {hits(marginTop, marginBase)}
        {marginScale.ticks.map((tick) => <g key={tick}><line className={tick === 0 ? 'io-baseline' : 'io-grid'} x1={left} x2={width - right} y1={ym(tick)} y2={ym(tick)} /><text className="io-axis" x={left - 8} y={ym(tick) + 4} textAnchor="end">{tick}%</text></g>)}
        <path className="io-line" d={path} />
        {months.map((month, index) => month.marginPercent === null ? null : <circle key={month.month} className={`io-dot ${tone(month.marginPercent)}`} cx={cx(index)} cy={ym(month.marginPercent)} r={active === index ? 6 : 4.5} />)}
        {monthAxis(marginBase)}
      </svg>
    </div>
  </ChartCard>;
}

const CLIENT_SLOTS = 3;
function LandingFactorChart({ records, clientOrder, selectedId, onSelect, periodFactor }: { records: ImportOrderRecord[]; clientOrder: string[]; selectedId: string; onSelect: (id: string) => void; periodFactor: number | null }) {
  const { mxn, compact, signed, currency } = useMoney();
  const tooltip = useTooltip();
  const points = landingFactorPoints(records);
  const slot = (client: string) => { const index = clientOrder.indexOf(client); return index >= 0 && index < CLIENT_SLOTS ? `series-${index + 1}` : 'series-other'; };
  const shownClients = clientOrder.slice(0, CLIENT_SLOTS).filter((client) => points.some((point) => point.client === client));
  const hasOther = points.some((point) => slot(point.client) === 'series-other');
  const width = 1300, height = 340, left = 56, right = 24, top = 16, bottom = 40;
  // Invoice values span orders of magnitude, so the x axis is logarithmic.
  const minValue = Math.min(...points.map((point) => point.invoiceValue)), maxValue = Math.max(...points.map((point) => point.invoiceValue));
  const steps = Array.from({ length: 10 }, (_, power) => [1, 2, 5].map((step) => step * 10 ** power)).flat();
  const xLow = [...steps].reverse().find((tick) => tick <= minValue) ?? 1, xHigh = steps.find((tick) => tick >= maxValue && tick > xLow) ?? xLow * 10;
  const xTicks = steps.filter((tick) => tick >= xLow && tick <= xHigh);
  const x = (value: number) => left + (Math.log10(value) - Math.log10(xLow)) / (Math.log10(xHigh) - Math.log10(xLow)) * (width - left - right);
  const yScale = niceScale(Math.min(1, ...points.map((point) => point.factor)), Math.max(1.1, ...points.map((point) => point.factor)));
  const y = (value: number) => height - bottom - (value - yScale.low) / (yScale.high - yScale.low) * (height - top - bottom);
  const outliers = new Set([...points].sort((a, b) => b.factor - a.factor).slice(0, 3).map((point) => point.id));
  const legend = <>{shownClients.map((client) => <Key key={client} swatch={slot(client)} label={client} />)}{hasOther ? <Key swatch="series-other" label="Other clients" /> : null}</>;
  return <ChartCard className="wide" title="Invoice value vs landing factor" subtitle="Small, low-value shipments carry a heavier logistics load. The highest factors are labelled." tooltip={tooltip} legend={legend} footnote={`Select a point to open the order details. Warranty orders are excluded because they carry no merchandise value.${periodFactor === null ? '' : ` The line marks the period landing factor, ${factor(periodFactor)}.`}`}>
    {points.length ? <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Scatter plot of invoice value against landing factor">
      {yScale.ticks.map((tick) => <g key={tick}><line className="io-grid" x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} /><text className="io-axis" x={left - 8} y={y(tick) + 4} textAnchor="end">×{tick.toFixed(2)}</text></g>)}
      {xTicks.map((tick) => <text key={tick} className="io-axis" x={x(tick)} y={height - bottom + 18} textAnchor="middle">{compact(tick)}</text>)}
      <line className="io-baseline" x1={left} x2={width - right} y1={height - bottom} y2={height - bottom} />
      <text className="io-axis" x={(left + width - right) / 2} y={height - 4} textAnchor="middle">Invoice value in {currency} (log scale)</text>
      {periodFactor !== null && periodFactor >= yScale.low && periodFactor <= yScale.high ? <g><line className="io-reference" x1={left} x2={width - right} y1={y(periodFactor)} y2={y(periodFactor)} /><text className="io-axis" x={width - right} y={y(periodFactor) - 6} textAnchor="end">Period {factor(periodFactor)}</text></g> : null}
      {points.map((point) => <g key={point.id} className={`io-point${point.id === selectedId ? ' selected' : ''}`} onClick={() => onSelect(point.id)} onMouseMove={(event) => tooltip.show(event, point.reference, [point.client, `Invoice value ${mxn(point.invoiceValue)}`, `Landed cost ${mxn(point.landed)}`, `Landing factor ${factor(point.factor)}`])}>
        <circle className="io-hit" cx={x(point.invoiceValue)} cy={y(point.factor)} r={12} />
        <circle className={slot(point.client)} cx={x(point.invoiceValue)} cy={y(point.factor)} r={point.id === selectedId ? 7 : 5.5} />
        {outliers.has(point.id) ? <text className="io-value" x={x(point.invoiceValue) + 10} y={y(point.factor) + 4}>{point.reference} · {factor(point.factor)}</text> : null}
      </g>)}
    </svg> : <p className="io-empty-note">No orders with merchandise value in this period.</p>}
  </ChartCard>;
}

export function ImportOrdersDashboard({ records, loading, selectedId, onSelect, currency = 'MXN', currencyNote }: Props) {
  const [period, setPeriod] = React.useState<ImportPeriod>('ytd');
  const [range, setRange] = React.useState<DateRange>({ from: '', to: '' });
  const rangeInverted = period === 'custom' && Boolean(range.from && range.to && range.from > range.to);
  const scoped = React.useMemo(() => rangeInverted ? [] : filterByPeriod(records, period, new Date(), range), [records, period, range, rangeInverted]);
  // A custom range starts from the dates of the view the user was looking at, so it only needs adjusting.
  const choosePeriod = (next: ImportPeriod) => {
    if (next === 'custom' && period !== 'custom') {
      const earliest = records.reduce((first, record) => record.created_at < first ? record.created_at : first, new Date().toISOString());
      const created = new Date(earliest);
      setRange(period === 'all' ? { from: `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}-${String(created.getDate()).padStart(2, '0')}`, to: periodRange('month').to } : periodRange(period));
    }
    setPeriod(next);
  };
  const summary = React.useMemo(() => summarizeImports(scoped), [scoped]);
  // Client colours are ranked on the full history, so changing the period never repaints a client.
  const clientOrder = React.useMemo(() => marginByClient(records).map((client) => client.client), [records]);
  const periodLabel = period === 'custom' ? rangeLabel(range) : (periods.find((option) => option.value === period)?.label ?? '').toLowerCase();
  return <CurrencyContext.Provider value={currency}><section className="io-dashboard">
    <header className="io-dashboard-header">
      <div><span>Import performance</span><strong>Landed cost, margin and logistics load</strong></div>
      <div className="io-period" role="group" aria-label="Period">{periods.map((option) => <button key={option.value} type="button" aria-pressed={period === option.value} onClick={() => choosePeriod(option.value)}>{option.label}</button>)}</div>
    </header>
    {currencyNote ? <p className="io-currency-note">{currencyNote}</p> : null}
    {period === 'custom' ? <div className="io-range">
      <label><span>From</span><input type="date" value={range.from} max={range.to || undefined} onChange={(event) => setRange((current) => ({ ...current, from: event.target.value }))} /></label>
      <label><span>To</span><input type="date" value={range.to} min={range.from || undefined} onChange={(event) => setRange((current) => ({ ...current, to: event.target.value }))} /></label>
      <small className={rangeInverted ? 'error' : ''} role={rangeInverted ? 'alert' : undefined}>{rangeInverted ? 'The start date is after the end date.' : `${rangeLabel(range)} · both dates included. Leave a date empty to keep that end open.`}</small>
    </div> : null}
    {loading ? <p className="io-empty-note">Loading import analytics…</p> : !scoped.length ? <p className="io-empty-note">{rangeInverted ? 'Correct the date range to see the analytics.' : `No import orders were created in this period${period === 'all' ? '' : '. Choose a longer period to see the history'}.`}</p> : <>
      <KpiTiles summary={summary} periodLabel={periodLabel} />
      <div className="io-charts">
        <OrderMarginChart records={scoped} selectedId={selectedId} onSelect={onSelect} />
        <ClientMarginChart records={scoped} />
        <CostCompositionChart records={scoped} />
        <MonthlyTrendChart records={scoped} />
        <LandingFactorChart records={scoped} clientOrder={clientOrder} selectedId={selectedId} onSelect={onSelect} periodFactor={summary.landingFactor} />
      </div>
    </>}
  </section></CurrencyContext.Provider>;
}
