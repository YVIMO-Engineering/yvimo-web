import React from 'react';
import {
  ArrowLeft,
  Building2,
  Check,
  ClipboardCheck,
  Eye,
  FileText,
  PackageCheck,
  Plus,
  Truck,
  Upload,
  X,
} from 'lucide-react';
import { mockProductionOrders, mockSupplierTransfers, mockSuppliers } from './mesMockData';
import type {
  Supplier,
  SupplierDocument,
  SupplierDocumentType,
  SupplierTransfer,
  SupplierTransferStatus,
  SupplierVoucher,
} from './mesTypes';

type SupplierOperationsWorkspaceProps = {
  onNavigate: (path: string) => void;
  organizationId: string;
  activeTab: SupplierContextTab;
  onActiveTabChange: (tab: SupplierContextTab) => void;
};

type SupplierModalMode = 'create' | 'checkout' | 'checkin' | 'document' | 'document-preview' | 'voucher' | null;
export type SupplierContextTab = 'dashboard' | 'transfers' | 'suppliers' | 'vouchers-docs' | 'check-in-out';

type SupplierTransferFormState = {
  productionOrder: string;
  supplierId: string;
  externalProcess: string;
  partNumber: string;
  lotSerial: string;
  quantityToSend: string;
  expectedReturnDate: string;
  requiredDocuments: SupplierDocumentType[];
  notes: string;
};

type CheckoutFormState = {
  quantitySent: string;
  notes: string;
  confirmed: boolean;
};

type CheckinFormState = {
  quantityReceived: string;
  quantityAccepted: string;
  quantityRejected: string;
  receivedDocuments: SupplierDocumentType[];
  notes: string;
};

type DocumentFormState = {
  documentType: SupplierDocumentType;
  fileName: string;
  approvalStatus: SupplierDocument['approvalStatus'];
};

const supplierDocumentOptions: Array<{ value: SupplierDocumentType; label: string }> = [
  { value: 'certificate', label: 'Certificate' },
  { value: 'inspection-report', label: 'Inspection Report' },
  { value: 'process-report', label: 'Process Report' },
  { value: 'packing-slip', label: 'Packing Slip' },
  { value: 'other', label: 'Other' },
];

const defaultTransferForm: SupplierTransferFormState = {
  productionOrder: mockProductionOrders[0]?.orderNumber ?? '',
  supplierId: mockSuppliers.find((supplier) => supplier.approvedStatus === 'approved')?.id ?? mockSuppliers[0]?.id ?? '',
  externalProcess: 'Heat treatment',
  partNumber: mockProductionOrders[0]?.partNumber ?? '',
  lotSerial: '',
  quantityToSend: '',
  expectedReturnDate: '',
  requiredDocuments: ['certificate'],
  notes: '',
};

const formatSupplierLabel = (value: string) => value.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

const formatSupplierDate = (value: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(new Date(`${value}T12:00:00`));

const formatSupplierTimestamp = (value: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));

const getSupplierDocumentPreviewUrl = (fileUrl: string) => `${fileUrl}#toolbar=1&navpanes=0&scrollbar=1&view=FitH`;

const getTodayIsoDate = () => {
  const today = new Date();
  const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
};

function getMissingDocuments(transfer: SupplierTransfer) {
  return transfer.requiredDocuments.filter((documentType) => !transfer.receivedDocuments.includes(documentType));
}

function getTransferStatusAfterCheckin(
  current: SupplierTransfer,
  quantityReceived: number,
  quantityAccepted: number,
  quantityRejected: number,
  receivedDocuments: SupplierDocumentType[],
): SupplierTransferStatus {
  if (quantityReceived !== current.quantitySent || quantityRejected > 0 || quantityAccepted + quantityRejected !== quantityReceived) {
    return 'discrepancy';
  }

  const hasMissingDocuments = current.requiredDocuments.some((documentType) => !receivedDocuments.includes(documentType));
  return hasMissingDocuments ? 'documents-pending' : 'closed';
}

function SupplierStatusBadge({ status }: { status: SupplierTransferStatus | Supplier['approvedStatus'] | SupplierDocument['approvalStatus'] }) {
  return <span className={`supplier-status-badge supplier-status-${status}`}>{formatSupplierLabel(status)}</span>;
}

