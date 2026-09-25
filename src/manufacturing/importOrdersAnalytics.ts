// Aggregations behind the Import Orders dashboard. Every amount is the MXN figure recorded on the estimate,
// so the dashboard reads the saved result and never re-costs an order with today's exchange rate.
export type ImportOrderRecord = {
  id: string; reference_number: string; client_name: string; created_at: string; warranty?: boolean | null;
  merchandise_cost: number | string; logistics_cost: number | string; total_cost: number | string; client_sale: number | string; profit_loss: number | string;
  international_freight?: number | string | null; insurance?: number | string | null; customs_agent_fees?: number | string | null; handling?: number | string | null;
  domestic_transport?: number | string | null; other_expenses?: number | string | null; logistics_management?: number | string | null;
};

const num = (value: unknown) => Number(value) || 0;
const TOLERANCE = .005;

export type ImportPeriod = 'month' | 'ytd' | '12m' | 'all' | 'custom';
// A custom range holds calendar dates (YYYY-MM-DD); both ends are inclusive and either may be left open.
export type DateRange = { from: string; to: string };
const startOfDay = (date: string) => { const [year, month, day] = date.split('-').map(Number); return new Date(year, month - 1, day); };
const toDateInput = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

// The calendar dates a preset covers, used to seed a custom range from the preset the user was looking at.
export function periodRange(period: Exclude<ImportPeriod, 'custom' | 'all'>, now = new Date()): DateRange {
  const start = period === 'month' ? new Date(now.getFullYear(), now.getMonth(), 1) : period === 'ytd' ? new Date(now.getFullYear(), 0, 1) : new Date(now.getFullYear(), now.getMonth() - 11, 1);
  return { from: toDateInput(start), to: toDateInput(now) };
}

export function filterByPeriod<T extends ImportOrderRecord>(records: T[], period: ImportPeriod, now = new Date(), range: DateRange = { from: '', to: '' }): T[] {
  if (period === 'all') return records;
  if (period === 'custom') {
    const from = range.from ? startOfDay(range.from) : null, to = range.to ? startOfDay(range.to) : null;
    if (to) to.setDate(to.getDate() + 1);
    return records.filter((record) => { const created = new Date(record.created_at); return (!from || created >= from) && (!to || created < to); });
  }
  const start = startOfDay(periodRange(period, now).from);
  return records.filter((record) => new Date(record.created_at) >= start);
}

// Warranty imports carry no merchandise cost, so their landing factor is undefined and they stay out of it.
const hasMerchandise = (record: ImportOrderRecord) => !record.warranty && num(record.merchandise_cost) > 0;

export type ImportSummary = {
  orderCount: number; totalLanded: number; totalSale: number; netMargin: number; weightedMarginPercent: number | null;
  profitCount: number; lossCount: number; breakEvenCount: number; averageLanded: number;
  landingFactor: number | null; factorOrderCount: number; excludedFromFactor: number;
};

export function summarizeImports(records: ImportOrderRecord[]): ImportSummary {
  const totalLanded = records.reduce((sum, record) => sum + num(record.total_cost), 0);
  const totalSale = records.reduce((sum, record) => sum + num(record.client_sale), 0);
  const netMargin = records.reduce((sum, record) => sum + num(record.profit_loss), 0);
  const factorOrders = records.filter(hasMerchandise);
  const factorCost = factorOrders.reduce((sum, record) => sum + num(record.total_cost), 0);
  const factorMerchandise = factorOrders.reduce((sum, record) => sum + num(record.merchandise_cost), 0);
  return {
    orderCount: records.length, totalLanded, totalSale, netMargin,
    // Weighted: total margin over total sale, so a large order counts for what it is worth.
    weightedMarginPercent: totalSale > 0 ? netMargin / totalSale * 100 : null,
    profitCount: records.filter((record) => num(record.profit_loss) > TOLERANCE).length,
    lossCount: records.filter((record) => num(record.profit_loss) < -TOLERANCE).length,
    breakEvenCount: records.filter((record) => Math.abs(num(record.profit_loss)) <= TOLERANCE).length,
    averageLanded: records.length ? totalLanded / records.length : 0,
    landingFactor: factorMerchandise > 0 ? factorCost / factorMerchandise : null,
    factorOrderCount: factorOrders.length, excludedFromFactor: records.length - factorOrders.length,
  };
}

export type OrderMargin = { id: string; reference: string; client: string; profitLoss: number; sale: number; landed: number };
export function marginByOrder(records: ImportOrderRecord[]): OrderMargin[] {
  return records.map((record) => ({ id: record.id, reference: record.reference_number, client: record.client_name, profitLoss: num(record.profit_loss), sale: num(record.client_sale), landed: num(record.total_cost) }))
    .sort((a, b) => a.profitLoss - b.profitLoss || a.reference.localeCompare(b.reference));
}

export type ClientMargin = { client: string; orders: number; landed: number; sale: number; profitLoss: number; marginPercent: number | null; saleShare: number };
export function marginByClient(records: ImportOrderRecord[]): ClientMargin[] {
  const groups = new Map<string, ClientMargin>();
  for (const record of records) {
    const client = record.client_name.trim() || 'Unassigned';
    const group = groups.get(client) ?? { client, orders: 0, landed: 0, sale: 0, profitLoss: 0, marginPercent: null, saleShare: 0 };
    group.orders += 1; group.landed += num(record.total_cost); group.sale += num(record.client_sale); group.profitLoss += num(record.profit_loss);
    groups.set(client, group);
  }
  const totalSale = records.reduce((sum, record) => sum + num(record.client_sale), 0);
  return [...groups.values()].map((group) => ({ ...group, marginPercent: group.sale > 0 ? group.profitLoss / group.sale * 100 : null, saleShare: totalSale > 0 ? group.sale / totalSale * 100 : 0 }))
    .sort((a, b) => b.landed - a.landed || a.client.localeCompare(b.client));
}

