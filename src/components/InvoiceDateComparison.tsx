import React, { useState } from 'react';
import { ArrowLeft, Search, AlertTriangle, CheckCircle, Calendar } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';

interface InvoiceDateComparisonProps {
  onBack: () => void;
}

export default function InvoiceDateComparison({ onBack }: InvoiceDateComparisonProps) {
  const { showToast } = useToast();
  const [referenceNumber, setReferenceNumber] = useState('022052');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleDiagnose = async () => {
    if (!referenceNumber.trim()) {
      showToast('Please enter a reference number', 'error');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/diagnose-invoice-by-reference`;

      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ referenceNumber: referenceNumber.trim() }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to diagnose invoice');
      }

      setResult(data);
      showToast('Invoice comparison completed', 'success');
    } catch (error: any) {
      console.error('Error:', error);
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateValue: any) => {
    if (!dateValue) return 'N/A';
    if (typeof dateValue === 'object' && dateValue.value) {
      const date = new Date(dateValue.value);
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    }
    if (typeof dateValue === 'string') {
      const date = new Date(dateValue);
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    }
    return String(dateValue);
  };

  const formatDateTime = (dateValue: any) => {
    if (!dateValue) return 'N/A';
    if (typeof dateValue === 'object' && dateValue.value) {
      const date = new Date(dateValue.value);
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    }
    if (typeof dateValue === 'string') {
      const date = new Date(dateValue);
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    }
    return String(dateValue);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <button
          onClick={onBack}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoice Date Diagnostic</h1>
          <p className="text-gray-600 mt-1">
            Compare invoice dates between Acumatica and our database
          </p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex space-x-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Invoice Reference Number
            </label>
            <input
              type="text"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder="e.g., 022052"
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              onKeyPress={(e) => e.key === 'Enter' && handleDiagnose()}
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleDiagnose}
              disabled={loading}
              className="flex items-center space-x-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Search className="w-4 h-4" />
              <span>{loading ? 'Checking...' : 'Diagnose'}</span>
            </button>
          </div>
        </div>
      </div>

      {result && (
        <div className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center space-x-2">
              <Calendar className="w-5 h-5 text-blue-600" />
              <h3 className="font-semibold text-blue-900">Diagnostic Results for {result.referenceNumber}</h3>
            </div>
          </div>

          {!result.database.exists && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                <p className="text-red-800 font-medium">Invoice not found in database</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2">
                <span className="w-3 h-3 bg-green-500 rounded-full"></span>
                <span>Acumatica (Source of Truth)</span>
              </h3>
              <div className="space-y-3">
                <div>
                  <div className="text-sm font-medium text-gray-500">Invoice Date</div>
                  <div className="text-lg font-semibold text-gray-900">{formatDate(result.acumatica.dates.Date)}</div>
                  <div className="text-xs text-gray-500 mt-1">Raw: {JSON.stringify(result.acumatica.dates.Date)}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-500">Due Date</div>
                  <div className="text-lg text-gray-900">{formatDate(result.acumatica.dates.DueDate)}</div>
                  <div className="text-xs text-gray-500 mt-1">Raw: {JSON.stringify(result.acumatica.dates.DueDate)}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-500">Doc Date</div>
                  <div className="text-lg text-gray-900">{formatDate(result.acumatica.dates.DocDate)}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-500">Post Period</div>
                  <div className="text-lg text-gray-900">
                    {result.acumatica.dates.PostPeriod?.value || 'N/A'}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-500">Created Date/Time</div>
                  <div className="text-sm text-gray-900">{formatDateTime(result.acumatica.dates.CreatedDateTime)}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-500">Last Modified Date/Time</div>
                  <div className="text-sm text-gray-900">{formatDateTime(result.acumatica.dates.LastModifiedDateTime)}</div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2">
                <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
                <span>Database (Our Copy)</span>
              </h3>
              {result.database.exists ? (
                <div className="space-y-3">
                  <div>
                    <div className="text-sm font-medium text-gray-500">Invoice Date</div>
                    <div className="text-lg font-semibold text-gray-900">{formatDate(result.database.dates.date)}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-500">Due Date</div>
                    <div className="text-lg text-gray-900">{formatDate(result.database.dates.due_date)}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-500">Post Period</div>
                    <div className="text-lg text-gray-900">
                      {result.database.dates.post_period || 'N/A'}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-500">Created Date/Time</div>
                    <div className="text-sm text-gray-900">{formatDateTime(result.database.dates.created_datetime)}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-500">Last Modified Date/Time</div>
                    <div className="text-sm text-gray-900">{formatDateTime(result.database.dates.last_modified_datetime)}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-500">Last Synced</div>
                    <div className="text-sm text-gray-900">{formatDateTime(result.database.dates.last_sync_timestamp)}</div>
                  </div>
                </div>
              ) : (
                <p className="text-gray-500 italic">Invoice not in database</p>
              )}
            </div>
          </div>

          {result.database.exists && (
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Comparison</h3>
              <div className="space-y-2">
                <div className="flex items-center space-x-3">
                  {result.comparison.dateMatch ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                  )}
                  <span className={result.comparison.dateMatch ? 'text-green-700' : 'text-red-700'}>
                    Invoice Date: {result.comparison.dateMatch ? 'Match' : 'Mismatch'}
                  </span>
                </div>
                <div className="flex items-center space-x-3">
                  {result.comparison.dueDateMatch ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                  )}
                  <span className={result.comparison.dueDateMatch ? 'text-green-700' : 'text-red-700'}>
                    Due Date: {result.comparison.dueDateMatch ? 'Match' : 'Mismatch'}
                  </span>
                </div>
              </div>
            </div>
          )}

          <details className="bg-gray-50 rounded-lg p-4">
            <summary className="cursor-pointer font-semibold text-gray-700 hover:text-gray-900">
              View Raw Data (Acumatica)
            </summary>
            <pre className="mt-4 text-xs bg-white p-4 rounded border overflow-auto max-h-96">
              {JSON.stringify(result.acumatica.fullData, null, 2)}
            </pre>
          </details>

          {result.database.exists && (
            <details className="bg-gray-50 rounded-lg p-4">
              <summary className="cursor-pointer font-semibold text-gray-700 hover:text-gray-900">
                View Raw Data (Database)
              </summary>
              <pre className="mt-4 text-xs bg-white p-4 rounded border overflow-auto max-h-96">
                {JSON.stringify(result.database.fullData, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
