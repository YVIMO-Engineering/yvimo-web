export type DailyProductionStat = {
  date: string;
  dayLabel: string;
  dateLabel: string;
  actualProduction: number;
  targetProduction: number | null;
  expectedProductionNow: number | null;
  scrap: number;
  productionRatePerHour: number | null;
  shiftProduction: ShiftProduction[];
  isToday: boolean;
  isFuture: boolean;
};

// `shiftNumber: null` holds production reported outside every configured shift.
export type ShiftProduction = { shiftNumber: number | null; quantity: number };

export type ProductionShiftSchedule = {
  workCenterCode: string;
  weekStart: string;
  shiftNumber: number;
  startTime: string;
  endTime: string;
};

export type ProductionStatisticsEvent = {
  id: string;
  event_type: 'production-good' | 'production-scrap';
  quantity: number | null;
  work_center_code: string | null;
  created_at: string;
};

export type ProductionTargetOrder = {
  planned_quantity: number;
  due_date: string;
};

export const PRODUCTION_SHIFT_NUMBERS = [1, 2, 3];
// Same fallback the Staff > Shifts module uses before a week is configured.
export const defaultShiftTimes = [
  { startTime: '06:00', endTime: '14:00' },
  { startTime: '14:00', endTime: '22:00' },
  { startTime: '22:00', endTime: '06:00' },
];

export const TEMPORARY_DAILY_TARGET = 30;
export const TEMPORARY_WEEKLY_TARGET = TEMPORARY_DAILY_TARGET * 7;

export const toLocalDateInput = (date: Date) => {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
};

export const addDays = (dateValue: string, days: number) => {
  const date = new Date(`${dateValue}T12:00:00`);
  date.setDate(date.getDate() + days);
  return toLocalDateInput(date);
};

export const getWeekRange = (anchorDate: string) => {
  const anchor = new Date(`${anchorDate}T12:00:00`);
  const mondayOffset = (anchor.getDay() + 6) % 7;
  const from = addDays(anchorDate, -mondayOffset);
  return { from, to: addDays(from, 6) };
};

export const formatShiftTime = (time: string) => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(`2000-01-01T${time.slice(0, 5)}:00`));

const toMinutes = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
};

const atLocalMinutes = (dateValue: string, minutes: number) => {
  const date = new Date(`${dateValue}T00:00:00`);
  date.setMinutes(minutes);
  return date.getTime();
};

// Weeks never opened in Staff > Shifts have no rows yet; the latest earlier
// configuration is what that module would copy forward.
export function getWeekShiftTimes(schedules: ProductionShiftSchedule[], workCenterCode: string, weekStart: string) {
  const rows = schedules
    .filter((schedule) => schedule.workCenterCode === workCenterCode)
    .sort((left, right) => right.weekStart.localeCompare(left.weekStart));
  const effectiveWeek = rows.find((row) => row.weekStart <= weekStart)?.weekStart ?? rows[rows.length - 1]?.weekStart;
  return PRODUCTION_SHIFT_NUMBERS.map((shiftNumber) => {
    const row = rows.find((candidate) => candidate.weekStart === effectiveWeek && candidate.shiftNumber === shiftNumber);
    const fallback = defaultShiftTimes[shiftNumber - 1];
    return { shiftNumber, startTime: (row?.startTime ?? fallback.startTime).slice(0, 5), endTime: (row?.endTime ?? fallback.endTime).slice(0, 5) };
  });
}

/**
 * Maps a production timestamp to the shift that was running and to the
 * production day that shift belongs to. A shift crossing midnight stays on the
 * day it started, and shifts starting before shift 1 (e.g. 00:00–06:00) close
 * the previous production day. When shifts overlap, the one already running
 * keeps the production until it ends.
 */
