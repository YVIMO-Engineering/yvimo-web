export type ProductionOrderStatus = 'planned' | 'released' | 'running' | 'paused' | 'completed' | 'cancelled';

export type ProductionOrderPriority = 'low' | 'normal' | 'high' | 'expedite';

export type WorkCenterStatus = 'available' | 'running' | 'down' | 'maintenance' | 'offline';

export type TraceabilityEventType =
  | 'order-created'
  | 'order-released'
  | 'order-started'
  | 'production-reported'
  | 'scrap-reported'
  | 'quality-check'
  | 'work-center-change'
  | 'order-completed';

export type WorkCenter = {
  id: string;
  code: string;
  name: string;
  type: string;
  status: WorkCenterStatus;
  currentOrder: string | null;
  capacityPerHour: number;
  location: string;
  lastActivity: string;
};

export type ProductionOrder = {
  id: string;
  orderNumber: string;
  partNumber: string;
  partName: string;
  plannedQuantity: number;
  completedQuantity: number;
  scrapQuantity: number;
  status: ProductionOrderStatus;
  priority: ProductionOrderPriority;
  dueDate: string;
  assignedWorkCenter: string;
};

export type TraceabilityEvent = {
  id: string;
  timestamp: string;
  eventType: TraceabilityEventType;
  productionOrder: string;
  workCenter: string;
  quantity: number;
  operator: string;
  serialNumber: string | null;
  lotNumber: string | null;
  partNumber: string;
  notes: string;
};
