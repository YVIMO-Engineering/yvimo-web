import { getDaysUntilDelivery, getDeliveryDistance, type DayCountMode } from './DeliveryRiskTimeline';

export type OrderRiskLevel = 'overdue' | 'high' | 'moderate' | 'low';

// How many days before the delivery date an order turns red and orange. Every workspace
// starts from these numbers; the Production Schedule reads its own pair from
// mes_production_schedule_settings (migration 188), so a shop that plans a week ahead
// stops seeing green on work it should already be running.
export type RiskThresholds = { high: number; moderate: number };
export const defaultRiskThresholds: RiskThresholds = { high: 1, moderate: 3 };

// Orange has to reach at least as far ahead as red, and neither window is negative.
// Mirrors the clamp in migration 188 so a stale row can never invert the colors.
export function normalizeRiskThresholds(high: unknown, moderate: unknown): RiskThresholds {
  const highDays = Math.max(0, Math.round(Number(high) || 0));
  const moderateDays = Math.max(highDays, Math.round(Number(moderate) || 0));
  return { high: highDays, moderate: moderateDays };
}

export function getOrderRiskLevel(
  dueDate: string,
  referenceDate = new Date(),
  mode: DayCountMode = 'calendar',
  languageCode = 'en',
  thresholds: RiskThresholds = defaultRiskThresholds,
): OrderRiskLevel {
  const calendarDays = getDaysUntilDelivery(dueDate, referenceDate);
  if (calendarDays < 0) return 'overdue';
  const days = getDeliveryDistance(calendarDays, mode, languageCode);
  if (days <= thresholds.high) return 'high';
  if (days <= thresholds.moderate) return 'moderate';
  return 'low';
}

export const isReworkOrder = (orderNumber: string) => /^RW-/i.test(orderNumber.trim());

// A rework order exists because a regular order already had a problem, so it never
// starts below moderate risk. Mirrors the rank floor in migration 185.
export function getScheduleOrderRiskLevel(
  order: { due_date: string; order_number: string },
  referenceDate = new Date(),
  thresholds: RiskThresholds = defaultRiskThresholds,
): OrderRiskLevel {
  const risk = getOrderRiskLevel(order.due_date, referenceDate, 'calendar', 'en', thresholds);
  return risk === 'low' && isReworkOrder(order.order_number) ? 'moderate' : risk;
}
