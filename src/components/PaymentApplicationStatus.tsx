import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, RefreshCw, CheckCircle, XCircle, AlertCircle, Download } from 'lucide-react';

interface PaymentWithAppCount {
  id: string;
  reference_number: string;
  type: string;
  customer_name: string;
  payment_amount: string;
  status: string;
  application_date: string;
  app_count: number;
}

interface FetchStatus {
  [key: string]: {
    status: 'idle' | 'fetching' | 'success' | 'error';
    message?: string;
    appCount?: number;
  };
}

export default function PaymentApplicationStatus({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const [payments, setPayments] = useState<PaymentWithAppCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchStatus, setFetchStatus] = useState<FetchStatus>({});
  const [filter, setFilter] = useState<'all' | 'missing' | 'has-apps'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  useEffect(() => {
    loadPayments();
  }, []);

  const loadPayments = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_payment_ids_with_applications');

      if (error) throw error;

      setPayments(data || []);
    } catch (error) {
      console.error('Error loading payments:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchApplicationsForPayment = async (payment: PaymentWithAppCount) => {
    const key = payment.reference_number;

    setFetchStatus(prev => ({
      ...prev,
      [key]: { status: 'fetching' }
    }));

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-payment-applications?paymentRef=${payment.reference_number}&type=${payment.type}`
      );

      const result = await response.json();

      if (result.success) {
        setFetchStatus(prev => ({
          ...prev,
          [key]: {
            status: 'success',
            message: `Found ${result.applications?.length || 0} applications`,
            appCount: result.applications?.length || 0
          }
        }));

        // Update the payment in the list
        setPayments(prev => prev.map(p =>
          p.reference_number === payment.reference_number
            ? { ...p, app_count: result.applications?.length || 0 }
            : p
        ));
      } else {
        setFetchStatus(prev => ({
          ...prev,
          [key]: {
            status: 'error',
            message: result.error || 'Failed to fetch applications'
          }
        }));
      }
    } catch (error) {
      setFetchStatus(prev => ({
        ...prev,
        [key]: {
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      }));
    }
  };

  const fetchAllMissing = async () => {
    const missing = filteredPayments.filter(p => p.app_count === 0);

    for (const payment of missing) {
      await fetchApplicationsForPayment(payment);
      // Small delay to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  };

  const filteredPayments = payments
    .filter(p => {
      if (filter === 'missing') return p.app_count === 0;
      if (filter === 'has-apps') return p.app_count > 0;
      return true;
    })
    .filter(p => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        p.reference_number.toLowerCase().includes(term) ||
        p.customer_name.toLowerCase().includes(term) ||
        p.type.toLowerCase().includes(term)
      );
    });

  const stats = {
    total: payments.length,
    withApps: payments.filter(p => p.app_count > 0).length,
    missing: payments.filter(p => p.app_count === 0).length
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <button
            onClick={handleBack}
            className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="h-5 w-5 mr-2" />
            Back
          </button>
          <h1 className="text-3xl font-bold text-gray-900">Payment Application Status</h1>
          <p className="text-gray-600 mt-2">Track which payments have invoice applications fetched</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Payments</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{stats.total}</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-lg">
                <RefreshCw className="h-8 w-8 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">With Applications</p>
                <p className="text-3xl font-bold text-green-600 mt-1">{stats.withApps}</p>
              </div>
              <div className="p-3 bg-green-100 rounded-lg">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Missing Applications</p>
                <p className="text-3xl font-bold text-orange-600 mt-1">{stats.missing}</p>
              </div>
              <div className="p-3 bg-orange-100 rounded-lg">
                <AlertCircle className="h-8 w-8 text-orange-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6 border border-gray-200">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search by payment #, customer, or type..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setFilter('all')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filter === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilter('missing')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filter === 'missing'
                    ? 'bg-orange-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Missing
              </button>
              <button
                onClick={() => setFilter('has-apps')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filter === 'has-apps'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Complete
              </button>
            </div>

            <button
              onClick={fetchAllMissing}
              disabled={stats.missing === 0}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
            >
              <Download className="h-5 w-5" />
              Fetch All Missing
            </button>

            <button
              onClick={loadPayments}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 flex items-center gap-2"
            >
              <RefreshCw className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Payments Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Payment
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Applications
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                      Loading payments...
                    </td>
                  </tr>
                ) : filteredPayments.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                      No payments found
                    </td>
                  </tr>
                ) : (
                  filteredPayments.map((payment) => {
                    const status = fetchStatus[payment.reference_number];
                    const displayAppCount = status?.appCount ?? payment.app_count;

                    return (
                      <tr key={payment.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="font-mono font-medium text-gray-900">
                            {payment.reference_number}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-gray-600">{payment.type}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-900">{payment.customer_name}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-medium text-gray-900">
                            ${parseFloat(payment.payment_amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-gray-600">
                            {new Date(payment.application_date).toLocaleDateString()}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                            payment.status === 'Closed' ? 'bg-green-100 text-green-800' :
                            payment.status === 'Balanced' ? 'bg-blue-100 text-blue-800' :
                            payment.status === 'Open' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {payment.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            {displayAppCount > 0 ? (
                              <>
                                <CheckCircle className="h-5 w-5 text-green-600" />
                                <span className="text-sm font-medium text-green-600">
                                  {displayAppCount} app{displayAppCount !== 1 ? 's' : ''}
                                </span>
                              </>
                            ) : (
                              <>
                                <XCircle className="h-5 w-5 text-orange-600" />
                                <span className="text-sm font-medium text-orange-600">
                                  None
                                </span>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {status?.status === 'fetching' ? (
                            <div className="flex items-center gap-2 text-blue-600">
                              <RefreshCw className="h-4 w-4 animate-spin" />
                              <span className="text-sm">Fetching...</span>
                            </div>
                          ) : status?.status === 'success' ? (
                            <div className="flex items-center gap-2 text-green-600">
                              <CheckCircle className="h-4 w-4" />
                              <span className="text-xs">{status.message}</span>
                            </div>
                          ) : status?.status === 'error' ? (
                            <div className="flex items-center gap-2 text-red-600">
                              <XCircle className="h-4 w-4" />
                              <span className="text-xs">{status.message}</span>
                            </div>
                          ) : (
                            <button
                              onClick={() => fetchApplicationsForPayment(payment)}
                              className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                            >
                              Fetch
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
