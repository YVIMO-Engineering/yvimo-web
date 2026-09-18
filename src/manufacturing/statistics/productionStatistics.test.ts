import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWeeklyProductionStats, createShiftResolver, type ProductionShiftSchedule, type ProductionStatisticsEvent } from './productionStatistics.ts';

// Mirrors GMEX-Saltillo in Staff > Shifts: shift 2 overlaps shift 3 from 22:00 to 02:00.
const saltillo = (weekStart: string): ProductionShiftSchedule[] => [
  { workCenterCode: 'GMEX-Saltillo', weekStart, shiftNumber: 1, startTime: '06:00:00', endTime: '16:00:00' },
  { workCenterCode: 'GMEX-Saltillo', weekStart, shiftNumber: 2, startTime: '16:00:00', endTime: '02:00:00' },
  { workCenterCode: 'GMEX-Saltillo', weekStart, shiftNumber: 3, startTime: '22:00:00', endTime: '06:00:00' },
];
const at = (value: string) => new Date(value);

test('assigns production to the shift running at that time', () => {
  const resolve = createShiftResolver(saltillo('2026-09-14'));
  assert.deepEqual(resolve(at('2026-09-17T06:00:00'), 'GMEX-Saltillo'), { productionDate: '2026-09-17', shiftNumber: 1 });
  assert.equal(resolve(at('2026-09-17T15:59:00'), 'GMEX-Saltillo').shiftNumber, 1);
  assert.equal(resolve(at('2026-09-17T16:00:00'), 'GMEX-Saltillo').shiftNumber, 2);
});

test('keeps overnight production on the day the shift started', () => {
  const resolve = createShiftResolver(saltillo('2026-09-14'));
  const lateShift2 = resolve(at('2026-09-18T01:30:00'), 'GMEX-Saltillo');
  assert.equal(lateShift2.productionDate, '2026-09-17');
  assert.equal(lateShift2.shiftNumber, 2);
  const lateShift3 = resolve(at('2026-09-18T04:00:00'), 'GMEX-Saltillo');
  assert.equal(lateShift3.productionDate, '2026-09-17');
  assert.equal(lateShift3.shiftNumber, 3);
});

test('the running shift keeps production while a later shift overlaps it', () => {
  const resolve = createShiftResolver(saltillo('2026-09-14'));
  assert.equal(resolve(at('2026-09-17T23:00:00'), 'GMEX-Saltillo').shiftNumber, 2);
});

test('shifts starting after midnight close the previous production day', () => {
  const resolve = createShiftResolver([
    { workCenterCode: 'WC', weekStart: '2026-09-14', shiftNumber: 1, startTime: '06:00', endTime: '14:00' },
    { workCenterCode: 'WC', weekStart: '2026-09-14', shiftNumber: 2, startTime: '14:00', endTime: '22:00' },
    { workCenterCode: 'WC', weekStart: '2026-09-14', shiftNumber: 3, startTime: '00:00', endTime: '06:00' },
  ]);
  assert.deepEqual(resolve(at('2026-09-18T03:00:00'), 'WC'), { productionDate: '2026-09-17', shiftNumber: 3 });
  const gap = resolve(at('2026-09-17T23:00:00'), 'WC');
  assert.equal(gap.shiftNumber, null);
  assert.equal(gap.productionDate, '2026-09-17');
});

test('falls back to the latest earlier week, then to default shift times', () => {
  const resolve = createShiftResolver(saltillo('2026-09-07'));
  assert.equal(resolve(at('2026-09-24T15:00:00'), 'GMEX-Saltillo').shiftNumber, 1);
  assert.equal(resolve(at('2026-09-24T15:00:00'), 'OTHER').shiftNumber, 2);
});

test('builds daily totals split by shift', () => {
  const event = (id: string, createdAt: string, quantity = 1, type: ProductionStatisticsEvent['event_type'] = 'production-good'): ProductionStatisticsEvent => ({ id, event_type: type, quantity, work_center_code: 'GMEX-Saltillo', created_at: createdAt });
  const stats = buildWeeklyProductionStats('2026-09-17', [
    event('a', '2026-09-17T08:00:00', 10),
    event('b', '2026-09-17T18:00:00', 4),
    event('c', '2026-09-18T03:00:00', 2),
    event('d', '2026-09-17T09:00:00', 1, 'production-scrap'),
    event('e', '2026-09-14T03:00:00', 5),
  ], [], saltillo('2026-09-14'));
  const thursday = stats.find((stat) => stat.date === '2026-09-17');
  assert.equal(thursday?.actualProduction, 16);
  assert.equal(thursday?.scrap, 1);
  assert.deepEqual(thursday?.shiftProduction, [
    { shiftNumber: 1, quantity: 10 },
    { shiftNumber: 2, quantity: 4 },
    { shiftNumber: 3, quantity: 2 },
    { shiftNumber: null, quantity: 0 },
  ]);
  // Monday 03:00 belongs to the previous Sunday's shift 3, outside this week.
  assert.equal(stats[0].actualProduction, 0);
});
