import { Activity, CalendarCheck2, Gauge, Target, TrendingUp } from 'lucide-react';
import { type DailyProductionStat, getProductionCompliance } from './productionStatistics';

export function ProductionMetricCards({ stats, dailyTarget }: { stats: DailyProductionStat[]; dailyTarget: number }) {
  const weeklyActual = stats.reduce((total, stat) => total + stat.actualProduction, 0);
  const weeklyTarget = dailyTarget * 7;
  const compliance = getProductionCompliance(weeklyActual, weeklyTarget);
  const today = stats.find((stat) => stat.isToday) ?? null;
  const cards = [
    { label: 'Weekly production', value: weeklyActual.toLocaleString(), detail: 'good pieces', icon: TrendingUp, tone: 'orange' },
    { label: 'Weekly target', value: weeklyTarget.toLocaleString(), detail: `${dailyTarget} pieces × 7 days`, icon: Target, tone: 'blue' },
    { label: 'Weekly compliance', value: compliance === null ? '—' : `${Math.round(compliance)}%`, detail: `against ${weeklyTarget}-piece weekly target`, icon: Gauge, tone: 'green' },
    { label: 'Production today', value: today?.actualProduction.toLocaleString() ?? '—', detail: today ? `${today.scrap} scrap` : 'outside selected week', icon: CalendarCheck2, tone: 'orange' },
    { label: 'Current rate', value: today?.productionRatePerHour === null || today?.productionRatePerHour === undefined ? '—' : `${today.productionRatePerHour.toFixed(1)}`, detail: 'pieces per hour', icon: Activity, tone: 'green' },
  ];
  return (
    <section className="statistics-metric-cards" aria-label="Weekly production indicators">
      {cards.map(({ label, value, detail, icon: Icon, tone }) => (
        <article className={tone} key={label}><Icon size={24} strokeWidth={2.2} /><span><small>{label}</small><strong>{value}</strong><em>{detail}</em></span></article>
      ))}
    </section>
  );
}
