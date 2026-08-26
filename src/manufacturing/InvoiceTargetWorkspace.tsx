import React from 'react';
import { ArrowLeft, CalendarDays, Check, FileText, FileUp, LineChart, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import './invoiceTargetWorkspace.css';

type Props = { onNavigate: (path: string) => void; organizationId: string };
type WorkCenter = { code: string; name: string };
type InvoiceReport = { fileName: string; amount: number; total: number; currency: string; uploadedAt: string };
type SavedReports = Record<string, InvoiceReport>;

const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const colors = ['#f97316', '#0f766e', '#2563eb', '#7c3aed', '#db2777', '#65a30d', '#0891b2', '#dc2626', '#a16207', '#4f46e5', '#059669', '#9333ea'];
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
const compactMoney = new Intl.NumberFormat('en-US', { notation: 'compact', style: 'currency', currency: 'MXN', maximumFractionDigits: 1 });

const storageKey = (organizationId: string, year: number) => `yvimo:invoice-target:${organizationId}:${year}`;
const reportKey = (workCenterCode: string, month: number) => `${workCenterCode}:${month}`;

const decodePdfString = (value: string) => value
  .replace(/\\([()\\])/g, '$1')
  .replace(/\\([0-7]{1,3})/g, (_, octal: string) => String.fromCharCode(parseInt(octal, 8)));

const inflatePdfStreams = async (buffer: ArrayBuffer) => {
  const source = new TextDecoder('latin1').decode(buffer);
  const chunks: string[] = [];
  const regex = /stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source))) {
    const end = source.indexOf('endstream', match.index);
    if (end < 0) break;
    let raw = new Uint8Array(buffer.slice(match.index + match[0].length, end));
    while (raw.length && (raw[raw.length - 1] === 10 || raw[raw.length - 1] === 13)) raw = raw.slice(0, -1);
    try {
      const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate'));
      chunks.push(await new Response(stream).text());
    } catch { /* Images and uncompressed streams are not report text. */ }
    regex.lastIndex = end + 9;
  }
  return chunks.join('\n');
};

const parseContpaqReport = async (file: File) => {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) throw new Error('Upload a PDF sales report.');
  const text = await inflatePdfStreams(await file.arrayBuffer());
  if (!/Reporte de Ventas por Cliente/i.test(text)) throw new Error('This is not a CONTPAQ Sales by Customer report.');
  const values = [...text.matchAll(/\(((?:\\.|[^\\)])*)\)Tj/g)].map((item) => decodePdfString(item[1]).trim());
  const generalIndex = values.findIndex((value) => value === 'Total General');
  if (generalIndex < 0) throw new Error('The report does not include a Total General row.');
  const totals = values.slice(generalIndex + 1).filter((value) => /^-?[\d,]+\.\d{2}$/.test(value)).slice(0, 6).map((value) => Number(value.split(',').join('')));
  if (totals.length < 6 || totals.some((value) => !Number.isFinite(value))) throw new Error('The Total General amounts could not be read.');
  const period = values.find((value) => /Del \d{2}\/[A-Z]{3}\/\d{4} al/i.test(value));
  const periodMatch = period?.match(/Del \d{2}\/([A-Z]{3})\/(\d{4})/i);
  const monthCodes = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
  return { amount: totals[3], total: totals[5], month: periodMatch ? monthCodes.indexOf(periodMatch[1].toUpperCase()) : -1, year: Number(periodMatch?.[2] || 0) };
};

