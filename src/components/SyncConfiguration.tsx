import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Settings, Power, Clock, Calendar, Download } from 'lucide-react';
import { supabase } from '../lib/supabase';
import CronJobControl from './CronJobControl';

interface SyncConfigurationProps {
  onBack?: () => void;
}

interface EntityConfig {
  id: string;
  entity_type: string;
  sync_enabled: boolean;
  sync_interval_minutes: number;
  lookback_minutes: number;
}

interface Credentials {
  id?: string;
  acumatica_url: string;
  username: string;
  password: string;
  company: string;
  branch: string;
  is_active: boolean;
  supabase_url: string;
  supabase_anon_key: string;
}

export default function SyncConfiguration({ onBack }: SyncConfigurationProps) {
  const navigate = useNavigate();
  const handleBack = onBack || (() => navigate(-1));
  const [configs, setConfigs] = useState<EntityConfig[]>([]);
  const [credentials, setCredentials] = useState<Credentials>({
    acumatica_url: '',
    username: '',
    password: '',
    company: '',
    branch: '',
    is_active: true,
    supabase_url: '',
    supabase_anon_key: ''
  });
  const [hasCredentials, setHasCredentials] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingCredentials, setSavingCredentials] = useState(false);
  const [message, setMessage] = useState('');
  const [credentialsMessage, setCredentialsMessage] = useState('');
  const [dateRangeSync, setDateRangeSync] = useState({
    entityType: 'invoice',
    rangeType: 'last_week',
    startDate: '',
    endDate: '',
    syncing: false,
    message: ''
  });

  useEffect(() => {
    loadConfigs();
    loadCredentials();
  }, []);

  const loadConfigs = async () => {
    try {
      const { data } = await supabase
        .from('sync_status')
        .select('id, entity_type, sync_enabled, sync_interval_minutes, lookback_minutes')
        .order('entity_type');

      if (data) setConfigs(data);
    } catch (err) {
      console.error('Error loading configs:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadCredentials = async () => {
    try {
      const { data } = await supabase
        .from('acumatica_sync_credentials')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        setCredentials(data);
        setHasCredentials(true);
      }
    } catch (err) {
      console.error('Error loading credentials:', err);
    }
  };

  const updateConfig = (entityType: string, field: string, value: any) => {
    setConfigs(prev =>
      prev.map(config =>
        config.entity_type === entityType
          ? { ...config, [field]: value }
          : config
      )
    );
  };

  const saveConfigs = async () => {
    setSaving(true);
    setMessage('');

    try {
      for (const config of configs) {
        const { error } = await supabase
          .from('sync_status')
          .update({
            sync_enabled: config.sync_enabled,
            sync_interval_minutes: config.sync_interval_minutes,
            lookback_minutes: config.lookback_minutes,
            updated_at: new Date().toISOString(),
          })
          .eq('id', config.id);

        if (error) throw error;
      }

      setMessage('Configuration saved successfully!');
    } catch (err: any) {
      setMessage(`Error saving configuration: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const saveCredentials = async () => {
    setSavingCredentials(true);
    setCredentialsMessage('');

    try {
      // Deactivate old credentials
      if (hasCredentials && credentials.id) {
        await supabase
          .from('acumatica_sync_credentials')
          .update({ is_active: false })
          .eq('id', credentials.id);
      }

      // Insert new credentials
      const { data, error } = await supabase
        .from('acumatica_sync_credentials')
        .insert({
          acumatica_url: credentials.acumatica_url,
          username: credentials.username,
          password: credentials.password,
          company: credentials.company,
          branch: credentials.branch,
          supabase_url: credentials.supabase_url,
          supabase_anon_key: credentials.supabase_anon_key,
          is_active: true
        })
        .select()
        .single();

      if (error) throw error;

      setCredentials(data);
      setHasCredentials(true);
      setCredentialsMessage('Credentials saved successfully! Automatic sync will now work.');
    } catch (err: any) {
      setCredentialsMessage(`Error saving credentials: ${err.message}`);
    } finally {
      setSavingCredentials(false);
    }
  };

  const getEntityLabel = (type: string) => {
    return type.charAt(0).toUpperCase() + type.slice(1) + 's';
  };

  const getDateRange = (rangeType: string) => {
    const now = new Date();
    let startDate: Date;
    let endDate: Date;

    switch (rangeType) {
      case 'last_week':
        // Last Sunday to Saturday
        const lastSunday = new Date(now);
        lastSunday.setDate(now.getDate() - now.getDay() - 7);
        lastSunday.setHours(0, 0, 0, 0);

        const lastSaturday = new Date(lastSunday);
        lastSaturday.setDate(lastSunday.getDate() + 6);
        lastSaturday.setHours(23, 59, 59, 999);

        startDate = lastSunday;
        endDate = lastSaturday;
        break;

      case 'this_week':
        // This Sunday to today
        const thisSunday = new Date(now);
        thisSunday.setDate(now.getDate() - now.getDay());
        thisSunday.setHours(0, 0, 0, 0);

        startDate = thisSunday;
        endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);
        break;

      case 'last_month':
        // First day to last day of previous month
        const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        firstDayLastMonth.setHours(0, 0, 0, 0);

        const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
        lastDayLastMonth.setHours(23, 59, 59, 999);

        startDate = firstDayLastMonth;
        endDate = lastDayLastMonth;
        break;

      case 'this_month':
        // First day of this month to today
        const firstDayThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        firstDayThisMonth.setHours(0, 0, 0, 0);

        startDate = firstDayThisMonth;
        endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);
        break;

      case 'last_30_days':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 30);
        startDate.setHours(0, 0, 0, 0);

        endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);
        break;

      case 'last_90_days':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 90);
        startDate.setHours(0, 0, 0, 0);

        endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);
        break;

      default:
        startDate = new Date(now);
        endDate = new Date(now);
    }

    return {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
    };
  };

  const triggerDateRangeSync = async () => {
    setDateRangeSync(prev => ({ ...prev, syncing: true, message: '' }));

    try {
      let startDate: string;
      let endDate: string;

      if (dateRangeSync.rangeType === 'custom') {
        if (!dateRangeSync.startDate || !dateRangeSync.endDate) {
          throw new Error('Please select both start and end dates for custom range');
        }
        startDate = new Date(dateRangeSync.startDate).toISOString();
        endDate = new Date(dateRangeSync.endDate + 'T23:59:59').toISOString();
      } else {
        const range = getDateRange(dateRangeSync.rangeType);
        startDate = range.startDate;
        endDate = range.endDate;
      }

      const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/acumatica-${dateRangeSync.entityType}-date-range-sync`;

      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          startDate,
          endDate
        })
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setDateRangeSync(prev => ({
          ...prev,
          message: `✓ Sync completed! Created: ${result.created || 0}, Updated: ${result.updated || 0}, Total: ${result.totalFetched || 0}`
        }));
      } else {
        throw new Error(result.error || 'Sync failed');
      }
    } catch (err: any) {
      setDateRangeSync(prev => ({
        ...prev,
        message: `Error: ${err.message}`
      }));
    } finally {
      setDateRangeSync(prev => ({ ...prev, syncing: false }));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 p-8">
        <div className="text-white">Loading configuration...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 p-8">
      <div className="max-w-4xl mx-auto">
        <button
          onClick={handleBack}
          className="mb-6 flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Back
        </button>

        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Settings className="w-8 h-8 text-blue-500" />
            <h1 className="text-3xl font-bold text-white">Sync Configuration</h1>
          </div>
          <p className="text-slate-400">Configure automatic synchronization settings for each entity type</p>
        </div>

        {message && (
          <div className={`mb-6 p-4 rounded-lg ${message.includes('Error') ? 'bg-red-900/20 border border-red-700 text-red-400' : 'bg-green-900/20 border border-green-700 text-green-400'}`}>
            {message}
          </div>
        )}

        {/* Credentials Section */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-white mb-4">Acumatica Credentials</h2>
          <p className="text-slate-400 mb-6 text-sm">
            {hasCredentials
              ? 'Credentials are configured. Update them below if needed.'
              : 'Enter your Acumatica credentials to enable automatic synchronization.'}
          </p>

          {credentialsMessage && (
            <div className={`mb-4 p-4 rounded-lg ${credentialsMessage.includes('Error') ? 'bg-red-900/20 border border-red-700 text-red-400' : 'bg-green-900/20 border border-green-700 text-green-400'}`}>
              {credentialsMessage}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">Acumatica URL</label>
              <input
                type="text"
                value={credentials.acumatica_url}
                onChange={(e) => setCredentials({ ...credentials, acumatica_url: e.target.value })}
                className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="https://yourcompany.acumatica.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">Username</label>
              <input
                type="text"
                value={credentials.username}
                onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
                className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="admin"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">Password</label>
              <input
                type="password"
                value={credentials.password}
                onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">Company</label>
              <input
                type="text"
                value={credentials.company}
                onChange={(e) => setCredentials({ ...credentials, company: e.target.value })}
                className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Company Name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">Branch</label>
              <input
                type="text"
                value={credentials.branch}
                onChange={(e) => setCredentials({ ...credentials, branch: e.target.value })}
                className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Branch Name"
              />
            </div>
          </div>

          <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4 mb-4">
            <h3 className="text-sm font-semibold text-blue-400 mb-3">Cron Job Configuration (Required for Auto-Sync)</h3>
            <p className="text-xs text-slate-400 mb-4">
              These credentials allow the automated sync cron job to call the edge functions. Find these in your Supabase Dashboard under Project Settings.
            </p>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Supabase URL</label>
                <input
                  type="text"
                  value={credentials.supabase_url}
                  onChange={(e) => setCredentials({ ...credentials, supabase_url: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="https://xxx.supabase.co"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Supabase Anon Key</label>
                <input
                  type="password"
                  value={credentials.supabase_anon_key}
                  onChange={(e) => setCredentials({ ...credentials, supabase_anon_key: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="eyJ... (anon key)"
                />
              </div>
            </div>
          </div>

          <button
            onClick={saveCredentials}
            disabled={savingCredentials || !credentials.username || !credentials.password}
            className="flex items-center gap-2 px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-700 text-white rounded-lg font-medium transition-colors"
          >
            {savingCredentials ? (
              <>
                <Save className="w-5 h-5 animate-pulse" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Save Credentials
              </>
            )}
          </button>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 mb-6">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-white mb-2">How Incremental Sync Works</h2>
            <div className="text-slate-300 space-y-2 text-sm">
              <p>
                Instead of webhooks, this system uses <strong className="text-white">polling/incremental sync</strong> to keep your data up-to-date:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>Every sync interval (e.g., 1 minute), the system queries Acumatica for recently modified records</li>
                <li>Uses the <code className="text-blue-400 bg-slate-900 px-1 rounded">LastModifiedDateTime</code> field to filter changes</li>
                <li>The "lookback window" determines how far back to check (e.g., 2 minutes)</li>
                <li>Automatically creates new records and updates existing ones</li>
                <li>More reliable than webhooks - no missed updates due to network issues</li>
              </ul>
            </div>
          </div>

          <div className={`${hasCredentials ? 'bg-green-900/20 border-green-700' : 'bg-yellow-900/20 border-yellow-700'} border rounded p-4`}>
            <div className={`${hasCredentials ? 'text-green-400' : 'text-yellow-400'} font-medium mb-2`}>
              {hasCredentials ? '✓ Ready to Sync' : '⚠ Setup Required'}
            </div>
            <div className="text-slate-300 text-sm space-y-1">
              {hasCredentials ? (
                <>
                  <p>✓ Credentials configured - automatic sync is active</p>
                  <p>✓ No changes needed in Acumatica - it just works!</p>
                  <p>• Enable sync below to start automatic synchronization</p>
                </>
              ) : (
                <>
                  <p>1. Enter your Acumatica credentials above</p>
                  <p>2. Save the credentials</p>
                  <p>3. Run an initial bulk fetch to populate existing data</p>
                  <p>4. Enable automatic sync below to keep data up-to-date</p>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6 mb-8">
          {configs.map((config) => (
            <div
              key={config.id}
              className="bg-slate-800 border border-slate-700 rounded-lg p-6"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-semibold text-white">
                  {getEntityLabel(config.entity_type)}
                </h3>
                <label className="flex items-center gap-3 cursor-pointer">
                  <span className="text-slate-400">Auto-Sync</span>
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={config.sync_enabled}
                      onChange={(e) => updateConfig(config.entity_type, 'sync_enabled', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-14 h-7 bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-[4px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-blue-600"></div>
                  </div>
                  <Power className={`w-5 h-5 ${config.sync_enabled ? 'text-green-500' : 'text-slate-500'}`} />
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Sync Interval (minutes)
                    </div>
                  </label>
                  <input
                    type="number"
                    min="5"
                    max="60"
                    value={config.sync_interval_minutes}
                    onChange={(e) => updateConfig(config.entity_type, 'sync_interval_minutes', parseInt(e.target.value))}
                    disabled={!config.sync_enabled}
                    className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    How often to check for changes (5-60 minutes, minimum 5 to prevent API login limits)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">
                    Lookback Window (minutes)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={config.lookback_minutes}
                    onChange={(e) => updateConfig(config.entity_type, 'lookback_minutes', parseInt(e.target.value))}
                    disabled={!config.sync_enabled}
                    className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    How far back to check for changes (buffer for reliability)
                  </p>
                </div>
              </div>

              {config.sync_enabled && (
                <div className="mt-4 p-3 bg-green-900/20 border border-green-700 rounded text-sm text-green-400">
                  <strong>Active:</strong> Syncing every {config.sync_interval_minutes} minute{config.sync_interval_minutes !== 1 ? 's' : ''}, checking last {config.lookback_minutes} minute{config.lookback_minutes !== 1 ? 's' : ''} for changes
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex justify-end">
          <button
            onClick={saveConfigs}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white rounded-lg font-medium transition-colors"
          >
            {saving ? (
              <>
                <Save className="w-5 h-5 animate-pulse" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Save Configuration
              </>
            )}
          </button>
        </div>

        {/* Advanced Date Range Sync */}
        <div className="mt-8 bg-slate-800 border border-slate-700 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <Calendar className="w-6 h-6 text-blue-500" />
            <h2 className="text-xl font-semibold text-white">Advanced Date Range Sync</h2>
          </div>
          <p className="text-slate-400 mb-6 text-sm">
            Sync historical data for a specific date range. Useful for catching up on missed data or initial setup.
          </p>

          {dateRangeSync.message && (
            <div className={`mb-4 p-4 rounded-lg ${dateRangeSync.message.includes('Error') ? 'bg-red-900/20 border border-red-700 text-red-400' : 'bg-green-900/20 border border-green-700 text-green-400'}`}>
              {dateRangeSync.message}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">Entity Type</label>
              <select
                value={dateRangeSync.entityType}
                onChange={(e) => setDateRangeSync(prev => ({ ...prev, entityType: e.target.value }))}
                disabled={dateRangeSync.syncing}
                className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              >
                <option value="customer">Customers</option>
                <option value="invoice">Invoices</option>
                <option value="payment">Payments</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">Date Range</label>
              <select
                value={dateRangeSync.rangeType}
                onChange={(e) => setDateRangeSync(prev => ({ ...prev, rangeType: e.target.value }))}
                disabled={dateRangeSync.syncing}
                className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              >
                <option value="last_week">Last Week (Sun-Sat)</option>
                <option value="this_week">This Week (Sun-Today)</option>
                <option value="last_month">Last Month</option>
                <option value="this_month">This Month</option>
                <option value="last_30_days">Last 30 Days</option>
                <option value="last_90_days">Last 90 Days</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={triggerDateRangeSync}
                disabled={dateRangeSync.syncing || !hasCredentials}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white rounded-lg font-medium transition-colors"
              >
                {dateRangeSync.syncing ? (
                  <>
                    <Download className="w-5 h-5 animate-bounce" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <Download className="w-5 h-5" />
                    Start Sync
                  </>
                )}
              </button>
            </div>
          </div>

          {dateRangeSync.rangeType === 'custom' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Start Date</label>
                <input
                  type="date"
                  value={dateRangeSync.startDate}
                  onChange={(e) => setDateRangeSync(prev => ({ ...prev, startDate: e.target.value }))}
                  disabled={dateRangeSync.syncing}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">End Date</label>
                <input
                  type="date"
                  value={dateRangeSync.endDate}
                  onChange={(e) => setDateRangeSync(prev => ({ ...prev, endDate: e.target.value }))}
                  disabled={dateRangeSync.syncing}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                />
              </div>
            </div>
          )}

          <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4">
            <h4 className="text-blue-400 font-medium mb-2 text-sm">How it works:</h4>
            <ul className="text-slate-300 text-xs space-y-1 list-disc list-inside">
              <li><strong>Last Week:</strong> Syncs from last Sunday 12:00 AM to last Saturday 11:59 PM</li>
              <li><strong>This Week:</strong> Syncs from this Sunday 12:00 AM to now</li>
              <li><strong>Last Month:</strong> Syncs the entire previous calendar month</li>
              <li><strong>Custom Range:</strong> Sync any specific date range you choose</li>
              <li>This is a one-time sync - it doesn't affect your automatic sync settings</li>
              <li>Large date ranges may take several minutes to complete</li>
            </ul>
          </div>

          {!hasCredentials && (
            <div className="mt-4 bg-yellow-900/20 border border-yellow-700 rounded-lg p-4">
              <p className="text-yellow-400 text-sm">
                Please configure Acumatica credentials above before using date range sync.
              </p>
            </div>
          )}
        </div>

        <div className="mt-8">
          <CronJobControl />
        </div>

        <div className="mt-8 bg-yellow-900/20 border border-yellow-700 rounded-lg p-6">
          <h3 className="text-yellow-400 font-semibold mb-2">Important Notes:</h3>
          <ul className="text-slate-300 text-sm space-y-1 list-disc list-inside">
            <li>Lower sync intervals (e.g., 1 minute) provide more real-time updates but use more API calls</li>
            <li>Lookback window should be slightly larger than sync interval to ensure no changes are missed</li>
            <li>Recommended: 1-minute interval with 2-minute lookback for near real-time sync</li>
            <li>The system automatically handles duplicates - records are upserted based on their reference numbers</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
