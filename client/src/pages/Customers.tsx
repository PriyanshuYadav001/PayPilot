import React, { useCallback, useEffect, useState } from 'react';
import {
  Plus,
  Users,
  Search,
  Pencil,
  Trash2,
  X,
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useOrganization } from '../hooks/useOrganization';
import type { Customer } from '@shared/types';
import {
  listCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  type CustomerInput,
} from '../lib/customers';

interface CustomerFormState {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  billingAddress: string;
  creditPeriodDays: string;
  notes: string;
}

const EMPTY_FORM: CustomerFormState = {
  companyName: '',
  contactName: '',
  email: '',
  phone: '',
  billingAddress: '',
  creditPeriodDays: '30',
  notes: '',
};

const PAGE_SIZE = 10;

const inputClass =
  'w-full px-3 py-2 bg-slate-950/60 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500';
const labelClass = 'block text-xs font-medium text-slate-400 mb-1.5';
const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors shadow-sm';
const secondaryButtonClass =
  'inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-700/60 hover:bg-slate-700 text-slate-200 rounded-lg text-sm font-medium transition-colors';

export const Customers: React.FC = () => {
  const { session } = useAuth();
  const { currentOrg } = useOrganization();

  const orgId = currentOrg?.id;
  const token = session?.access_token;

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadCustomers = useCallback(async () => {
    if (!orgId || !token) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await listCustomers(orgId, token, { page, limit: PAGE_SIZE, search });
      setCustomers(result.customers);
      setTotalCount(result.pagination.totalCount);
      setTotalPages(result.pagination.totalPages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load customers.');
    } finally {
      setIsLoading(false);
    }
  }, [orgId, token, page, search]);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const openCreate = () => {
    setEditingCustomer(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setForm({
      companyName: customer.companyName,
      contactName: customer.contactName,
      email: customer.email,
      phone: customer.phone ?? '',
      billingAddress: (customer.billingAddress?.address as string) ?? '',
      creditPeriodDays: String(customer.creditPeriodDays),
      notes: customer.notes ?? '',
    });
    setFormError(null);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!orgId || !token) return;
    if (form.companyName.trim() === '' || form.contactName.trim() === '' || form.email.trim() === '') {
      setFormError('Company name, contact name, and email are required.');
      return;
    }
    setSaving(true);
    setFormError(null);

    const payload: CustomerInput = {
      companyName: form.companyName.trim(),
      contactName: form.contactName.trim(),
      email: form.email.trim(),
      ...(form.phone.trim() !== '' ? { phone: form.phone.trim() } : {}),
      billingAddress: { address: form.billingAddress.trim() },
      creditPeriodDays: Number(form.creditPeriodDays) || 30,
      notes: form.notes.trim(),
    };

    try {
      if (editingCustomer) {
        await updateCustomer(orgId, token, editingCustomer.id, payload);
      } else {
        await createCustomer(orgId, token, payload);
      }
      setModalOpen(false);
      await loadCustomers();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save customer.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!orgId || !token || !deleteTarget) return;
    setDeleting(true);
    try {
      await deleteCustomer(orgId, token, deleteTarget.id);
      setDeleteTarget(null);
      await loadCustomers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete customer.');
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Customers</h1>
          <p className="text-sm text-slate-400 mt-1">Manage debtor directory, credit terms, and communication preferences.</p>
        </div>
        <button onClick={openCreate} className={primaryButtonClass}>
          <Plus className="w-4 h-4" />
          <span>Add Customer</span>
        </button>
      </div>

      <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-700/60 flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search customers..."
              aria-label="Search customers"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className={`${inputClass} pl-9`}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center p-12 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            <span>Loading customers...</span>
          </div>
        ) : error ? (
          <div className="p-12 text-center">
            <p className="text-sm text-rose-400">{error}</p>
            <button
              onClick={() => void loadCustomers()}
              className={`${secondaryButtonClass} mt-4`}
            >
              Retry
            </button>
          </div>
        ) : customers.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-700/50 flex items-center justify-center mx-auto mb-3 text-slate-400">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-slate-200">No customers registered</h3>
            <p className="text-sm text-slate-400 mt-1">Add customers to issue invoices and enable automated payment reminders.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-700/60">
                  <th className="px-4 py-3 font-medium">Company</th>
                  <th className="px-4 py-3 font-medium">Contact</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">Credit</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/40">
                {customers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-slate-700/20">
                    <td className="px-4 py-3 font-medium text-slate-200">{customer.companyName}</td>
                    <td className="px-4 py-3 text-slate-300">{customer.contactName}</td>
                    <td className="px-4 py-3 text-slate-300">{customer.email}</td>
                    <td className="px-4 py-3 text-slate-300">{customer.phone || '—'}</td>
                    <td className="px-4 py-3 text-slate-300">{customer.creditPeriodDays} days</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(customer)}
                          aria-label={`Edit ${customer.companyName}`}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-slate-700/40 transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(customer)}
                          aria-label={`Delete ${customer.companyName}`}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-700/40 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => window.open(`/customers/${customer.id}/communications`, '_blank')}
                          aria-label={`View communications for ${customer.companyName}`}
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
              Page {page} of {totalPages} · {totalCount} customers
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
          aria-label={editingCustomer ? 'Edit customer' : 'Add customer'}
        >
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/60">
              <h2 className="text-lg font-semibold text-slate-100">
                {editingCustomer ? 'Edit Customer' : 'Add Customer'}
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
              className="px-6 py-4 space-y-4"
              aria-label={editingCustomer ? 'Edit customer' : 'Add customer'}
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="customer-company" className={labelClass}>
                    Company name
                  </label>
                  <input
                    id="customer-company"
                    type="text"
                    value={form.companyName}
                    onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
                    placeholder="Globex Ltd"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="customer-contact" className={labelClass}>
                    Contact name
                  </label>
                  <input
                    id="customer-contact"
                    type="text"
                    value={form.contactName}
                    onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
                    placeholder="Jane Doe"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="customer-email" className={labelClass}>
                    Email address
                  </label>
                  <input
                    id="customer-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="billing@globex.com"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="customer-phone" className={labelClass}>
                    Phone
                  </label>
                  <input
                    id="customer-phone"
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="+91 98765 43210"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="customer-billing-address" className={labelClass}>
                    Billing address
                  </label>
                  <input
                    id="customer-billing-address"
                    type="text"
                    value={form.billingAddress}
                    onChange={(e) => setForm((f) => ({ ...f, billingAddress: e.target.value }))}
                    placeholder="221B Baker Street"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="customer-credit-period" className={labelClass}>
                    Credit period (days)
                  </label>
                  <input
                    id="customer-credit-period"
                    type="number"
                    min={0}
                    value={form.creditPeriodDays}
                    onChange={(e) => setForm((f) => ({ ...f, creditPeriodDays: e.target.value }))}
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="customer-notes" className={labelClass}>
                  Notes
                </label>
                <textarea
                  id="customer-notes"
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Payment preferences, special terms..."
                  className={inputClass}
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setModalOpen(false)} className={secondaryButtonClass}>
                  Cancel
                </button>
                <button type="submit" disabled={saving} className={primaryButtonClass}>
                  {saving ? 'Saving...' : editingCustomer ? 'Save changes' : 'Add customer'}
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
          aria-label="Delete customer"
        >
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl">
            <div className="px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-100">Delete customer</h2>
              <p className="text-sm text-slate-400 mt-2">
                Are you sure you want to delete{' '}
                <span className="text-slate-200 font-medium">{deleteTarget.companyName}</span>? This
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
    </div>
  );
};
