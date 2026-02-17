import { useState } from 'react';
import { Save, Lock, Globe, Building, MapPin } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Credentials {
  id?: string;
  acumatica_url: string;
  username: string;
  password: string;
  company: string;
  branch: string;
  supabase_url: string;
  supabase_anon_key: string;
  is_active: boolean;
}

interface CredentialsCardProps {
  credentials: Credentials;
  hasCredentials: boolean;
  onUpdate: (credentials: Credentials) => void;
  onSaved: () => void;
}

export default function CredentialsCard({ credentials, hasCredentials, onUpdate, onSaved }: CredentialsCardProps) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setMessage('');

    try {
      if (hasCredentials && credentials.id) {
        await supabase
          .from('acumatica_sync_credentials')
          .update({ is_active: false })
          .eq('id', credentials.id);
      }

      const { error } = await supabase
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
        });

      if (error) throw error;

      setMessage('Credentials saved successfully!');
      onSaved();
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
          <Lock className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Acumatica Credentials</h2>
          <p className="text-sm text-slate-500">
            {hasCredentials ? 'Update your credentials below' : 'Enter credentials to enable sync'}
          </p>
        </div>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${message.includes('Error') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
          {message}
        </div>
      )}

      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
              <Globe className="w-4 h-4 text-slate-400" />
              Acumatica URL
            </label>
            <input
              type="text"
              value={credentials.acumatica_url}
              onChange={(e) => onUpdate({ ...credentials, acumatica_url: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="https://yourcompany.acumatica.com"
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
              <Building className="w-4 h-4 text-slate-400" />
              Company
            </label>
            <input
              type="text"
              value={credentials.company}
              onChange={(e) => onUpdate({ ...credentials, company: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Company Name"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">Username</label>
            <input
              type="text"
              value={credentials.username}
              onChange={(e) => onUpdate({ ...credentials, username: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="admin"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">Password</label>
            <input
              type="password"
              value={credentials.password}
              onChange={(e) => onUpdate({ ...credentials, password: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="••••••••"
            />
          </div>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
            <MapPin className="w-4 h-4 text-slate-400" />
            Branch
          </label>
          <input
            type="text"
            value={credentials.branch}
            onChange={(e) => onUpdate({ ...credentials, branch: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Branch Name"
          />
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-blue-900 mb-3">Supabase Configuration</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-blue-800 mb-1 block">Supabase URL</label>
              <input
                type="text"
                value={credentials.supabase_url}
                onChange={(e) => onUpdate({ ...credentials, supabase_url: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                placeholder="https://xxx.supabase.co"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-blue-800 mb-1 block">Anon Key</label>
              <input
                type="password"
                value={credentials.supabase_anon_key}
                onChange={(e) => onUpdate({ ...credentials, supabase_anon_key: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                placeholder="eyJ..."
              />
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving || !credentials.username || !credentials.password}
        className="mt-6 w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
      >
        {saving ? (
          <>
            <Save className="w-4 h-4 animate-pulse" />
            Saving...
          </>
        ) : (
          <>
            <Save className="w-4 h-4" />
            Save Credentials
          </>
        )}
      </button>
    </div>
  );
}
