import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, FileText, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface PaymentWithNoteId {
  id: string;
  reference_number: string;
  customer_id: string;
  note_id: string;
  payment_amount: number;
  application_date: string;
}

interface FileRecord {
  PaymentType: string;
  PaymentRefNbr: string;
  CustomerID: string;
  PaymentNoteID: string;
  FileID: string;
  FileName: string;
  FileCreatedDate: string;
  downloadUrl: string;
}

export default function PaymentAttachmentTest({ onBack }: { onBack: () => void }) {
  const [payments, setPayments] = useState<PaymentWithNoteId[]>([]);
  const [selectedPayment, setSelectedPayment] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    fetchPaymentsWithNoteId();
  }, []);

  const fetchPaymentsWithNoteId = async () => {
    setLoading(true);
    setError('');

    try {
      const { data, error: fetchError } = await supabase
        .from('acumatica_payments')
        .select('id, reference_number, customer_id, note_id, payment_amount, application_date')
        .not('note_id', 'is', null)
        .order('application_date', { ascending: false })
        .limit(50);

      if (fetchError) throw fetchError;
      setPayments(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchAttachments = async () => {
    if (!selectedPayment) {
      setError('Please select a payment first');
      return;
    }

    setFetching(true);
    setError('');
    setResult(null);

    try {
      const payment = payments.find(p => p.id === selectedPayment);
      if (!payment) throw new Error('Payment not found');

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      if (!supabaseUrl) {
        throw new Error('Missing Supabase URL');
      }

      const functionUrl = `${supabaseUrl}/functions/v1/fetch-payment-attachments`;

      console.log('Fetching attachments for payment:', payment.reference_number);
      console.log('Note ID:', payment.note_id);

      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          paymentRefNumber: payment.reference_number,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch attachments');
      }

      setResult(data);
    } catch (err: any) {
      console.error('Error fetching attachments:', err);
      setError(err.message);
    } finally {
      setFetching(false);
    }
  };

  const selectedPaymentData = payments.find(p => p.id === selectedPayment);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBack}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Payment Attachment Test</h1>
              <p className="text-sm text-gray-600 mt-1">
                Test fetching attachments from Acumatica for payments with note_id
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
              <h2 className="text-lg font-semibold mb-4">Select Payment</h2>
              <p className="text-sm text-gray-600 mb-4">
                Found {payments.length} payments with note_id (document references)
              </p>

              <select
                value={selectedPayment}
                onChange={(e) => setSelectedPayment(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg mb-4"
              >
                <option value="">Select a payment...</option>
                {payments.map((payment) => (
                  <option key={payment.id} value={payment.id}>
                    {payment.reference_number} - Customer: {payment.customer_id} - ${payment.payment_amount?.toFixed(2)} - {new Date(payment.application_date).toLocaleDateString()}
                  </option>
                ))}
              </select>

              {selectedPaymentData && (
                <div className="bg-gray-50 p-4 rounded-lg mb-4">
                  <h3 className="font-semibold mb-2">Selected Payment Details</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="font-medium">Reference:</span> {selectedPaymentData.reference_number}</div>
                    <div><span className="font-medium">Customer:</span> {selectedPaymentData.customer_id}</div>
                    <div><span className="font-medium">Amount:</span> ${selectedPaymentData.payment_amount?.toFixed(2)}</div>
                    <div><span className="font-medium">Date:</span> {new Date(selectedPaymentData.application_date).toLocaleDateString()}</div>
                    <div className="col-span-2"><span className="font-medium">Note ID:</span> <code className="text-xs bg-white px-2 py-1 rounded">{selectedPaymentData.note_id}</code></div>
                  </div>
                </div>
              )}

              <button
                onClick={fetchAttachments}
                disabled={!selectedPayment || fetching}
                className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {fetching ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Fetching Attachments...
                  </>
                ) : (
                  <>
                    <Download className="w-5 h-5" />
                    Fetch Attachments
                  </>
                )}
              </button>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-red-900 mb-1">Error</h3>
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {result && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                  <h2 className="text-lg font-semibold">Results</h2>
                </div>

                <div className="bg-green-50 p-4 rounded-lg mb-6">
                  <p className="text-sm text-green-800">
                    <span className="font-semibold">Success!</span> Found {result.filesCount} attachment(s) for payment {result.paymentRefNumber}
                  </p>
                </div>

                {result.files && result.files.length > 0 ? (
                  <div className="space-y-3">
                    <h3 className="font-semibold mb-3">Attachments:</h3>
                    {result.files.map((file: FileRecord, index: number) => (
                      <div key={index} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <FileText className="w-5 h-5 text-blue-600 mt-1" />
                            <div>
                              <h4 className="font-medium text-gray-900">{file.FileName}</h4>
                              <div className="text-sm text-gray-600 mt-1 space-y-1">
                                <div>File ID: <code className="text-xs bg-gray-100 px-2 py-0.5 rounded">{file.FileID}</code></div>
                                <div>Payment: {file.PaymentRefNbr} ({file.PaymentType})</div>
                                <div>Customer: {file.CustomerID}</div>
                                {file.FileCreatedDate && (
                                  <div>Created: {new Date(file.FileCreatedDate).toLocaleString()}</div>
                                )}
                              </div>
                            </div>
                          </div>
                          <a
                            href={file.downloadUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm"
                          >
                            <Download className="w-4 h-4" />
                            Download
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <FileText className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                    <p>No attachments found for this payment</p>
                  </div>
                )}

                <details className="mt-6">
                  <summary className="cursor-pointer font-semibold text-gray-700 hover:text-gray-900">
                    View Raw Response
                  </summary>
                  <pre className="mt-3 bg-gray-50 p-4 rounded-lg overflow-x-auto text-xs">
                    {JSON.stringify(result, null, 2)}
                  </pre>
                </details>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
