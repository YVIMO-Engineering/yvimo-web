export type ProductionOrderStatus = 'planned' | 'released' | 'running' | 'paused' | 'completed' | 'cancelled';

export type ProductionOrderPriority = 'low' | 'normal' | 'high' | 'expedite';

export type ProductionOrderManufacturingType = 'multi-step' | 'single-operation';

export type WorkCenterStatus = 'available' | 'idle' | 'running' | 'setup' | 'down' | 'maintenance' | 'offline';

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
  plannedShifts: string[];
  manufacturingType: ProductionOrderManufacturingType;
  productionFlow: string;
  assignedStation: string;
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

export type SupplierApprovedStatus = 'approved' | 'pending-approval' | 'inactive';

export type SupplierTransferStatus =
  | 'draft'
  | 'ready-for-checkout'
  | 'sent-to-supplier'
  | 'received-back'
  | 'documents-pending'
  | 'closed'
  | 'discrepancy';

export type SupplierDocumentType =
  | 'certificate'
  | 'inspection-report'
  | 'process-report'
  | 'packing-slip'
  | 'other';

export type SupplierDocumentApprovalStatus = 'pending-review' | 'approved' | 'rejected';

export type Supplier = {
  id: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  approvedStatus: SupplierApprovedStatus;
  processCapabilities: string[];
  notes: string;
};

export type SupplierDocument = {
  id: string;
  transferId: string;
  supplier: string;
  documentType: SupplierDocumentType;
  fileName: string;
  fileUrl: string;
  uploadedBy: string;
  uploadedAt: string;
  approvalStatus: SupplierDocumentApprovalStatus;
  hash?: string;
};

export type SupplierVoucher = {
  id: string;
  transferId: string;
  direction: 'outbound' | 'inbound';
  supplier: string;
  productionOrder: string;
  partNumber: string;
  lotSerial: string;
  quantitySent: number;
  quantityReceived?: number;
  quantityAccepted?: number;
  quantityRejected?: number;
  externalProcess: string;
  checkoutDate?: string;
  checkedOutBy?: string;
  receivedDate?: string;
  receivedBy?: string;
  expectedReturnDate: string;
  documentsReceived?: SupplierDocumentType[];
  notes: string;
};

export type SupplierTransfer = {
  id: string;
  productionOrder: string;
  supplierId: string;
  supplierName: string;
  externalProcess: string;
  partNumber: string;
  lotSerial: string;
  quantitySent: number;
  quantityReceived: number;
  quantityAccepted: number;
  quantityRejected: number;
  status: SupplierTransferStatus;
  expectedReturnDate: string;
  requiredDocuments: SupplierDocumentType[];
  receivedDocuments: SupplierDocumentType[];
  documents: SupplierDocument[];
  vouchers: SupplierVoucher[];
  notes: string;
  checkoutNotes: string;
  receivedNotes: string;
  createdAt: string;
  updatedAt: string;
};
