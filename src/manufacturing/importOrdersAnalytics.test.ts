import test from 'node:test';
import assert from 'node:assert/strict';
import { convertRecords, costComposition, filterByPeriod, periodRange, landingFactorPoints, marginByClient, marginByOrder, monthlyTrend, summarizeImports, type ImportOrderRecord } from './importOrdersAnalytics.ts';

const order = (id: string, client: string, created: string, merchandise: number, logistics: number, sale: number, extra: Partial<ImportOrderRecord> = {}): ImportOrderRecord => ({
  id, reference_number: `IMP-${id}`, client_name: client, created_at: created, merchandise_cost: merchandise, logistics_cost: logistics,
  total_cost: merchandise + logistics, client_sale: sale, profit_loss: sale - merchandise - logistics, international_freight: logistics, ...extra,
});
const records = [
  order('1', 'JATCO', '2026-01-15T12:00:00', 100000, 20000, 150000),
  order('2', 'JATCO', '2026-03-10T12:00:00', 50000, 10000, 40000),
  order('3', 'GM SILAO', '2026-03-20T12:00:00', 0, 8000, 0, { warranty: true }),
  order('4', 'GM SILAO', '2025-11-02T12:00:00', 10000, 5000, 15000),
];

test('weights the margin by sale instead of averaging order percentages', () => {
  const summary = summarizeImports(records);
  assert.equal(summary.totalLanded, 203000);
  assert.equal(summary.totalSale, 205000);
  assert.equal(summary.netMargin, 2000);
  assert.ok(Math.abs((summary.weightedMarginPercent ?? 0) - 2000 / 205000 * 100) < 1e-9);
  assert.deepEqual([summary.profitCount, summary.lossCount, summary.breakEvenCount], [1, 2, 1]);
});

test('landing factor excludes warranty orders, which have no merchandise value', () => {
  const summary = summarizeImports(records);
  assert.equal(summary.factorOrderCount, 3);
  assert.equal(summary.excludedFromFactor, 1);
  assert.ok(Math.abs((summary.landingFactor ?? 0) - 195000 / 160000) < 1e-9);
  assert.deepEqual(landingFactorPoints(records).map((point) => point.id), ['1', '2', '4']);
  assert.equal(landingFactorPoints(records).find((point) => point.id === '4')?.factor, 1.5);
});

test('reports no margin percent when nothing was sold', () => {
  assert.equal(summarizeImports([records[2]]).weightedMarginPercent, null);
  assert.equal(summarizeImports([]).landingFactor, null);
});

test('filters the period from the start of the month or year', () => {
  const now = new Date('2026-03-25T12:00:00');
  assert.deepEqual(filterByPeriod(records, 'month', now).map((record) => record.id), ['2', '3']);
  assert.deepEqual(filterByPeriod(records, 'ytd', now).map((record) => record.id), ['1', '2', '3']);
  assert.equal(filterByPeriod(records, '12m', now).length, 4);
});

test('a custom range includes both end dates and may be left open', () => {
  const now = new Date('2026-03-25T12:00:00');
  assert.deepEqual(filterByPeriod(records, 'custom', now, { from: '2026-01-15', to: '2026-03-10' }).map((record) => record.id), ['1', '2']);
  assert.deepEqual(filterByPeriod(records, 'custom', now, { from: '2026-03-11', to: '' }).map((record) => record.id), ['3']);
  assert.deepEqual(filterByPeriod(records, 'custom', now, { from: '', to: '2025-12-31' }).map((record) => record.id), ['4']);
  assert.deepEqual(periodRange('ytd', now), { from: '2026-01-01', to: '2026-03-25' });
});

test('orders margins from worst to best and groups them by client', () => {
  assert.deepEqual(marginByOrder(records).map((row) => row.id), ['2', '3', '4', '1']);
  const clients = marginByClient(records);
  assert.deepEqual(clients.map((client) => client.client), ['JATCO', 'GM SILAO']);
  assert.equal(clients[0].profitLoss, 10000);
  assert.ok(Math.abs(clients[0].saleShare - 190000 / 205000 * 100) < 1e-9);
});

test('keeps empty months on the trend axis', () => {
  const trend = monthlyTrend(records);
  assert.deepEqual(trend.map((month) => month.month), ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03']);
  assert.equal(trend[1].orders, 0);
  assert.equal(trend[1].marginPercent, null);
  assert.equal(trend[4].landed, 68000);
});

test('splits landed cost into merchandise and logistics components', () => {
  const composition = costComposition(records);
  assert.equal(composition.merchandise, 160000);
  assert.equal(composition.logistics, 43000);
  assert.equal(composition.components[0].key, 'international_freight');
  assert.equal(composition.components[0].amount, 43000);
});

test('converts each order with its recorded rate when it was costed in the display currency', () => {
  const usd = { ...records[0], sale_currency: 'USD', sale_fx: 20, purchase_currency: 'USD', purchase_fx: 20 };
  const eur = { ...records[1], sale_currency: 'EUR', sale_fx: 21, purchase_currency: 'EUR', purchase_fx: 21 };
  const view = convertRecords([usd, eur], 'USD', 18);
  assert.equal(view.records[0].total_cost, 120000 / 20);
  assert.equal(view.records[0].profit_loss, 30000 / 20);
  assert.equal(view.records[1].total_cost, 60000 / 18);
  assert.deepEqual([view.recordedRateCount, view.currentRateCount, view.unavailable], [1, 1, false]);
  // One rate per order: each order keeps its own landing factor.
  landingFactorPoints(view.records).forEach((point, index) => assert.ok(Math.abs(point.factor - landingFactorPoints([usd, eur])[index].factor) < 1e-9));
});

test('keeps MXN when a needed current rate is missing', () => {
  const eur = { ...records[1], sale_currency: 'EUR', sale_fx: 21 };
  const view = convertRecords([eur], 'USD', null);
  assert.equal(view.unavailable, true);
  assert.equal(view.records[0].total_cost, 60000);
  assert.equal(convertRecords([eur], 'MXN', null).records[0], eur);
});
