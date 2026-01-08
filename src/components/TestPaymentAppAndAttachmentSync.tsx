import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { PlayCircle, Loader2, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface TestResult {
  step: string;
  status: 'pending' | 'success' | 'error';
  message: string;
  data?: any;
}

export function TestPaymentAppAndAttachmentSync() {
  const navigate = useNavigate();
  const [testing, setTesting] = useState(false);
  const [results, setResults] = useState<TestResult[]>([]);
  const [paymentInfo, setPaymentInfo] = useState<any>(null);
  const [referenceNumber, setReferenceNumber] = useState('');

  const addResult = (step: string, status: TestResult['status'], message: string, data?: any) => {
    setResults(prev => [...prev, { step, status, message, data }]);
  };

  const runTest = async () => {
    setTesting(true);
    setResults([]);
    setPaymentInfo(null);

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/test-payment-sync-model`;

      const body: any = {};
      if (referenceNumber.trim()) {
        body.reference_number = referenceNumber.trim();
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body)
      });

      const data = await response.json();

      if (data.success) {
        setPaymentInfo(data.payment);
        setResults(data.results);
      } else {
        addResult('Error', 'error', data.error || 'Unknown error occurred');
      }

    } catch (error: any) {
      addResult('Error', 'error', error.message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <button
            onClick={() => navigate('/developer-tools')}
            className="flex items-center text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Developer Tools
          </button>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Test Payment Application & Attachment Sync
          </h1>
          <p className="text-gray-600 mb-6">
            Test how applications and attachments are fetched from Acumatica. Leave the reference number blank to test the most recently modified payment.
          </p>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Payment Reference Number (optional)
            </label>
            <input
              type="text"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder="e.g., 026100 or leave blank for most recent"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={testing}
            />
            <p className="text-xs text-gray-500 mt-1">
              Enter a payment reference that has applications and attachments (not a prepayment)
            </p>
          </div>

          {paymentInfo && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h3 className="font-semibold text-blue-900 mb-2">Testing Payment:</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-blue-700 font-medium">Reference:</span> {paymentInfo.reference_number}
                </div>
                <div>
                  <span className="text-blue-700 font-medium">Type:</span> {paymentInfo.type}
                </div>
                <div>
                  <span className="text-blue-700 font-medium">Customer:</span> {paymentInfo.customer_name}
                </div>
                <div>
                  <span className="text-blue-700 font-medium">Amount:</span> ${paymentInfo.payment_amount}
                </div>
                <div>
                  <span className="text-blue-700 font-medium">Status:</span> {paymentInfo.status}
                </div>
                <div>
                  <span className="text-blue-700 font-medium">Last Modified:</span>{' '}
                  {new Date(paymentInfo.last_modified_datetime).toLocaleString()}
                </div>
              </div>
            </div>
          )}

          <button
            onClick={runTest}
            disabled={testing}
            className="flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {testing ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Testing...
              </>
            ) : (
              <>
                <PlayCircle className="w-5 h-5 mr-2" />
                Run Test
              </>
            )}
          </button>
        </div>

        {results.length > 0 && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Test Results</h2>
            <div className="space-y-4">
              {results.map((result, index) => (
                <div
                  key={index}
                  className={`p-4 rounded-lg border-l-4 ${
                    result.status === 'success'
                      ? 'bg-green-50 border-green-500'
                      : result.status === 'error'
                      ? 'bg-red-50 border-red-500'
                      : 'bg-blue-50 border-blue-500'
                  }`}
                >
                  <div className="flex items-start">
                    <div className="flex-shrink-0 mt-0.5">
                      {result.status === 'success' && (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      )}
                      {result.status === 'error' && (
                        <AlertCircle className="w-5 h-5 text-red-600" />
                      )}
                      {result.status === 'pending' && (
                        <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                      )}
                    </div>
                    <div className="ml-3 flex-1">
                      <h3 className="font-semibold text-gray-900">{result.step}</h3>
                      <p className="text-sm text-gray-700 mt-1">{result.message}</p>
                      {result.data && (
                        <details className="mt-2">
                          <summary className="text-sm text-blue-600 cursor-pointer hover:text-blue-800">
                            View Data
                          </summary>
                          <pre className="mt-2 p-3 bg-gray-800 text-green-400 rounded text-xs overflow-x-auto">
                            {JSON.stringify(result.data, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default TestPaymentAppAndAttachmentSync;