export const logisticsComponents = [
  ['international_freight', 'International freight'], ['insurance', 'Insurance'], ['customs_agent_fees', 'Customs agent fees'], ['handling', 'Handling'],
  ['domestic_transport', 'Domestic transport'], ['other_expenses', 'Other expenses'], ['logistics_management', 'Logistics management'],
] as const;
export type CostComposition = { merchandise: number; logistics: number; total: number; components: Array<{ key: string; label: string; amount: number; shareOfLanded: number }> };
export function costComposition(records: ImportOrderRecord[]): CostComposition {
  const merchandise = records.reduce((sum, record) => sum + num(record.merchandise_cost), 0);
  const logistics = records.reduce((sum, record) => sum + num(record.logistics_cost), 0);
  const total = merchandise + logistics;
  const components = logisticsComponents.map(([key, label]) => {
    const amount = records.reduce((sum, record) => sum + num(record[key]), 0);
    return { key, label, amount, shareOfLanded: total > 0 ? amount / total * 100 : 0 };
  }).sort((a, b) => b.amount - a.amount);
  return { merchandise, logistics, total, components };
}

export type MonthlyImports = { month: string; landed: number; sale: number; profitLoss: number; marginPercent: number | null; orders: number };
const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
// Months without orders are kept, so the time axis never hides a gap.
export function monthlyTrend(records: ImportOrderRecord[]): MonthlyImports[] {
  if (!records.length) return [];
  const dates = records.map((record) => new Date(record.created_at));
  const first = new Date(Math.min(...dates.map(Number))), last = new Date(Math.max(...dates.map(Number)));
  const months = new Map<string, MonthlyImports>();
  for (let cursor = new Date(first.getFullYear(), first.getMonth(), 1); cursor <= last; cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)) {
    const month = monthKey(cursor);
    months.set(month, { month, landed: 0, sale: 0, profitLoss: 0, marginPercent: null, orders: 0 });
  }
  records.forEach((record, index) => {
    const bucket = months.get(monthKey(dates[index]));
    if (!bucket) return;
    bucket.landed += num(record.total_cost); bucket.sale += num(record.client_sale); bucket.profitLoss += num(record.profit_loss); bucket.orders += 1;
  });
  return [...months.values()].map((bucket) => ({ ...bucket, marginPercent: bucket.sale > 0 ? bucket.profitLoss / bucket.sale * 100 : null }));
}

export type FactorPoint = { id: string; reference: string; client: string; invoiceValue: number; landed: number; factor: number };
export function landingFactorPoints(records: ImportOrderRecord[]): FactorPoint[] {
  return records.filter(hasMerchandise).map((record) => ({ id: record.id, reference: record.reference_number, client: record.client_name, invoiceValue: num(record.merchandise_cost), landed: num(record.total_cost), factor: num(record.total_cost) / num(record.merchandise_cost) }));
}

// Money fields recorded in MXN on every estimate.
const moneyFields = ['merchandise_cost', 'logistics_cost', 'total_cost', 'client_sale', 'profit_loss', ...logisticsComponents.map(([key]) => key)] as const;
export type ConvertibleRecord = ImportOrderRecord & { sale_currency?: string | null; sale_fx?: number | string | null; purchase_currency?: string | null; purchase_fx?: number | string | null };
export type CurrencyView<T> = { records: T[]; recordedRateCount: number; currentRateCount: number; unavailable: boolean };

// Shows the recorded MXN amounts in another currency. An order that was costed in that currency is converted
// with the rate recorded on it, so its figures match the offer; any other order uses the current rate
// (MXN per unit of the display currency). All of an order's amounts share one rate, so its margins hold.
export function convertRecords<T extends ConvertibleRecord>(records: T[], currency: string, currentMxnPerUnit: number | null): CurrencyView<T> {
  if (currency === 'MXN') return { records, recordedRateCount: 0, currentRateCount: 0, unavailable: false };
  let recordedRateCount = 0, currentRateCount = 0, unavailable = false;
  const converted = records.map((record) => {
    const recorded = record.sale_currency === currency && num(record.sale_fx) > 0 ? num(record.sale_fx) : record.purchase_currency === currency && num(record.purchase_fx) > 0 ? num(record.purchase_fx) : 0;
    const rate = recorded || currentMxnPerUnit || 0;
    if (recorded) recordedRateCount += 1; else if (rate) currentRateCount += 1; else unavailable = true;
    if (!rate) return record;
    const next: Record<string, unknown> = { ...record };
    for (const field of moneyFields) if (record[field] !== null && record[field] !== undefined) next[field] = num(record[field]) / rate;
    return next as T;
  });
  // Without a current rate some orders could not be converted; mixing them with converted ones would be wrong.
  return unavailable ? { records, recordedRateCount: 0, currentRateCount: 0, unavailable: true } : { records: converted, recordedRateCount, currentRateCount, unavailable: false };
}
