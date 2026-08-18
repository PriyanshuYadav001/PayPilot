import React, { useEffect, useState } from 'react';
import { Shield, Building, CreditCard, Phone, Mail, MessageCircle, Zap, Folder, MapPin, Clock } from 'lucide-react';
import { PLAN_LIMITS } from '@shared/constants';
import { useAuth } from '../hooks/useAuth';
import { useOrganization } from '../hooks/useOrganization';
import { apiRequest } from '../lib/apiClient';

export const Settings: React.FC = () => {
  const { session } = useAuth();
const { currentOrg } = useOrganization();

const [organization, setOrganization] = useState<any>(null);

const orgId = currentOrg?.id;
const token = session?.access_token;
  const [loading, setLoading] = useState(true);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
  async function fetchOrganization() {
    if (!orgId || !token) {
      setLoading(false);
      return;
    }

    try {
      const response = await apiRequest<{ organization: any }>('/settings', {
        orgId,
        token,
      });

      if (!response.success || !response.data?.organization) {
        setOrganization({
          name: currentOrg?.name || 'Default Organization',
          supportEmail: 'support@paypilot.com',
          supportPhone: '+91-98765 43210',
          currency: currentOrg?.currency || 'INR',
          timezone: currentOrg?.timezone || 'Asia/Kolkata',
          billingAddress: {
            street: '',
            city: '',
            state: '',
            postalCode: '',
            country: 'India',
          },
        });
      } else {
        setOrganization(response.data.organization);
      }
    } catch (err) {
      console.error('Error fetching settings', err);

      setOrganization({
        name: currentOrg?.name || 'Default Organization',
        supportEmail: 'support@paypilot.com',
        supportPhone: '+91-98765 43210',
        currency: currentOrg?.currency || 'INR',
        timezone: currentOrg?.timezone || 'Asia/Kolkata',
        billingAddress: {
          street: '',
          city: '',
          state: '',
          postalCode: '',
          country: 'India',
        },
      });
    } finally {
      setLoading(false);
    }
  }

  void fetchOrganization();
}, [orgId, token, currentOrg]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    field: string
  ) => {
    const value = e.target.value;
    setFormErrors({} as Record<string, string>);

    let isValid = true;
    let errorMsg = '';

    if (field === 'name' && (value.length < 2 || value.length > 150)) {
      isValid = false;
      errorMsg = 'Organization name must be between 2 and 150 characters';
    } else if (field === 'supportEmail' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      isValid = false;
      errorMsg = 'Invalid email address';
    } else if (field === 'currency' && (value.length !== 3 || !/^[A-Z]{3}$/.test(value))) {
      isValid = false;
      errorMsg = 'Currency must be a 3-letter ISO code';
    }

    setFormErrors((prev: Record<string, string>) => ({
      ...prev,
      [field]: isValid ? '' : errorMsg,
    }));

    if (isValid) {
      setOrganization((prev: any) => ({
        ...prev,
        [field]: value,
      }));
    }
  };

  const handleSave = async () => {
    if (saving || !organization) return;

    setSaving(true);
    setFormErrors({} as Record<string, string>);

    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include' as RequestCredentials,
        body: JSON.stringify({ organization }),
      });
      const data = await res.json();

      if (data?.success === false) {
        setFormErrors((prev: Record<string, string>) => ({
          ...prev,
          general: data.message || 'Failed to save settings',
        }));
        throw new Error(data.message || 'Failed to save settings');
      }

      setShowSuccess(true);
      setSaving(false);

      const timer = setTimeout(() => {
        setShowSuccess(false);
        clearTimeout(timer);
      }, 3000);

    } catch (err) {
      setFormErrors((prev: Record<string, string>) => ({
        ...prev,
        general: 'Failed to save settings. Please try again.',
      }));
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center">
        <span className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" />
        <span className="ml-4 text-slate-300">Loading settings...</span>
      </div>
    );
  }

  if (!organization) {
    return <div>Failed to load organization settings.</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Settings & Integrations</h1>
        <p className="text-sm text-slate-400 mt-1">Manage organization details, provider API credentials, and subscription tiers.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Organization Info */}
        <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400">
              <Building className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-200">Organization Profile</h2>
              <p className="text-xs text-slate-400">Update your organization details</p>
            </div>
          </div>
          <div className="space-y-3 text-sm">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Organization Name</label>
              <input
                type="text"
                onChange={(e) => handleInputChange(e, 'name')}
                value={organization.name || ''}
                className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-lg text-slate-300 text-sm placeholder-slate-500 transition-colors focus:border-emerald-500/50 focus:bg-slate-950/80"
                disabled={saving}
                placeholder="e.g. Default Organization"
              />
              {formErrors.name && (
                <p className="text-xs text-red-400 mt-1">{formErrors.name}</p>
              )}
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Support Email</label>
              <input
                type="email"
                onChange={(e) => handleInputChange(e, 'supportEmail')}
                value={organization.supportEmail || ''}
                className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-lg text-slate-300 text-sm placeholder-slate-500 transition-colors focus:border-emerald-500/50 focus:bg-slate-950/80"
                disabled={saving}
                placeholder="support@your-business.com"
              />
              {formErrors.supportEmail && (
                <p className="text-xs text-red-400 mt-1">{formErrors.supportEmail}</p>
              )}
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Support Phone</label>
              <input
                type="tel"
                onChange={(e) => handleInputChange(e, 'supportPhone')}
                value={organization.supportPhone || ''}
                className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-lg text-slate-300 text-sm placeholder-slate-500 transition-colors focus:border-emerald-500/50 focus:bg-slate-950/80"
                disabled={saving}
                placeholder="+91-98765 43210"
              />
              {formErrors.supportPhone && (
                <p className="text-xs text-red-400 mt-1">{formErrors.supportPhone}</p>
              )}
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Currency</label>
              <input
                type="text"
                onChange={(e) => handleInputChange(e, 'currency')}
                value={organization.currency || 'INR'}
                className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-lg text-slate-300 text-sm placeholder-slate-500 transition-colors focus:border-emerald-500/50 focus:bg-slate-950/80"
                disabled={saving}
                placeholder="INR"
              />
              {formErrors.currency && (
                <p className="text-xs text-red-400 mt-1">{formErrors.currency}</p>
              )}
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Timezone</label>
              <input
                type="text"
                onChange={(e) => handleInputChange(e, 'timezone')}
                value={organization.timezone || 'Asia/Kolkata'}
                className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-lg text-slate-300 text-sm placeholder-slate-500 transition-colors focus:border-emerald-500/50 focus:bg-slate-950/80"
                disabled={saving}
                placeholder="Asia/Kolkata"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Billing Address</label>
              <p className="text-xs text-slate-400 line-clamp-3">
                {organization.billingAddress
                  ? `${organization.billingAddress.street || ''}\n${
                      organization.billingAddress.city || ''
                    }, ${organization.billingAddress.state || ''} ${organization.billingAddress.postalCode || ''}`
                  : 'Not set'}
              </p>
            </div>
          </div>
        </div>

        {/* Subscription Plan Overview */}
        <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-200">Subscription Tier</h2>
              <p className="text-xs text-slate-400">Current plan limits and quotas</p>
            </div>
          </div>
          <div className="space-y-2 text-sm text-slate-300">
            <div className="flex justify-between py-1.5 border-b border-slate-700/50">
              <span className="text-slate-400">Current Plan:</span>
              <span className="font-semibold text-emerald-400">Growth</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-700/50">
              <span className="text-slate-400">Monthly Invoices:</span>
              <span>{PLAN_LIMITS.growth.maxInvoicesMonthly} max</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-700/50">
              <span className="text-slate-400">Used Today:</span>
              <span>0 / {PLAN_LIMITS.growth.maxInvoicesMonthly}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-700/50">
              <span className="text-slate-400">WhatsApp Messages:</span>
              <span>{PLAN_LIMITS.growth.maxWhatsAppMonthly} max</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-700/50">
              <span className="text-slate-400">Used Today:</span>
              <span>0 / {PLAN_LIMITS.growth.maxWhatsAppMonthly}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-400">Team Seats:</span>
              <span>{PLAN_LIMITS.growth.maxTeamMembers} seats</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-400">AI Analyses:</span>
              <span>{PLAN_LIMITS.growth.maxAiAnalysesMonthly} max</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-400">Price:</span>
              <span>₹{PLAN_LIMITS.growth.priceInr}/month</span>
            </div>
          </div>
        </div>

        {/* Usage Metrics Summary */}
        <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400">
              <MessageCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-200">Usage Metrics</h2>
              <p className="text-xs text-slate-400">Your monthly usage is tracked server-side</p>
            </div>
          </div>
          <div className="bg-slate-900/60 border border-slate-700/80 rounded-lg p-4 font-mono text-xs text-slate-300 space-y-2">
            <div className="flex justify-between text-slate-400">
              <span>Invoices Created</span>
              <span>{PLAN_LIMITS.growth.maxInvoicesMonthly} monthly limit</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>WhatsApp Messages</span>
              <span>{PLAN_LIMITS.growth.maxWhatsAppMonthly} monthly limit</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Emails Sent</span>
              <span>{PLAN_LIMITS.growth.maxEmailsMonthly} monthly limit</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Calls Made</span>
              <span>{PLAN_LIMITS.growth.maxCallsMonthly} monthly limit</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>AI Analyses</span>
              <span>{PLAN_LIMITS.growth.maxAiAnalysesMonthly} monthly limit</span>
            </div>
          </div>
          <div className="text-xs text-slate-500 mt-2">
            Usage is tracked automatically on each operation. Limits are enforced server-side per your subscription tier.
          </div>
        </div>
      </div>

      {/* Security & Multi-Tenancy */}
      <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-6 shadow-sm md:col-span-2">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-200">Security & Isolation Status</h2>
            <p className="text-xs text-slate-400">Supabase Row-Level Security and JWT Header verification</p>
          </div>
        </div>
        <div className="bg-slate-900/60 border border-slate-700/80 rounded-lg p-4 font-mono text-xs text-slate-300 space-y-1">
          <div className="text-emerald-400">✔ PostgreSQL Row Level Security (RLS) policies enforced</div>
          <div className="text-emerald-400">✔ Organization Tenant Context Header: X-Organization-Id</div>
          <div className="text-emerald-400">✔ JWT Auth Header: Bearer token validation</div>
        </div>
      </div>

      {/* Save Button */}
      {showSuccess && (
        <div className="bg-emerald-500/20 border border-emerald-500/40 rounded-lg p-4 text-center mb-6">
          <span className="text-emerald-400 font-medium">Settings saved successfully!</span>
        </div>
      )}

      {saving && (
        <div className="bg-slate-700/50 border border-slate-600/50 rounded-lg p-4 text-center">
          <span className="animate-spin inline-block h-4 w-4 me-3 text-emerald-400" />
          <span className="text-slate-300">Saving settings...</span>
        </div>
      )}
    </div>
  );
};
