export type DailyProductionStat = {
  date: string;
  dayLabel: string;
  dateLabel: string;
  actualProduction: number;
  targetProduction: number | null;
  expectedProductionNow: number | null;
  scrap: number;
  productionRatePerHour: number | null;
  isToday: boolean;
  isFuture: boolean;
};

export type ProductionStatisticsEvent = {
  id: string;
  event_type: 'production-good' | 'production-scrap';
  quantity: number | null;
  created_at: string;
};

export type ProductionTargetOrder = {
  planned_quantity: number;
  due_date: string;
};

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

export function buildWeeklyProductionStats(
  anchorDate: string,
  events: ProductionStatisticsEvent[],
  targetOrders: ProductionTargetOrder[],
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
      isToday: date === today,
      isFuture: date > today,
    } satisfies DailyProductionStat;
  });
  const byDate = new Map(stats.map((stat) => [stat.date, stat]));
  const firstGoodEventByDate = new Map<string, Date>();

  events.forEach((event) => {
    const date = toLocalDateInput(new Date(event.created_at));
    const stat = byDate.get(date);
    if (!stat) return;
    const quantity = Math.max(1, Number(event.quantity) || 1);
    if (event.event_type === 'production-good') {
      stat.actualProduction += quantity;
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
