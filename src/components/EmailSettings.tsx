import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  Mail,
  Globe,
  Shield,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Send,
  Eye,
  MousePointer,
  Building2,
  AtSign,
  Loader2,
  FileText,
  Key,
  Clock,
  MessageSquare,
  X
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import DepartmentEmailSenders from './DepartmentEmailSenders';

interface EmailSettingsData {
  id: string;
  ar_from_email: string;
  ar_from_name: string;
  noreply_from_email: string;
  noreply_from_name: string;
  reply_to_email: string;
  reply_to_name: string;
  company_name: string;
  domain: string;
  inbound_parse_subdomain: string;
  sendgrid_tracking_clicks: boolean;
  sendgrid_tracking_opens: boolean;
  updated_at: string;
  updated_by: string | null;
}

interface TestResult {
  type: string;
  success: boolean;
  message: string;
}

export default function EmailSettings() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [settings, setSettings] = useState<EmailSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testingType, setTestingType] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<TestResult[]>([]);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('email_settings')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (data) {
        setSettings(data);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load email settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!settings || !user) return;
    setSaving(true);
    setSaveSuccess(false);
    setError(null);

    try {
      const { error: updateError } = await supabase
        .from('email_settings')
        .update({
          ar_from_email: settings.ar_from_email,
          ar_from_name: settings.ar_from_name,
          noreply_from_email: settings.noreply_from_email,
          noreply_from_name: settings.noreply_from_name,
          reply_to_email: settings.reply_to_email,
          reply_to_name: settings.reply_to_name,
          company_name: settings.company_name,
          domain: settings.domain,
          inbound_parse_subdomain: settings.inbound_parse_subdomain,
          sendgrid_tracking_clicks: settings.sendgrid_tracking_clicks,
          sendgrid_tracking_opens: settings.sendgrid_tracking_opens,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', settings.id);

      if (updateError) throw updateError;
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const getHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('No active session');
    return {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    };
  };

  const addTestResult = (result: TestResult) => {
    setTestResults(prev => [result, ...prev]);
  };

  const clearTestResults = () => setTestResults([]);

  const testAREmail = async () => {
    if (!user) return;
    setTestingType('ar');
    try {
      const headers = await getHeaders();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-customer-invoice-email`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            template: {
              subject: '[TEST] Customer Invoice Email - {{customer_name}}',
              body: `<div style="font-family: Arial, sans-serif;">
                <h2 style="color: #1e3a5f;">Test: Customer Invoice Email</h2>
                <p>Hello {{customer_name}},</p>
                <p>This is a <strong>test</strong> of the customer invoice email type.</p>
                <p>Balance: {{balance}}</p>
                <p>Total Invoices: {{total_invoices}}</p>
                {{invoice_table}}
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
                <p style="color: #6b7280; font-size: 12px;">Sent from: ${settings?.ar_from_email} (${settings?.ar_from_name})</p>
                <p style="color: #6b7280; font-size: 12px;">Test sent at: ${new Date().toLocaleString()}</p>
              </div>`,
              include_invoice_table: true,
              include_payment_table: false,
            },
            customerData: {
              customer_name: profile?.full_name || 'Test Customer',
              customer_id: 'TEST-001',
              customer_email: user.email,
              balance: 1250.00,
              total_invoices: 3,
              invoices: [
                { reference_number: 'INV-TEST-001', invoice_date: '2026-01-15', due_date: '2026-02-15', amount: 500.00, balance: 500.00, description: 'Test Invoice 1' },
                { reference_number: 'INV-TEST-002', invoice_date: '2026-02-01', due_date: '2026-03-01', amount: 450.00, balance: 450.00, description: 'Test Invoice 2' },
                { reference_number: 'INV-TEST-003', invoice_date: '2026-02-15', due_date: '2026-03-15', amount: 300.00, balance: 300.00, description: 'Test Invoice 3' },
              ],
            },
            sentByUserId: user.id,
            department: 'ar',
          }),
        }
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || errData.details || `Status ${response.status}`);
      }

      addTestResult({ type: 'AR Invoice Email', success: true, message: `Sent to ${user.email} with sample invoice table` });
    } catch (err: any) {
      addTestResult({ type: 'AR Invoice Email', success: false, message: err.message });
    } finally {
      setTestingType(null);
    }
  };

  const testReplyEmail = async () => {
    if (!user) return;
    setTestingType('reply');
    try {
      const headers = await getHeaders();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email-reply`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            to: user.email,
            subject: '[TEST] Email Reply',
            department: 'ar',
            html: `<div style="font-family: Arial, sans-serif; padding: 20px;">
              <h2 style="color: #1e3a5f;">Test: Email Reply</h2>
              <p>This is a <strong>test</strong> of the email reply function.</p>
              <p>This type of email is sent when a user replies to a customer from the inbox.</p>
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
              <p style="color: #6b7280; font-size: 12px;">Sent from: ${settings?.ar_from_email} (${settings?.company_name})</p>
              <p style="color: #6b7280; font-size: 12px;">Reply-To: ${settings?.reply_to_email} (${settings?.reply_to_name})</p>
              <p style="color: #6b7280; font-size: 12px;">Test sent at: ${new Date().toLocaleString()}</p>
            </div>`,
          }),
        }
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Status ${response.status}`);
      }

      addTestResult({ type: 'Email Reply', success: true, message: `Sent to ${user.email}` });
    } catch (err: any) {
      addTestResult({ type: 'Email Reply', success: false, message: err.message });
    } finally {
      setTestingType(null);
    }
  };

  const testTemporaryPasswordEmail = async () => {
    if (!user) return;
    setTestingType('password');
    try {
      const headers = await getHeaders();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-temporary-password`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            to: user.email,
            name: profile?.full_name || 'Test User',
            temporaryPassword: 'TestP@ss123-DEMO',
            department: 'noreply',
          }),
        }
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || errData.details || `Status ${response.status}`);
      }

      addTestResult({ type: 'Temporary Password', success: true, message: `Sent to ${user.email} from ${settings?.noreply_from_email}` });
    } catch (err: any) {
      addTestResult({ type: 'Temporary Password', success: false, message: err.message });
    } finally {
      setTestingType(null);
    }
  };

  const testSchedulerEmail = async () => {
    if (!user) return;
    setTestingType('scheduler');
    try {
      const headers = await getHeaders();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email-reply`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            to: user.email,
            subject: '[TEST] Scheduled Email Preview',
            department: 'census',
            html: `<div style="font-family: Arial, sans-serif; padding: 20px;">
              <h2 style="color: #1e3a5f;">Test: Scheduled Email</h2>
              <p>This is a <strong>test</strong> simulating a scheduled email.</p>
              <p>The email scheduler automatically sends emails to customers based on their assigned formula and template. This test verifies that the sender settings are working correctly for scheduled emails.</p>
              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0;">
                <p style="margin: 0 0 8px 0; font-weight: 600; color: #334155;">Current Scheduler Settings:</p>
                <p style="margin: 4px 0; color: #64748b; font-size: 14px;">From: ${settings?.ar_from_email} (${settings?.ar_from_name})</p>
                <p style="margin: 4px 0; color: #64748b; font-size: 14px;">Reply-To: ${settings?.reply_to_email} (${settings?.reply_to_name})</p>
              </div>
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
              <p style="color: #6b7280; font-size: 12px;">Test sent at: ${new Date().toLocaleString()}</p>
            </div>`,
          }),
        }
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Status ${response.status}`);
      }

      addTestResult({ type: 'Scheduled Email', success: true, message: `Preview sent to ${user.email}` });
    } catch (err: any) {
      addTestResult({ type: 'Scheduled Email', success: false, message: err.message });
    } finally {
      setTestingType(null);
    }
  };

  const testReminderEmail = async () => {
    if (!user) return;
    setTestingType('reminder');
    try {
      const headers = await getHeaders();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email-reply`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            to: user.email,
            subject: '[TEST] Reminder Notification',
            department: 'reminders',
            html: `<div style="font-family: Arial, sans-serif; padding: 20px;">
              <h2 style="color: #1e3a5f;">Test: Reminder Email Notification</h2>
              <p>This is a <strong>test</strong> of the reminder notification email.</p>
              <p>Reminder notifications are sent to users when they have upcoming or overdue reminders.</p>
              <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; margin: 16px 0; border-radius: 4px;">
                <p style="margin: 0; font-weight: 600; color: #92400e;">Sample Reminder</p>
                <p style="margin: 4px 0 0 0; color: #78350f; font-size: 14px;">Follow up with customer ABC Corp about overdue invoices</p>
              </div>
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
              <p style="color: #6b7280; font-size: 12px;">Sent from: ${settings?.ar_from_email}</p>
              <p style="color: #6b7280; font-size: 12px;">Test sent at: ${new Date().toLocaleString()}</p>
            </div>`,
          }),
        }
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Status ${response.status}`);
      }

      addTestResult({ type: 'Reminder Notification', success: true, message: `Sent to ${user.email}` });
    } catch (err: any) {
      addTestResult({ type: 'Reminder Notification', success: false, message: err.message });
    } finally {
      setTestingType(null);
    }
  };

  const updateField = (field: keyof EmailSettingsData, value: string | boolean) => {
    if (!settings) return;
    setSettings({ ...settings, [field]: value });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-3 text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Loading email settings...</span>
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <AlertCircle className="w-12 h-12 text-red-400" />
        <p className="text-slate-600">No email settings found.</p>
        <button
          onClick={loadSettings}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  const emailTests = [
    {
      id: 'ar',
      name: 'Customer Invoice Email',
      description: 'Sends a sample invoice email with a table of test invoices',
      icon: FileText,
      color: 'blue',
      sender: settings.ar_from_email,
      handler: testAREmail,
    },
    {
      id: 'reply',
      name: 'Email Reply',
      description: 'Sends a reply-style email as used when responding from the inbox',
      icon: MessageSquare,
      color: 'emerald',
      sender: settings.ar_from_email,
      handler: testReplyEmail,
    },
    {
      id: 'password',
      name: 'Temporary Password',
      description: 'Sends a welcome email with a demo temporary password',
      icon: Key,
      color: 'amber',
      sender: settings.noreply_from_email,
      handler: testTemporaryPasswordEmail,
    },
    {
      id: 'scheduler',
      name: 'Scheduled Email',
      description: 'Sends a preview of what scheduled emails look like to customers',
      icon: Clock,
      color: 'cyan',
      sender: settings.ar_from_email,
      handler: testSchedulerEmail,
    },
    {
      id: 'reminder',
      name: 'Reminder Notification',
      description: 'Sends a sample reminder notification email to yourself',
      icon: Mail,
      color: 'rose',
      sender: settings.ar_from_email,
      handler: testReminderEmail,
    },
  ];

  const colorMap: Record<string, { bg: string; iconBg: string; iconText: string; border: string; hoverBg: string }> = {
    blue: { bg: 'bg-blue-50', iconBg: 'bg-blue-100', iconText: 'text-blue-600', border: 'border-blue-200', hoverBg: 'hover:bg-blue-100' },
    emerald: { bg: 'bg-emerald-50', iconBg: 'bg-emerald-100', iconText: 'text-emerald-600', border: 'border-emerald-200', hoverBg: 'hover:bg-emerald-100' },
    amber: { bg: 'bg-amber-50', iconBg: 'bg-amber-100', iconText: 'text-amber-600', border: 'border-amber-200', hoverBg: 'hover:bg-amber-100' },
    cyan: { bg: 'bg-cyan-50', iconBg: 'bg-cyan-100', iconText: 'text-cyan-600', border: 'border-cyan-200', hoverBg: 'hover:bg-cyan-100' },
    rose: { bg: 'bg-rose-50', iconBg: 'bg-rose-100', iconText: 'text-rose-600', border: 'border-rose-200', hoverBg: 'hover:bg-rose-100' },
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Email Settings</h1>
            <p className="text-sm text-slate-500 mt-1">
              Configure sender addresses, domain, and tracking for all outgoing emails
            </p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium text-sm disabled:opacity-50 shadow-sm"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : saveSuccess ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {saveSuccess ? 'Saved' : 'Save Changes'}
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-red-800 font-medium text-sm">Error</p>
            <p className="text-red-600 text-sm mt-0.5">{error}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <Mail className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">AR Sender</h2>
              <p className="text-xs text-slate-500">Used for customer invoices, replies, and scheduled emails</p>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">From Email</label>
              <div className="relative">
                <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  value={settings.ar_from_email}
                  onChange={(e) => updateField('ar_from_email', e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                  placeholder="ar@yourdomain.com"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">From Name</label>
              <input
                type="text"
                value={settings.ar_from_name}
                onChange={(e) => updateField('ar_from_name', e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                placeholder="Company - Accounts Receivable"
              />
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
              <Shield className="w-5 h-5 text-slate-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">No-Reply Sender</h2>
              <p className="text-xs text-slate-500">Used for system emails like password resets and notifications</p>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">From Email</label>
              <div className="relative">
                <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  value={settings.noreply_from_email}
                  onChange={(e) => updateField('noreply_from_email', e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                  placeholder="noreply@yourdomain.com"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">From Name</label>
              <input
                type="text"
                value={settings.noreply_from_name}
                onChange={(e) => updateField('noreply_from_name', e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                placeholder="Company Admin"
              />
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <Send className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Reply-To Address</h2>
              <p className="text-xs text-slate-500">Where customer replies are directed when they respond to emails</p>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Reply-To Email</label>
              <div className="relative">
                <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  value={settings.reply_to_email}
                  onChange={(e) => updateField('reply_to_email', e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                  placeholder="ar@yourdomain.com"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Reply-To Name</label>
              <input
                type="text"
                value={settings.reply_to_name}
                onChange={(e) => updateField('reply_to_name', e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                placeholder="Company - Accounts Receivable"
              />
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Company Info</h2>
              <p className="text-xs text-slate-500">Company name and domain used across all emails</p>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Company Name</label>
              <input
                type="text"
                value={settings.company_name}
                onChange={(e) => updateField('company_name', e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                placeholder="Your Company Name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Email Domain</label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={settings.domain}
                  onChange={(e) => updateField('domain', e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                  placeholder="yourdomain.com"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-cyan-50 flex items-center justify-center">
              <Globe className="w-5 h-5 text-cyan-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Inbound Parse</h2>
              <p className="text-xs text-slate-500">SendGrid Inbound Parse configuration for receiving emails</p>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Subdomain (optional)</label>
              <input
                type="text"
                value={settings.inbound_parse_subdomain}
                onChange={(e) => updateField('inbound_parse_subdomain', e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                placeholder="Leave empty if not using subdomain"
              />
              <p className="text-xs text-slate-400 mt-1.5">
                Emails to *@{settings.inbound_parse_subdomain ? `${settings.inbound_parse_subdomain}.` : ''}{settings.domain} will be processed
              </p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl">
              <p className="text-xs font-medium text-slate-600 mb-1">Webhook URL</p>
              <code className="text-xs text-slate-500 break-all">
                {import.meta.env.VITE_SUPABASE_URL}/functions/v1/email-receiver
              </code>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center">
              <Eye className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Email Tracking</h2>
              <p className="text-xs text-slate-500">SendGrid tracking for customer invoice emails</p>
            </div>
          </div>
          <div className="space-y-4">
            <label className="flex items-center justify-between p-3 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
              <div className="flex items-center gap-3">
                <Eye className="w-4 h-4 text-slate-500" />
                <div>
                  <p className="text-sm font-medium text-slate-700">Open Tracking</p>
                  <p className="text-xs text-slate-400">Track when recipients open emails</p>
                </div>
              </div>
              <div className="relative">
                <input
                  type="checkbox"
                  checked={settings.sendgrid_tracking_opens}
                  onChange={(e) => updateField('sendgrid_tracking_opens', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </div>
            </label>
            <label className="flex items-center justify-between p-3 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
              <div className="flex items-center gap-3">
                <MousePointer className="w-4 h-4 text-slate-500" />
                <div>
                  <p className="text-sm font-medium text-slate-700">Click Tracking</p>
                  <p className="text-xs text-slate-400">Track when recipients click links in emails</p>
                </div>
              </div>
              <div className="relative">
                <input
                  type="checkbox"
                  checked={settings.sendgrid_tracking_clicks}
                  onChange={(e) => updateField('sendgrid_tracking_clicks', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </div>
            </label>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <DepartmentEmailSenders
          fallbackFromEmail={settings.ar_from_email}
          fallbackFromName={settings.ar_from_name}
          fallbackReplyToEmail={settings.reply_to_email}
          fallbackReplyToName={settings.reply_to_name}
        />
      </div>

      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Test Emails</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Send a test of each email type to <span className="font-medium text-slate-700">{user?.email}</span>
            </p>
          </div>
          {testResults.length > 0 && (
            <button
              onClick={clearTestResults}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Clear Results
            </button>
          )}
        </div>

        {testResults.length > 0 && (
          <div className="mb-4 space-y-2">
            {testResults.map((result, i) => (
              <div
                key={i}
                className={`p-3 rounded-xl border flex items-center gap-3 text-sm animate-fade-in ${
                  result.success
                    ? 'bg-emerald-50 border-emerald-200'
                    : 'bg-red-50 border-red-200'
                }`}
              >
                {result.success ? (
                  <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                )}
                <span className={`font-medium ${result.success ? 'text-emerald-700' : 'text-red-700'}`}>
                  {result.type}:
                </span>
                <span className={result.success ? 'text-emerald-600' : 'text-red-600'}>
                  {result.message}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {emailTests.map((test) => {
            const Icon = test.icon;
            const colors = colorMap[test.color];
            const isLoading = testingType === test.id;
            const isDisabled = testingType !== null;

            return (
              <button
                key={test.id}
                onClick={test.handler}
                disabled={isDisabled}
                className={`relative text-left p-5 rounded-2xl border transition-all ${colors.border} ${colors.bg} ${colors.hoverBg} disabled:opacity-50 disabled:cursor-not-allowed group`}
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className={`w-9 h-9 rounded-lg ${colors.iconBg} flex items-center justify-center flex-shrink-0`}>
                    {isLoading ? (
                      <Loader2 className={`w-4.5 h-4.5 animate-spin ${colors.iconText}`} />
                    ) : (
                      <Icon className={`w-4.5 h-4.5 ${colors.iconText}`} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{test.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{test.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <AtSign className="w-3 h-3" />
                  <span className="truncate">{test.sender}</span>
                </div>
                <div className={`absolute inset-0 rounded-2xl border-2 border-transparent group-hover:border-current opacity-0 group-hover:opacity-10 transition-all pointer-events-none ${colors.iconText}`} />
              </button>
            );
          })}
        </div>
      </div>

      {settings.updated_at && (
        <div className="mt-6 text-center">
          <p className="text-xs text-slate-400">
            Last updated: {new Date(settings.updated_at).toLocaleString()}
          </p>
        </div>
      )}
    </div>
  );
}
