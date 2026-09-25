import assert from 'node:assert/strict';
import test from 'node:test';
import { addToCurrency, assignUsageToLines, billingStatus, daysBetween, getStatus, invoiceTotals, stageCoverage, stageLimit, sumActiveQuantities } from './otcBalances.ts';

test('usage goes to the first line listing the Tool ID, case-insensitively', () => {
  const lines = [{ toolIds: ['HB-1', 'HB-2'] }, { toolIds: ['hb-2', 'HB-3'] }];
  const result = assignUsageToLines(lines, [
    { toolId: 'hb-2', pieces: 3 },
    { toolId: ' HB-3 ', pieces: 2 },
    { toolId: 'HB-9', pieces: 4 },
    { toolId: null, pieces: 1 },
  ]);
  assert.deepEqual(result.used, [3, 2]);
  assert.equal(result.unmatched, 5);
});

test('only rows of active owners are summed', () => {
  const rows = [
    { key: 'a', quantity: 2, active: true },
    { key: 'a', quantity: 5, active: false },
    { key: 'b', quantity: 1, active: true },
    { key: 'a', quantity: 3, active: true },
  ];
  const totals = sumActiveQuantities(rows, (row) => row.key, (row) => row.active);
  assert.equal(totals.get('a'), 5);
  assert.equal(totals.get('b'), 1);
});

test('billing status of a remission', () => {
  assert.equal(billingStatus([{ quantity: 4, invoiced: 0 }, { quantity: 2, invoiced: 0 }]), 'pending');
  assert.equal(billingStatus([{ quantity: 4, invoiced: 4 }, { quantity: 2, invoiced: 0 }]), 'partial');
  assert.equal(billingStatus([{ quantity: 4, invoiced: 4 }, { quantity: 2, invoiced: 2 }]), 'invoiced');
  // Extra invoiced pieces on one line never hide pending pieces on another.
  assert.equal(billingStatus([{ quantity: 4, invoiced: 6 }, { quantity: 2, invoiced: 0 }]), 'partial');
});

test('invoice totals round the tax on the subtotal', () => {
  assert.deepEqual(invoiceTotals([10.005, 20.004], 0.16), { subtotal: 30.01, tax: 4.8, total: 34.81 });
  assert.deepEqual(invoiceTotals([], 0.16), { subtotal: 0, tax: 0, total: 0 });
});

test('currency totals stay apart', () => {
  const totals = new Map<string, number>();
  addToCurrency(totals, 'USD', 10.1);
  addToCurrency(totals, 'MXN', 5);
  addToCurrency(totals, 'USD', 0.2);
  assert.equal(totals.get('USD'), 10.3);
  assert.equal(totals.get('MXN'), 5);
});

test('days between calendar dates', () => {
  assert.equal(daysBetween('2026-09-01', '2026-09-25'), 24);
  assert.equal(daysBetween('2026-09-25', '2026-09-01'), 0);
  assert.equal(daysBetween('2026-03-07', '2026-03-09'), 2);
});

test('several documents per stage add up their pieces', () => {
  const coverage = stageCoverage({
    'purchase-order': [{ pieces: 8 }, { pieces: 5 }],
    remission: [{ pieces: 6 }],
    invoice: [],
  });
  assert.deepEqual(coverage, { 'purchase-order': 13, remission: 6, invoice: 0 });
});

test('an order waits on the first stage that does not cover all its pieces', () => {
  assert.equal(getStatus(13, { 'purchase-order': 8, remission: 0, invoice: 0 }), 'purchase-order');
  assert.equal(getStatus(13, { 'purchase-order': 13, remission: 6, invoice: 6 }), 'remission');
  assert.equal(getStatus(13, { 'purchase-order': 13, remission: 13, invoice: 12 }), 'invoice');
  assert.equal(getStatus(13, { 'purchase-order': 13, remission: 13, invoice: 13 }), 'completed');
});

test('each stage can cover at most what the stage before it covers', () => {
  const coverage = { 'purchase-order': 8, remission: 5, invoice: 2 };
  assert.equal(stageLimit(13, coverage, 'purchase-order'), 13);
  assert.equal(stageLimit(13, coverage, 'remission'), 8);
  assert.equal(stageLimit(13, coverage, 'invoice'), 5);
});
