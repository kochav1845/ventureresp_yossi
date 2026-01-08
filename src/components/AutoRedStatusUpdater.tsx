import { useState } from 'react';
import { AlertCircle, CheckCircle, Play } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function AutoRedStatusUpdater() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ count: number; invoices: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runAutoUpdate = async () => {
    setRunning(true);
    setError(null);
    setResult(null);

    try {
      const { data, error: rpcError } = await supabase.rpc('auto_update_invoice_red_status');

      if (rpcError) throw rpcError;

      if (data && data.length > 0) {
        setResult({
          count: data[0].updated_count || 0,
          invoices: data[0].invoice_numbers || []
        });
      } else {
        setResult({ count: 0, invoices: [] });
      }
    } catch (err: any) {
      console.error('Error running auto-update:', err);
      setError(err.message || 'Failed to run auto-update');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            Auto Red Status Updater
          </h3>
          <p className="text-sm text-gray-600">
            Automatically mark overdue invoices as red based on each customer's threshold
          </p>
        </div>
        <button
          onClick={runAutoUpdate}
          disabled={running}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
        >
          <Play className={`w-4 h-4 ${running ? 'animate-spin' : ''}`} />
          {running ? 'Running...' : 'Run Update'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-900">Error</p>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {result && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-start gap-3 mb-3">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-green-900">
                Successfully updated {result.count} invoice{result.count !== 1 ? 's' : ''}
              </p>
              {result.count === 0 && (
                <p className="text-sm text-green-700 mt-1">
                  All invoices are already up to date or within their grace period
                </p>
              )}
            </div>
          </div>

          {result.invoices && result.invoices.length > 0 && (
            <div className="mt-4 pt-4 border-t border-green-200">
              <p className="text-sm font-medium text-green-900 mb-2">
                Updated Invoices:
              </p>
              <div className="max-h-48 overflow-y-auto">
                <div className="grid grid-cols-4 gap-2">
                  {result.invoices.map((invoice, idx) => (
                    <div
                      key={idx}
                      className="text-xs font-mono bg-white px-2 py-1 rounded border border-green-300 text-gray-700"
                    >
                      #{invoice}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-900 font-medium mb-2">How it works:</p>
        <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
          <li>Checks all open invoices with unpaid balances</li>
          <li>Compares days past due against customer-specific thresholds</li>
          <li>Automatically marks invoices as red if threshold exceeded</li>
          <li>Default threshold is 30 days (customizable per customer)</li>
          <li>Respects manual status overrides</li>
        </ul>
      </div>
    </div>
  );
}
