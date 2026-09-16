import { getDaysUntilDelivery, getDeliveryDistance, type DayCountMode } from './DeliveryRiskTimeline';

export type OrderRiskLevel = 'overdue' | 'high' | 'moderate' | 'low';

export function getOrderRiskLevel(
  dueDate: string,
  referenceDate = new Date(),
  mode: DayCountMode = 'calendar',
  languageCode = 'en',
): OrderRiskLevel {
  const calendarDays = getDaysUntilDelivery(dueDate, referenceDate);
  if (calendarDays < 0) return 'overdue';
  const days = getDeliveryDistance(calendarDays, mode, languageCode);
  if (days <= 1) return 'high';
  if (days <= 3) return 'moderate';
  return 'low';
}

export const isReworkOrder = (orderNumber: string) => /^RW-/i.test(orderNumber.trim());

// A rework order exists because a regular order already had a problem, so it never
// starts below moderate risk. Mirrors the rank floor in migration 185.
export function getScheduleOrderRiskLevel(order: { due_date: string; order_number: string }, referenceDate = new Date()): OrderRiskLevel {
  const risk = getOrderRiskLevel(order.due_date, referenceDate);
  return risk === 'low' && isReworkOrder(order.order_number) ? 'moderate' : risk;
}
