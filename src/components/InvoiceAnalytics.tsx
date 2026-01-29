import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  TrendingUp,
  DollarSign,
  Calendar,
  FileText,
  AlertCircle,
  Filter,
  BarChart3,
  RefreshCw,
  ArrowLeft,
  PieChart,
  Mail
} from 'lucide-react';
import InvoiceStatusControl from './InvoiceStatusControl';
import { useAuth } from '../contexts/AuthContext';

interface PaymentApplication {
  payment_reference_number: string;
  invoice_reference_number: string;
  customer_id: string;
  application_date: string;
  amount_paid: number;
  due_date?: string;
  invoice_date?: string;
  invoice_amount: number;
  invoice_balance: number;
  customer_name: string;
  payment_id?: string;
  applications?: Array<{
    invoice_reference_number: string;
    invoice_date: string;
    amount_paid: number;
  }>;
}

interface InvoiceAnalyticsProps {
  onNavigate?: (view: string) => void;
}

export default function InvoiceAnalytics({ onNavigate }: InvoiceAnalyticsProps) {
  const { user } = useAuth();
  const [applications, setApplications] = useState<PaymentApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const getCurrentMonth = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  };

  const [dateFilter, setDateFilter] = useState<string>('last-month');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedCustomer, setSelectedCustomer] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [unpaidInvoicesCount, setUnpaidInvoicesCount] = useState<number>(0);
  const [unpaidInvoicesAmount, setUnpaidInvoicesAmount] = useState<number>(0);
  const [groupByInvoiceDate, setGroupByInvoiceDate] = useState<boolean>(false);
  const [paymentsOnly, setPaymentsOnly] = useState<number>(0);
  const [creditMemosOnly, setCreditMemosOnly] = useState<number>(0);

  const isAdmin = user?.email === 'a88933513@gmail.com';

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const startTime = performance.now();

    try {
      // Calculate date range for last month
      const now = new Date();
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      const startDate = lastMonth.toISOString().split('T')[0];
      const endDate = lastMonthEnd.toISOString().split('T')[0];

      // Call edge function for all analytics calculation
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const url = `${supabaseUrl}/functions/v1/calculate-invoice-analytics?startDate=${startDate}&endDate=${endDate}&customerId=${selectedCustomer}`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to load analytics');
      }

      const result = await response.json();

      // Map payment data to expected format
      interface PaymentApiResponse {
        payment_reference_number: string;
        customer_id: string;
        application_date: string;
        amount_paid: number;
        customer_name: string;
        payment_id: string;
        type: string;
      }

      const enriched = result.payments.map((p: PaymentApiResponse) => ({
        payment_reference_number: p.payment_reference_number,
        invoice_reference_number: '',
        customer_id: p.customer_id,
        application_date: p.application_date,
        amount_paid: p.amount_paid,
        invoice_date: '',
        invoice_amount: 0,
        invoice_balance: 0,
        customer_name: p.customer_name,
        payment_id: p.payment_id,
        type: p.type,
        applications: []
      }));

      setApplications(enriched);
      setPaymentsOnly(result.summary.paymentsTotal);
      setCreditMemosOnly(result.summary.creditMemosTotal);
      setUnpaidInvoicesCount(result.summary.unpaidInvoicesCount);
      setUnpaidInvoicesAmount(result.summary.unpaidInvoicesTotal);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const getFilteredApplications = () => {
    let filtered = applications;

    if (dateFilter === 'last-month') {
      const now = new Date();
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      filtered = filtered.filter(app => {
        const appDate = new Date(app.application_date);
        return appDate >= lastMonth && appDate < currentMonth;
      });
    } else if (dateFilter === 'current-month') {
      const now = new Date();
      const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

      filtered = filtered.filter(app => {
        const appDate = new Date(app.application_date);
        return appDate >= currentMonth && appDate < nextMonth;
      });
    } else if (dateFilter === 'last-3-months') {
      const now = new Date();
      const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);

      filtered = filtered.filter(app => {
        const appDate = new Date(app.application_date);
        return appDate >= threeMonthsAgo;
      });
    } else if (dateFilter === 'this-year') {
      const now = new Date();
      const yearStart = new Date(now.getFullYear(), 0, 1);

      filtered = filtered.filter(app => {
        const appDate = new Date(app.application_date);
        return appDate >= yearStart;
      });
    }

    if (selectedYear !== 'all') {
      filtered = filtered.filter(app => {
        const year = new Date(app.application_date).getFullYear();
        return year.toString() === selectedYear;
      });
    }

    if (selectedCustomer !== 'all') {
      filtered = filtered.filter(app => app.customer_id === selectedCustomer);
    }

    return filtered;
  };

  const calculateMetrics = () => {
    const filtered = getFilteredApplications();
    const totalAmount = filtered.reduce((sum, app) => sum + Number(app.amount_paid || 0), 0);
    const totalPayments = filtered.length;
    const uniqueInvoices = new Set(filtered.map(app => app.invoice_reference_number)).size;
    const uniqueCustomers = new Set(filtered.map(app => app.customer_id)).size;

    return {
      totalAmount,
      totalPayments,
      uniqueInvoices,
      uniqueCustomers,
      avgPayment: totalPayments > 0 ? totalAmount / totalPayments : 0,
      paymentsOnly,
      creditMemosOnly
    };
  };

  const getMonthlyData = () => {
    const filtered = getFilteredApplications();
    const monthlyMap = new Map<string, number>();

    if (groupByInvoiceDate) {
      // Group by invoice date
      filtered.forEach(payment => {
        if (payment.applications && payment.applications.length > 0) {
          // Use invoice dates from applications
          payment.applications.forEach(app => {
            if (app.invoice_date) {
              const date = new Date(app.invoice_date);
              const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
              monthlyMap.set(monthKey, (monthlyMap.get(monthKey) || 0) + Number(app.amount_paid || 0));
            }
          });
        } else {
          // Fallback to payment date if no invoice applications
          const date = new Date(payment.application_date);
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          monthlyMap.set(monthKey, (monthlyMap.get(monthKey) || 0) + Number(payment.amount_paid || 0));
        }
      });
    } else {
      // Group by payment date (original behavior)
      filtered.forEach(app => {
        const date = new Date(app.application_date);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        monthlyMap.set(monthKey, (monthlyMap.get(monthKey) || 0) + Number(app.amount_paid || 0));
      });
    }

    return Array.from(monthlyMap.entries())
      .map(([month, amount]) => ({ month, amount }))
      .sort((a, b) => b.month.localeCompare(a.month))
      .slice(0, 12);
  };

  const getTopCustomers = () => {
    const filtered = getFilteredApplications();
    const customerMap = new Map<string, { name: string; amount: number; count: number }>();

    filtered.forEach(app => {
      if (!customerMap.has(app.customer_id)) {
        customerMap.set(app.customer_id, {
          name: app.customer_name,
          amount: 0,
          count: 0
        });
      }
      const data = customerMap.get(app.customer_id)!;
      data.amount += Number(app.amount_paid || 0);
      data.count += 1;
    });

    return Array.from(customerMap.entries())
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);
  };

  const getAvailableYears = () => {
    const years = new Set<string>();
    applications.forEach(app => {
      const year = new Date(app.application_date).getFullYear();
      years.add(year.toString());
    });
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  };

  const getAvailableCustomers = () => {
    const customers = new Map<string, string>();
    applications.forEach(app => {
      customers.set(app.customer_id, app.customer_name);
    });
    return Array.from(customers.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const getIncomeTrendData = () => {
    const filtered = getFilteredApplications();
    const monthlyIncome = new Map<string, number>();

    filtered.forEach(payment => {
      if (payment.applications && payment.applications.length > 0) {
        payment.applications.forEach(app => {
          if (app.invoice_date) {
            const date = new Date(app.invoice_date);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            monthlyIncome.set(monthKey, (monthlyIncome.get(monthKey) || 0) + Number(app.amount_paid || 0));
          }
        });
      } else {
        const date = new Date(payment.application_date);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        monthlyIncome.set(monthKey, (monthlyIncome.get(monthKey) || 0) + Number(payment.amount_paid || 0));
      }
    });

    return Array.from(monthlyIncome.entries())
      .map(([month, amount]) => ({ month, amount }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12);
  };

  const getPaymentTimingData = () => {
    const filtered = getFilteredApplications();
    let onTimeCount = 0;
    let onTimeAmount = 0;
    let nextMonthCount = 0;
    let nextMonthAmount = 0;
    let laterCount = 0;
    let laterAmount = 0;

    let paymentsWithApps = 0;
    let totalApps = 0;

    filtered.forEach(payment => {
      if (payment.applications && payment.applications.length > 0) {
        paymentsWithApps++;
        totalApps += payment.applications.length;

        payment.applications.forEach(app => {
          if (app.invoice_date) {
            const invoiceDate = new Date(app.invoice_date);
            const paymentDate = new Date(payment.application_date);

            const invoiceMonth = invoiceDate.getMonth();
            const invoiceYear = invoiceDate.getFullYear();
            const paymentMonth = paymentDate.getMonth();
            const paymentYear = paymentDate.getFullYear();

            const monthsDiff = (paymentYear - invoiceYear) * 12 + (paymentMonth - invoiceMonth);

            if (monthsDiff === 0) {
              onTimeCount++;
              onTimeAmount += Number(app.amount_paid || 0);
            } else if (monthsDiff === 1) {
              nextMonthCount++;
              nextMonthAmount += Number(app.amount_paid || 0);
            } else {
              laterCount++;
              laterAmount += Number(app.amount_paid || 0);
            }
          }
        });
      }
    });

    return {
      onTime: { count: onTimeCount, amount: onTimeAmount },
      nextMonth: { count: nextMonthCount, amount: nextMonthAmount },
      later: { count: laterCount, amount: laterAmount },
      total: onTimeCount + nextMonthCount + laterCount
    };
  };

  const formatMonth = (monthKey: string) => {
    const [year, month] = monthKey.split('-');
    return new Date(Date.UTC(parseInt(year), parseInt(month) - 1)).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      timeZone: 'UTC'
    });
  };

  const getMonthlyBreakdown = (monthKey: string) => {
    const filtered = getFilteredApplications();
    const [targetYear, targetMonth] = monthKey.split('-').map(Number);

    const paymentsInMonth = filtered.filter(app => {
      const date = new Date(app.application_date);
      return date.getFullYear() === targetYear && date.getMonth() + 1 === targetMonth;
    });

    const breakdown = new Map<string, { amount: number; count: number; invoiceCount: number }>();

    paymentsInMonth.forEach(payment => {
      if (payment.applications && payment.applications.length > 0) {
        // Group by invoice date for payments with invoice applications
        payment.applications.forEach(app => {
          if (app.invoice_date) {
            const invoiceDate = new Date(app.invoice_date);
            const invoiceMonthKey = `${invoiceDate.getFullYear()}-${String(invoiceDate.getMonth() + 1).padStart(2, '0')}`;

            if (!breakdown.has(invoiceMonthKey)) {
              breakdown.set(invoiceMonthKey, { amount: 0, count: 0, invoiceCount: 0 });
            }

            const data = breakdown.get(invoiceMonthKey)!;
            data.amount += Number(app.amount_paid || 0);
            data.invoiceCount += 1;
          }
        });
      } else {
        // For payments without invoice applications, group by payment date
        const paymentDate = new Date(payment.application_date);
        const paymentMonthKey = `${paymentDate.getFullYear()}-${String(paymentDate.getMonth() + 1).padStart(2, '0')}`;

        if (!breakdown.has(paymentMonthKey)) {
          breakdown.set(paymentMonthKey, { amount: 0, count: 0, invoiceCount: 0 });
        }

        const data = breakdown.get(paymentMonthKey)!;
        data.amount += Number(payment.amount_paid || 0);
        data.count += 1;
      }
    });

    // Count unique payment references
    breakdown.forEach((data) => {
      if (data.count === 0) {
        data.count = data.invoiceCount;
      }
    });

    // Get daily breakdown for the month
    const dailyBreakdown = new Map<string, { amount: number; invoiceCount: number; payments: PaymentApplication[] }>();

    paymentsInMonth.forEach(payment => {
      const paymentDate = new Date(payment.application_date);
      const dayKey = paymentDate.toISOString().split('T')[0]; // YYYY-MM-DD format

      if (!dailyBreakdown.has(dayKey)) {
        dailyBreakdown.set(dayKey, { amount: 0, invoiceCount: 0, payments: [] });
      }

      const dayData = dailyBreakdown.get(dayKey)!;
      dayData.amount += Number(payment.amount_paid || 0);
      dayData.invoiceCount += (payment.applications?.length || 1);
      dayData.payments.push(payment);
    });

    return {
      payments: paymentsInMonth,
      breakdown: Array.from(breakdown.entries())
        .map(([month, data]) => ({
          month,
          amount: data.amount,
          count: data.invoiceCount || data.count
        }))
        .sort((a, b) => b.month.localeCompare(a.month)),
      dailyBreakdown: Array.from(dailyBreakdown.entries())
        .map(([day, data]) => ({
          day,
          amount: data.amount,
          invoiceCount: data.invoiceCount,
          payments: data.payments
        }))
        .sort((a, b) => a.day.localeCompare(b.day)),
      total: paymentsInMonth.reduce((sum, p) => sum + Number(p.amount_paid || 0), 0),
      count: paymentsInMonth.length
    };
  };

  const getDailyCustomers = (dayKey: string) => {
    const filtered = getFilteredApplications();
    const paymentsOnDay = filtered.filter(app => {
      const paymentDate = new Date(app.application_date).toISOString().split('T')[0];
      return paymentDate === dayKey;
    });

    const customerMap = new Map<string, { name: string; amount: number; payments: PaymentApplication[] }>();

    paymentsOnDay.forEach(payment => {
      if (!customerMap.has(payment.customer_id)) {
        customerMap.set(payment.customer_id, {
          name: payment.customer_name,
          amount: 0,
          payments: []
        });
      }

      const customerData = customerMap.get(payment.customer_id)!;
      customerData.amount += Number(payment.amount_paid || 0);
      customerData.payments.push(payment);
    });

    return Array.from(customerMap.entries())
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.amount - a.amount);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  const metrics = calculateMetrics();
  const monthlyData = getMonthlyData();
  const incomeTrend = getIncomeTrendData();
  const paymentTiming = getPaymentTimingData();
  const topCustomers = getTopCustomers();
  const availableYears = getAvailableYears();
  const availableCustomers = getAvailableCustomers();
  const maxMonthlyAmount = Math.max(...monthlyData.map(m => m.amount), 1);

  return (
    <>
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => window.history.back()}
            className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Back</span>
          </button>
          <h1 className="text-3xl font-bold text-gray-900">Payment Analytics</h1>
        </div>
        <div className="flex items-center gap-3">
          {onNavigate && (
            <button
              onClick={() => onNavigate('payment-analytics')}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 transition-all shadow-md hover:shadow-lg"
            >
              <Calendar className="w-4 h-4" />
              Monthly Payment Calendar
            </button>
          )}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-5 h-5 text-gray-600" />
          <h2 className="text-lg font-semibold text-gray-900">Filters</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Date Range</label>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="last-month">Last Month</option>
              <option value="current-month">Current Month</option>
              <option value="last-3-months">Last 3 Months</option>
              <option value="this-year">This Year</option>
              <option value="all">All Time</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Year</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={dateFilter !== 'all'}
            >
              <option value="all">All Years</option>
              {availableYears.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Customer</label>
            <select
              value={selectedCustomer}
              onChange={(e) => setSelectedCustomer(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Customers</option>
              {availableCustomers.map(customer => (
                <option key={customer.id} value={customer.id}>{customer.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <DollarSign className="w-8 h-8 text-green-600" />
            <div>
              <p className="text-sm text-gray-600">Total Payments</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(metrics.paymentsOnly)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <DollarSign className="w-8 h-8 text-purple-600" />
            <div>
              <p className="text-sm text-gray-600">Credit Memos</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(metrics.creditMemosOnly)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <FileText className="w-8 h-8 text-blue-600" />
            <div>
              <p className="text-sm text-gray-600">Payment Count</p>
              <p className="text-2xl font-bold text-gray-900">{metrics.totalPayments.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <AlertCircle className="w-8 h-8 text-red-600" />
            <div>
              <p className="text-sm text-gray-600">Unpaid Invoices</p>
              <p className="text-2xl font-bold text-gray-900">{unpaidInvoicesCount.toLocaleString()}</p>
              <p className="text-sm text-red-600 font-semibold mt-1">{formatCurrency(unpaidInvoicesAmount)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="w-8 h-8 text-orange-600" />
            <div>
              <p className="text-sm text-gray-600">Avg Payment</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(metrics.avgPayment)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">Monthly Payment Trend</h2>
          </div>
          <button
            onClick={() => setGroupByInvoiceDate(!groupByInvoiceDate)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              groupByInvoiceDate
                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
            }`}
          >
            {groupByInvoiceDate ? '📅 By Invoice Date' : '💰 By Payment Date'}
          </button>
        </div>
        <div className="space-y-4">
          {monthlyData.map(({ month, amount }) => (
            <div
              key={month}
              className="cursor-pointer hover:bg-gray-50 p-3 rounded-lg transition-colors"
              onClick={() => setSelectedMonth(month)}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">{formatMonth(month)}</span>
                <span className="text-sm font-bold text-gray-900">{formatCurrency(amount)}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-blue-600 h-3 rounded-full transition-all duration-500"
                  style={{ width: `${(amount / maxMonthlyAmount) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-6">
          <TrendingUp className="w-5 h-5 text-gray-600" />
          <h2 className="text-lg font-semibold text-gray-900">Top 10 Customers</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Customer</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Total Paid</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Payments</th>
              </tr>
            </thead>
            <tbody>
              {topCustomers.map((customer, index) => (
                <tr key={customer.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs font-bold">
                        {index + 1}
                      </span>
                      <span className="text-sm text-gray-900">{customer.name}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right text-sm font-semibold text-gray-900">
                    {formatCurrency(customer.amount)}
                  </td>
                  <td className="py-3 px-4 text-right text-sm text-gray-600">
                    {customer.count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-6">
          <BarChart3 className="w-5 h-5 text-gray-600" />
          <h2 className="text-lg font-semibold text-gray-900">Income Trend (Last 12 Months)</h2>
        </div>
        <div className="space-y-3">
          {incomeTrend.map(({ month, amount }) => {
            const maxAmount = Math.max(...incomeTrend.map(d => d.amount), 1);
            return (
              <div key={month} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-gray-700">{formatMonth(month)}</span>
                  <span className="font-bold text-gray-900">{formatCurrency(amount)}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-green-600 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${(amount / maxAmount) * 100}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-6">
          <Calendar className="w-5 h-5 text-gray-600" />
          <h2 className="text-lg font-semibold text-gray-900">Payment Timing Analysis</h2>
        </div>
        <div className="space-y-6">
          <div className="flex items-center justify-center">
            <div className="relative w-64 h-64">
              <svg viewBox="0 0 200 200" className="transform -rotate-90">
                {(() => {
                  const total = paymentTiming.total;
                  if (total === 0) return null;

                  const onTimePercent = (paymentTiming.onTime.count / total) * 100;
                  const nextMonthPercent = (paymentTiming.nextMonth.count / total) * 100;
                  const laterPercent = (paymentTiming.later.count / total) * 100;

                  const radius = 80;
                  const circumference = 2 * Math.PI * radius;

                  const onTimeLength = (onTimePercent / 100) * circumference;
                  const nextMonthLength = (nextMonthPercent / 100) * circumference;
                  const laterLength = (laterPercent / 100) * circumference;

                  return (
                    <>
                      <circle
                        cx="100"
                        cy="100"
                        r={radius}
                        fill="none"
                        stroke="#10b981"
                        strokeWidth="40"
                        strokeDasharray={`${onTimeLength} ${circumference}`}
                        strokeDashoffset="0"
                      />
                      <circle
                        cx="100"
                        cy="100"
                        r={radius}
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth="40"
                        strokeDasharray={`${nextMonthLength} ${circumference}`}
                        strokeDashoffset={-onTimeLength}
                      />
                      <circle
                        cx="100"
                        cy="100"
                        r={radius}
                        fill="none"
                        stroke="#ef4444"
                        strokeWidth="40"
                        strokeDasharray={`${laterLength} ${circumference}`}
                        strokeDashoffset={-(onTimeLength + nextMonthLength)}
                      />
                    </>
                  );
                })()}
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-3xl font-bold text-gray-900">{paymentTiming.total}</div>
                  <div className="text-sm text-gray-600">Invoices</div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-green-600 rounded-full"></div>
                <span className="text-sm font-medium text-gray-700">Same Month</span>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-gray-900">{paymentTiming.onTime.count} invoices</div>
                <div className="text-xs text-gray-600">{formatCurrency(paymentTiming.onTime.amount)}</div>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-amber-600 rounded-full"></div>
                <span className="text-sm font-medium text-gray-700">Next Month</span>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-gray-900">{paymentTiming.nextMonth.count} invoices</div>
                <div className="text-xs text-gray-600">{formatCurrency(paymentTiming.nextMonth.amount)}</div>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-red-600 rounded-full"></div>
                <span className="text-sm font-medium text-gray-700">Later (2+ Months)</span>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-gray-900">{paymentTiming.later.count} invoices</div>
                <div className="text-xs text-gray-600">{formatCurrency(paymentTiming.later.amount)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    {selectedDay && (
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-6 z-[60]"
        onClick={() => setSelectedDay(null)}
      >
        <div
          className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {new Date(selectedDay).toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  timeZone: 'UTC',
                  month: 'long',
                  day: 'numeric'
                })}
              </h2>
              <p className="text-gray-600 mt-1">
                Customers who paid on this day
              </p>
            </div>
            <button
              onClick={() => setSelectedDay(null)}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {(() => {
              const dayCustomers = getDailyCustomers(selectedDay);
              const dayTotal = dayCustomers.reduce((sum, c) => sum + c.amount, 0);

              return (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-blue-50 rounded-lg p-4">
                      <div className="text-sm text-blue-600 font-medium mb-1">Total Amount</div>
                      <div className="text-2xl font-bold text-blue-900">{formatCurrency(dayTotal)}</div>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4">
                      <div className="text-sm text-green-600 font-medium mb-1">Customers</div>
                      <div className="text-2xl font-bold text-green-900">{dayCustomers.length}</div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                      Customer Payments
                    </h3>
                    <div className="space-y-3">
                      {dayCustomers.map((customer) => (
                        <div key={customer.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <div className="font-semibold text-gray-900 text-lg">{customer.name}</div>
                              <div className="text-sm text-gray-600">ID: {customer.id}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-xl font-bold text-blue-600">{formatCurrency(customer.amount)}</div>
                              <div className="text-sm text-gray-600">{customer.payments.length} payment{customer.payments.length !== 1 ? 's' : ''}</div>
                            </div>
                          </div>

                          <div className="space-y-2">
                            {customer.payments.map((payment, idx) => (
                              <div key={idx} className="bg-gray-50 rounded p-3 text-sm">
                                <div className="flex justify-between items-center">
                                  <span className="text-gray-700 font-medium">Payment: {payment.payment_reference_number}</span>
                                  <span className="font-semibold text-gray-900">{formatCurrency(payment.amount_paid)}</span>
                                </div>
                                {payment.applications && payment.applications.length > 0 && (
                                  <div className="mt-2 pl-3 border-l-2 border-gray-300">
                                    <div className="text-xs text-gray-600 mb-1">Applied to {payment.applications.length} invoice{payment.applications.length !== 1 ? 's' : ''}:</div>
                                    {payment.applications.map((app, appIdx) => (
                                      <div key={appIdx} className="text-xs text-gray-500">
                                        • Invoice {app.invoice_reference_number}: {formatCurrency(app.amount_paid)}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    )}

    {selectedMonth && (
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-6 z-50"
        onClick={() => setSelectedMonth(null)}
      >
        <div
          className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {formatMonth(selectedMonth)}
              </h2>
              <p className="text-gray-600 mt-1">
                Payment breakdown for this month
              </p>
            </div>
            <button
              onClick={() => setSelectedMonth(null)}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {(() => {
              const monthData = getMonthlyBreakdown(selectedMonth);

              return (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-blue-50 rounded-lg p-4">
                      <div className="text-sm text-blue-600 font-medium mb-1">Total Payments</div>
                      <div className="text-2xl font-bold text-blue-900">{formatCurrency(monthData.total)}</div>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4">
                      <div className="text-sm text-green-600 font-medium mb-1">Payment Count</div>
                      <div className="text-2xl font-bold text-green-900">{monthData.count}</div>
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                      Daily Breakdown - Click a day to see customers
                    </h3>
                    <p className="text-sm text-gray-600 mb-3">
                      Shows payments received each day of the month
                    </p>
                    <div className="space-y-2">
                      {monthData.dailyBreakdown.map(({ day, amount, invoiceCount }) => (
                        <button
                          key={day}
                          onClick={() => setSelectedDay(day)}
                          className="w-full flex items-center justify-between p-3 bg-white rounded-lg hover:bg-blue-50 hover:shadow-md transition-all cursor-pointer border border-transparent hover:border-blue-200"
                        >
                          <div className="text-left">
                            <div className="font-medium text-gray-900">
                              {new Date(day).toLocaleDateString('en-US', {
                                weekday: 'short',
                                month: 'short',
                                timeZone: 'UTC',
                                day: 'numeric',
                                year: 'numeric'
                              })}
                            </div>
                            <div className="text-sm text-gray-600">{invoiceCount} invoice{invoiceCount !== 1 ? 's' : ''} paid</div>
                          </div>
                          <div className="text-right">
                            <div className="font-bold text-gray-900">{formatCurrency(amount)}</div>
                            <div className="text-sm text-blue-600">View customers →</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                      Payment Details ({monthData.payments.length})
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-200 bg-gray-50">
                            <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Payment Ref</th>
                            <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Customer</th>
                            <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Date</th>
                            <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {monthData.payments.map((payment, index) => (
                            <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                              <td className="py-3 px-4 text-sm text-gray-900 font-medium">
                                {payment.payment_reference_number}
                              </td>
                              <td className="py-3 px-4 text-sm text-gray-700">
                                {payment.customer_name}
                              </td>
                              <td className="py-3 px-4 text-sm text-gray-600">
                                {new Date(payment.application_date).toLocaleDateString('en-US', {
                                  year: 'numeric',
                                  month: 'short',
                                  timeZone: 'UTC',
                                  day: 'numeric'
                                })}
                              </td>
                              <td className="py-3 px-4 text-sm font-semibold text-gray-900 text-right">
                                {formatCurrency(payment.amount_paid)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    )}
    </>
  );
}