function AnnualChart({ workCenters, reports }: { workCenters: WorkCenter[]; reports: SavedReports }) {
  const series = workCenters.map((center, index) => ({ ...center, color: colors[index % colors.length], values: months.map((_, month) => reports[reportKey(center.code, month)]?.amount ?? null) })).filter((center) => center.values.some((value) => value !== null));
  const maximum = Math.max(1, ...series.flatMap((item) => item.values.map((value) => value ?? 0)));
  const width = 980; const height = 390; const left = 82; const top = 24; const plotWidth = 865; const plotHeight = 290;
  const x = (index: number) => left + (plotWidth * index / 11);
  const y = (value: number) => top + plotHeight - (value / maximum * plotHeight);
  return <div className="invoice-chart-wrap">
    {series.length ? <>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Annual invoicing by workcenter">
        {[0, .25, .5, .75, 1].map((ratio) => <g key={ratio}><line x1={left} x2={left + plotWidth} y1={y(maximum * ratio)} y2={y(maximum * ratio)} className="invoice-grid-line" /><text x={left - 12} y={y(maximum * ratio) + 4} textAnchor="end">{compactMoney.format(maximum * ratio)}</text></g>)}
        {months.map((month, index) => <text key={month} x={x(index)} y={top + plotHeight + 28} textAnchor="middle">{month.slice(0, 3)}</text>)}
        {series.map((item) => { const points = item.values.map((value, index) => value === null ? null : `${x(index)},${y(value)}`); const segments: string[][] = []; let current: string[] = []; points.forEach((point) => { if (point) current.push(point); else if (current.length) { segments.push(current); current = []; } }); if (current.length) segments.push(current); return <g key={item.code}>{segments.map((segment, index) => <polyline key={index} points={segment.join(' ')} fill="none" stroke={item.color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />)}{item.values.map((value, index) => value === null ? null : <circle key={index} cx={x(index)} cy={y(value)} r="5" fill={item.color}><title>{item.name} · {months[index]}: {money.format(value)}</title></circle>)}</g>; })}
      </svg>
      <div className="invoice-chart-legend">{series.map((item) => <span key={item.code}><i style={{ background: item.color }} />{item.name}</span>)}</div>
    </> : <div className="invoice-chart-empty"><LineChart size={34} /><strong>No invoicing reports yet</strong><span>Upload a monthly PDF to begin the annual chart.</span></div>}
  </div>;
}

export function InvoiceTargetWorkspace({ onNavigate, organizationId }: Props) {
  const [year, setYear] = React.useState(new Date().getFullYear());
  const [workCenters, setWorkCenters] = React.useState<WorkCenter[]>([]);
  const [selected, setSelected] = React.useState('');
  const [reports, setReports] = React.useState<SavedReports>({});
  const [message, setMessage] = React.useState('');
  React.useEffect(() => { void supabase.from('mes_work_centers').select('code, name').eq('organization_id', organizationId).order('name').then(({ data }) => { const rows = (data ?? []) as WorkCenter[]; setWorkCenters(rows); setSelected((current) => current || rows[0]?.code || ''); }); }, [organizationId]);
  React.useEffect(() => { try { setReports(JSON.parse(localStorage.getItem(storageKey(organizationId, year)) || '{}')); } catch { setReports({}); } }, [organizationId, year]);
  const persist = (next: SavedReports) => { setReports(next); localStorage.setItem(storageKey(organizationId, year), JSON.stringify(next)); };
  const upload = async (month: number, file?: File) => {
    if (!file || !selected) return;
    setMessage('');
    try {
      const parsed = await parseContpaqReport(file);
      if (parsed.month >= 0 && parsed.month !== month) throw new Error(`This report belongs to ${months[parsed.month]}, not ${months[month]}.`);
      if (parsed.year && parsed.year !== year) throw new Error(`This report belongs to ${parsed.year}, not ${year}.`);
      persist({ ...reports, [reportKey(selected, month)]: { fileName: file.name, amount: parsed.amount, total: parsed.total, currency: 'MXN', uploadedAt: new Date().toISOString() } });
      setMessage(`${months[month]} loaded: ${money.format(parsed.amount)} net invoicing.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'The report could not be processed.'); }
  };
  const selectedName = workCenters.find((center) => center.code === selected)?.name ?? 'Workcenter';
  const annualTotal = Object.entries(reports).filter(([key]) => key.startsWith(`${selected}:`)).reduce((sum, [, report]) => sum + report.amount, 0);
  return <section className="invoice-target-workspace">
    <header className="invoice-target-header"><button type="button" onClick={() => onNavigate('/workspace/manufacturing-ops/intelligence')}><ArrowLeft size={16} /> Ops Intelligence</button><div><span>OPS INTELLIGENCE / FINANCIAL STATUS</span><h1>Invoice Target</h1><p>Annual invoicing visibility by workcenter</p></div><label><span>Fiscal year</span><select value={year} onChange={(event) => setYear(Number(event.target.value))}>{Array.from({ length: 7 }, (_, index) => new Date().getFullYear() + 2 - index).map((value) => <option key={value}>{value}</option>)}</select></label></header>
    {message ? <div className="invoice-target-message">{message}</div> : null}
    <div className="invoice-target-layout">
      <aside className="invoice-upload-panel"><header><FileUp size={19} /><div><span>REPORT INPUT</span><h2>Monthly sales files</h2></div></header><label className="invoice-workspace-select"><span>Workspace / workcenter</span><select value={selected} onChange={(event) => setSelected(event.target.value)}>{workCenters.map((center) => <option value={center.code} key={center.code}>{center.name} ({center.code})</option>)}</select></label><div className="invoice-month-list">{months.map((month, index) => { const report = reports[reportKey(selected, index)]; return <article className={report ? 'loaded' : ''} key={month}><span className="invoice-month-icon">{report ? <Check size={15} /> : <CalendarDays size={15} />}</span><div><strong>{month}</strong><small>{report ? `${money.format(report.amount)} · ${report.fileName}` : 'No report uploaded'}</small></div><label title={`Upload ${month} report`}><FileText size={16} /><span>{report ? 'Replace' : 'Upload'}</span><input type="file" accept="application/pdf,.pdf" onChange={(event) => { void upload(index, event.target.files?.[0]); event.currentTarget.value = ''; }} /></label>{report ? <button type="button" title="Remove report" onClick={() => { const next = { ...reports }; delete next[reportKey(selected, index)]; persist(next); }}><Trash2 size={15} /></button> : null}</article>; })}</div></aside>
      <main className="invoice-annual-panel"><header><div><span>ANNUAL PERFORMANCE · NET OF TAX</span><h2>{year} invoicing overview</h2><p>Every line represents one workcenter. Empty months remain unconnected until a report is uploaded.</p></div><div><small>{selectedName}</small><strong>{money.format(annualTotal)}</strong><span>selected annual total</span></div></header><AnnualChart workCenters={workCenters} reports={reports} /><footer><span><i /> Values use “Neto-Desc.” from the CONTPAQ Total General row.</span><strong>{Object.keys(reports).length} monthly reports loaded</strong></footer></main>
    </div>
  </section>;
}
