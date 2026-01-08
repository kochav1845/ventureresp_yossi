import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, DollarSign, TrendingUp, CreditCard, BarChart3 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface RevenueAnalyticsProps {
  onBack?: () => void;
  onNavigate?: (view: string) => void;
}

interface MonthlyRevenue {
  month: string;
  total: number;
  count: number;
  average: number;
}

interface PaymentTypeStats {
  doc_type: string;
  count: number;
  total_amount: number;
  percentage: number;
}

export default function RevenueAnalytics({ onBack, onNavigate }: RevenueAnalyticsProps) {
  const navigate = useNavigate();
  const [monthlyData, setMonthlyData] = useState<MonthlyRevenue[]>([]);
  const [paymentTypes, setPaymentTypes] = useState<PaymentTypeStats[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [averagePayment, setAveragePayment] = useState(0);
  const [totalPayments, setTotalPayments] = useState(0);
  const [loading, setLoading] = useState(true);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate('/dashboard');
    }
  };

  useEffect(() => {
    loadRevenueData();
  }, []);

  const loadRevenueData = async () => {
    setLoading(true);
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 12);

      const startStr = startDate.toISOString().split('T')[0];
      const endStr = endDate.toISOString().split('T')[0];

      const { data: payments, error: paymentsError } = await supabase
        .from('acumatica_payments')
        .select('application_date, payment_amount, id')
        .gte('application_date', startStr)
        .lte('application_date', endStr)
        .order('application_date', { ascending: true });

      if (paymentsError) throw paymentsError;

      const { data: applications, error: appError } = await supabase
        .from('payment_invoice_applications')
        .select('payment_id, doc_type, amount_paid');

      if (appError) throw appError;

      const paymentAppMap = new Map<string, any[]>();
      applications?.forEach(app => {
        if (!paymentAppMap.has(app.payment_id)) {
          paymentAppMap.set(app.payment_id, []);
        }
        paymentAppMap.get(app.payment_id)!.push(app);
      });

      const monthMap = new Map<string, { total: number; count: number }>();
      const typeMap = new Map<string, { count: number; total: number }>();
      let totalRev = 0;
      let totalCount = 0;

      payments?.forEach(payment => {
        if (!payment.application_date || !payment.payment_amount) return;

        const date = new Date(payment.application_date);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

        if (!monthMap.has(monthKey)) {
          monthMap.set(monthKey, { total: 0, count: 0 });
        }

        const monthData = monthMap.get(monthKey)!;
        monthData.total += payment.payment_amount;
        monthData.count += 1;

        totalRev += payment.payment_amount;
        totalCount += 1;

        const apps = paymentAppMap.get(payment.id) || [];
        apps.forEach(app => {
          const docType = app.doc_type || 'Unknown';
          if (!typeMap.has(docType)) {
            typeMap.set(docType, { count: 0, total: 0 });
          }
          const typeData = typeMap.get(docType)!;
          typeData.count += 1;
          typeData.total += app.amount_paid || 0;
        });
      });

      const monthlyArray: MonthlyRevenue[] = [];
      for (let i = 11; i >= 0; i--) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const monthName = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

        const data = monthMap.get(monthKey) || { total: 0, count: 0 };
        monthlyArray.push({
          month: monthName,
          total: data.total,
          count: data.count,
          average: data.count > 0 ? data.total / data.count : 0
        });
      }

      const typeArray: PaymentTypeStats[] = Array.from(typeMap.entries())
        .map(([doc_type, data]) => ({
          doc_type,
          count: data.count,
          total_amount: data.total,
          percentage: (data.count / totalCount) * 100
        }))
        .sort((a, b) => b.count - a.count);

      setMonthlyData(monthlyArray);
      setPaymentTypes(typeArray);
      setTotalRevenue(totalRev);
      setTotalPayments(totalCount);
      setAveragePayment(totalCount > 0 ? totalRev / totalCount : 0);
    } catch (error) {
      console.error('Error loading revenue data:', error);
    } finally {
      setLoading(false);
    }
  };

  const maxRevenue = Math.max(...monthlyData.map(m => m.total), 1);

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-green-50">
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBack}
              className="p-2 hover:bg-green-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-green-600" />
            </button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Revenue Analytics</h1>
              <p className="text-gray-600">Last 12 months financial performance</p>
            </div>
          </div>
          {onNavigate && (
            <button
              onClick={() => onNavigate('payment-analytics')}
              className="px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:shadow-lg transition-all"
            >
              View Payment Analytics
            </button>
          )}
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading revenue data...</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-600 font-medium">Total Revenue (12 months)</span>
                  <DollarSign className="w-5 h-5 text-green-600" />
                </div>
                <p className="text-3xl font-bold text-gray-900">
                  ${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-600 font-medium">Average Payment Amount</span>
                  <TrendingUp className="w-5 h-5 text-blue-600" />
                </div>
                <p className="text-3xl font-bold text-gray-900">
                  ${averagePayment.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-600 font-medium">Total Payments</span>
                  <CreditCard className="w-5 h-5 text-purple-600" />
                </div>
                <p className="text-3xl font-bold text-gray-900">{totalPayments.toLocaleString()}</p>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
              <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                <BarChart3 className="w-6 h-6 text-green-600" />
                Monthly Revenue Trend
              </h2>
              <div className="space-y-4">
                {monthlyData.map((month, index) => (
                  <div key={index} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-gray-700">{month.month}</span>
                      <div className="flex items-center gap-4">
                        <span className="text-gray-600">{month.count} payments</span>
                        <span className="font-bold text-green-700">
                          ${month.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                    <div className="relative h-8 bg-gray-100 rounded-lg overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 bg-gradient-to-r from-green-500 to-emerald-500 rounded-lg transition-all duration-500"
                        style={{ width: `${(month.total / maxRevenue) * 100}%` }}
                      />
                      <div className="absolute inset-0 flex items-center px-3 text-xs font-semibold text-gray-700">
                        Avg: ${month.average.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Payment Type Distribution</h2>
              <div className="space-y-4">
                {paymentTypes.map((type, index) => (
                  <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-gray-900">{type.doc_type}</span>
                        <span className="text-sm text-gray-600">{type.percentage.toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-gradient-to-r from-blue-500 to-cyan-500 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${type.percentage}%` }}
                        />
                      </div>
                    </div>
                    <div className="ml-6 text-right">
                      <p className="text-sm text-gray-600">{type.count} applications</p>
                      <p className="font-bold text-gray-900">
                        ${type.total_amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                ))}

                {paymentTypes.length === 0 && (
                  <p className="text-center text-gray-500 py-8">No payment type data available</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
