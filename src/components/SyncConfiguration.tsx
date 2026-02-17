import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Settings, Save, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import CredentialsCard from './SyncConfig/CredentialsCard';
import EntitySyncCard from './SyncConfig/EntitySyncCard';
import DateRangeSync from './SyncConfig/DateRangeSync';
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
  const [message, setMessage] = useState('');

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
      setTimeout(() => setMessage(''), 3000);
    } catch (err: any) {
      setMessage(`Error saving: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-50 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-slate-600">Loading configuration...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <button
          onClick={handleBack}
          className="mb-6 flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors group"
        >
          <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          <span className="font-medium">Back</span>
        </button>

        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-600 flex items-center justify-center shadow-lg">
              <Settings className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Sync Configuration</h1>
              <p className="text-slate-600">Manage automatic data synchronization</p>
            </div>
          </div>
        </div>

        {message && (
          <div className={`mb-6 p-4 rounded-xl flex items-center gap-3 ${message.includes('Error') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
            {!message.includes('Error') && <CheckCircle className="w-5 h-5" />}
            <span className="font-medium">{message}</span>
          </div>
        )}

        <div className="space-y-6">
          <CredentialsCard
            credentials={credentials}
            hasCredentials={hasCredentials}
            onUpdate={setCredentials}
            onSaved={() => {
              setHasCredentials(true);
              loadCredentials();
            }}
          />

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-2">How Incremental Sync Works</h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                This system uses polling-based incremental sync to keep your data up-to-date. Every sync interval,
                it queries Acumatica for recently modified records using the LastModifiedDateTime field. The lookback
                window ensures reliability by checking slightly further back than the sync interval.
              </p>
            </div>

            <div className={`p-4 rounded-lg border ${hasCredentials ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
              <p className={`text-sm font-medium mb-2 ${hasCredentials ? 'text-green-800' : 'text-yellow-800'}`}>
                {hasCredentials ? 'Ready to Sync' : 'Setup Required'}
              </p>
              <p className={`text-sm ${hasCredentials ? 'text-green-700' : 'text-yellow-700'}`}>
                {hasCredentials
                  ? 'Credentials are configured. Enable sync for each entity type below to start automatic synchronization.'
                  : 'Configure your Acumatica credentials above to enable automatic sync.'}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-slate-900">Entity Sync Settings</h2>
            {configs.map((config) => (
              <EntitySyncCard
                key={config.id}
                config={config}
                onUpdate={(field, value) => updateConfig(config.entity_type, field, value)}
              />
            ))}
          </div>

          <button
            onClick={saveConfigs}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 disabled:from-slate-300 disabled:to-slate-300 disabled:cursor-not-allowed text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all"
          >
            {saving ? (
              <>
                <Save className="w-5 h-5 animate-pulse" />
                Saving Changes...
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Save Configuration
              </>
            )}
          </button>

          <DateRangeSync hasCredentials={hasCredentials} />

          <CronJobControl />

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
            <h3 className="text-blue-900 font-semibold mb-3">Best Practices</h3>
            <ul className="text-sm text-blue-800 space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-blue-600 mt-0.5">•</span>
                <span>Recommended: 5-minute sync interval with 2-minute lookback for near real-time updates</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 mt-0.5">•</span>
                <span>Lower intervals provide faster updates but use more API calls</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 mt-0.5">•</span>
                <span>The system automatically handles duplicates by upserting based on reference numbers</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 mt-0.5">•</span>
                <span>Use date range sync for initial setup or catching up on historical data</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
