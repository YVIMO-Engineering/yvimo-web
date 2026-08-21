import type { ProductionOrder } from './mesTypes';
import { getOrderRiskLevel, type OrderRiskLevel } from './orderRisk';

const ORDER_WEIGHT = 3;
const HISTORY_DAYS = 90;
const MINIMUM_P90_SAMPLES = 14;

const riskWeights: Record<OrderRiskLevel, number> = {
  low: 1,
  moderate: 1.1,
  high: 1.25,
  overdue: 1.5,
};

export type StationLoadStatus = 'no-load' | 'low' | 'normal' | 'high' | 'very-high' | 'overloaded';
export type StationLoadReferenceMethod = 'P90' | 'Historical maximum' | 'Current load fallback' | 'No load';

export type StationLoadEvent = {
  production_order_id: string | null;
  station_code: string;
  event_type: 'production-good' | 'production-scrap';
  quantity: number;
  created_at: string;
};

export type StationLoadResult = {
  stationId: string;
  stationName: string;
  stationCode: string;
  remainingUnits: number;
  openOrders: number;
  weightedRemainingUnits: number;
  currentLoadPoints: number;
  referenceLoadPoints: number;
  loadPercent: number;
  visualLoadPercent: number;
  loadStatus: StationLoadStatus;
  atRiskOrders: number;
  criticalOrders: number;
  referenceMethod: StationLoadReferenceMethod;
  historicalSamples: number;
};

type StationIdentity = { id: string; name: string; code: string };

export function calculateRemainingUnits(order: Pick<ProductionOrder, 'plannedQuantity' | 'completedQuantity' | 'scrapQuantity'>) {
  return Math.max(order.plannedQuantity - order.completedQuantity - order.scrapQuantity, 0);
}

export function getRiskWeight(risk: OrderRiskLevel) {
  return riskWeights[risk];
}

export function calculateStationLoadPoints(orders: Array<{ remainingUnits: number; risk: OrderRiskLevel }>) {
  const weightedRemainingUnits = orders.reduce((total, order) => total + (order.remainingUnits * getRiskWeight(order.risk)), 0);
  return {
    weightedRemainingUnits,
    loadPoints: weightedRemainingUnits + (orders.length * ORDER_WEIGHT),
  };
}

export function calculatePercentile(values: number[], percentile: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = (sorted.length - 1) * percentile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + ((sorted[upper] - sorted[lower]) * (index - lower));
}

export function calculateStationReferenceLoad(historicalLoadPoints: number[], currentLoadPoints: number) {
  const positiveSamples = historicalLoadPoints.filter((value) => value > 0);
  if (positiveSamples.length >= MINIMUM_P90_SAMPLES) {
    return { referenceLoadPoints: calculatePercentile(positiveSamples, 0.9), referenceMethod: 'P90' as const };
  }
  if (positiveSamples.length) {
    return { referenceLoadPoints: Math.max(...positiveSamples), referenceMethod: 'Historical maximum' as const };
  }
  if (currentLoadPoints > 0) {
    return { referenceLoadPoints: currentLoadPoints, referenceMethod: 'Current load fallback' as const };
  }
  return { referenceLoadPoints: 0, referenceMethod: 'No load' as const };
}

export function calculateStationLoadPercent(currentLoadPoints: number, referenceLoadPoints: number) {
  return referenceLoadPoints > 0 ? Math.round((currentLoadPoints / referenceLoadPoints) * 100) : 0;
}

export function getStationLoadStatus(loadPercent: number): StationLoadStatus {
  if (loadPercent <= 0) return 'no-load';
  if (loadPercent <= 35) return 'low';
  if (loadPercent <= 65) return 'normal';
  if (loadPercent <= 85) return 'high';
  if (loadPercent <= 100) return 'very-high';
  return 'overloaded';
}

