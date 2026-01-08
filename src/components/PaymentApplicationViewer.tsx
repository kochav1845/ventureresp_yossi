import React, { useState, useEffect } from 'react';
import { ArrowLeft, Search, FileText, DollarSign, Calendar, User, TrendingUp, RefreshCw, Play } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatDate as formatDateUtil } from '../lib/dateUtils';

interface InvoiceApplication {
  id: string;
  payment_id: string;
  payment_reference_number: string;
  invoice_reference_number: string;
  customer_id: string;
  application_date: string;
  amount_paid: number;
  balance: number;
  cash_discount_taken: number;
  post_period: string;
  application_period: string;
  due_date: string;
  customer_order: string;
  description: string;
}

interface PaymentWithApplications {
  payment_id: string;
  payment_reference_number: string;
  customer_id: string;
  total_amount: number;
  application_count: number;
  applications: InvoiceApplication[];
}

export default function PaymentApplicationViewer() {
  const [payments, setPayments] = useState<PaymentWithApplications[]>([]);
  const [filteredPayments, setFilteredPayments] = useState<PaymentWithApplications[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPayment, setSelectedPayment] = useState<PaymentWithApplications | null>(null);
  const [stats, setStats] = useState({
    totalPayments: 0,
    totalInvoices: 0,
    totalAmountApplied: 0,
    uniqueCustomers: 0
  });

  useEffect(() => {
    fetchPaymentApplications();
  }, []);

  useEffect(() => {
    filterPayments();
  }, [searchTerm, payments]);

  const resyncPaymentsWithoutApplications = async () => {
    setResyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resync-payments-without-applications`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to re-sync payments');
      }

      const result = await response.json();
      console.log('Re-sync result:', result);
      alert(`Successfully re-synced ${result.payments_processed} payments and created ${result.applications_created} invoice applications`);

      await fetchPaymentApplications();
    } catch (error) {
      console.error('Error re-syncing payments:', error);
      alert('Failed to re-sync payments. Check console for details.');
    } finally {
      setResyncing(false);
    }
  };

  const syncPaymentInvoiceLinks = async () => {
    setSyncing(true);
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/payment-invoice-links-sync`;
      const headers = {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers
      });

      if (!response.ok) {
        throw new Error('Failed to sync payment-invoice links');
      }

      const result = await response.json();
      console.log('Sync result:', result);

      await fetchPaymentApplications();
    } catch (error) {
      console.error('Error syncing payment-invoice links:', error);
      alert('Failed to sync payment-invoice links. Check console for details.');
    } finally {
      setSyncing(false);
    }
  };

  const fetchPaymentApplications = async () => {
    setLoading(true);
    try {
      // Fetch stats using database function to avoid row limit
      const { data: statsData } = await supabase
        .rpc('get_payment_application_stats');

      if (statsData && statsData.length > 0) {
        setStats({
          totalPayments: statsData[0].total_payments || 0,
          totalInvoices: statsData[0].total_applications || 0,
          totalAmountApplied: statsData[0].total_applied || 0,
          uniqueCustomers: statsData[0].unique_customers || 0
        });
      }

      // Fetch recent applications for display (limited to 1000 is fine for UI)
      const { data, error } = await supabase
        .from('payment_invoice_applications')
        .select('*')
        .order('application_date', { ascending: false })
        .limit(1000);

      if (error) throw error;

      const applicationsData = data || [];

      const paymentMap = new Map<string, PaymentWithApplications>();

      applicationsData.forEach((app: InvoiceApplication) => {
        const key = app.payment_id;

        if (!paymentMap.has(key)) {
          paymentMap.set(key, {
            payment_id: app.payment_id,
            payment_reference_number: app.payment_reference_number,
            customer_id: app.customer_id,
            total_amount: 0,
            application_count: 0,
            applications: []
          });
        }

        const payment = paymentMap.get(key)!;
        payment.total_amount += app.amount_paid;
        payment.application_count++;
        payment.applications.push(app);
      });

      const paymentsArray = Array.from(paymentMap.values());
      setPayments(paymentsArray);
    } catch (error) {
      console.error('Error fetching payment applications:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterPayments = () => {
    if (!searchTerm.trim()) {
      setFilteredPayments(payments);
      return;
    }

    const term = searchTerm.toLowerCase();
    const filtered = payments.filter(payment => {
      const matchesPayment =
        payment.payment_reference_number?.toLowerCase().includes(term) ||
        payment.customer_id?.toLowerCase().includes(term);

      const matchesInvoices = payment.applications.some(app =>
        app.invoice_reference_number?.toLowerCase().includes(term)
      );

      return matchesPayment || matchesInvoices;
    });

    setFilteredPayments(filtered);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };


  if (selectedPayment) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
        <div className="max-w-6xl mx-auto">
          <button
            onClick={() => setSelectedPayment(null)}
            className="mb-6 flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow-sm hover:shadow-md transition-all text-slate-700 hover:text-slate-900"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Payments
          </button>

          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">
                  Payment {selectedPayment.payment_reference_number}
                </h2>
                <div className="flex items-center gap-4 text-sm text-slate-600">
                  <span className="flex items-center gap-1">
                    <User className="w-4 h-4" />
                    Customer: {selectedPayment.customer_id}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-slate-600 mb-1">Total Applied</div>
                <div className="text-3xl font-bold text-emerald-600">
                  {formatCurrency(selectedPayment.total_amount)}
                </div>
                <div className="text-sm text-slate-600 mt-2">
                  {selectedPayment.application_count} invoice{selectedPayment.application_count !== 1 ? 's' : ''}
                </div>
              </div>
            </div>

            <div className="border-t pt-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                Invoices Paid ({selectedPayment.applications.length})
              </h3>

              <div className="space-y-3">
                {selectedPayment.applications.map((app) => (
                  <div
                    key={app.id}
                    className="bg-gradient-to-r from-slate-50 to-white border border-slate-200 rounded-lg p-4 hover:shadow-md transition-all"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                          <FileText className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900">
                            Invoice {app.invoice_reference_number}
                          </div>
                          <div className="text-sm text-slate-500">
                            Period: {app.application_period || 'N/A'}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-emerald-600">
                          {formatCurrency(app.amount_paid)}
                        </div>
                        <div className="text-xs text-slate-500">Applied Amount</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <div className="text-slate-500 mb-1">Application Date</div>
                        <div className="font-medium text-slate-700">
                          {formatDateUtil(app.application_date)}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500 mb-1">Due Date</div>
                        <div className="font-medium text-slate-700">
                          {formatDateUtil(app.due_date)}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500 mb-1">Discount Taken</div>
                        <div className="font-medium text-slate-700">
                          {formatCurrency(app.cash_discount_taken)}
                        </div>
                      </div>
                    </div>

                    {app.customer_order && (
                      <div className="mt-3 pt-3 border-t">
                        <div className="text-xs text-slate-500 mb-1">Customer Order</div>
                        <div className="text-sm text-slate-700">{app.customer_order}</div>
                      </div>
                    )}

                    {app.description && (
                      <div className="mt-3 pt-3 border-t">
                        <div className="text-xs text-slate-500 mb-1">Description</div>
                        <div className="text-sm text-slate-700">{app.description}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Payment-to-Invoice Links</h1>
            <p className="text-slate-600">View which invoices each payment was applied to</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={resyncPaymentsWithoutApplications}
              disabled={resyncing || syncing}
              className="flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg font-medium transition-colors shadow-lg hover:shadow-xl"
            >
              {resyncing ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Re-syncing...
                </>
              ) : (
                <>
                  <RefreshCw className="w-5 h-5" />
                  Re-check Missing Applications
                </>
              )}
            </button>
            <button
              onClick={syncPaymentInvoiceLinks}
              disabled={syncing || resyncing}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors shadow-lg hover:shadow-xl"
            >
              {syncing ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Extracting Links...
                </>
              ) : (
                <>
                  <Play className="w-5 h-5" />
                  Extract Invoice Links
                </>
              )}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-slate-600">Total Payments</div>
              <DollarSign className="w-5 h-5 text-blue-500" />
            </div>
            <div className="text-3xl font-bold text-slate-900">{stats.totalPayments}</div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-slate-600">Total Invoices</div>
              <FileText className="w-5 h-5 text-emerald-500" />
            </div>
            <div className="text-3xl font-bold text-slate-900">{stats.totalInvoices}</div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-slate-600">Unique Customers</div>
              <User className="w-5 h-5 text-violet-500" />
            </div>
            <div className="text-3xl font-bold text-slate-900">{stats.uniqueCustomers}</div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-slate-600">Total Applied</div>
              <TrendingUp className="w-5 h-5 text-amber-500" />
            </div>
            <div className="text-2xl font-bold text-slate-900">
              {formatCurrency(stats.totalAmountApplied)}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by payment number, customer, or invoice number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-xl shadow-lg p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-slate-600">Loading payment-invoice links...</p>
          </div>
        ) : filteredPayments.length === 0 ? (
          <div className="bg-white rounded-xl shadow-lg p-12 text-center">
            <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-600 mb-2">
              {searchTerm ? 'No payment-invoice links found' : 'No payment-invoice links available'}
            </p>
            <p className="text-sm text-slate-500">
              {searchTerm ? 'Try a different search term' : 'Click "Extract Invoice Links" to populate the data'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Payment #</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Customer</th>
                    <th className="text-center px-6 py-4 text-sm font-semibold text-slate-700">Invoices Paid</th>
                    <th className="text-right px-6 py-4 text-sm font-semibold text-slate-700">Total Amount</th>
                    <th className="text-right px-6 py-4 text-sm font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPayments.map((payment) => (
                    <tr key={payment.payment_id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-slate-900">{payment.payment_reference_number}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-slate-600">{payment.customer_id}</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 text-sm font-medium">
                          {payment.application_count}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="font-semibold text-slate-900">
                          {formatCurrency(payment.total_amount)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => setSelectedPayment(payment)}
                          className="text-blue-600 hover:text-blue-800 font-medium text-sm"
                        >
                          View Invoices
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