export function createShiftResolver(schedules: ProductionShiftSchedule[]) {
  const shiftsCache = new Map<string, Array<{ shiftNumber: number; start: number; end: number }>>();
  const shiftsFor = (workCenterCode: string, weekStart: string) => {
    const cacheKey = `${workCenterCode}|${weekStart}`;
    const cached = shiftsCache.get(cacheKey);
    if (cached) return cached;
    const shifts = getWeekShiftTimes(schedules, workCenterCode, weekStart)
      .map((shift) => ({ shiftNumber: shift.shiftNumber, start: toMinutes(shift.startTime), end: toMinutes(shift.endTime) }));
    shiftsCache.set(cacheKey, shifts);
    return shifts;
  };

  return (timestamp: Date, workCenterCode: string | null): { productionDate: string; shiftNumber: number | null } => {
    const time = timestamp.getTime();
    const calendarDate = toLocalDateInput(timestamp);
    let match: { productionDate: string; shiftNumber: number; startsAt: number } | null = null;
    for (const day of [calendarDate, addDays(calendarDate, -1)]) {
      const shifts = shiftsFor(workCenterCode ?? '', getWeekRange(day).from);
      const dayStart = shifts[0].start;
      for (const shift of shifts) {
        const durationMinutes = (shift.end - shift.start + 1440) % 1440;
        if (!durationMinutes) continue;
        const startsAt = atLocalMinutes(day, shift.start);
        if (time < startsAt || time >= atLocalMinutes(day, shift.start + durationMinutes)) continue;
        if (match && match.startsAt <= startsAt) continue;
        match = { productionDate: shift.start < dayStart ? addDays(day, -1) : day, shiftNumber: shift.shiftNumber, startsAt };
      }
    }
    return match ? { productionDate: match.productionDate, shiftNumber: match.shiftNumber } : { productionDate: calendarDate, shiftNumber: null };
  };
}

export function buildWeeklyProductionStats(
  anchorDate: string,
  events: ProductionStatisticsEvent[],
  targetOrders: ProductionTargetOrder[],
  shiftSchedules: ProductionShiftSchedule[] = [],
): DailyProductionStat[] {
  const today = toLocalDateInput(new Date());
  const { from } = getWeekRange(anchorDate);
  const stats = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(from, index);
    const dateObject = new Date(`${date}T12:00:00`);
    return {
      date,
      dayLabel: new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(dateObject),
      dateLabel: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(dateObject),
      actualProduction: 0,
      targetProduction: null,
      expectedProductionNow: null,
      scrap: 0,
      productionRatePerHour: null,
      shiftProduction: [...PRODUCTION_SHIFT_NUMBERS, null].map((shiftNumber) => ({ shiftNumber, quantity: 0 })),
      isToday: date === today,
      isFuture: date > today,
    } satisfies DailyProductionStat;
  });
  const byDate = new Map(stats.map((stat) => [stat.date, stat]));
  const firstGoodEventByDate = new Map<string, Date>();
  const resolveShift = createShiftResolver(shiftSchedules);

  events.forEach((event) => {
    // Administrative piece release keeps the original audit event but sets its
    // quantity to zero. A later re-report creates a new positive event.
    if (event.event_type === 'production-good' && event.quantity !== null && Number(event.quantity) <= 0) return;
    const { productionDate: date, shiftNumber } = resolveShift(new Date(event.created_at), event.work_center_code);
    const stat = byDate.get(date);
    if (!stat) return;
    const quantity = Math.max(1, Number(event.quantity) || 1);
    if (event.event_type === 'production-good') {
      stat.actualProduction += quantity;
      const shift = stat.shiftProduction.find((candidate) => candidate.shiftNumber === shiftNumber);
      if (shift) shift.quantity += quantity;
      const timestamp = new Date(event.created_at);
      const firstTimestamp = firstGoodEventByDate.get(date);
      if (!firstTimestamp || timestamp < firstTimestamp) firstGoodEventByDate.set(date, timestamp);
    } else {
      stat.scrap += quantity;
    }
  });

  targetOrders.forEach((order) => {
    const stat = byDate.get(order.due_date);
    if (!stat) return;
    stat.targetProduction = (stat.targetProduction ?? 0) + Math.max(0, Number(order.planned_quantity) || 0);
  });

  stats.forEach((stat) => {
    const firstEvent = firstGoodEventByDate.get(stat.date);
    if (!firstEvent || !stat.actualProduction) return;
    const rateEnd = stat.isToday ? new Date() : new Date(`${stat.date}T23:59:59`);
    const elapsedHours = Math.max(1 / 60, (rateEnd.getTime() - firstEvent.getTime()) / 3_600_000);
    stat.productionRatePerHour = stat.actualProduction / elapsedHours;
  });
  return stats;
}

export const getProductionCompliance = (actual: number, target: number | null) => (
  target && target > 0 ? actual / target * 100 : null
);

export const getDailyProductionStatus = (stat: DailyProductionStat) => {
  if (stat.isFuture) return 'future';
  if (stat.isToday && stat.expectedProductionNow === null) return 'live';
  const comparisonTarget = stat.isToday ? stat.expectedProductionNow : stat.targetProduction;
  if (comparisonTarget === null || comparisonTarget <= 0) return 'unconfigured';
  return stat.actualProduction >= comparisonTarget ? 'achieved' : 'below';
};
