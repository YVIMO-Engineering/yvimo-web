import type { ReactNode } from 'react';
import { Activity, Gauge, Target, TrendingUp } from 'lucide-react';
import { type DailyProductionStat, getProductionCompliance } from './productionStatistics';

export function ProductionMetricCards({ stats, dailyTarget, weeklyTarget, weeklyTargetDetail, workCenterSelector }: { stats: DailyProductionStat[]; dailyTarget: number; weeklyTarget: number; weeklyTargetDetail: string; workCenterSelector: ReactNode }) {
  const weeklyActual = stats.reduce((total, stat) => total + stat.actualProduction, 0);
  const compliance = getProductionCompliance(weeklyActual, weeklyTarget);
  const today = stats.find((stat) => stat.isToday) ?? null;
  const cards = [
    { label: 'Weekly production', value: weeklyActual.toLocaleString(), detail: 'good pieces', icon: TrendingUp, tone: 'orange' },
    { label: 'Weekly target', value: weeklyTarget.toLocaleString(), detail: weeklyTargetDetail, icon: Target, tone: 'blue' },
    { label: 'Weekly compliance', value: compliance === null ? '—' : `${Math.round(compliance)}%`, detail: `against ${weeklyTarget}-piece weekly target`, icon: Gauge, tone: 'green' },
    { label: 'Current rate', value: today?.productionRatePerHour === null || today?.productionRatePerHour === undefined ? '—' : `${today.productionRatePerHour.toFixed(1)}`, detail: 'pieces per hour', icon: Activity, tone: 'green' },
  ];
  return (
    <section className="statistics-metric-cards" aria-label="Weekly production indicators">
      {cards.slice(0, 3).map(({ label, value, detail, icon: Icon, tone }) => (
        <article className={tone} key={label}><Icon size={24} strokeWidth={2.2} /><span><small>{label}</small><strong>{value}</strong><em>{detail}</em></span></article>
      ))}
      {cards.slice(3).map(({ label, value, detail, icon: Icon, tone }) => (
        <article className={tone} key={label}><Icon size={24} strokeWidth={2.2} /><span><small>{label}</small><strong>{value}</strong><em>{detail}</em></span></article>
      ))}
      {workCenterSelector}
    </section>
  );
}
