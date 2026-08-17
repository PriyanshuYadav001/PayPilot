import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Plus,
  FileText,
  Search,
  Pencil,
  Trash2,
  X,
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
  Upload,
  Download,
  Link2,
  CreditCard,
  Copy,
  Check,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useOrganization } from '../hooks/useOrganization';
import type { Customer, Invoice, InvoiceStatus, Payment, PaymentLink, PaymentStatus } from '@shared/types';
import {
  listInvoices,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  uploadInvoiceFile,
  getInvoiceFileUrl,
  type InvoiceInput,
  type InvoiceItemInput,
} from '../lib/invoices';
import { createPaymentLink, listInvoicePayments } from '../lib/payments';
import { listCustomers } from '../lib/customers';

interface ItemRow {
  description: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
}

interface InvoiceFormState {
  customerId: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  discount: string;
  notes: string;
  items: ItemRow[];
}

const EMPTY_ITEM: ItemRow = { description: '', quantity: '1', unitPrice: '0', taxRate: '0' };

const EMPTY_FORM: InvoiceFormState = {
  customerId: '',
  invoiceNumber: '',
  issueDate: '',
  dueDate: '',
  discount: '0',
  notes: '',
  items: [{ ...EMPTY_ITEM }],
};

const STATUSES: InvoiceStatus[] = ['draft', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled'];

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  partially_paid: 'Partially Paid',
  paid: 'Paid',
  overdue: 'Overdue',
  cancelled: 'Cancelled',
};

const STATUS_CLASSES: Record<InvoiceStatus, string> = {
  draft: 'bg-slate-600/30 text-slate-300 border-slate-500/40',
  sent: 'bg-sky-500/10 text-sky-300 border-sky-500/40',
  partially_paid: 'bg-amber-500/10 text-amber-300 border-amber-500/40',
  paid: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40',
  overdue: 'bg-rose-500/10 text-rose-300 border-rose-500/40',
  cancelled: 'bg-slate-500/10 text-slate-400 border-slate-500/40',
};

const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  pending: 'Pending',
  processing: 'Processing',
  successful: 'Successful',
  failed: 'Failed',
  refunded: 'Refunded',
  cancelled: 'Cancelled',
};

const PAYMENT_CLASSES: Record<PaymentStatus, string> = {
  pending: 'bg-slate-600/30 text-slate-300 border-slate-500/40',
  processing: 'bg-sky-500/10 text-sky-300 border-sky-500/40',
  successful: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40',
  failed: 'bg-rose-500/10 text-rose-300 border-rose-500/40',
  refunded: 'bg-amber-500/10 text-amber-300 border-amber-500/40',
  cancelled: 'bg-slate-500/10 text-slate-400 border-slate-500/40',
};

const PAGE_SIZE = 10;

const inputClass =
  'w-full px-3 py-2 bg-slate-950/60 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500';
