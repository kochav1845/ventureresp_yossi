import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle, ArrowLeft, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface InvoiceDetail {
  reference_number: string;
  old_date?: string;
  new_date?: string;
  date?: string;
  status: string;
  balance: number;
  action: 'replaced' | 'inserted';
}

interface FixResult {
  success: boolean;
  totalOrphanedInvoices: number;
  fetched: number;
  replaced: number;
  inserted: number;
  skipped: number;
  invoiceDetails: InvoiceDetail[];
  errors?: string[];
}

export default function OrphanedInvoiceFixer({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [dryRunning, setDryRunning] = useState(false);
  const [result, setResult] = useState<FixResult | null>(null);
  const [dryRunResult, setDryRunResult] = useState<{ count: number; orphanedInvoices: string[] } | null>(null);
  const [error, setError] = useState('');

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  const runDryRun = async () => {
    setDryRunning(true);
    setError('');
    setDryRunResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('fetch-missing-invoices', {
        body: { dryRun: true, autoDetect: true }
      });

      if (error) throw error;

      setDryRunResult({
        count: data.count || 0,
        orphanedInvoices: data.orphanedInvoices || []
      });
    } catch (err: any) {
      setError(err.message || 'Failed to run dry run');
    } finally {
      setDryRunning(false);
    }
  };

  const fixOrphanedInvoices = async () => {
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('fetch-missing-invoices', {
        body: { dryRun: false, autoDetect: true }
      });

      if (error) throw error;

      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fix orphaned invoices');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <button
        onClick={handleBack}
        className="mb-6 flex items-center gap-2 text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      <div className="bg-white rounded-lg shadow-lg p-8">
        <div className="flex items-center gap-3 mb-6">
          <AlertTriangle className="w-8 h-8 text-amber-500" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Orphaned Invoice Fixer</h1>
            <p className="text-sm text-gray-600">Fix payments linked to old closed invoices</p>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-amber-900 mb-2">What This Tool Does</h3>
          <ul className="text-sm text-amber-800 space-y-1 list-disc list-inside">
            <li>Finds 2025 payments incorrectly linked to old 2020-2022 closed invoices</li>
            <li>Fetches the correct newer invoices from Acumatica with the same reference numbers</li>
            <li>Replaces old invoice records with current ones</li>
            <li>Fixes payment linkages automatically</li>
          </ul>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800 font-medium">Error</p>
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        <div className="flex gap-4 mb-6">
          <button
            onClick={runDryRun}
            disabled={dryRunning || loading}
            className="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
          >
            <RefreshCw className={`w-4 h-4 ${dryRunning ? 'animate-spin' : ''}`} />
            {dryRunning ? 'Scanning...' : 'Dry Run (Preview Only)'}
          </button>

          <button
            onClick={fixOrphanedInvoices}
            disabled={loading || dryRunning}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
          >
            <CheckCircle className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Fixing...' : 'Fix Orphaned Invoices'}
          </button>
        </div>

        {dryRunResult && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
            <h3 className="font-semibold text-blue-900 mb-3">Dry Run Results</h3>
            <p className="text-blue-800 mb-4">
              Found <strong>{dryRunResult.count}</strong> orphaned invoice references
            </p>
            {dryRunResult.count > 0 && (
              <div>
                <p className="text-sm text-blue-700 mb-2">Invoice Reference Numbers:</p>
                <div className="bg-white rounded p-3 max-h-48 overflow-y-auto">
                  <div className="flex flex-wrap gap-2">
                    {dryRunResult.orphanedInvoices.map((ref) => (
                      <span key={ref} className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-mono">
                        {ref}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {result && (
          <div className="space-y-6">
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-sm text-green-600 mb-1">Replaced</p>
                <p className="text-3xl font-bold text-green-700">{result.replaced}</p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-600 mb-1">Inserted</p>
                <p className="text-3xl font-bold text-blue-700">{result.inserted}</p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-1">Skipped</p>
                <p className="text-3xl font-bold text-gray-700">{result.skipped}</p>
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <p className="text-sm text-purple-600 mb-1">Total Found</p>
                <p className="text-3xl font-bold text-purple-700">{result.totalOrphanedInvoices}</p>
              </div>
            </div>

            {result.invoiceDetails.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-6 py-3 border-b border-gray-200">
                  <h3 className="font-semibold text-gray-900">Invoice Details</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Old Date</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">New Date</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {result.invoiceDetails.map((invoice, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap font-mono text-sm text-gray-900">
                            {invoice.reference_number}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              invoice.action === 'replaced'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}>
                              {invoice.action}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {invoice.old_date || '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                            {invoice.new_date || invoice.date || '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {invoice.status}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                            ${invoice.balance.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {result.errors && result.errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h3 className="font-semibold text-red-900 mb-2">Errors ({result.errors.length})</h3>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {result.errors.map((err, idx) => (
                    <p key={idx} className="text-sm text-red-700">{err}</p>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-green-800 font-medium">✓ Fix completed successfully</p>
              <p className="text-sm text-green-700 mt-1">
                Payment linkages will now point to the correct invoices.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