function isOrderOpenAt(order: ProductionOrder, snapshot: Date) {
  const createdAt = order.createdAt ? new Date(order.createdAt) : null;
  if (createdAt && !Number.isNaN(createdAt.getTime()) && createdAt > snapshot) return false;
  if (!['completed', 'cancelled'].includes(order.status)) return true;
  const closedAt = order.updatedAt ? new Date(order.updatedAt) : null;
  return Boolean(closedAt && !Number.isNaN(closedAt.getTime()) && closedAt > snapshot);
}

function historicalRemainingUnits(order: ProductionOrder, snapshot: Date, events: StationLoadEvent[]) {
  const producedAfterSnapshot = events.reduce((total, event) => (
    new Date(event.created_at) > snapshot ? total + Math.max(Number(event.quantity) || 0, 0) : total
  ), 0);
  return Math.min(order.plannedQuantity, calculateRemainingUnits(order) + producedAfterSnapshot);
}

export function calculateStationLoads({
  stations,
  orders,
  events,
  stationCodesForOrder,
  now = new Date(),
}: {
  stations: StationIdentity[];
  orders: ProductionOrder[];
  events: StationLoadEvent[];
  stationCodesForOrder: (order: ProductionOrder) => string[];
  now?: Date;
}): StationLoadResult[] {
  const ordersByStation = new Map(stations.map((station) => [station.code, orders.filter((order) => stationCodesForOrder(order).includes(station.code))]));
  const eventsByStationAndOrder = new Map<string, StationLoadEvent[]>();
  events.forEach((event) => {
    if (!event.production_order_id) return;
    const key = `${event.station_code}:${event.production_order_id}`;
    const group = eventsByStationAndOrder.get(key) ?? [];
    group.push(event);
    eventsByStationAndOrder.set(key, group);
  });

  return stations.map((station) => {
    const stationOrders = ordersByStation.get(station.code) ?? [];
    const currentOrders = stationOrders
      .filter((order) => !['completed', 'cancelled'].includes(order.status))
      .map((order) => ({ order, remainingUnits: calculateRemainingUnits(order), risk: getOrderRiskLevel(order.dueDate, now) }))
      .filter(({ remainingUnits }) => remainingUnits > 0);
    const currentPointData = calculateStationLoadPoints(currentOrders);
    const historicalLoadPoints = Array.from({ length: HISTORY_DAYS }, (_, dayIndex) => {
      const snapshot = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayIndex - 1, 23, 59, 59, 999);
      const snapshotOrders = stationOrders
        .filter((order) => isOrderOpenAt(order, snapshot))
        .map((order) => ({
          remainingUnits: historicalRemainingUnits(order, snapshot, eventsByStationAndOrder.get(`${station.code}:${order.id}`) ?? []),
          risk: getOrderRiskLevel(order.dueDate, snapshot),
        }))
        .filter(({ remainingUnits }) => remainingUnits > 0);
      return calculateStationLoadPoints(snapshotOrders).loadPoints;
    });
    const reference = calculateStationReferenceLoad(historicalLoadPoints, currentPointData.loadPoints);
    const loadPercent = calculateStationLoadPercent(currentPointData.loadPoints, reference.referenceLoadPoints);
    const risks = currentOrders.map(({ risk }) => risk);

    return {
      stationId: station.id,
      stationName: station.name,
      stationCode: station.code,
      remainingUnits: currentOrders.reduce((total, order) => total + order.remainingUnits, 0),
      openOrders: currentOrders.length,
      weightedRemainingUnits: currentPointData.weightedRemainingUnits,
      currentLoadPoints: currentPointData.loadPoints,
      referenceLoadPoints: reference.referenceLoadPoints,
      loadPercent,
      visualLoadPercent: Math.min(loadPercent, 100),
      loadStatus: getStationLoadStatus(loadPercent),
      atRiskOrders: risks.filter((risk) => risk === 'high').length,
      criticalOrders: risks.filter((risk) => risk === 'overdue').length,
      referenceMethod: reference.referenceMethod,
      historicalSamples: historicalLoadPoints.filter((value) => value > 0).length,
    };
  }).sort((left, right) => right.loadPercent - left.loadPercent || right.currentLoadPoints - left.currentLoadPoints);
}
