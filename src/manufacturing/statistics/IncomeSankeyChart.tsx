import React from 'react';

export type IncomeProductionRow = {
  id: string;
  serial_number: string;
  production_order_id: string;
  quotation_id: string;
  reported_at: string;
  verified_quotation_price: number | null;
  mes_production_orders: { order_number: string; assigned_work_center?: string } | Array<{ order_number: string; assigned_work_center?: string }> | null;
  mes_quotations: {
    quotation_number: string;
    client_name: string;
    total_price: number;
    currency: string | null;
  } | Array<{
    quotation_number: string;
    client_name: string;
    total_price: number;
    currency: string | null;
  }> | null;
};

type SankeyNode = { id: string; label: string; detail: string; value: number; x: number; y: number; height: number; color: string };
type SankeyLink = { id: string; source: SankeyNode; target: SankeyNode; value: number; sourceOffset: number; targetOffset: number; color: string };

const clientPalette = ['#2563eb', '#f97316', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4', '#eab308', '#ef4444', '#14b8a6', '#6366f1', '#84cc16', '#f43f5e'];
const first = <T,>(value: T | T[] | null) => Array.isArray(value) ? value[0] : value;

export const formatIncome = (value: number, currency = 'USD') => {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
};

function makeNodes(
  entries: Array<{ id: string; label: string; detail: string; value: number; color: string }>,
  x: number,
  height: number,
) {
  const gap = 18;
  const available = Math.max(100, height - 62 - gap * Math.max(0, entries.length - 1));
  const total = entries.reduce((sum, entry) => sum + entry.value, 0) || 1;
  let y = 48;
  return entries.map((entry) => {
    const node = { ...entry, x, y, height: entry.value / total * available };
    y += node.height + gap;
    return node;
  });
}

function linkPath(link: SankeyLink, scale: number) {
  const thickness = Math.max(2, link.value * scale);
  const sy = link.source.y + link.sourceOffset + thickness / 2;
  const ty = link.target.y + link.targetOffset + thickness / 2;
  const sx = link.source.x + 18;
  const tx = link.target.x;
  const curve = Math.max(60, (tx - sx) * .48);
  return { thickness, d: `M ${sx} ${sy} C ${sx + curve} ${sy}, ${tx - curve} ${ty}, ${tx} ${ty}` };
}

export function IncomeSankeyChart({ rows, currency }: { rows: IncomeProductionRow[]; currency: string }) {
  const chart = React.useMemo(() => {
    const clientNames = [...new Set(rows.map((row) => first(row.mes_quotations)?.client_name || 'Unknown client'))]
      .sort((left, right) => left.localeCompare(right));
    const colorByClient = new Map(clientNames.map((clientName, index) => [
      clientName,
      clientPalette[index] ?? `hsl(${Math.round(index * 137.508) % 360} 72% 48%)`,
    ]));
    const clients = new Map<string, { id: string; label: string; detail: string; value: number; color: string }>();
    const quotes = new Map<string, { id: string; label: string; detail: string; value: number; color: string; clientId: string }>();
    const orders = new Map<string, { id: string; label: string; detail: string; value: number; color: string }>();
    const quoteOrderValues = new Map<string, number>();
    rows.forEach((row) => {
      const quotation = first(row.mes_quotations);
      const order = first(row.mes_production_orders);
      if (!quotation) return;
      const value = Math.max(0, Number(row.verified_quotation_price ?? quotation.total_price) || 0);
      const clientName = quotation.client_name || 'Unknown client';
      const clientId = `client:${clientName}`;
      const color = colorByClient.get(clientName) ?? '#64748b';
      const currentClient = clients.get(clientId);
      clients.set(clientId, { id: clientId, label: quotation.client_name || 'Unknown client', detail: 'Client', value: (currentClient?.value ?? 0) + value, color });
      const currentQuote = quotes.get(row.quotation_id);
      quotes.set(row.quotation_id, { id: row.quotation_id, label: quotation.quotation_number, detail: `${currentQuote ? Number(currentQuote.detail.split(' ')[0]) + 1 : 1} produced piece${currentQuote ? 's' : ''}`, value: (currentQuote?.value ?? 0) + value, color, clientId });
      const orderId = row.production_order_id;
      const currentOrder = orders.get(orderId);
      orders.set(orderId, { id: orderId, label: order?.order_number ?? 'Production order', detail: `${currentOrder ? Number(currentOrder.detail.split(' ')[0]) + 1 : 1} produced piece${currentOrder ? 's' : ''}`, value: (currentOrder?.value ?? 0) + value, color });
      quoteOrderValues.set(`${row.quotation_id}|${orderId}`, (quoteOrderValues.get(`${row.quotation_id}|${orderId}`) ?? 0) + value);
    });
    const sorted = <T extends { value: number }>(items: T[]) => items.sort((a, b) => b.value - a.value);
    const nodeCount = Math.max(clients.size, quotes.size, orders.size);
    const height = Math.max(440, nodeCount * 66 + 70);
    const clientNodes = makeNodes(sorted([...clients.values()]), 48, height);
    const quoteNodes = makeNodes(sorted([...quotes.values()]), 800, height);
    const orderNodes = makeNodes(sorted([...orders.values()]), 1500, height);
    const nodeById = new Map([...clientNodes, ...quoteNodes, ...orderNodes].map((node) => [node.id, node]));
    const maxColumnTotal = Math.max(
      clientNodes.reduce((sum, node) => sum + node.value, 0),
      quoteNodes.reduce((sum, node) => sum + node.value, 0),
      1,
    );
    const linkScale = (height - 62 - Math.max(0, nodeCount - 1) * 18) / maxColumnTotal;
    const sourceOffsets = new Map<string, number>();
    const targetOffsets = new Map<string, number>();
    const links: SankeyLink[] = [];
    quotes.forEach((quote) => {
      const source = nodeById.get(quote.clientId);
      const target = nodeById.get(quote.id);
      if (!source || !target) return;
      links.push({ id: `${source.id}:${target.id}`, source, target, value: quote.value, sourceOffset: sourceOffsets.get(source.id) ?? 0, targetOffset: targetOffsets.get(target.id) ?? 0, color: quote.color });
      sourceOffsets.set(source.id, (sourceOffsets.get(source.id) ?? 0) + quote.value * linkScale);
      targetOffsets.set(target.id, (targetOffsets.get(target.id) ?? 0) + quote.value * linkScale);
    });
    quoteOrderValues.forEach((value, key) => {
      const [quoteId, orderId] = key.split('|');
      const source = nodeById.get(quoteId);
      const target = nodeById.get(orderId);
      if (!source || !target) return;
      links.push({ id: key, source, target, value, sourceOffset: sourceOffsets.get(source.id) ?? 0, targetOffset: targetOffsets.get(target.id) ?? 0, color: source.color });
      sourceOffsets.set(source.id, (sourceOffsets.get(source.id) ?? 0) + value * linkScale);
      targetOffsets.set(target.id, (targetOffsets.get(target.id) ?? 0) + value * linkScale);
    });
    return { height, nodes: [...clientNodes, ...quoteNodes, ...orderNodes], links, linkScale };
  }, [rows]);

  if (!rows.length) return <div className="statistics-income-empty"><strong>No linked income yet</strong><span>Income will appear when a good piece linked to a quotation is produced during this week.</span></div>;

  return (
    <div className="statistics-sankey-wrap">
      <svg className="statistics-income-sankey" viewBox={`0 0 1800 ${chart.height}`} role="img" aria-label="Weekly income flow from clients through quotations to production orders">
        <text x="48" y="25" className="statistics-sankey-column-title">CLIENTS</text>
        <text x="800" y="25" className="statistics-sankey-column-title">QUOTATIONS</text>
        <text x="1500" y="25" className="statistics-sankey-column-title">PRODUCTION ORDERS</text>
        <g className="statistics-sankey-links">
          {chart.links.map((link) => { const path = linkPath(link, chart.linkScale); return <path key={link.id} d={path.d} stroke={link.color} strokeWidth={path.thickness}><title>{`${link.source.label} → ${link.target.label}: ${formatIncome(link.value, currency)}`}</title></path>; })}
        </g>
        <g className="statistics-sankey-nodes">
          {chart.nodes.map((node) => <g key={node.id} transform={`translate(${node.x} ${node.y})`}><rect width="18" height={Math.max(8, node.height)} rx="5" fill={node.color} /><text x="29" y={Math.max(12, node.height / 2 - 3)} className="label">{node.label}</text><text x="29" y={Math.max(25, node.height / 2 + 12)} className="value">{formatIncome(node.value, currency)} · {node.detail}</text><title>{`${node.label}: ${formatIncome(node.value, currency)}`}</title></g>)}
        </g>
      </svg>
    </div>
  );
}
