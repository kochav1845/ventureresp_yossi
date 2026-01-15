import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, RefreshCw, CheckCircle, XCircle, Database } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface PaymentApplicationDiagnosticProps {
  onBack?: () => void;
}

export default function PaymentApplicationDiagnostic({ onBack }: PaymentApplicationDiagnosticProps) {
  const navigate = useNavigate();
  const [paymentRef, setPaymentRef] = useState('025835');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  const runDiagnostic = async () => {
    if (!paymentRef.trim()) {
      alert('Please enter a payment reference number');
      return;
    }

    setLoading(true);
    const diagnosticResults: any = {
      paymentRef,
      timestamp: new Date().toISOString(),
      approaches: {}
    };

    try {
      console.log('=== PAYMENT APPLICATION DIAGNOSTIC ===');
      console.log('Testing payment:', paymentRef);

      // Approach 1: Get payment by reference_number
      console.log('\n--- Approach 1: Direct payment lookup ---');
      const { data: payment, error: paymentError } = await supabase
        .from('acumatica_payments')
        .select('*')
        .eq('reference_number', paymentRef)
        .maybeSingle();

      diagnosticResults.approaches.approach1 = {
        name: 'Direct Payment Lookup',
        query: `SELECT * FROM acumatica_payments WHERE reference_number = '${paymentRef}'`,
        success: !paymentError,
        error: paymentError?.message,
        data: payment,
        recordCount: payment ? 1 : 0
      };

      console.log('Payment found:', payment);
      console.log('Error:', paymentError);

      // Approach 2: Get applications by payment_reference_number
      console.log('\n--- Approach 2: Applications by payment_reference_number ---');
      const { data: appsByRef, error: appsByRefError } = await supabase
        .from('payment_invoice_applications')
        .select('*')
        .eq('payment_reference_number', paymentRef)
        .order('application_date', { ascending: false });

      diagnosticResults.approaches.approach2 = {
        name: 'Applications by payment_reference_number',
        query: `SELECT * FROM payment_invoice_applications WHERE payment_reference_number = '${paymentRef}'`,
        success: !appsByRefError,
        error: appsByRefError?.message,
        data: appsByRef,
        recordCount: appsByRef?.length || 0
      };

      console.log('Applications found:', appsByRef);
      console.log('Error:', appsByRefError);

      // Approach 3: Get applications by payment_id (if payment found)
      if (payment?.id) {
        console.log('\n--- Approach 3: Applications by payment_id ---');
        const { data: appsByPaymentId, error: appsByPaymentIdError } = await supabase
          .from('payment_invoice_applications')
          .select('*')
          .eq('payment_id', payment.id)
          .order('application_date', { ascending: false });

        diagnosticResults.approaches.approach3 = {
          name: 'Applications by payment_id (UUID)',
          query: `SELECT * FROM payment_invoice_applications WHERE payment_id = '${payment.id}'`,
          success: !appsByPaymentIdError,
          error: appsByPaymentIdError?.message,
          data: appsByPaymentId,
          recordCount: appsByPaymentId?.length || 0
        };

        console.log('Applications found:', appsByPaymentId);
        console.log('Error:', appsByPaymentIdError);
      }

      // Approach 4: Join payment with applications
      console.log('\n--- Approach 4: Join payment with applications ---');
      const { data: joinedData, error: joinError } = await supabase
        .from('acumatica_payments')
        .select(`
          *,
          applications:payment_invoice_applications(*)
        `)
        .eq('reference_number', paymentRef)
        .maybeSingle();

      diagnosticResults.approaches.approach4 = {
        name: 'Join Query (payment with applications)',
        query: `SELECT p.*, app.* FROM acumatica_payments p LEFT JOIN payment_invoice_applications app ON p.id = app.payment_id WHERE p.reference_number = '${paymentRef}'`,
        success: !joinError,
        error: joinError?.message,
        data: joinedData,
        recordCount: joinedData?.applications?.length || 0,
        applicationCount: joinedData?.applications?.length || 0
      };

      console.log('Joined data:', joinedData);
      console.log('Error:', joinError);

      // Approach 5: Get invoices that were paid by this payment
      if (appsByRef && appsByRef.length > 0) {
        console.log('\n--- Approach 5: Get invoices paid by this payment ---');
        const invoiceRefs = appsByRef.map(app => app.invoice_reference_number);
        const { data: invoices, error: invoicesError } = await supabase
          .from('acumatica_invoices')
          .select('*')
          .in('reference_number', invoiceRefs);

        diagnosticResults.approaches.approach5 = {
          name: 'Invoices Paid by This Payment',
          query: `SELECT * FROM acumatica_invoices WHERE reference_number IN (${invoiceRefs.map(r => `'${r}'`).join(', ')})`,
          success: !invoicesError,
          error: invoicesError?.message,
          data: invoices,
          recordCount: invoices?.length || 0
        };

        console.log('Invoices found:', invoices);
        console.log('Error:', invoicesError);
      }

      // Approach 6: Complete join with invoice details
      console.log('\n--- Approach 6: Complete join with invoice details ---');
      const { data: completeData, error: completeError } = await supabase
        .from('acumatica_payments')
        .select(`
          *,
          applications:payment_invoice_applications(
            *,
            invoice:acumatica_invoices!invoice_reference_number(*)
          )
        `)
        .eq('reference_number', paymentRef)
        .maybeSingle();

      diagnosticResults.approaches.approach6 = {
        name: 'Complete Join (payment + applications + invoices)',
        query: `Complex join with invoice details`,
        success: !completeError,
        error: completeError?.message,
        data: completeData,
        recordCount: completeData?.applications?.length || 0
      };

      console.log('Complete data:', completeData);
      console.log('Error:', completeError);

      setResults(diagnosticResults);
      console.log('\n=== DIAGNOSTIC COMPLETE ===');

    } catch (error: any) {
      console.error('Diagnostic error:', error);
      diagnosticResults.error = error.message;
      setResults(diagnosticResults);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        <button
          onClick={handleBack}
          className="mb-6 flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Back
        </button>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <Database className="w-8 h-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">
              Payment Application Diagnostic
            </h1>
          </div>

          <p className="text-gray-600 mb-6">
            This tool tests different approaches to fetch a payment with its applications (invoice payments).
            Enter a payment reference number to see which queries work and what data they return.
          </p>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Payment Reference Number
              </label>
              <input
                type="text"
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
                placeholder="e.g., 025835"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={runDiagnostic}
                disabled={loading}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <Search className="w-5 h-5" />
                    Run Diagnostic
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {results && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                Diagnostic Results for Payment: {results.paymentRef}
              </h2>
              <p className="text-sm text-gray-600 mb-4">
                Timestamp: {new Date(results.timestamp).toLocaleString()}
              </p>
            </div>

            {Object.entries(results.approaches).map(([key, approach]: [string, any]) => (
              <div key={key} className="bg-white rounded-lg shadow-md p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {approach.success ? (
                        <CheckCircle className="w-6 h-6 text-green-600" />
                      ) : (
                        <XCircle className="w-6 h-6 text-red-600" />
                      )}
                      <h3 className="text-lg font-bold text-gray-900">
                        {approach.name}
                      </h3>
                      <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-medium">
                        {approach.recordCount} record{approach.recordCount !== 1 ? 's' : ''}
                      </span>
                      {approach.applicationCount !== undefined && (
                        <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                          {approach.applicationCount} application{approach.applicationCount !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <code className="block text-xs text-gray-600 bg-gray-50 p-2 rounded mb-3">
                      {approach.query}
                    </code>
                  </div>
                </div>

                {approach.error && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-700 font-medium">Error:</p>
                    <p className="text-sm text-red-600">{approach.error}</p>
                  </div>
                )}

                {approach.success && approach.data && (
                  <div className="bg-gray-50 rounded-lg p-4 overflow-x-auto">
                    <p className="text-xs text-gray-600 font-medium mb-2">Raw Data:</p>
                    <pre className="text-xs text-gray-800 overflow-x-auto">
                      {JSON.stringify(approach.data, null, 2)}
                    </pre>
                  </div>
                )}

                {approach.success && !approach.data && (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm text-yellow-700">No data returned</p>
                  </div>
                )}
              </div>
            ))}

            <div className="bg-gradient-to-r from-blue-50 to-green-50 rounded-lg shadow-md p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">
                Recommendation
              </h3>
              <div className="space-y-3 text-sm text-gray-700">
                <p className="font-medium">
                  Based on the results above, the best approach is:
                </p>
                <ol className="list-decimal list-inside space-y-2 ml-4">
                  <li>
                    <strong>For listing payments with application counts:</strong> Use Approach 1 (direct payment lookup)
                    + count from payment_invoice_applications table.
                  </li>
                  <li>
                    <strong>For getting payment details with applications:</strong> Use Approach 4 (join query)
                    to get payment and all its applications in one query.
                  </li>
                  <li>
                    <strong>For getting complete details including invoices:</strong> Use Approach 6 (complete join)
                    if the foreign key relationship is properly set up.
                  </li>
                  <li>
                    <strong>Alternative if joins don't work:</strong> Use Approach 2 (applications by payment_reference_number)
                    + Approach 5 (get invoices) in separate queries.
                  </li>
                </ol>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
