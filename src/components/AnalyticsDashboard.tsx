import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, DollarSign, FileText, TrendingUp, ChevronDown, ChevronRight, Filter, Users, Search, Lock, Download } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { batchedInQuery } from '../lib/batchedQuery';
import { useUserPermissions, PERMISSION_KEYS } from '../lib/permissions';
import * as XLSX from 'xlsx';

interface AnalyticsDashboardProps {
  onBack?: () => void;
  onNavigate?: (view: string) => void;
}

interface MonthData {
  month: string;
  year: number;
  invoiceCount: number;
  paymentCount: number;
  totalPayments: number;
  totalPaymentsWithoutCreditMemos: number;
  isExpanded: boolean;
  weeks?: WeekData[];
}

interface WeekData {
  weekNumber: number;
  startDate: string;
  endDate: string;
  invoiceCount: number;
  paymentCount: number;
  totalPayments: number;
  totalPaymentsWithoutCreditMemos: number;
  isExpanded: boolean;
  days?: DayData[];
}

interface DayData {
  date: string;
  invoiceCount: number;
  paymentCount: number;
  totalPayments: number;
  totalPaymentsWithoutCreditMemos: number;
  isExpanded: boolean;
  customers?: CustomerDayData[];
}

interface CustomerDayData {
  customerId: string;
  customerName: string;
  paymentAmount: number;
  invoices: string[];
  hasCreditMemo: boolean;
}

type PaymentFilterType = 'all' | 'without_credit_memos';
type DateRangeType = 'current_month' | 'last_month' | 'two_months_ago' | 'all_year' | 'all_time' | 'custom';

interface CurrentMonthStats {
  regularPayments: number;
  creditMemos: number;
  totalAmount: number;
}

