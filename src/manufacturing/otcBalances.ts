// Pure balance math shared by the OTC registries and the Reconciliation view.
//
// The chain is PO line -> remission line -> invoice line. Only active remissions and active
// invoices count; the database guarantees that the active remissions of a PO line never exceed
// its quantity and that the active invoices of a remission line never exceed what it delivered.

export type BillingStatus = 'pending' | 'partial' | 'invoiced';

export type ToolUsage = { toolId: string | null; pieces: number };

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

// Each piece of a production order linked to a PO uses the first line that lists its Tool ID;
// pieces whose Tool ID is on no line are reported apart instead of being guessed.
export function assignUsageToLines(lines: Array<{ toolIds: string[] }>, usage: ToolUsage[]) {
  const used = lines.map(() => 0);
  let unmatched = 0;
  usage.forEach((entry) => {
    const pieces = Number(entry.pieces) || 0;
    const toolId = entry.toolId?.trim().toLowerCase();
    const index = toolId ? lines.findIndex((line) => line.toolIds.some((candidate) => candidate.toLowerCase() === toolId)) : -1;
    if (index >= 0) used[index] += pieces;
    else unmatched += pieces;
  });
  return { used, unmatched };
}

// Sums quantity per key over the rows whose owner is active.
export function sumActiveQuantities<Row extends { quantity: number }>(rows: Row[], keyOf: (row: Row) => string, isActive: (row: Row) => boolean) {
  const totals = new Map<string, number>();
  rows.forEach((row) => {
    if (!isActive(row)) return;
    const key = keyOf(row);
    totals.set(key, (totals.get(key) ?? 0) + row.quantity);
  });
  return totals;
}

export function billingStatus(lines: Array<{ quantity: number; invoiced: number }>): BillingStatus {
  const delivered = lines.reduce((sum, line) => sum + line.quantity, 0);
  const invoiced = lines.reduce((sum, line) => sum + Math.min(line.invoiced, line.quantity), 0);
  if (invoiced <= 0) return 'pending';
  return invoiced >= delivered ? 'invoiced' : 'partial';
}

export function invoiceTotals(lineSubtotals: number[], taxRate: number) {
  const subtotal = roundMoney(lineSubtotals.reduce((sum, value) => sum + value, 0));
  const tax = roundMoney(subtotal * taxRate);
  return { subtotal, tax, total: roundMoney(subtotal + tax) };
}

export function addToCurrency(totals: Map<string, number>, currency: string, value: number) {
  totals.set(currency, roundMoney((totals.get(currency) ?? 0) + value));
  return totals;
}

// Whole days between two calendar dates (YYYY-MM-DD), never negative.
export function daysBetween(fromIso: string, toIso: string) {
  const toDay = (value: string) => {
    const [year, month, day] = value.slice(0, 10).split('-').map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.max(0, Math.round((toDay(toIso) - toDay(fromIso)) / 86400000));
}
