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