export default function AnalyticsDashboard({ onBack, onNavigate }: AnalyticsDashboardProps) {
  const { hasPermission } = useUserPermissions();
  const navigate = useNavigate();
  const handleBack = onBack || (() => navigate(-1));
  const hasAccess = hasPermission(PERMISSION_KEYS.ANALYTICS_DASHBOARD, 'view');
  const [months, setMonths] = useState<MonthData[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilterType>('all');
  const [showAllMonths, setShowAllMonths] = useState(false);
  const [selectedMonthIndex, setSelectedMonthIndex] = useState<number | null>(null);
  const [loadingWeeks, setLoadingWeeks] = useState<Set<string>>(new Set());
  const [loadingDays, setLoadingDays] = useState<Set<string>>(new Set());
  const [currentMonthStats, setCurrentMonthStats] = useState<CurrentMonthStats>({
    regularPayments: 0,
    creditMemos: 0,
    totalAmount: 0
  });
  const [dateRangeType, setDateRangeType] = useState<DateRangeType>('current_month');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  useEffect(() => {
    loadMonthlyData();
  }, []);

  useEffect(() => {
    if (months.length > 0 && !months[0].isExpanded && !months[0].weeks) {
      toggleMonth(0);
    }
  }, [months.length]);

  useEffect(() => {
    loadCurrentMonthStats();
  }, [dateRangeType, customStartDate, customEndDate]);

  const loadCurrentMonthStats = async () => {
    try {
      let startStr: string;
      let endStr: string;
      const now = new Date();

      switch (dateRangeType) {
        case 'current_month': {
          const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
          startStr = startDate.toISOString().split('T')[0];
          endStr = endDate.toISOString().split('T')[0];
          break;
        }
        case 'last_month': {
          const startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          const endDate = new Date(now.getFullYear(), now.getMonth(), 0);
          startStr = startDate.toISOString().split('T')[0];
          endStr = endDate.toISOString().split('T')[0];
          break;
        }
        case 'two_months_ago': {
          const startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
          const endDate = new Date(now.getFullYear(), now.getMonth() - 1, 0);
          startStr = startDate.toISOString().split('T')[0];
          endStr = endDate.toISOString().split('T')[0];
          break;
        }
        case 'all_year': {
          const startDate = new Date(now.getFullYear(), 0, 1);
          const endDate = new Date(now.getFullYear(), 11, 31);
          startStr = startDate.toISOString().split('T')[0];
          endStr = endDate.toISOString().split('T')[0];
          break;
        }
        case 'all_time': {
          startStr = '1900-01-01';
          endStr = '2100-12-31';
          break;
        }
        case 'custom': {
          if (!customStartDate || !customEndDate) {
            return;
          }
          startStr = customStartDate;
          endStr = customEndDate;
          break;
        }
        default:
          return;
      }

      console.log('Querying payments with date range:', { startStr, endStr, dateRangeType });

      const allPayments: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: payments, error: payError } = await supabase
          .from('acumatica_payments')
          .select('payment_amount, id, application_date, type')
          .gte('application_date', startStr)
          .lte('application_date', endStr)
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (payError) {
          console.error('Error fetching payments:', payError);
          console.error('Date range:', { startStr, endStr, dateRangeType });
          throw payError;
        }

        if (payments && payments.length > 0) {
          allPayments.push(...payments);
          console.log(`Fetched page ${page + 1}: ${payments.length} payments (total so far: ${allPayments.length})`);
          hasMore = payments.length === pageSize;
          page++;
        } else {
          hasMore = false;
        }
      }

      const payments = allPayments;
      console.log(`Found ${payments?.length || 0} TOTAL payments in date range`);
      if (payments && payments.length > 0) {
        console.log('Sample payment:', payments[0]);
      }

      const paymentIds = payments?.map(p => p.id) || [];

      if (paymentIds.length === 0) {
        console.log('No payments found, skipping applications query');
        setCurrentMonthStats({
          regularPayments: 0,
          creditMemos: 0,
          totalAmount: 0
        });
        return;
      }

      console.log(`Fetching applications for ${paymentIds.length} payments in batches...`);

      const batchSize = 100;
      const applications: any[] = [];

      for (let i = 0; i < paymentIds.length; i += batchSize) {
        const batch = paymentIds.slice(i, i + batchSize);
        const { data, error } = await supabase
          .from('payment_invoice_applications')
          .select('payment_id, doc_type, amount_paid')
          .in('payment_id', batch);

        if (error) {
          console.error(`Error fetching batch ${i / batchSize + 1}:`, error);
          throw error;
        }

        if (data) {
          applications.push(...data);
        }
      }

      console.log(`Fetched ${applications.length} total applications`);

      const paymentApplicationsMap = new Map<string, any[]>();
      applications?.forEach(app => {
        if (!paymentApplicationsMap.has(app.payment_id)) {
          paymentApplicationsMap.set(app.payment_id, []);
        }
        paymentApplicationsMap.get(app.payment_id)!.push(app);
      });

      let regularPayments = 0;
      let creditMemos = 0;
      let prepayments = 0;

      payments?.forEach(payment => {
        const paymentAmount = Number(payment.payment_amount) || 0;

        if (payment.type === 'Credit Memo') {
          creditMemos += paymentAmount;
        } else if (payment.type === 'Prepayment') {
          prepayments += paymentAmount;
        } else {
          regularPayments += paymentAmount;
        }
      });

      const newStats = {
        regularPayments: regularPayments + prepayments,
        creditMemos,
        totalAmount: regularPayments + creditMemos + prepayments
      };

      console.log('Payment breakdown:', {
        regularPayments,
        creditMemos,
        prepayments,
        total: regularPayments + creditMemos + prepayments,
        paymentCount: payments?.length
      });
      console.log('Setting state to:', newStats);

      setCurrentMonthStats(newStats);

      console.log('State should be updated now');
    } catch (error) {
      console.error('Error loading current month stats:', error);
      console.error('Date range type:', dateRangeType);
      if (dateRangeType === 'custom') {
        console.error('Custom dates:', { customStartDate, customEndDate });
      }
      setCurrentMonthStats({
        regularPayments: 0,
        creditMemos: 0,
        totalAmount: 0
      });
    }
  };

  const loadMonthlyData = async () => {
    setLoading(true);
    try {
      const { count: invoiceCount } = await supabase
        .from('acumatica_invoices')
        .select('*', { count: 'exact', head: true });

      const { count: paymentCount } = await supabase
        .from('acumatica_payments')
        .select('*', { count: 'exact', head: true });

      const { count: applicationCount } = await supabase
        .from('payment_invoice_applications')
        .select('*', { count: 'exact', head: true });

      const invoiceLimit = Math.max(invoiceCount || 10000, 10000);
      const paymentLimit = Math.max(paymentCount || 10000, 10000);
      const applicationLimit = Math.max(applicationCount || 50000, 50000);

      const { data: invoices, error: invError } = await supabase
        .from('acumatica_invoices')
        .select('date, amount')
        .limit(invoiceLimit);

      if (invError) throw invError;

      const { data: payments, error: payError } = await supabase
        .from('acumatica_payments')
        .select('application_date, payment_amount, id')
        .limit(paymentLimit);

      if (payError) throw payError;

      const { data: applications, error: appError } = await supabase
        .from('payment_invoice_applications')
        .select('payment_id, doc_type, amount_paid')
        .limit(applicationLimit);

      if (appError) throw appError;

      const paymentApplicationsMap = new Map<string, any[]>();
      applications?.forEach(app => {
        if (!paymentApplicationsMap.has(app.payment_id)) {
          paymentApplicationsMap.set(app.payment_id, []);
        }
        paymentApplicationsMap.get(app.payment_id)!.push(app);
      });

      const monthMap = new Map<string, {
        invoices: any[];
        payments: any[];
        year: number;
        month: number;
      }>();

      const parseLocalDate = (dateStr: string) => {
        const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
        return new Date(year, month - 1, day);
      };

      invoices?.forEach(inv => {
        if (!inv.date) return;
        const date = parseLocalDate(inv.date);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (!monthMap.has(key)) {
          monthMap.set(key, {
            invoices: [],
            payments: [],
            year: date.getFullYear(),
            month: date.getMonth() + 1
          });
        }
        monthMap.get(key)!.invoices.push(inv);
      });

      payments?.forEach(pay => {
        if (!pay.application_date) return;
        const date = parseLocalDate(pay.application_date);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (!monthMap.has(key)) {
          monthMap.set(key, {
            invoices: [],
            payments: [],
            year: date.getFullYear(),
            month: date.getMonth() + 1
          });
        }

        const apps = paymentApplicationsMap.get(pay.id) || [];
        const hasCreditMemo = apps.some(app => app.doc_type === 'Credit Memo');
        const paymentWithoutCreditMemos = hasCreditMemo ? 0 : pay.payment_amount;

        monthMap.get(key)!.payments.push({
          ...pay,
          paymentWithoutCreditMemos
        });
      });

      const monthsArray: MonthData[] = Array.from(monthMap.entries())
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([key, data]) => {
          const totalPayments = data.payments.reduce((sum, p) => sum + (p.payment_amount || 0), 0);
          const totalPaymentsWithoutCreditMemos = data.payments.reduce((sum, p) => sum + (p.paymentWithoutCreditMemos || 0), 0);

          return {
            month: new Date(data.year, data.month - 1).toLocaleDateString('en-US', { month: 'long' }),
            year: data.year,
            invoiceCount: data.invoices.length,
            paymentCount: data.payments.length,
            totalPayments,
            totalPaymentsWithoutCreditMemos,
            isExpanded: false
          };
        });

      setMonths(monthsArray);
    } catch (error) {
      console.error('Error loading monthly data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadWeeksForMonth = async (monthIndex: number) => {
    const month = months[monthIndex];
    const loadingKey = `${month.year}-${month.month}`;
    setLoadingWeeks(prev => new Set(prev).add(loadingKey));

    try {
      const monthNum = new Date(`${month.month} 1, ${month.year}`).getMonth();
      const startOfMonth = new Date(month.year, monthNum, 1);
      const endOfMonth = new Date(month.year, monthNum + 1, 1);

      const startStr = startOfMonth.toISOString().split('T')[0];
      const endStr = endOfMonth.toISOString().split('T')[0];

      const { data: invoices } = await supabase
        .from('acumatica_invoices')
        .select('date, amount')
        .gte('date', startStr)
        .lt('date', endStr);

      const { data: payments } = await supabase
        .from('acumatica_payments')
        .select('application_date, payment_amount, id')
        .gte('application_date', startStr)
        .lt('application_date', endStr);

      const paymentIds = payments?.map(p => p.id) || [];
      const applications = await batchedInQuery(
        supabase,
        'payment_invoice_applications',
        'payment_id, doc_type, amount_paid',
        'payment_id',
        paymentIds
      );

      const paymentApplicationsMap = new Map<string, any[]>();
      applications?.forEach(app => {
        if (!paymentApplicationsMap.has(app.payment_id)) {
          paymentApplicationsMap.set(app.payment_id, []);
        }
        paymentApplicationsMap.get(app.payment_id)!.push(app);
      });

      const weekMap = new Map<number, {
        invoices: any[];
        payments: any[];
        startDate: Date;
        endDate: Date;
      }>();

      const parseLocalDate = (dateStr: string) => {
        const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
        return new Date(year, month - 1, day);
      };

      const getWeekBoundaries = (year: number, monthIndex: number) => {
        const weeks: { weekNum: number; start: Date; end: Date; displayStart: Date; displayEnd: Date }[] = [];
        const firstOfMonth = new Date(year, monthIndex, 1);
        const lastOfMonth = new Date(year, monthIndex + 1, 0);

        let weekStart = new Date(firstOfMonth);
        weekStart.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());

        let weekNum = 1;
        while (weekStart <= lastOfMonth) {
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekStart.getDate() + 6);

          const displayStart = weekStart < firstOfMonth ? firstOfMonth : new Date(weekStart);
          const displayEnd = weekEnd > lastOfMonth ? lastOfMonth : new Date(weekEnd);

          weeks.push({
            weekNum,
            start: new Date(weekStart),
            end: new Date(weekEnd),
            displayStart: new Date(displayStart),
            displayEnd: new Date(displayEnd)
          });

          weekStart.setDate(weekStart.getDate() + 7);
          weekNum++;
        }

        return weeks;
      };

      const getWeekNumber = (date: Date, weekBoundaries: { weekNum: number; start: Date; end: Date }[]) => {
        for (const week of weekBoundaries) {
          if (date >= week.start && date <= week.end) {
            return week.weekNum;
          }
        }
        return 1;
      };

      const weekBoundaries = getWeekBoundaries(month.year, monthNum);

      weekBoundaries.forEach(wb => {
        weekMap.set(wb.weekNum, {
          invoices: [],
          payments: [],
          startDate: wb.displayStart,
          endDate: wb.displayEnd
        });
      });

      invoices?.forEach(inv => {
        if (!inv.date) return;
        const date = parseLocalDate(inv.date);
        const weekNum = getWeekNumber(date, weekBoundaries);
        weekMap.get(weekNum)?.invoices.push(inv);
      });

      payments?.forEach(pay => {
        if (!pay.application_date) return;
        const date = parseLocalDate(pay.application_date);
        const weekNum = getWeekNumber(date, weekBoundaries);

        const apps = paymentApplicationsMap.get(pay.id) || [];
        const hasCreditMemo = apps.some(app => app.doc_type === 'Credit Memo');
        const paymentWithoutCreditMemos = hasCreditMemo ? 0 : pay.payment_amount;

        weekMap.get(weekNum)?.payments.push({
          ...pay,
          paymentWithoutCreditMemos
        });
      });

      const weeksArray: WeekData[] = Array.from(weekMap.entries())
        .filter(([_, data]) => data.invoices.length > 0 || data.payments.length > 0)
        .sort(([a], [b]) => a - b)
        .map(([weekNum, data]) => ({
          weekNumber: weekNum,
          startDate: data.startDate.toISOString(),
          endDate: data.endDate.toISOString(),
          invoiceCount: data.invoices.length,
          paymentCount: data.payments.length,
          totalPayments: data.payments.reduce((sum, p) => sum + (p.payment_amount || 0), 0),
          totalPaymentsWithoutCreditMemos: data.payments.reduce((sum, p) => sum + (p.paymentWithoutCreditMemos || 0), 0),
          isExpanded: false
        }));

      const totalInvoiceCount = weeksArray.reduce((sum, w) => sum + w.invoiceCount, 0);
      const totalPaymentCount = weeksArray.reduce((sum, w) => sum + w.paymentCount, 0);
      const totalPaymentsAmount = weeksArray.reduce((sum, w) => sum + w.totalPayments, 0);
      const totalPaymentsWithoutCreditMemosAmount = weeksArray.reduce((sum, w) => sum + w.totalPaymentsWithoutCreditMemos, 0);

      setMonths(prev => prev.map((m, idx) =>
        idx === monthIndex ? {
          ...m,
          weeks: weeksArray,
          isExpanded: true,
          invoiceCount: totalInvoiceCount,
          paymentCount: totalPaymentCount,
          totalPayments: totalPaymentsAmount,
          totalPaymentsWithoutCreditMemos: totalPaymentsWithoutCreditMemosAmount
        } : m
      ));
    } catch (error) {
      console.error('Error loading weeks:', error);
    } finally {
      setLoadingWeeks(prev => {
        const next = new Set(prev);
        next.delete(loadingKey);
        return next;
      });
    }
  };

  const loadDaysForWeek = async (monthIndex: number, weekIndex: number) => {
    const month = months[monthIndex];
    const week = month.weeks![weekIndex];
    const loadingKey = `${monthIndex}-${weekIndex}`;
    setLoadingDays(prev => new Set(prev).add(loadingKey));

    try {
      const startDate = new Date(week.startDate);
      const endDate = new Date(week.endDate);
      const nextDay = new Date(endDate);
      nextDay.setDate(nextDay.getDate() + 1);

      const startStr = startDate.toISOString().split('T')[0];
      const endStr = nextDay.toISOString().split('T')[0];

      const { data: invoices } = await supabase
        .from('acumatica_invoices')
        .select('date, amount, reference_nbr')
        .gte('date', startStr)
        .lt('date', endStr);

      const { data: payments } = await supabase
        .from('acumatica_payments')
        .select('application_date, payment_amount, id, customer_id, reference_number')
        .gte('application_date', startStr)
        .lt('application_date', endStr);

      const paymentIds = payments?.map(p => p.id) || [];
      const applications = await batchedInQuery(
        supabase,
        'payment_invoice_applications',
        'payment_id, doc_type, amount_paid',
        'payment_id',
        paymentIds
      );

      const paymentApplicationsMap = new Map<string, any[]>();
      applications?.forEach(app => {
        if (!paymentApplicationsMap.has(app.payment_id)) {
          paymentApplicationsMap.set(app.payment_id, []);
        }
        paymentApplicationsMap.get(app.payment_id)!.push(app);
      });

      const { data: customers } = await supabase
        .from('acumatica_customers')
        .select('customer_id, customer_name');

      const customerMap = new Map(customers?.map(c => [c.customer_id, c.customer_name]) || []);

      const dayMap = new Map<string, {
        invoices: any[];
        payments: any[];
      }>();

      invoices?.forEach(inv => {
        if (!inv.date) return;
        const dateKey = new Date(inv.date).toISOString().split('T')[0];
        if (!dayMap.has(dateKey)) {
          dayMap.set(dateKey, { invoices: [], payments: [] });
        }
        dayMap.get(dateKey)!.invoices.push(inv);
      });

      payments?.forEach(pay => {
        if (!pay.application_date) return;
        const dateKey = new Date(pay.application_date).toISOString().split('T')[0];
        if (!dayMap.has(dateKey)) {
          dayMap.set(dateKey, { invoices: [], payments: [] });
        }

        const apps = paymentApplicationsMap.get(pay.id) || [];
        const hasCreditMemo = apps.some(app => app.doc_type === 'Credit Memo');
        const paymentWithoutCreditMemos = hasCreditMemo ? 0 : pay.payment_amount;

        dayMap.get(dateKey)!.payments.push({
          ...pay,
          customerName: customerMap.get(pay.customer_id) || pay.customer_id,
          hasCreditMemo,
          paymentWithoutCreditMemos
        });
      });

      const daysArray: DayData[] = Array.from(dayMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([dateKey, data]) => ({
          date: dateKey,
          invoiceCount: data.invoices.length,
          paymentCount: data.payments.length,
          totalPayments: data.payments.reduce((sum, p) => sum + (p.payment_amount || 0), 0),
          totalPaymentsWithoutCreditMemos: data.payments.reduce((sum, p) => sum + (p.paymentWithoutCreditMemos || 0), 0),
          isExpanded: false,
          customers: data.payments.map(p => ({
            customerId: p.customer_id,
            customerName: p.customerName,
            paymentAmount: p.payment_amount,
            invoices: [p.reference_number],
            hasCreditMemo: p.hasCreditMemo
          }))
        }));

      setMonths(prev => prev.map((m, mIdx) => {
        if (mIdx !== monthIndex) return m;
        return {
          ...m,
          weeks: m.weeks?.map((w, wIdx) =>
            wIdx === weekIndex ? { ...w, days: daysArray, isExpanded: true } : w
          )
        };
      }));
    } catch (error) {
      console.error('Error loading days:', error);
    } finally {
      setLoadingDays(prev => {
        const next = new Set(prev);
        next.delete(loadingKey);
        return next;
      });
    }
  };

  const toggleMonth = async (index: number) => {
    const month = months[index];
    if (!month.isExpanded && !month.weeks) {
      await loadWeeksForMonth(index);
    } else {
      setMonths(prev => prev.map((m, idx) =>
        idx === index ? { ...m, isExpanded: !m.isExpanded } : m
      ));
    }
  };

  const toggleWeek = async (monthIndex: number, weekIndex: number) => {
    const week = months[monthIndex].weeks![weekIndex];
    if (!week.isExpanded && !week.days) {
      await loadDaysForWeek(monthIndex, weekIndex);
    } else {
      setMonths(prev => prev.map((m, mIdx) => {
        if (mIdx !== monthIndex) return m;
        return {
          ...m,
          weeks: m.weeks?.map((w, wIdx) =>
            wIdx === weekIndex ? { ...w, isExpanded: !w.isExpanded } : w
          )
        };
      }));
    }
  };

  const toggleDay = (monthIndex: number, weekIndex: number, dayIndex: number) => {
    setMonths(prev => prev.map((m, mIdx) => {
      if (mIdx !== monthIndex) return m;
      return {
        ...m,
        weeks: m.weeks?.map((w, wIdx) => {
          if (wIdx !== weekIndex) return w;
          return {
            ...w,
            days: w.days?.map((d, dIdx) =>
              dIdx === dayIndex ? { ...d, isExpanded: !d.isExpanded } : d
            )
          };
        })
      };
    }));
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const displayedMonths = showAllMonths ? months : months.slice(0, 4);
  const getPaymentTotal = (item: MonthData | WeekData | DayData) => {
    return paymentFilter === 'all' ? item.totalPayments : item.totalPaymentsWithoutCreditMemos;
  };

  const renderPieChart = () => {
    const { regularPayments, creditMemos, totalAmount } = currentMonthStats;

    console.log('Rendering pie chart with stats:', { regularPayments, creditMemos, totalAmount });

    if (totalAmount === 0) {
      return (
        <div className="flex items-center justify-center h-48 text-slate-400">
          No payment data for current month
        </div>
      );
    }

    const regularPercentage = (regularPayments / totalAmount) * 100;
    const creditPercentage = (creditMemos / totalAmount) * 100;

    const radius = 70;
    const circumference = 2 * Math.PI * radius;
    const regularDashOffset = circumference - (circumference * regularPercentage) / 100;

    return (
      <div className="flex flex-col items-center justify-center">
        <div className="relative mb-8" style={{ width: '200px', height: '200px' }}>
          <svg width="200" height="200" viewBox="0 0 200 200" className="transform -rotate-90">
            <circle
              cx="100"
              cy="100"
              r={radius}
              fill="none"
              stroke="#10b981"
              strokeWidth="40"
            />
            <circle
              cx="100"
              cy="100"
              r={radius}
              fill="none"
              stroke="#f59e0b"
              strokeWidth="40"
              strokeDasharray={circumference}
              strokeDashoffset={regularDashOffset}
              className="transition-all duration-500"
            />
          </svg>
        </div>

        <div className="space-y-3 w-full max-w-md">
          <div className="flex items-center justify-between gap-4 p-3 bg-slate-700/30 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded bg-emerald-500"></div>
              <div className="text-white font-semibold">Regular Payments</div>
            </div>
            <div className="text-right">
              <div className="text-white font-semibold">{formatCurrency(regularPayments)}</div>
              <div className="text-slate-400 text-sm">{regularPercentage.toFixed(1)}%</div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 p-3 bg-slate-700/30 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded bg-amber-500"></div>
              <div className="text-white font-semibold">Credit Memos</div>
            </div>
            <div className="text-right">
              <div className="text-white font-semibold">{formatCurrency(creditMemos)}</div>
              <div className="text-slate-400 text-sm">{creditPercentage.toFixed(1)}%</div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 p-4 bg-blue-600/20 border border-blue-500/50 rounded-lg mt-4">
            <div className="text-white font-bold text-lg">Total</div>
            <div className="text-white font-bold text-xl">{formatCurrency(totalAmount)}</div>
          </div>
        </div>
      </div>
    );
  };

  const getDateRangeLabel = () => {
    const now = new Date();
    switch (dateRangeType) {
      case 'current_month':
        return now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      case 'last_month':
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        return lastMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      case 'two_months_ago':
        const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        return twoMonthsAgo.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      case 'all_year':
        return `All of ${now.getFullYear()}`;
      case 'all_time':
        return 'All Time';
      case 'custom':
        if (customStartDate && customEndDate) {
          return `${new Date(customStartDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} - ${new Date(customEndDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
        }
        return 'Custom Range';
      default:
        return '';
    }
  };

  const exportToExcel = () => {
    const exportData: any[] = [];

    months.forEach(month => {
      if (month.weeks) {
        month.weeks.forEach(week => {
          if (week.days) {
            week.days.forEach(day => {
              if (day.customers) {
                day.customers.forEach(customer => {
                  exportData.push({
                    'Month': `${month.month} ${month.year}`,
                    'Week': `Week ${week.weekNumber}`,
                    'Date': day.date,
                    'Customer ID': customer.customerId,
                    'Customer Name': customer.customerName,
                    'Payment Amount': customer.paymentAmount,
                    'Invoice Count': customer.invoices.length,
                    'Invoices': customer.invoices.join(', ')
                  });
                });
              } else {
                exportData.push({
                  'Month': `${month.month} ${month.year}`,
                  'Week': `Week ${week.weekNumber}`,
                  'Date': day.date,
                  'Customer ID': '',
                  'Customer Name': '',
                  'Payment Amount': day.totalPayments,
                  'Invoice Count': day.invoiceCount,
                  'Invoices': ''
                });
              }
            });
          } else {
            exportData.push({
              'Month': `${month.month} ${month.year}`,
              'Week': `Week ${week.weekNumber}`,
              'Date': `${week.startDate} to ${week.endDate}`,
              'Customer ID': '',
              'Customer Name': '',
              'Payment Amount': week.totalPayments,
              'Invoice Count': week.invoiceCount,
              'Invoices': ''
            });
          }
        });
      } else {
        exportData.push({
          'Month': `${month.month} ${month.year}`,
          'Week': '',
          'Date': '',
          'Customer ID': '',
          'Customer Name': '',
          'Payment Amount': month.totalPayments,
          'Invoice Count': month.invoiceCount,
          'Invoices': ''
        });
      }
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Invoice Analytics');
    XLSX.writeFile(workbook, `invoice_analytics_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Check permission
  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-gray-100 p-6">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors mb-6"
          >
            <ArrowLeft className="w-5 h-5" />
            Back
          </button>

          <div className="bg-white rounded-lg shadow-lg p-12 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
              <Lock className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-600 mb-6">
              You do not have permission to view Analytics Dashboard.
            </p>
            <p className="text-sm text-gray-500">
              Please contact your administrator if you believe you should have access to this page.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBack}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              Back
            </button>
            <div>
              <h1 className="text-3xl font-bold text-white">Analytics Dashboard</h1>
              <p className="text-slate-400 mt-1">Invoice and payment analytics by month, week, and day</p>
            </div>
          </div>
          {onNavigate && (
            <div className="flex gap-3">
              <button
                onClick={() => onNavigate('invoice-format-checker')}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-lg"
              >
                <Search className="w-5 h-5" />
                Check Invoice Formats
              </button>
              <button
                onClick={() => onNavigate('invoice-variation-checker')}
                className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors shadow-lg"
              >
                <Search className="w-5 h-5" />
                Check Variations in Acumatica
              </button>
            </div>
          )}
        </div>

        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6 mb-6">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
              <DollarSign className="w-6 h-6 text-emerald-400" />
              {getDateRangeLabel()} - Payment Breakdown
            </h2>
            <p className="text-slate-400 text-sm mb-6">Payment distribution by type for selected period</p>

            <div className="mb-6 p-4 bg-slate-900/50 rounded-lg border border-slate-700">
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="w-5 h-5 text-blue-400" />
                <span className="text-slate-300 font-medium">Select Date Range:</span>
              </div>
              <div className="flex flex-wrap gap-2 mb-4">
                <button
                  onClick={() => setDateRangeType('current_month')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    dateRangeType === 'current_month'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  Current Month
                </button>
                <button
                  onClick={() => setDateRangeType('last_month')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    dateRangeType === 'last_month'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  Last Month
                </button>
                <button
                  onClick={() => setDateRangeType('two_months_ago')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    dateRangeType === 'two_months_ago'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  2 Months Ago
                </button>
                <button
                  onClick={() => setDateRangeType('all_year')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    dateRangeType === 'all_year'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  All Year
                </button>
                <button
                  onClick={() => setDateRangeType('all_time')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    dateRangeType === 'all_time'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  All Time
                </button>
                <button
                  onClick={() => setDateRangeType('custom')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    dateRangeType === 'custom'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  Custom Range
                </button>
              </div>

              {dateRangeType === 'custom' && (
                <div className="flex gap-4 items-center">
                  <div className="flex-1">
                    <label className="block text-sm text-slate-400 mb-1">Start Date</label>
                    <input
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm text-slate-400 mb-1">End Date</label>
                    <input
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {renderPieChart()}
          </div>
        </div>

        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <FileText className="w-6 h-6 text-blue-400" />
              Monthly Breakdown
            </h2>
            <button
              onClick={exportToExcel}
              className="flex items-center gap-2 px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-all shadow-sm"
            >
              <Download className="w-5 h-5" />
              Export Excel
            </button>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-slate-400" />
              <span className="text-slate-300 font-medium">Payment Filter:</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPaymentFilter('all')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  paymentFilter === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                All Payments
              </button>
              <button
                onClick={() => setPaymentFilter('without_credit_memos')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  paymentFilter === 'without_credit_memos'
                    ? 'bg-green-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                Without Credit Memos
              </button>
            </div>
            <div className="ml-auto">
              {months.length > 4 && (
                <button
                  onClick={() => setShowAllMonths(!showAllMonths)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                >
                  {showAllMonths ? 'Show Recent 4 Months' : `Show All ${months.length} Months`}
                </button>
              )}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-center text-slate-400 py-12">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            Loading analytics...
          </div>
        ) : (
          <div className="space-y-4">
            {displayedMonths.map((month, monthIndex) => (
              <div key={`${month.year}-${month.month}`} className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl overflow-hidden">
                <button
                  onClick={() => toggleMonth(monthIndex)}
                  className="w-full p-6 flex items-center justify-between hover:bg-slate-700/30 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    {month.isExpanded ? (
                      <ChevronDown className="w-6 h-6 text-blue-400" />
                    ) : (
                      <ChevronRight className="w-6 h-6 text-slate-400" />
                    )}
                    <div className="text-left">
                      <h2 className="text-2xl font-bold text-white">{month.month} {month.year}</h2>
                    </div>
                  </div>
                  <div className="flex gap-6">
                    <div className="text-right">
                      <p className="text-sm text-slate-400">Invoices Created</p>
                      <p className="text-2xl font-bold text-blue-400">{month.invoiceCount}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-slate-400">Payments Made</p>
                      <p className="text-2xl font-bold text-green-400">{month.paymentCount}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-slate-400">Total Payments</p>
                      <p className="text-2xl font-bold text-emerald-400">{formatCurrency(getPaymentTotal(month))}</p>
                    </div>
                  </div>
                </button>

                {month.isExpanded && month.weeks && (
                  <div className="border-t border-slate-700 bg-slate-900/30">
                    {month.weeks.map((week, weekIndex) => (
                      <div key={`week-${weekIndex}`} className="border-b border-slate-700 last:border-b-0">
                        <button
                          onClick={() => toggleWeek(monthIndex, weekIndex)}
                          className="w-full p-4 pl-16 flex items-center justify-between hover:bg-slate-700/30 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            {week.isExpanded ? (
                              <ChevronDown className="w-5 h-5 text-blue-400" />
                            ) : (
                              <ChevronRight className="w-5 h-5 text-slate-400" />
                            )}
                            <div className="text-left">
                              <h3 className="text-lg font-semibold text-white">Week {week.weekNumber}</h3>
                              <p className="text-sm text-slate-400">
                                {formatDate(week.startDate)} - {formatDate(week.endDate)}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-4">
                            <div className="text-right">
                              <p className="text-xs text-slate-400">Invoices</p>
                              <p className="text-lg font-bold text-blue-400">{week.invoiceCount}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-slate-400">Payments</p>
                              <p className="text-lg font-bold text-green-400">{week.paymentCount}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-slate-400">Total</p>
                              <p className="text-lg font-bold text-emerald-400">{formatCurrency(getPaymentTotal(week))}</p>
                            </div>
                          </div>
                        </button>

                        {week.isExpanded && week.days && (
                          <div className="bg-slate-900/50">
                            {week.days.map((day, dayIndex) => (
                              <div key={day.date} className="border-t border-slate-700">
                                <button
                                  onClick={() => toggleDay(monthIndex, weekIndex, dayIndex)}
                                  className="w-full p-3 pl-28 flex items-center justify-between hover:bg-slate-700/30 transition-colors"
                                >
                                  <div className="flex items-center gap-3">
                                    {day.isExpanded ? (
                                      <ChevronDown className="w-4 h-4 text-blue-400" />
                                    ) : (
                                      <ChevronRight className="w-4 h-4 text-slate-400" />
                                    )}
                                    <div className="text-left">
                                      <p className="text-white font-medium">{formatDate(day.date)}</p>
                                    </div>
                                  </div>
                                  <div className="flex gap-4">
                                    <div className="text-right">
                                      <p className="text-xs text-slate-400">Invoices</p>
                                      <p className="font-semibold text-blue-400">{day.invoiceCount}</p>
                                    </div>
                                    <div className="text-right">
                                      <p className="text-xs text-slate-400">Payments</p>
                                      <p className="font-semibold text-green-400">{day.paymentCount}</p>
                                    </div>
                                    <div className="text-right">
                                      <p className="text-xs text-slate-400">Total</p>
                                      <p className="font-semibold text-emerald-400">{formatCurrency(getPaymentTotal(day))}</p>
                                    </div>
                                  </div>
                                </button>

                                {day.isExpanded && day.customers && day.customers.length > 0 && (
                                  <div className="bg-slate-900/70 pl-40 pr-6 pb-3">
                                    <div className="space-y-2">
                                      {day.customers.map((customer, idx) => (
                                        <div
                                          key={idx}
                                          className={`flex items-center justify-between p-3 rounded-lg ${
                                            customer.hasCreditMemo && paymentFilter === 'without_credit_memos'
                                              ? 'bg-red-900/20 border border-red-700/30'
                                              : 'bg-slate-800/50 border border-slate-700'
                                          }`}
                                        >
                                          <div className="flex items-center gap-3">
                                            <Users className="w-4 h-4 text-slate-400" />
                                            <div>
                                              <p className="text-white font-medium">{customer.customerName}</p>
                                              <p className="text-sm text-slate-400">ID: {customer.customerId}</p>
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-4">
                                            {customer.hasCreditMemo && (
                                              <span className="px-2 py-1 bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-semibold rounded">
                                                Credit Memo
                                              </span>
                                            )}
                                            <div className="text-right">
                                              <p className="text-sm text-slate-400">Payment Amount</p>
                                              <p className={`text-lg font-bold ${
                                                customer.hasCreditMemo && paymentFilter === 'without_credit_memos'
                                                  ? 'text-red-400 line-through'
                                                  : 'text-emerald-400'
                                              }`}>
                                                {formatCurrency(customer.paymentAmount)}
                                              </p>
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
