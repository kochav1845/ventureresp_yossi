import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, Trash2, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface OrphanedApplication {
  id: string;
  payment_reference_number: string;
  invoice_reference_number: string;
  applied_amount: number;
  application_date: string;
  doc_type: string;
}

interface DiagnosticResults {
  totalApplications: number;
  validApplications: number;
  orphanedApplications: number;
  orphanedList: OrphanedApplication[];
}

export default function OrphanedApplicationDiagnostic({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<DiagnosticResults | null>(null);
  const [cleaning, setCleaning] = useState(false);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  const runDiagnostic = async () => {
    setLoading(true);
    try {
      const { data: allApplications, error: appError } = await supabase
        .from('payment_invoice_applications')
        .select('*');

      if (appError) throw appError;

      const { data: allInvoices, error: invError } = await supabase
        .from('acumatica_invoices')
        .select('reference_number');

      if (invError) throw invError;

      const invoiceSet = new Set(allInvoices?.map(inv => inv.reference_number) || []);

      const orphaned: OrphanedApplication[] = [];
      let validCount = 0;

      allApplications?.forEach(app => {
        if (!invoiceSet.has(app.invoice_reference_number)) {
          orphaned.push({
            id: app.id,
            payment_reference_number: app.payment_reference_number,
            invoice_reference_number: app.invoice_reference_number,
            applied_amount: app.applied_amount,
            application_date: app.application_date,
            doc_type: app.doc_type || 'N/A'
          });
        } else {
          validCount++;
        }
      });

      setResults({
        totalApplications: allApplications?.length || 0,
        validApplications: validCount,
        orphanedApplications: orphaned.length,
        orphanedList: orphaned
      });
    } catch (error) {
      console.error('Diagnostic error:', error);
      alert('Error running diagnostic: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const cleanOrphanedApplications = async () => {
    if (!results || results.orphanedApplications === 0) return;

    if (!confirm(`This will delete ${results.orphanedApplications} orphaned applications. Continue?`)) {
      return;
    }

    setCleaning(true);
    try {
      const orphanedIds = results.orphanedList.map(app => app.id);

      const { error } = await supabase
        .from('payment_invoice_applications')
        .delete()
        .in('id', orphanedIds);

      if (error) throw error;

      alert(`Successfully deleted ${results.orphanedApplications} orphaned applications`);
      runDiagnostic();
    } catch (error) {
      console.error('Cleanup error:', error);
      alert('Error cleaning up: ' + (error as Error).message);
    } finally {
      setCleaning(false);
    }
  };

  const exportOrphanedList = () => {
    if (!results) return;

    const csv = [
      'Payment Ref,Invoice Ref,Amount,Date,Doc Type',
      ...results.orphanedList.map(app =>
        `${app.payment_reference_number},${app.invoice_reference_number},${app.applied_amount},${app.application_date},${app.doc_type}`
      )
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orphaned-applications-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={handleBack}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Orphaned Applications Diagnostic</h1>
                <p className="text-sm text-gray-600">Find applications that reference non-existent invoices</p>
              </div>
            </div>
            <button
              onClick={runDiagnostic}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center space-x-2"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? 'Scanning...' : 'Run Diagnostic'}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!results ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <AlertTriangle className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Run Diagnostic to Begin</h2>
            <p className="text-gray-600 mb-4">
              This tool will scan all payment applications and identify which ones reference invoices
              that don't exist in your database.
            </p>
            <button
              onClick={runDiagnostic}
              disabled={loading}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Scanning...' : 'Start Diagnostic'}
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-6 mb-8">
              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-sm text-gray-600 mb-1">Total Applications</div>
                <div className="text-3xl font-bold text-gray-900">{results.totalApplications}</div>
              </div>
              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-sm text-gray-600 mb-1">Valid Applications</div>
                <div className="text-3xl font-bold text-green-600">{results.validApplications}</div>
              </div>
              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-sm text-gray-600 mb-1">Orphaned Applications</div>
                <div className="text-3xl font-bold text-red-600">{results.orphanedApplications}</div>
                <div className="text-xs text-gray-500 mt-1">
                  {((results.orphanedApplications / results.totalApplications) * 100).toFixed(1)}% of total
                </div>
              </div>
            </div>

            {results.orphanedApplications > 0 && (
              <>
                <div className="bg-white rounded-lg shadow mb-6">
                  <div className="p-6 border-b flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold">Orphaned Applications</h2>
                      <p className="text-sm text-gray-600">Applications referencing non-existent invoices</p>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={exportOrphanedList}
                        className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                      >
                        Export CSV
                      </button>
                      <button
                        onClick={cleanOrphanedApplications}
                        disabled={cleaning}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center space-x-2"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>{cleaning ? 'Deleting...' : 'Delete Orphaned'}</span>
                      </button>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Payment Ref</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Missing Invoice Ref</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Doc Type</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {results.orphanedList.map((app) => (
                          <tr key={app.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 text-sm font-medium text-gray-900">{app.payment_reference_number}</td>
                            <td className="px-6 py-4 text-sm text-red-600 font-medium">{app.invoice_reference_number}</td>
                            <td className="px-6 py-4 text-sm text-gray-900">${app.applied_amount.toFixed(2)}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{app.application_date}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{app.doc_type}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-yellow-900 mb-2">Next Steps</h3>
                  <ul className="list-disc list-inside space-y-1 text-yellow-800">
                    <li>Check if these invoices exist in Acumatica but haven't synced to your database</li>
                    <li>Run a sync to fetch missing invoices</li>
                    <li>Verify if the invoice reference numbers are correct</li>
                    <li>Delete orphaned applications if invoices truly don't exist</li>
                  </ul>
                </div>
              </>
            )}

            {results.orphanedApplications === 0 && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-8 text-center">
                <div className="text-green-600 text-6xl mb-4">✓</div>
                <h2 className="text-xl font-semibold text-green-900 mb-2">All Applications Valid!</h2>
                <p className="text-green-700">
                  Every payment application successfully references an existing invoice in your database.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