function SupplierDocumentChecklist({
  value,
  onChange,
}: {
  value: SupplierDocumentType[];
  onChange: (value: SupplierDocumentType[]) => void;
}) {
  const toggleDocument = (documentType: SupplierDocumentType) => {
    onChange(value.includes(documentType)
      ? value.filter((item) => item !== documentType)
      : [...value, documentType]);
  };

  return (
    <div className="supplier-document-checklist">
      {supplierDocumentOptions.map((option) => (
        <label key={option.value}>
          <input
            type="checkbox"
            checked={value.includes(option.value)}
            onChange={() => toggleDocument(option.value)}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}

function SupplierVoucherView({ voucher }: { voucher: SupplierVoucher }) {
  const inbound = voucher.direction === 'inbound';

  return (
    <div className="supplier-voucher-sheet">
      <div>
        <span>{inbound ? 'Inbound Voucher' : 'Outbound Voucher'}</span>
        <strong>{voucher.id}</strong>
      </div>
      <dl>
        <span><dt>Transfer ID</dt><dd>{voucher.transferId}</dd></span>
        <span><dt>Supplier</dt><dd>{voucher.supplier}</dd></span>
        <span><dt>Production Order</dt><dd>{voucher.productionOrder}</dd></span>
        <span><dt>Part Number</dt><dd>{voucher.partNumber}</dd></span>
        <span><dt>Lot / Serial</dt><dd>{voucher.lotSerial}</dd></span>
        <span><dt>Quantity Sent</dt><dd>{voucher.quantitySent.toLocaleString()}</dd></span>
        {inbound ? <span><dt>Quantity Received</dt><dd>{voucher.quantityReceived?.toLocaleString() ?? 'N/A'}</dd></span> : null}
        {inbound ? <span><dt>Quantity Accepted</dt><dd>{voucher.quantityAccepted?.toLocaleString() ?? 'N/A'}</dd></span> : null}
        {inbound ? <span><dt>Quantity Rejected</dt><dd>{voucher.quantityRejected?.toLocaleString() ?? 'N/A'}</dd></span> : null}
        <span><dt>External Process</dt><dd>{voucher.externalProcess}</dd></span>
        <span><dt>{inbound ? 'Received Date' : 'Checkout Date'}</dt><dd>{formatSupplierTimestamp(inbound ? voucher.receivedDate ?? '' : voucher.checkoutDate ?? '')}</dd></span>
        <span><dt>{inbound ? 'Received By' : 'Checked Out By'}</dt><dd>{inbound ? voucher.receivedBy : voucher.checkedOutBy}</dd></span>
        <span><dt>Expected Return</dt><dd>{formatSupplierDate(voucher.expectedReturnDate)}</dd></span>
        {inbound ? <span><dt>Documents Received</dt><dd>{voucher.documentsReceived?.map(formatSupplierLabel).join(', ') || 'None'}</dd></span> : null}
      </dl>
      <p>{voucher.notes || 'No notes entered.'}</p>
    </div>
  );
}

export function SupplierOperationsWorkspace({ onNavigate, activeTab, onActiveTabChange }: SupplierOperationsWorkspaceProps) {
  const [suppliers] = React.useState<Supplier[]>(mockSuppliers);
  const [transfers, setTransfers] = React.useState<SupplierTransfer[]>(mockSupplierTransfers);
  const [selectedTransferId, setSelectedTransferId] = React.useState(mockSupplierTransfers[0]?.id ?? '');
  const [modalMode, setModalMode] = React.useState<SupplierModalMode>(null);
  const [activeVoucher, setActiveVoucher] = React.useState<SupplierVoucher | null>(null);
  const [transferForm, setTransferForm] = React.useState<SupplierTransferFormState>(defaultTransferForm);
  const [checkoutForm, setCheckoutForm] = React.useState<CheckoutFormState>({ quantitySent: '', notes: '', confirmed: false });
  const [checkinForm, setCheckinForm] = React.useState<CheckinFormState>({ quantityReceived: '', quantityAccepted: '', quantityRejected: '0', receivedDocuments: [], notes: '' });
  const [documentForm, setDocumentForm] = React.useState<DocumentFormState>({ documentType: 'certificate', fileName: '', approvalStatus: 'pending-review' });
  const [previewDocument, setPreviewDocument] = React.useState<SupplierDocument | null>(null);

  const selectedTransfer = transfers.find((transfer) => transfer.id === selectedTransferId) ?? transfers[0] ?? null;
  const todayIsoDate = getTodayIsoDate();
  const transferCount = transfers.length;
  const sentTransfers = transfers.filter((transfer) => transfer.status === 'sent-to-supplier').length;
  const pendingReturn = transfers.filter((transfer) => ['sent-to-supplier', 'ready-for-checkout'].includes(transfer.status)).length;
  const missingDocuments = transfers.filter((transfer) => getMissingDocuments(transfer).length > 0 && ['received-back', 'documents-pending', 'discrepancy'].includes(transfer.status)).length;
  const overdueTransfers = transfers.filter((transfer) => transfer.expectedReturnDate < todayIsoDate && !['closed'].includes(transfer.status)).length;
  const activeSupplierTransfers = transfers.filter((transfer) => transfer.status !== 'closed');

  const updateTransfer = (transferId: string, updater: (transfer: SupplierTransfer) => SupplierTransfer) => {
    setTransfers((currentTransfers) => currentTransfers.map((transfer) => transfer.id === transferId ? updater(transfer) : transfer));
  };

  const openCreateTransfer = () => {
    setTransferForm(defaultTransferForm);
    setModalMode('create');
  };

  const openCheckout = (transfer: SupplierTransfer) => {
    setSelectedTransferId(transfer.id);
    setCheckoutForm({ quantitySent: String(transfer.quantitySent || ''), notes: transfer.checkoutNotes, confirmed: false });
    setModalMode('checkout');
  };

  const openCheckin = (transfer: SupplierTransfer) => {
    setSelectedTransferId(transfer.id);
    setCheckinForm({
      quantityReceived: String(transfer.quantityReceived || transfer.quantitySent || ''),
      quantityAccepted: String(transfer.quantityAccepted || transfer.quantitySent || ''),
      quantityRejected: String(transfer.quantityRejected || 0),
      receivedDocuments: transfer.receivedDocuments,
      notes: transfer.receivedNotes,
    });
    setModalMode('checkin');
  };

  const openDocumentUpload = (transfer: SupplierTransfer) => {
    setSelectedTransferId(transfer.id);
    setDocumentForm({
      documentType: getMissingDocuments(transfer)[0] ?? transfer.requiredDocuments[0] ?? 'certificate',
      fileName: '',
      approvalStatus: 'pending-review',
    });
    setModalMode('document');
  };

  const closeTransfer = (transfer: SupplierTransfer) => {
    updateTransfer(transfer.id, (currentTransfer) => ({
      ...currentTransfer,
      status: getMissingDocuments(currentTransfer).length > 0 ? 'documents-pending' : 'closed',
      updatedAt: new Date().toISOString(),
    }));
  };

  const createTransfer = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const supplier = suppliers.find((item) => item.id === transferForm.supplierId) ?? suppliers[0];
    const order = mockProductionOrders.find((item) => item.orderNumber === transferForm.productionOrder);
    const transfer: SupplierTransfer = {
      id: `ST-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${String(transfers.length + 1).padStart(3, '0')}`,
      productionOrder: transferForm.productionOrder,
      supplierId: supplier.id,
      supplierName: supplier.name,
      externalProcess: transferForm.externalProcess.trim(),
      partNumber: transferForm.partNumber.trim() || order?.partNumber || '',
      lotSerial: transferForm.lotSerial.trim(),
      quantitySent: Number(transferForm.quantityToSend) || 0,
      quantityReceived: 0,
      quantityAccepted: 0,
      quantityRejected: 0,
      status: 'ready-for-checkout',
      expectedReturnDate: transferForm.expectedReturnDate,
      requiredDocuments: transferForm.requiredDocuments,
      receivedDocuments: [],
      documents: [],
      vouchers: [],
      notes: transferForm.notes.trim(),
      checkoutNotes: '',
      receivedNotes: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setTransfers((currentTransfers) => [transfer, ...currentTransfers]);
    setSelectedTransferId(transfer.id);
    onActiveTabChange('transfers');
    setModalMode(null);
  };

  const checkoutTransfer = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTransfer || !checkoutForm.confirmed) return;

    const quantitySent = Number(checkoutForm.quantitySent) || selectedTransfer.quantitySent;
    const voucher: SupplierVoucher = {
      id: `OV-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${String(selectedTransfer.vouchers.length + 1).padStart(3, '0')}`,
      transferId: selectedTransfer.id,
      direction: 'outbound',
      supplier: selectedTransfer.supplierName,
      productionOrder: selectedTransfer.productionOrder,
      partNumber: selectedTransfer.partNumber,
      lotSerial: selectedTransfer.lotSerial,
      quantitySent,
      externalProcess: selectedTransfer.externalProcess,
      checkoutDate: new Date().toISOString(),
      checkedOutBy: 'MES Supervisor',
      expectedReturnDate: selectedTransfer.expectedReturnDate,
      notes: checkoutForm.notes.trim(),
    };

    updateTransfer(selectedTransfer.id, (transfer) => ({
      ...transfer,
      quantitySent,
      status: 'sent-to-supplier',
      checkoutNotes: checkoutForm.notes.trim(),
      vouchers: [...transfer.vouchers, voucher],
      updatedAt: new Date().toISOString(),
    }));
    setActiveVoucher(voucher);
    setModalMode('voucher');
  };

  const checkinTransfer = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTransfer) return;

    const quantityReceived = Number(checkinForm.quantityReceived) || 0;
    const quantityAccepted = Number(checkinForm.quantityAccepted) || 0;
    const quantityRejected = Number(checkinForm.quantityRejected) || 0;
    const nextStatus = getTransferStatusAfterCheckin(selectedTransfer, quantityReceived, quantityAccepted, quantityRejected, checkinForm.receivedDocuments);
    const voucher: SupplierVoucher = {
      id: `IV-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${String(selectedTransfer.vouchers.length + 1).padStart(3, '0')}`,
      transferId: selectedTransfer.id,
      direction: 'inbound',
      supplier: selectedTransfer.supplierName,
      productionOrder: selectedTransfer.productionOrder,
      partNumber: selectedTransfer.partNumber,
      lotSerial: selectedTransfer.lotSerial,
      quantitySent: selectedTransfer.quantitySent,
      quantityReceived,
      quantityAccepted,
      quantityRejected,
      externalProcess: selectedTransfer.externalProcess,
      receivedDate: new Date().toISOString(),
      receivedBy: 'Receiving',
      expectedReturnDate: selectedTransfer.expectedReturnDate,
      documentsReceived: checkinForm.receivedDocuments,
      notes: checkinForm.notes.trim(),
    };

    updateTransfer(selectedTransfer.id, (transfer) => ({
      ...transfer,
      quantityReceived,
      quantityAccepted,
      quantityRejected,
      status: nextStatus,
      receivedDocuments: checkinForm.receivedDocuments,
      receivedNotes: checkinForm.notes.trim(),
      vouchers: [...transfer.vouchers, voucher],
      updatedAt: new Date().toISOString(),
    }));
    setActiveVoucher(voucher);
    setModalMode('voucher');
  };

  const uploadDocument = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTransfer) return;

    const document: SupplierDocument = {
      id: `SD-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${String(selectedTransfer.documents.length + 1).padStart(3, '0')}`,
      transferId: selectedTransfer.id,
      supplier: selectedTransfer.supplierName,
      documentType: documentForm.documentType,
      fileName: documentForm.fileName.trim() || `${selectedTransfer.id}-${documentForm.documentType}.pdf`,
      fileUrl: '/assets/supplier-documents/sample-supplier-document.pdf',
      uploadedBy: 'Quality',
      uploadedAt: new Date().toISOString(),
      approvalStatus: documentForm.approvalStatus,
      hash: `sha256:demo-${Math.random().toString(16).slice(2, 8)}`,
    };

    updateTransfer(selectedTransfer.id, (transfer) => {
      const receivedDocuments = Array.from(new Set([...transfer.receivedDocuments, document.documentType]));
      const hasMissingDocuments = transfer.requiredDocuments.some((documentType) => !receivedDocuments.includes(documentType));
      return {
        ...transfer,
        documents: [...transfer.documents, document],
        receivedDocuments,
        status: transfer.status === 'documents-pending' && !hasMissingDocuments ? 'closed' : transfer.status,
        updatedAt: new Date().toISOString(),
      };
    });
    setModalMode(null);
  };

  const supplierKpiGrid = (
    <div className="supplier-kpi-grid">
      <article><span><ClipboardCheck size={16} /> Active Transfers</span><strong>{transferCount}</strong><em>open supplier records</em></article>
      <article><span><Truck size={16} /> Sent to Supplier</span><strong>{sentTransfers}</strong><em>physically checked out</em></article>
      <article><span><PackageCheck size={16} /> Pending Return</span><strong>{pendingReturn}</strong><em>ready or in transit</em></article>
      <article><span><FileText size={16} /> Missing Documents</span><strong>{missingDocuments}</strong><em>requires supplier docs</em></article>
      <article><span><Check size={16} /> Overdue Transfers</span><strong>{overdueTransfers}</strong><em>past expected return</em></article>
    </div>
  );

  const supplierTransfersTable = (
    <>
      <div className="production-orders-panel-title supplier-panel-title">
        <strong>Supplier Transfers</strong>
        <span>{transfers.length} tracked transfers</span>
        <button type="button" onClick={openCreateTransfer}><Plus size={16} /> New Supplier Transfer</button>
      </div>
      <div className="mes-table-wrap supplier-table-wrap">
        <table className="mes-table supplier-transfers-table">
          <thead>
            <tr>
              <th>Transfer ID</th>
              <th>Production Order</th>
              <th>Supplier</th>
              <th>Process</th>
              <th>Part Number</th>
              <th>Lot / Serial</th>
              <th>Qty Sent</th>
              <th>Qty Received</th>
              <th>Status</th>
              <th>Expected Return</th>
              <th>Documents</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {transfers.map((transfer) => (
              <tr key={transfer.id} className={selectedTransfer?.id === transfer.id ? 'selected' : ''}>
                <td><strong>{transfer.id}</strong></td>
                <td>{transfer.productionOrder}</td>
                <td><strong>{transfer.supplierName}</strong></td>
                <td>{transfer.externalProcess}</td>
                <td>{transfer.partNumber}</td>
                <td>{transfer.lotSerial}</td>
                <td>{transfer.quantitySent.toLocaleString()}</td>
                <td>{transfer.quantityReceived.toLocaleString()}</td>
                <td><SupplierStatusBadge status={transfer.status} /></td>
                <td>{formatSupplierDate(transfer.expectedReturnDate)}</td>
                <td>{transfer.receivedDocuments.length}/{transfer.requiredDocuments.length}<span>{getMissingDocuments(transfer).map(formatSupplierLabel).join(', ') || 'Complete'}</span></td>
                <td>
                  <div className="supplier-table-actions">
                    <button type="button" onClick={() => setSelectedTransferId(transfer.id)} aria-label={`View ${transfer.id}`}><Eye size={15} /></button>
                    <button type="button" onClick={() => openCheckout(transfer)} disabled={transfer.status === 'sent-to-supplier' || transfer.status === 'closed'} aria-label={`Check out ${transfer.id}`}><Truck size={15} /></button>
                    <button type="button" onClick={() => openCheckin(transfer)} disabled={transfer.status === 'draft' || transfer.status === 'ready-for-checkout' || transfer.status === 'closed'} aria-label={`Check in ${transfer.id}`}><PackageCheck size={15} /></button>
                    <button type="button" onClick={() => openDocumentUpload(transfer)} aria-label={`Upload document for ${transfer.id}`}><Upload size={15} /></button>
                    <button type="button" onClick={() => closeTransfer(transfer)} disabled={transfer.status === 'closed'} aria-label={`Close ${transfer.id}`}><Check size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );

  const activeTransfersBar = (
    <section className="supplier-active-transfers" aria-label="Active supplier transfers">
      <div>
        <span>Active Transfers</span>
        <strong>{activeSupplierTransfers.length} active supplier transfers</strong>
      </div>
      <div className="supplier-active-transfer-list">
        {activeSupplierTransfers.map((transfer) => (
          <article
            key={transfer.id}
            className={selectedTransfer?.id === transfer.id ? 'active' : ''}
          >
            <button type="button" className="supplier-active-transfer-select" onClick={() => setSelectedTransferId(transfer.id)}>
              <strong>{transfer.id}</strong>
              <em>{transfer.externalProcess}</em>
            </button>
            <button
              type="button"
              className="supplier-active-transfer-supplier"
              onClick={() => onActiveTabChange('suppliers')}
            >
              {transfer.supplierName}
            </button>
            <SupplierStatusBadge status={transfer.status} />
          </article>
        ))}
      </div>
    </section>
  );

  const selectedTransferSummary = selectedTransfer ? (
    <section className="supplier-selected-transfer-summary">
      <div className="supplier-section-heading">
        <span><PackageCheck size={16} /> Transfer Detail</span>
        <strong>{selectedTransfer.id}</strong>
      </div>
      <div className="supplier-selected-transfer-grid">
        <span><b>Transfer ID</b>{selectedTransfer.id}</span>
        <span><b>Production Order</b>{selectedTransfer.productionOrder}</span>
        <span><b>Supplier</b>{selectedTransfer.supplierName}</span>
        <span><b>Process</b>{selectedTransfer.externalProcess}</span>
        <span><b>Part Number</b>{selectedTransfer.partNumber}</span>
        <span><b>Lot / Serial</b>{selectedTransfer.lotSerial}</span>
        <span><b>Date of Issuance</b>{formatSupplierDate(selectedTransfer.createdAt.slice(0, 10))}</span>
        <span><b>Expected Return</b>{formatSupplierDate(selectedTransfer.expectedReturnDate)}</span>
        <span className={`supplier-selected-transfer-status supplier-selected-transfer-status-${selectedTransfer.status}`}>
          <b>Status</b>
          <strong>{formatSupplierLabel(selectedTransfer.status)}</strong>
        </span>
      </div>
      <div className="supplier-selected-transfer-actions">
        <button type="button" onClick={() => openCheckout(selectedTransfer)} disabled={selectedTransfer.status === 'sent-to-supplier' || selectedTransfer.status === 'closed'}><Truck size={16} /> Check Out</button>
        <button type="button" onClick={() => openCheckin(selectedTransfer)} disabled={selectedTransfer.status === 'draft' || selectedTransfer.status === 'ready-for-checkout' || selectedTransfer.status === 'closed'}><PackageCheck size={16} /> Check In</button>
        <button type="button" onClick={() => openDocumentUpload(selectedTransfer)}><Upload size={16} /> Upload Document</button>
        <button type="button" onClick={() => closeTransfer(selectedTransfer)} disabled={selectedTransfer.status === 'closed'}><Check size={16} /> Close Transfer</button>
      </div>
      <div className="supplier-transfer-artifacts">
        <div className="supplier-detail-block">
          <strong>Documents</strong>
          {selectedTransfer.documents.length ? selectedTransfer.documents.map((document) => (
            <article className="supplier-document-row" key={document.id}>
              <FileText size={16} />
              <span><b>{document.fileName}</b>{formatSupplierLabel(document.documentType)} / {formatSupplierTimestamp(document.uploadedAt)}</span>
              <SupplierStatusBadge status={document.approvalStatus} />
            </article>
          )) : <span className="supplier-empty-note">No supplier documents attached yet.</span>}
        </div>
        <div className="supplier-detail-block">
          <strong>Vouchers</strong>
          {selectedTransfer.vouchers.length ? selectedTransfer.vouchers.map((voucher) => (
            <button
              className="supplier-voucher-link"
              type="button"
              key={voucher.id}
              onClick={() => {
                setActiveVoucher(voucher);
                setModalMode('voucher');
              }}
            >
              <FileText size={16} />
              <span>{voucher.id}<em>{voucher.direction === 'inbound' ? 'Inbound' : 'Outbound'}</em></span>
            </button>
          )) : <span className="supplier-empty-note">No vouchers generated yet.</span>}
        </div>
      </div>
    </section>
  ) : null;

  const supplierManagementSection = (
    <section className="supplier-section">
      <div className="supplier-section-heading">
        <span><Building2 size={16} /> Supplier Management</span>
        <strong>{suppliers.length} external suppliers</strong>
      </div>
      <div className="supplier-card-grid">
        {suppliers.map((supplier) => (
          <article key={supplier.id}>
            <div>
              <strong>{supplier.name}</strong>
              <SupplierStatusBadge status={supplier.approvedStatus} />
            </div>
            <span>{supplier.contactName} / {supplier.email}</span>
            <span>{supplier.phone}</span>
            <em>{supplier.processCapabilities.join(', ')}</em>
            <p>{supplier.notes}</p>
          </article>
        ))}
      </div>
    </section>
  );

  const selectedTransferDetail = selectedTransfer ? (
    <aside className="supplier-detail-panel">
      <div className="supplier-detail-header">
        <span>Selected Transfer</span>
        <strong>{selectedTransfer.id}</strong>
        <div className="supplier-parts-metric-grid">
          <article>
            <span>Sent Parts</span>
            <strong>{selectedTransfer.quantitySent.toLocaleString()}</strong>
          </article>
          <article>
            <span>Pending Parts</span>
            <strong>{Math.max(0, selectedTransfer.quantitySent - selectedTransfer.quantityReceived).toLocaleString()}</strong>
          </article>
        </div>
      </div>
      <div className="supplier-detail-block">
        <strong>Required Documents</strong>
        <div className="supplier-document-status-sections">
          <section>
            <span>Pending from Supplier</span>
            <div className="supplier-document-tags supplier-document-tags-pending">
              {selectedTransfer.requiredDocuments
                .filter((documentType) => !selectedTransfer.documents.some((document) => document.documentType === documentType))
                .map((documentType) => (
                  <span key={documentType}>{formatSupplierLabel(documentType)}</span>
                ))}
              {selectedTransfer.requiredDocuments.every((documentType) => selectedTransfer.documents.some((document) => document.documentType === documentType)) ? (
                <em>No pending documents</em>
              ) : null}
            </div>
          </section>
          <section>
            <span>Delivered by Supplier</span>
            <div className="supplier-document-tags supplier-document-tags-delivered">
              {selectedTransfer.documents.filter((document) => selectedTransfer.requiredDocuments.includes(document.documentType)).map((document) => (
                <button
                  type="button"
                  key={document.id}
                  onClick={() => {
                    setPreviewDocument(document);
                    setModalMode('document-preview');
                  }}
                >
                  {formatSupplierLabel(document.documentType)}
                </button>
              ))}
              {selectedTransfer.documents.some((document) => selectedTransfer.requiredDocuments.includes(document.documentType)) ? null : (
                <em>No delivered documents</em>
              )}
            </div>
          </section>
        </div>
      </div>
    </aside>
  ) : null;

  const vouchersAndDocsSection = (
    <section className="supplier-section">
      <div className="supplier-section-heading">
        <span><FileText size={16} /> Vouchers and Docs</span>
        <strong>{transfers.reduce((total, transfer) => total + transfer.vouchers.length + transfer.documents.length, 0)} records</strong>
      </div>
      <div className="supplier-docs-grid">
        {transfers.map((transfer) => (
          <article key={transfer.id}>
            <div>
              <strong>{transfer.id}</strong>
              <SupplierStatusBadge status={transfer.status} />
            </div>
            <span>{transfer.supplierName} / {transfer.externalProcess}</span>
            <div className="supplier-document-tags">
              {transfer.requiredDocuments.map((documentType) => (
                <span className={transfer.receivedDocuments.includes(documentType) ? 'received' : ''} key={documentType}>{formatSupplierLabel(documentType)}</span>
              ))}
            </div>
            <div className="supplier-docs-actions">
              <button type="button" onClick={() => openDocumentUpload(transfer)}><Upload size={15} /> Upload Document</button>
              {transfer.vouchers.map((voucher) => (
                <button
                  type="button"
                  key={voucher.id}
                  onClick={() => {
                    setSelectedTransferId(transfer.id);
                    setActiveVoucher(voucher);
                    setModalMode('voucher');
                  }}
                >
                  <FileText size={15} /> {voucher.id}
                </button>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );

  const checkInOutSection = (
    <section className="supplier-section supplier-checkinout-section">
      <div className="supplier-section-heading">
        <span><Truck size={16} /> Check in/out</span>
        <strong>{selectedTransfer?.id ?? 'No transfer selected'}</strong>
      </div>
      {selectedTransfer ? (
        <>
          <div className="supplier-checkinout-summary">
            <strong>{selectedTransfer.supplierName}</strong>
            <span>{selectedTransfer.productionOrder} / {selectedTransfer.partNumber} / {selectedTransfer.lotSerial}</span>
            <SupplierStatusBadge status={selectedTransfer.status} />
          </div>
          <div className="supplier-checkinout-actions">
            <button type="button" onClick={() => openCheckout(selectedTransfer)} disabled={selectedTransfer.status === 'sent-to-supplier' || selectedTransfer.status === 'closed'}><Truck size={16} /> Check Out</button>
            <button type="button" onClick={() => openCheckin(selectedTransfer)} disabled={selectedTransfer.status === 'draft' || selectedTransfer.status === 'ready-for-checkout' || selectedTransfer.status === 'closed'}><PackageCheck size={16} /> Check In</button>
            <button type="button" onClick={() => openDocumentUpload(selectedTransfer)}><Upload size={16} /> Upload Document</button>
            <button type="button" onClick={() => closeTransfer(selectedTransfer)} disabled={selectedTransfer.status === 'closed'}><Check size={16} /> Close Transfer</button>
          </div>
        </>
      ) : <span className="supplier-empty-note">Select a supplier transfer first.</span>}
    </section>
  );

  const renderModal = () => {
    if (!modalMode) return null;

    return (
      <div className="supplier-modal-backdrop" role="presentation">
        <div className="supplier-modal" role="dialog" aria-modal="true">
          <button className="supplier-modal-close" type="button" onClick={() => setModalMode(null)} aria-label="Close dialog">
            <X size={18} />
          </button>

          {modalMode === 'create' ? (
            <form onSubmit={createTransfer}>
              <div className="supplier-modal-header">
                <span>Supplier Transfer</span>
                <strong>New Supplier Transfer</strong>
              </div>
              <div className="supplier-form-grid">
                <label>
                  Production Order
                  <select value={transferForm.productionOrder} onChange={(event) => {
                    const order = mockProductionOrders.find((item) => item.orderNumber === event.target.value);
                    setTransferForm((current) => ({ ...current, productionOrder: event.target.value, partNumber: order?.partNumber ?? current.partNumber }));
                  }}>
                    {mockProductionOrders.map((order) => <option key={order.id} value={order.orderNumber}>{order.orderNumber} / {order.partNumber}</option>)}
                  </select>
                </label>
                <label>
                  Supplier
                  <select value={transferForm.supplierId} onChange={(event) => setTransferForm((current) => ({ ...current, supplierId: event.target.value }))}>
                    {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                  </select>
                </label>
                <label>
                  External Process
                  <input required value={transferForm.externalProcess} onChange={(event) => setTransferForm((current) => ({ ...current, externalProcess: event.target.value }))} />
                </label>
                <label>
                  Part Number
                  <input required value={transferForm.partNumber} onChange={(event) => setTransferForm((current) => ({ ...current, partNumber: event.target.value }))} />
                </label>
                <label>
                  Lot Number / Serial Number
                  <input required value={transferForm.lotSerial} onChange={(event) => setTransferForm((current) => ({ ...current, lotSerial: event.target.value }))} />
                </label>
                <label>
                  Quantity to Send
                  <input required min="1" type="number" value={transferForm.quantityToSend} onChange={(event) => setTransferForm((current) => ({ ...current, quantityToSend: event.target.value }))} />
                </label>
                <label>
                  Expected Return Date
                  <input required type="date" value={transferForm.expectedReturnDate} onChange={(event) => setTransferForm((current) => ({ ...current, expectedReturnDate: event.target.value }))} />
                </label>
              </div>
              <fieldset>
                <legend>Required Documents</legend>
                <SupplierDocumentChecklist value={transferForm.requiredDocuments} onChange={(requiredDocuments) => setTransferForm((current) => ({ ...current, requiredDocuments }))} />
              </fieldset>
              <label>
                Notes
                <textarea value={transferForm.notes} onChange={(event) => setTransferForm((current) => ({ ...current, notes: event.target.value }))} />
              </label>
              <div className="supplier-modal-actions">
                <button type="button" onClick={() => setModalMode(null)}>Cancel</button>
                <button type="submit"><Plus size={16} /> Create Transfer</button>
              </div>
            </form>
          ) : null}

          {modalMode === 'checkout' && selectedTransfer ? (
            <form onSubmit={checkoutTransfer}>
              <div className="supplier-modal-header">
                <span>{selectedTransfer.id}</span>
                <strong>Check Out Parts</strong>
              </div>
              <div className="supplier-form-grid">
                <label>
                  Quantity Sent
                  <input required min="1" type="number" value={checkoutForm.quantitySent} onChange={(event) => setCheckoutForm((current) => ({ ...current, quantitySent: event.target.value }))} />
                </label>
                <label>
                  Expected Return
                  <input value={selectedTransfer.expectedReturnDate} readOnly />
                </label>
              </div>
              <label>
                Checkout Notes
                <textarea value={checkoutForm.notes} onChange={(event) => setCheckoutForm((current) => ({ ...current, notes: event.target.value }))} />
              </label>
              <label className="supplier-confirmation-check">
                <input type="checkbox" checked={checkoutForm.confirmed} onChange={(event) => setCheckoutForm((current) => ({ ...current, confirmed: event.target.checked }))} />
                <span>Confirm parts physically left the plant and create outbound voucher.</span>
              </label>
              <div className="supplier-modal-actions">
                <button type="button" onClick={() => setModalMode(null)}>Cancel</button>
                <button type="submit" disabled={!checkoutForm.confirmed}><Truck size={16} /> Check Out</button>
              </div>
            </form>
          ) : null}

          {modalMode === 'checkin' && selectedTransfer ? (
            <form onSubmit={checkinTransfer}>
              <div className="supplier-modal-header">
                <span>{selectedTransfer.id}</span>
                <strong>Check In Return</strong>
              </div>
              <div className="supplier-form-grid">
                <label>
                  Quantity Received
                  <input required min="0" type="number" value={checkinForm.quantityReceived} onChange={(event) => setCheckinForm((current) => ({ ...current, quantityReceived: event.target.value }))} />
                </label>
                <label>
                  Quantity Accepted
                  <input required min="0" type="number" value={checkinForm.quantityAccepted} onChange={(event) => setCheckinForm((current) => ({ ...current, quantityAccepted: event.target.value }))} />
                </label>
                <label>
                  Quantity Rejected
                  <input required min="0" type="number" value={checkinForm.quantityRejected} onChange={(event) => setCheckinForm((current) => ({ ...current, quantityRejected: event.target.value }))} />
                </label>
              </div>
              <fieldset>
                <legend>Documents Received</legend>
                <SupplierDocumentChecklist value={checkinForm.receivedDocuments} onChange={(receivedDocuments) => setCheckinForm((current) => ({ ...current, receivedDocuments }))} />
              </fieldset>
              <label>
                Received Notes
                <textarea value={checkinForm.notes} onChange={(event) => setCheckinForm((current) => ({ ...current, notes: event.target.value }))} />
              </label>
              <div className="supplier-modal-actions">
                <button type="button" onClick={() => setModalMode(null)}>Cancel</button>
                <button type="submit"><PackageCheck size={16} /> Check In</button>
              </div>
            </form>
          ) : null}

          {modalMode === 'document' && selectedTransfer ? (
            <form onSubmit={uploadDocument}>
              <div className="supplier-modal-header">
                <span>{selectedTransfer.id}</span>
                <strong>Upload Supplier Document</strong>
              </div>
              <div className="supplier-form-grid">
                <label>
                  Document Type
                  <select value={documentForm.documentType} onChange={(event) => setDocumentForm((current) => ({ ...current, documentType: event.target.value as SupplierDocumentType }))}>
                    {supplierDocumentOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label>
                  Approval Status
                  <select value={documentForm.approvalStatus} onChange={(event) => setDocumentForm((current) => ({ ...current, approvalStatus: event.target.value as SupplierDocument['approvalStatus'] }))}>
                    <option value="pending-review">Pending Review</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </label>
                <label className="supplier-form-wide">
                  File Name
                  <input value={documentForm.fileName} placeholder={`${selectedTransfer.id}-certificate.pdf`} onChange={(event) => setDocumentForm((current) => ({ ...current, fileName: event.target.value }))} />
                </label>
              </div>
              <div className="supplier-modal-actions">
                <button type="button" onClick={() => setModalMode(null)}>Cancel</button>
                <button type="submit"><Upload size={16} /> Save Document</button>
              </div>
            </form>
          ) : null}

          {modalMode === 'document-preview' && previewDocument ? (
            <div>
              <div className="supplier-modal-header">
                <span>{formatSupplierLabel(previewDocument.documentType)}</span>
                <strong>{previewDocument.fileName}</strong>
              </div>
              <div className="supplier-document-preview">
                <iframe src={getSupplierDocumentPreviewUrl(previewDocument.fileUrl)} title={`Preview ${previewDocument.fileName}`} />
              </div>
              <div className="supplier-modal-actions">
                <button type="button" onClick={() => setModalMode(null)}>Close</button>
              </div>
            </div>
          ) : null}

          {modalMode === 'voucher' && activeVoucher ? (
            <div>
              <div className="supplier-modal-header">
                <span>Generated Voucher</span>
                <strong>{activeVoucher.direction === 'inbound' ? 'Inbound Voucher' : 'Outbound Voucher'}</strong>
              </div>
              <SupplierVoucherView voucher={activeVoucher} />
              <div className="supplier-modal-actions">
                <button type="button" onClick={() => setModalMode(null)}>Done</button>
                <button type="button" onClick={() => window.print()}><FileText size={16} /> Print</button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <section className="mes-workspace-panel supplier-operations-workspace">
      <div className="mes-screen-header">
        <button className="academy-back-button engineering-back-button mes-workspace-back" type="button" onClick={() => onNavigate('/workspace/manufacturing-ops/mes')}>
          <ArrowLeft size={16} />
          MES Applications
        </button>
        <div className="mes-workspace-heading">
          <p className="eyebrow">MES / Suppliers</p>
          <h2>Supplier Operations</h2>
          <p>Track external processing, supplier check-outs, returns, vouchers, and supplier documents.</p>
        </div>
        <div className="supplier-header-actions">
          <button type="button" onClick={openCreateTransfer}>
            <Plus size={16} /> Add New Transfer
          </button>
        </div>
      </div>

      <div className="supplier-app-shell">
        <div className="supplier-app-content">
          {activeTab === 'dashboard' ? (
            <>
              {supplierKpiGrid}
              <div className="supplier-workspace-layout supplier-dashboard-layout">
                <div className="supplier-main-panel">
                  {supplierTransfersTable}
                </div>
                {selectedTransferDetail}
              </div>
            </>
          ) : null}

          {activeTab === 'transfers' ? (
            <>
              {activeTransfersBar}
              <div className="supplier-transfer-combined-panel">
                <div className="supplier-transfer-combined-main">
                  {selectedTransferSummary}
                </div>
                {selectedTransferDetail}
              </div>
            </>
          ) : null}

          {activeTab === 'suppliers' ? supplierManagementSection : null}

          {activeTab === 'vouchers-docs' ? vouchersAndDocsSection : null}

          {activeTab === 'check-in-out' ? (
            <div className="supplier-workspace-layout supplier-dashboard-layout">
              <div className="supplier-main-panel">
                {checkInOutSection}
                {supplierTransfersTable}
              </div>
              {selectedTransferDetail}
            </div>
          ) : null}
        </div>

      </div>

      {renderModal()}
    </section>
  );
}
