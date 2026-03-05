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
  Loader2
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

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

export default function EmailSettings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [settings, setSettings] = useState<EmailSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testingEmail, setTestingEmail] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

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

  const handleTestEmail = async () => {
    if (!user) return;
    setTestingEmail(true);
    setTestResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No active session');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email-reply`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            to: user.email,
            subject: 'Email Settings Test - Venture Respiratory',
            html: `<div style="font-family: Arial, sans-serif; padding: 20px;">
              <h2>Email Settings Test</h2>
              <p>This is a test email sent from your Venture Respiratory admin portal.</p>
              <p>If you received this email, your email settings are configured correctly.</p>
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
              <p style="color: #6b7280; font-size: 12px;">Sent at: ${new Date().toLocaleString()}</p>
            </div>`,
          }),
        }
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Failed with status ${response.status}`);
      }

      setTestResult({ success: true, message: `Test email sent to ${user.email}` });
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || 'Failed to send test email' });
    } finally {
      setTestingEmail(false);
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
        <div className="flex items-center gap-3">
          <button
            onClick={handleTestEmail}
            disabled={testingEmail}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition-colors font-medium text-sm disabled:opacity-50"
          >
            {testingEmail ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Send Test Email
          </button>
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

      {testResult && (
        <div className={`mb-6 p-4 border rounded-xl flex items-start gap-3 ${
          testResult.success
            ? 'bg-emerald-50 border-emerald-200'
            : 'bg-red-50 border-red-200'
        }`}>
          {testResult.success ? (
            <CheckCircle className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
          )}
          <div>
            <p className={`font-medium text-sm ${testResult.success ? 'text-emerald-800' : 'text-red-800'}`}>
              {testResult.success ? 'Test Email Sent' : 'Test Failed'}
            </p>
            <p className={`text-sm mt-0.5 ${testResult.success ? 'text-emerald-600' : 'text-red-600'}`}>
              {testResult.message}
            </p>
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
