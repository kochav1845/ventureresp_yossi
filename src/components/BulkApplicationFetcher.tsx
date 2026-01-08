import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, RefreshCw, Calendar, Clock } from 'lucide-react';

interface FetchResult {
  success: boolean;
  processed: number;
  applicationsFound: number;
  total_without_apps: number;
  remaining: number;
  nextSkip: number;
  batchSize: number;
  errors?: string[];
  durationMs: number;
}

export default function BulkApplicationFetcher({ onBack }: { onBack: () => void }) {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<{ total: number; without_apps: number; synced_today: number } | null>(null);
  const [result, setResult] = useState<FetchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetchMode, setFetchMode] = useState<'all' | 'today'>('today');

  const loadStats = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: payments } = await supabase
        .from('acumatica_payments')
        .select('id, last_sync_timestamp');

      const { data: withApps } = await supabase
        .from('payment_invoice_applications')
        .select('payment_id');

      const withAppsSet = new Set(withApps?.map(a => a.payment_id));
      const withoutApps = payments?.filter(p => !withAppsSet.has(p.id)) || [];

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const syncedToday = payments?.filter(p =>
        p.last_sync_timestamp && new Date(p.last_sync_timestamp) >= today
      ) || [];

      setStats({
        total: payments?.length || 0,
        without_apps: withoutApps.length,
        synced_today: syncedToday.length
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchApplications = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const requestBody: any = {
        batchSize: 100,
        skip: 0,
        onlyWithoutApplications: true
      };

      if (fetchMode === 'today') {
        requestBody.syncedToday = true;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/backfill-payment-applications`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(requestBody),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch applications');
      }

      setResult(data);
      await loadStats();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    loadStats();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-4xl mx-auto">
        <button
          onClick={handleBack}
          className="mb-6 flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Dashboard
        </button>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <RefreshCw className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Bulk Application Fetcher</h1>
              <p className="text-slate-600 text-sm">Fetch missing payment applications from Acumatica</p>
            </div>
          </div>

          {stats && (
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                <div className="text-2xl font-bold text-slate-900">{stats.total}</div>
                <div className="text-sm text-slate-600">Total Payments</div>
              </div>
              <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                <div className="text-2xl font-bold text-orange-600">{stats.without_apps}</div>
                <div className="text-sm text-orange-700">Without Applications</div>
              </div>
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <div className="text-2xl font-bold text-blue-600">{stats.synced_today}</div>
                <div className="text-sm text-blue-700">Synced Today</div>
              </div>
            </div>
          )}

          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 mb-3">Fetch Mode</label>
            <div className="flex gap-4">
              <button
                onClick={() => setFetchMode('today')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-all ${
                  fetchMode === 'today'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                <Calendar className="w-5 h-5" />
                <span>Today's Synced Payments</span>
              </button>
              <button
                onClick={() => setFetchMode('all')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-all ${
                  fetchMode === 'all'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                <Clock className="w-5 h-5" />
                <span>All Without Applications</span>
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {result && (
            <div className="mb-6 p-6 bg-green-50 border border-green-200 rounded-lg">
              <h3 className="font-semibold text-green-900 mb-3">Fetch Complete</h3>
              <div className="space-y-2 text-sm text-green-800">
                <div className="flex justify-between">
                  <span>Payments Processed:</span>
                  <span className="font-semibold">{result.processed}</span>
                </div>
                <div className="flex justify-between">
                  <span>Applications Found:</span>
                  <span className="font-semibold">{result.applicationsFound}</span>
                </div>
                <div className="flex justify-between">
                  <span>Duration:</span>
                  <span className="font-semibold">{(result.durationMs / 1000).toFixed(1)}s</span>
                </div>
                {result.remaining > 0 && (
                  <div className="flex justify-between text-orange-700">
                    <span>Remaining:</span>
                    <span className="font-semibold">{result.remaining}</span>
                  </div>
                )}
              </div>
              {result.errors && result.errors.length > 0 && (
                <div className="mt-4 pt-4 border-t border-green-200">
                  <p className="font-semibold text-red-700 mb-2">Errors ({result.errors.length}):</p>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {result.errors.map((err, idx) => (
                      <p key={idx} className="text-xs text-red-600">{err}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={fetchApplications}
              disabled={loading || stats?.without_apps === 0}
              className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed font-medium flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Fetching Applications...
                </>
              ) : (
                <>
                  <RefreshCw className="w-5 h-5" />
                  Fetch Applications
                </>
              )}
            </button>
            <button
              onClick={loadStats}
              disabled={loading}
              className="px-6 py-3 rounded-lg border-2 border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 font-medium"
            >
              Refresh Stats
            </button>
          </div>

          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>Note:</strong> This will fetch payment applications from Acumatica for payments that don't have any applications yet.
              Processing is done in batches of 100 to avoid timeouts. If there are more payments to process, run again.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