const labelClass = 'block text-xs font-medium text-slate-400 mb-1.5';
const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors shadow-sm';
const secondaryButtonClass =
  'inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-700/60 hover:bg-slate-700 text-slate-200 rounded-lg text-sm font-medium transition-colors';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatMoney(value: number): string {
  return value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function computePreview(items: ItemRow[], discount: number): {
  subtotal: number;
  taxTotal: number;
  total: number;
} {
  let subtotal = 0;
  let taxTotal = 0;
  for (const item of items) {
    const quantity = Number(item.quantity) || 0;
    const unitPrice = Number(item.unitPrice) || 0;
    const taxRate = Number(item.taxRate) || 0;
    const lineTotal = quantity * unitPrice;
    subtotal += lineTotal;
    taxTotal += (lineTotal * taxRate) / 100;
  }
  return { subtotal, taxTotal, total: subtotal + taxTotal - discount };
}

export const Invoices: React.FC = () => {
  const { session } = useAuth();
  const { currentOrg } = useOrganization();

  const orgId = currentOrg?.id;
  const token = session?.access_token;

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | ''>('');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [form, setForm] = useState<InvoiceFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadTarget, setUploadTarget] = useState<Invoice | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  const [collectingId, setCollectingId] = useState<string | null>(null);
  const [payLinkTarget, setPayLinkTarget] = useState<PaymentLink | null>(null);
  const [paymentsTarget, setPaymentsTarget] = useState<Invoice | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadInvoices = useCallback(async () => {
    if (!orgId || !token) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await listInvoices(orgId, token, {
        page,
        limit: PAGE_SIZE,
        search,
        status: statusFilter || undefined,
      });
      setInvoices(result.invoices);
      setTotalCount(result.pagination.totalCount);
      setTotalPages(result.pagination.totalPages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load invoices.');
    } finally {
      setIsLoading(false);
    }
  }, [orgId, token, page, search, statusFilter]);

  useEffect(() => {
    void loadInvoices();
  }, [loadInvoices]);

  const loadCustomers = useCallback(async () => {
    if (!orgId || !token) return;
    setCustomersLoading(true);
    try {
      const result = await listCustomers(orgId, token, { limit: 100 });
      setCustomers(result.customers);
    } catch {
      setCustomers([]);
    } finally {
      setCustomersLoading(false);
    }
  }, [orgId, token]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleStatusFilterChange = (value: InvoiceStatus | '') => {
    setStatusFilter(value);
    setPage(1);
  };

  const openCreate = () => {
    setEditingInvoice(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
    void loadCustomers();
  };

  const openEdit = (invoice: Invoice) => {
    setEditingInvoice(invoice);
    setForm({
      customerId: invoice.customerId,
      invoiceNumber: invoice.invoiceNumber,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      discount: String(invoice.discount ?? 0),
      notes: invoice.notes ?? '',
      items: (invoice.items?.length ? invoice.items : [null]).map((item) => ({
        description: item?.description ?? '',
        quantity: String(item?.quantity ?? 1),
        unitPrice: String(item?.unitPrice ?? 0),
        taxRate: String(item?.taxRate ?? 0),
      })),
    });
    setFormError(null);
    setModalOpen(true);
    void loadCustomers();
  };

  const updateItem = (index: number, patch: Partial<ItemRow>) => {
    setForm((f) => ({
      ...f,
      items: f.items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));
  };

  const addItem = () => {
    setForm((f) => ({ ...f, items: [...f.items, { ...EMPTY_ITEM }] }));
  };

  const removeItem = (index: number) => {
    setForm((f) => ({
      ...f,
      items: f.items.length > 1 ? f.items.filter((_, i) => i !== index) : f.items,
    }));
  };

  const toItemsPayload = (rows: ItemRow[]): InvoiceItemInput[] =>
    rows.map((row) => ({
      description: row.description.trim(),
      quantity: Number(row.quantity) || 0,
      unitPrice: Number(row.unitPrice) || 0,
      taxRate: Number(row.taxRate) || 0,
    }));

  const handleSave = async () => {
    if (!orgId || !token) return;
    if (form.customerId === '') {
      setFormError('Please select a customer.');
      return;
    }
    if (form.invoiceNumber.trim() === '') {
      setFormError('Invoice number is required.');
      return;
    }
    if (form.items.some((item) => item.description.trim() === '')) {
      setFormError('Every line item needs a description.');
      return;
    }
    setSaving(true);
    setFormError(null);

    const items = toItemsPayload(form.items);
    const payload: InvoiceInput = {
      customerId: form.customerId,
      invoiceNumber: form.invoiceNumber.trim(),
      issueDate: form.issueDate || today(),
      dueDate: form.dueDate,
      discount: Number(form.discount) || 0,
      items,
      notes: form.notes.trim(),
    };

    try {
      if (editingInvoice) {
        await updateInvoice(orgId, token, editingInvoice.id, payload);
      } else {
        await createInvoice(orgId, token, payload);
      }
      setModalOpen(false);
      await loadInvoices();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save invoice.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!orgId || !token || !deleteTarget) return;
    setDeleting(true);
    try {
      await deleteInvoice(orgId, token, deleteTarget.id);
      setDeleteTarget(null);
      await loadInvoices();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete invoice.');
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !uploadTarget || !orgId || !token) return;

    setUploadingId(uploadTarget.id);
    setFileError(null);
    try {
      await uploadInvoiceFile(orgId, token, uploadTarget.id, file);
      await loadInvoices();
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'Failed to upload file.');
    } finally {
      setUploadingId(null);
      setUploadTarget(null);
    }
  };

  const handleViewFile = async (invoice: Invoice) => {
    if (!orgId || !token) return;
    setFileError(null);
    try {
      let url = signedUrls[invoice.id];
      if (!url) {
        const result = await getInvoiceFileUrl(orgId, token, invoice.id);
        url = result.signedUrl;
        setSignedUrls((prev) => ({ ...prev, [invoice.id]: url }));
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'Could not load invoice file.');
    }
  };

  const handleCreatePaymentLink = async (invoice: Invoice) => {
    if (!orgId || !token) return;
    setCollectingId(invoice.id);
    setPayError(null);
    setCopied(false);
    try {
      const paymentLink = await createPaymentLink(orgId, token, { invoiceId: invoice.id });
      setPayLinkTarget(paymentLink);
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Could not create payment link.');
    } finally {
      setCollectingId(null);
    }
  };

  const openPayments = async (invoice: Invoice) => {
    if (!orgId || !token) return;
    setPaymentsTarget(invoice);
    setPaymentsLoading(true);
    setPayError(null);
    try {
      const result = await listInvoicePayments(orgId, token, invoice.id);
      setPayments(result);
    } catch (err) {
      setPayments([]);
      setPayError(err instanceof Error ? err.message : 'Could not load payments.');
    } finally {
      setPaymentsLoading(false);
    }
  };

  const copyPaymentLink = async () => {
    if (!payLinkTarget) return;
    try {
      await navigator.clipboard.writeText(payLinkTarget.shortUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be unavailable; the URL remains visible.
    }
  };

  const preview = computePreview(form.items, Number(form.discount) || 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Invoices</h1>
          <p className="text-sm text-slate-400 mt-1">Manage accounts receivable invoices and track statuses.</p>
        </div>
        <button onClick={openCreate} className={primaryButtonClass}>
          <Plus className="w-4 h-4" />
          <span>New Invoice</span>
        </button>
      </div>

      <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl overflow-hidden shadow-sm">
        {fileError && (
          <div
            role="alert"
            className="px-4 py-2 border-b border-slate-700/60 text-sm text-rose-400 bg-rose-500/5"
          >
            {fileError}
          </div>
        )}
        {payError && (
          <div
            role="alert"
            className="px-4 py-2 border-b border-slate-700/60 text-sm text-rose-400 bg-rose-500/5"
          >
            {payError}
          </div>
        )}
        <div className="p-4 border-b border-slate-700/60 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by invoice #..."
              aria-label="Search invoices"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className={`${inputClass} pl-9`}
            />
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="invoice-status-filter" className="text-xs font-medium text-slate-400">
              Status
            </label>
            <select
              id="invoice-status-filter"
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(e) => handleStatusFilterChange(e.target.value as InvoiceStatus | '')}
              className={inputClass}
            >
              <option value="">All</option>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center p-12 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            <span>Loading invoices...</span>
          </div>
        ) : error ? (
          <div className="p-12 text-center">
            <p className="text-sm text-rose-400">{error}</p>
            <button onClick={() => void loadInvoices()} className={`${secondaryButtonClass} mt-4`}>
              Retry
            </button>
          </div>
        ) : invoices.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-700/50 flex items-center justify-center mx-auto mb-3 text-slate-400">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-slate-200">No invoices yet</h3>
            <p className="text-sm text-slate-400 mt-1">
              Create your first invoice to start tracking payments and follow-ups.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-700/60">
                  <th className="px-4 py-3 font-medium">Invoice</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Issue Date</th>
                  <th className="px-4 py-3 font-medium">Due Date</th>
                  <th className="px-4 py-3 font-medium text-right">Total</th>
                  <th className="px-4 py-3 font-medium text-right">Balance</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/40">
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-slate-700/20">
                    <td className="px-4 py-3 font-medium text-slate-200">{invoice.invoiceNumber}</td>
                    <td className="px-4 py-3 text-slate-300">
                      {invoice.customer?.companyName ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-300">{invoice.issueDate}</td>
                    <td className="px-4 py-3 text-slate-300">{invoice.dueDate}</td>
                    <td className="px-4 py-3 text-right text-slate-200 font-medium">
                      {formatMoney(invoice.totalAmount)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-300">{formatMoney(invoice.amountDue)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${STATUS_CLASSES[invoice.status]}`}
                      >
                        {STATUS_LABELS[invoice.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => void handleCreatePaymentLink(invoice)}
                          disabled={collectingId !== null || invoice.status === 'paid' || invoice.status === 'cancelled'}
                          aria-label={`Payment link ${invoice.invoiceNumber}`}
                          title="Generate payment link"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-sky-400 hover:bg-slate-700/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          {collectingId === invoice.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Link2 className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={() => void openPayments(invoice)}
                          aria-label={`Payments ${invoice.invoiceNumber}`}
                          title="View payments"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-700/40 transition-colors"
                        >
                          <CreditCard className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setUploadTarget(invoice);
                            fileInputRef.current?.click();
                          }}
                          disabled={uploadingId !== null}
                          aria-label={`Upload file ${invoice.invoiceNumber}`}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-slate-700/40 disabled:opacity-40 transition-colors"
                        >
                          {uploadingId === invoice.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Upload className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={() => void handleViewFile(invoice)}
                          aria-label={`View file ${invoice.invoiceNumber}`}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-sky-400 hover:bg-slate-700/40 transition-colors"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openEdit(invoice)}
                          aria-label={`Edit ${invoice.invoiceNumber}`}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-slate-700/40 transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
<button
                          onClick={() => void setDeleteTarget(invoice)}
                          aria-label={`Delete ${invoice.invoiceNumber}`}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-700/40 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => window.open(`/invoices/${invoice.id}/communications`, '_blank')}
                          aria-label={`View communications for ${invoice.invoiceNumber}`}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-sky-400 hover:bg-slate-700/40 transition-colors"
                          title="Communications">
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-slate-700/60 flex items-center justify-between text-sm text-slate-400">
            <span>
              Page {page} of {totalPages} · {totalCount} invoices
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                aria-label="Previous page"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                aria-label="Next page"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
  Eye,
              </button>
            </div>
          </div>
        )}
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={editingInvoice ? 'Edit invoice' : 'New invoice'}
        >
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-3xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/60">
              <h2 className="text-lg font-semibold text-slate-100">
                {editingInvoice ? 'Edit Invoice' : 'New Invoice'}
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                aria-label="Close"
                className="text-slate-400 hover:text-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              className="px-6 py-4 space-y-4 overflow-y-auto"
              aria-label={editingInvoice ? 'Edit invoice' : 'New invoice'}
              onSubmit={(e) => {
                e.preventDefault();
                void handleSave();
              }}
            >
              {formError && (
                <div
                  role="alert"
                  className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2"
                >
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="invoice-customer" className={labelClass}>
                    Customer
                  </label>
                  <select
                    id="invoice-customer"
                    value={form.customerId}
                    onChange={(e) => setForm((f) => ({ ...f, customerId: e.target.value }))}
                    className={inputClass}
                  >
                    <option value="">{customersLoading ? 'Loading customers...' : 'Select a customer'}</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.companyName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="invoice-number" className={labelClass}>
                    Invoice number
                  </label>
                  <input
                    id="invoice-number"
                    type="text"
                    value={form.invoiceNumber}
                    onChange={(e) => setForm((f) => ({ ...f, invoiceNumber: e.target.value }))}
                    placeholder="INV-2026-001"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="invoice-issue-date" className={labelClass}>
                    Issue date
                  </label>
                  <input
                    id="invoice-issue-date"
                    type="date"
                    value={form.issueDate}
                    onChange={(e) => setForm((f) => ({ ...f, issueDate: e.target.value }))}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="invoice-due-date" className={labelClass}>
                    Due date
                  </label>
                  <input
                    id="invoice-due-date"
                    type="date"
                    value={form.dueDate}
                    onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="invoice-discount" className={labelClass}>
                    Discount
                  </label>
                  <input
                    id="invoice-discount"
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.discount}
                    onChange={(e) => setForm((f) => ({ ...f, discount: e.target.value }))}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="invoice-currency" className={labelClass}>
                    Currency
                  </label>
                  <input id="invoice-currency" type="text" value="INR" readOnly className={inputClass} />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className={labelClass}>Line items</label>
                  <button
                    type="button"
                    onClick={addItem}
                    className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add item
                  </button>
                </div>
                <div className="space-y-2">
                  {form.items.map((item, index) => (
                    <div key={index} className="grid grid-cols-12 gap-2 items-center">
                      <input
                        type="text"
                        aria-label="Item description"
                        placeholder="Description"
                        value={item.description}
                        onChange={(e) => updateItem(index, { description: e.target.value })}
                        className={`${inputClass} col-span-4`}
                      />
                      <input
                        type="number"
                        aria-label="Quantity"
                        min={0}
                        step="any"
                        placeholder="Qty"
                        value={item.quantity}
                        onChange={(e) => updateItem(index, { quantity: e.target.value })}
                        className={`${inputClass} col-span-2`}
                      />
                      <input
                        type="number"
                        aria-label="Unit price"
                        min={0}
                        step="any"
                        placeholder="Unit price"
                        value={item.unitPrice}
                        onChange={(e) => updateItem(index, { unitPrice: e.target.value })}
                        className={`${inputClass} col-span-2`}
                      />
                      <input
                        type="number"
                        aria-label="Tax rate %"
                        min={0}
                        max={100}
                        step="any"
                        placeholder="Tax %"
                        value={item.taxRate}
                        onChange={(e) => updateItem(index, { taxRate: e.target.value })}
                        className={`${inputClass} col-span-2`}
                      />
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        disabled={form.items.length <= 1}
                        aria-label={`Remove item ${index + 1}`}
                        className="col-span-2 p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-700/40 disabled:opacity-40 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 sm:items-start sm:justify-between">
                <div className="flex-1">
                  <label htmlFor="invoice-notes" className={labelClass}>
                    Notes
                  </label>
                  <textarea
                    id="invoice-notes"
                    rows={2}
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder="Payment terms, references..."
                    className={inputClass}
                  />
                </div>
                <div className="text-sm space-y-1 text-slate-300 sm:text-right shrink-0">
                  <div className="flex justify-between gap-6">
                    <span className="text-slate-400">Subtotal</span>
                    <span>{formatMoney(preview.subtotal)}</span>
                  </div>
                  <div className="flex justify-between gap-6">
                    <span className="text-slate-400">Tax</span>
                    <span>{formatMoney(preview.taxTotal)}</span>
                  </div>
                  <div className="flex justify-between gap-6">
                    <span className="text-slate-400">Discount</span>
                    <span>-{formatMoney(Number(form.discount) || 0)}</span>
                  </div>
                  <div className="flex justify-between gap-6 text-base font-semibold text-slate-100">
                    <span>Total</span>
                    <span>{formatMoney(preview.total)}</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setModalOpen(false)} className={secondaryButtonClass}>
                  Cancel
                </button>
                <button type="submit" disabled={saving} className={primaryButtonClass}>
                  {saving ? 'Saving...' : editingInvoice ? 'Save changes' : 'Create invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Delete invoice"
        >
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl">
            <div className="px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-100">Delete invoice</h2>
              <p className="text-sm text-slate-400 mt-2">
                Are you sure you want to delete invoice{' '}
                <span className="text-slate-200 font-medium">{deleteTarget.invoiceNumber}</span>? This
                action cannot be undone.
              </p>
            </div>
            <div className="px-6 py-4 border-t border-slate-700/60 flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)} className={secondaryButtonClass}>
                Cancel
              </button>
              <button
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {payLinkTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Payment link"
        >
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/60">
              <h2 className="text-lg font-semibold text-slate-100">Payment link</h2>
              <button
                onClick={() => setPayLinkTarget(null)}
                aria-label="Close"
                className="text-slate-400 hover:text-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <p className="text-sm text-slate-400">
                Share this link with the customer to collect{' '}
                <span className="text-slate-200 font-medium">
                  {formatMoney(payLinkTarget.amount)} {payLinkTarget.currency}
                </span>{' '}
                for invoice{' '}
                <span className="text-slate-200 font-medium">{payLinkTarget.invoiceNumber ?? ''}</span>.
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={payLinkTarget.shortUrl}
                  aria-label="Payment link URL"
                  className={inputClass}
                />
                <button
                  onClick={() => void copyPaymentLink()}
                  aria-label="Copy payment link"
                  className="p-2.5 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-200 transition-colors"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              {payLinkTarget.expiresAt && (
                <p className="text-xs text-slate-500">
                  Expires {new Date(payLinkTarget.expiresAt).toLocaleDateString()}.
                </p>
              )}
              <p className="text-xs text-slate-500">
                Payments are confirmed by the payment provider webhook, never by the browser.
              </p>
            </div>
            <div className="px-6 py-4 border-t border-slate-700/60 flex justify-end">
              <button onClick={() => setPayLinkTarget(null)} className={primaryButtonClass}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {paymentsTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Invoice payments"
        >
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-2xl shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/60">
              <h2 className="text-lg font-semibold text-slate-100">
                Payments · {paymentsTarget.invoiceNumber}
              </h2>
              <button
                onClick={() => setPaymentsTarget(null)}
                aria-label="Close"
                className="text-slate-400 hover:text-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-4 overflow-y-auto">
              {paymentsLoading ? (
                <div className="flex items-center justify-center p-8 text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  <span>Loading payments...</span>
                </div>
              ) : payments.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-400">
                  <CreditCard className="w-8 h-8 mx-auto mb-2 text-slate-500" />
                  <p>No payments recorded yet.</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Payments move from pending to successful only after the provider webhook confirms capture.
                  </p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-700/60">
                      <th className="px-2 py-2 font-medium">Status</th>
                      <th className="px-2 py-2 font-medium">Amount</th>
                      <th className="px-2 py-2 font-medium">Method</th>
                      <th className="px-2 py-2 font-medium text-right">Paid at</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/40">
                    {payments.map((payment) => (
                      <tr key={payment.id} className="hover:bg-slate-700/20">
                        <td className="px-2 py-2">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${PAYMENT_CLASSES[payment.status]}`}
                          >
                            {PAYMENT_LABELS[payment.status]}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-slate-200 font-medium">
                          {formatMoney(payment.amount)} {payment.currency}
                        </td>
                        <td className="px-2 py-2 text-slate-300 uppercase">{payment.method}</td>
                        <td className="px-2 py-2 text-right text-slate-300">
                          {new Date(payment.paidAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-700/60 flex justify-end">
              <button onClick={() => setPaymentsTarget(null)} className={secondaryButtonClass}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
        className="hidden"
        aria-label="Upload invoice file"
        onChange={handleFileChange}
      />
    </div>
  );
};
