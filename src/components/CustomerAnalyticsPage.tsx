import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, DollarSign, FileText, TrendingUp, AlertCircle, Filter, X, Download } from 'lucide-react';
import { supabase } from '../lib/supabase';
import * as XLSX from 'xlsx';

interface CustomerAnalyticsPageProps {
  onBack?: () => void;
}

interface CustomerStats {
  total_customers: number;
  active_customers: number;
  high_balance_customers: number;
  total_balance: number;
  avg_balance: number;
  customers_with_open_invoices: number;
}

interface CustomerData {
  customer_id: string;
  customer_name: string;
  balance: number;
  invoice_count: number;
  oldest_invoice_date: string | null;
  newest_invoice_date: string | null;
}

interface FilterConfig {
  minBalance: number;
  maxBalance: number;
  minInvoiceCount: number;
  maxInvoiceCount: number;
  minInvoiceAmount: number;
  maxInvoiceAmount: number;
  dateFrom: string;
  dateTo: string;
  logicOperator: 'AND' | 'OR';
  sortBy: 'balance' | 'invoice_count' | 'customer_name';
  sortOrder: 'asc' | 'desc';
}

const PRESET_FILTERS = [
  { label: 'High Balance (>$10k)', filter: { minBalance: 10000, maxBalance: Infinity, minInvoiceCount: 0, maxInvoiceCount: Infinity } },
  { label: 'Medium Balance ($5k-$10k)', filter: { minBalance: 5000, maxBalance: 10000, minInvoiceCount: 0, maxInvoiceCount: Infinity } },
  { label: 'Balance >$500 & >10 Invoices', filter: { minBalance: 500, maxBalance: Infinity, minInvoiceCount: 10, maxInvoiceCount: Infinity } },
  { label: 'Many Open Invoices (>20)', filter: { minBalance: 0, maxBalance: Infinity, minInvoiceCount: 20, maxInvoiceCount: Infinity } },
  { label: 'Critical: >$20k OR >30 Invoices', filter: { minBalance: 20000, maxBalance: Infinity, minInvoiceCount: 30, maxInvoiceCount: Infinity }, logic: 'OR' as const },
];

export default function CustomerAnalyticsPage({ onBack }: CustomerAnalyticsPageProps) {
  const navigate = useNavigate();
  const [stats, setStats] = useState<CustomerStats>({
    total_customers: 0,
    active_customers: 0,
    high_balance_customers: 0,
    total_balance: 0,
    avg_balance: 0,
    customers_with_open_invoices: 0
  });
  const [allCustomers, setAllCustomers] = useState<CustomerData[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<CustomerData[]>([]);
  const [allInvoices, setAllInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  const [filters, setFilters] = useState<FilterConfig>({
    minBalance: 0,
    maxBalance: Infinity,
    minInvoiceCount: 0,
    maxInvoiceCount: Infinity,
    minInvoiceAmount: 0,
    maxInvoiceAmount: Infinity,
    dateFrom: '',
    dateTo: '',
    logicOperator: 'AND',
    sortBy: 'balance',
    sortOrder: 'desc'
  });

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate('/dashboard');
    }
  };

  useEffect(() => {
    loadCustomerAnalytics();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [filters, allCustomers]);

  const fetchAllPaginated = async (table: string, select: string, filters?: { column: string; operator: string; value: any }[]) => {
    const PAGE_SIZE = 1000;
    let allData: any[] = [];
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      let query = supabase
        .from(table)
        .select(select)
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (filters) {
        filters.forEach(f => {
          if (f.operator === 'gt') {
            query = query.gt(f.column, f.value);
          } else if (f.operator === 'gte') {
            query = query.gte(f.column, f.value);
          } else if (f.operator === 'lte') {
            query = query.lte(f.column, f.value);
          }
        });
      }

      const { data, error } = await query;

      if (error) throw error;

      if (data && data.length > 0) {
        allData = [...allData, ...data];
        hasMore = data.length === PAGE_SIZE;
        page++;
      } else {
        hasMore = false;
      }
    }

    return allData;
  };

  const loadCustomerAnalytics = async () => {
    setLoading(true);
    try {
      // Get exact count of customers (excluding those marked for exclusion)
      const { count: totalCustomers, error: countError } = await supabase
        .from('acumatica_customers')
        .select('*', { count: 'exact', head: true })
        .eq('exclude_from_customer_analytics', false);

      if (countError) throw countError;

      // Get count of active customers (excluding those marked for exclusion)
      const { count: activeCustomers, error: activeError } = await supabase
        .from('acumatica_customers')
        .select('*', { count: 'exact', head: true })
        .eq('customer_status', 'Active')
        .eq('exclude_from_customer_analytics', false);

      if (activeError) throw activeError;

      // Fetch all invoices with balance > 0 (paginated)
      const invoices = await fetchAllPaginated(
        'acumatica_invoices',
        'customer, balance, date',
        [{ column: 'balance', operator: 'gt', value: 0 }]
      );

      // Store all invoices for filtering
      setAllInvoices(invoices);

      // Calculate balances, invoice counts, and date ranges per customer (unfiltered)
      const customerBalanceMap = new Map<string, number>();
      const customerInvoiceCountMap = new Map<string, number>();
      const customerOldestDateMap = new Map<string, Date>();
      const customerNewestDateMap = new Map<string, Date>();

      invoices.forEach((inv: any) => {
        const current = customerBalanceMap.get(inv.customer) || 0;
        customerBalanceMap.set(inv.customer, current + (inv.balance || 0));

        const count = customerInvoiceCountMap.get(inv.customer) || 0;
        customerInvoiceCountMap.set(inv.customer, count + 1);

        if (inv.date) {
          const invDate = new Date(inv.date);
          const oldestDate = customerOldestDateMap.get(inv.customer);
          const newestDate = customerNewestDateMap.get(inv.customer);

          if (!oldestDate || invDate < oldestDate) {
            customerOldestDateMap.set(inv.customer, invDate);
          }
          if (!newestDate || invDate > newestDate) {
            customerNewestDateMap.set(inv.customer, invDate);
          }
        }
      });

      const totalBalance = Array.from(customerBalanceMap.values()).reduce((sum, bal) => sum + bal, 0);
      const highBalanceCustomers = Array.from(customerBalanceMap.values()).filter(bal => bal > 10000).length;
      const customersWithOpenInvoices = customerBalanceMap.size;
      const avgBalance = customersWithOpenInvoices > 0 ? totalBalance / customersWithOpenInvoices : 0;

      // Get all unique customer IDs
      const allCustomerIds = Array.from(customerBalanceMap.keys());

      // Fetch customer names and exclusion flags in batches
      const customerNameMap = new Map<string, string>();
      const excludedCustomers = new Set<string>();
      const BATCH_SIZE = 100;
      for (let i = 0; i < allCustomerIds.length; i += BATCH_SIZE) {
        const batch = allCustomerIds.slice(i, i + BATCH_SIZE);
        const { data: customerData, error: custError } = await supabase
          .from('acumatica_customers')
          .select('customer_id, customer_name, exclude_from_customer_analytics')
          .in('customer_id', batch);

        if (custError) throw custError;
        customerData?.forEach(c => {
          customerNameMap.set(c.customer_id, c.customer_name);
          if (c.exclude_from_customer_analytics) {
            excludedCustomers.add(c.customer_id);
          }
        });
      }

      // Filter out excluded customers
      const filteredCustomerIds = allCustomerIds.filter(id => !excludedCustomers.has(id));

      const customersArray: CustomerData[] = filteredCustomerIds.map(customer_id => ({
        customer_id,
        customer_name: customerNameMap.get(customer_id) || 'Unknown',
        balance: customerBalanceMap.get(customer_id) || 0,
        invoice_count: customerInvoiceCountMap.get(customer_id) || 0,
        oldest_invoice_date: customerOldestDateMap.get(customer_id)?.toISOString().split('T')[0] || null,
        newest_invoice_date: customerNewestDateMap.get(customer_id)?.toISOString().split('T')[0] || null,
      }));

      setStats({
        total_customers: totalCustomers || 0,
        active_customers: activeCustomers || 0,
        high_balance_customers: highBalanceCustomers,
        total_balance: totalBalance,
        avg_balance: avgBalance,
        customers_with_open_invoices: customersWithOpenInvoices
      });

      setAllCustomers(customersArray);
    } catch (error) {
      console.error('Error loading customer analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    // Step 1: Filter invoices based on date range and invoice amount
    let filteredInvoices = [...allInvoices];

    // Filter by date range
    if (filters.dateFrom || filters.dateTo) {
      const fromDate = filters.dateFrom ? new Date(filters.dateFrom) : null;
      const toDate = filters.dateTo ? new Date(filters.dateTo) : null;

      filteredInvoices = filteredInvoices.filter(inv => {
        if (!inv.date) return false;
        const invDate = new Date(inv.date);

        if (fromDate && toDate) {
          return invDate >= fromDate && invDate <= toDate;
        } else if (fromDate) {
          return invDate >= fromDate;
        } else if (toDate) {
          return invDate <= toDate;
        }
        return true;
      });
    }

    // Filter by invoice amount (individual invoice balance)
    if (filters.minInvoiceAmount > 0 || filters.maxInvoiceAmount !== Infinity) {
      filteredInvoices = filteredInvoices.filter(inv => {
        const balance = inv.balance || 0;
        return balance >= filters.minInvoiceAmount &&
               (filters.maxInvoiceAmount === Infinity || balance <= filters.maxInvoiceAmount);
      });
    }

    // Step 2: Recalculate customer data based on filtered invoices
    const customerBalanceMap = new Map<string, number>();
    const customerInvoiceCountMap = new Map<string, number>();
    const customerOldestDateMap = new Map<string, Date>();
    const customerNewestDateMap = new Map<string, Date>();

    filteredInvoices.forEach((inv: any) => {
      const current = customerBalanceMap.get(inv.customer) || 0;
      customerBalanceMap.set(inv.customer, current + (inv.balance || 0));

      const count = customerInvoiceCountMap.get(inv.customer) || 0;
      customerInvoiceCountMap.set(inv.customer, count + 1);

      if (inv.date) {
        const invDate = new Date(inv.date);
        const oldestDate = customerOldestDateMap.get(inv.customer);
        const newestDate = customerNewestDateMap.get(inv.customer);

        if (!oldestDate || invDate < oldestDate) {
          customerOldestDateMap.set(inv.customer, invDate);
        }
        if (!newestDate || invDate > newestDate) {
          customerNewestDateMap.set(inv.customer, invDate);
        }
      }
    });

    // Step 3: Create customer array with recalculated data
    const recalculatedCustomers: CustomerData[] = [];

    allCustomers.forEach(customer => {
      // Only include customers that have invoices after filtering
      if (customerBalanceMap.has(customer.customer_id)) {
        recalculatedCustomers.push({
          ...customer,
          balance: customerBalanceMap.get(customer.customer_id) || 0,
          invoice_count: customerInvoiceCountMap.get(customer.customer_id) || 0,
          oldest_invoice_date: customerOldestDateMap.get(customer.customer_id)?.toISOString().split('T')[0] || null,
          newest_invoice_date: customerNewestDateMap.get(customer.customer_id)?.toISOString().split('T')[0] || null,
        });
      }
    });

    // Step 4: Apply customer-level filters
    let filtered = recalculatedCustomers;

    if (filters.logicOperator === 'AND') {
      filtered = filtered.filter(customer => {
        const balanceMatch = customer.balance >= filters.minBalance &&
                            (filters.maxBalance === Infinity || customer.balance <= filters.maxBalance);
        const invoiceMatch = customer.invoice_count >= filters.minInvoiceCount &&
                            (filters.maxInvoiceCount === Infinity || customer.invoice_count <= filters.maxInvoiceCount);
        return balanceMatch && invoiceMatch;
      });
    } else {
      filtered = filtered.filter(customer => {
        const balanceMatch = customer.balance >= filters.minBalance &&
                            (filters.maxBalance === Infinity || customer.balance <= filters.maxBalance);
        const invoiceMatch = customer.invoice_count >= filters.minInvoiceCount &&
                            (filters.maxInvoiceCount === Infinity || customer.invoice_count <= filters.maxInvoiceCount);
        return balanceMatch || invoiceMatch;
      });
    }

    // Step 5: Apply sorting
    filtered.sort((a, b) => {
      let comparison = 0;
      if (filters.sortBy === 'balance') {
        comparison = a.balance - b.balance;
      } else if (filters.sortBy === 'invoice_count') {
        comparison = a.invoice_count - b.invoice_count;
      } else {
        comparison = a.customer_name.localeCompare(b.customer_name);
      }
      return filters.sortOrder === 'asc' ? comparison : -comparison;
    });

    setFilteredCustomers(filtered);
  };

  const resetFilters = () => {
    setFilters({
      minBalance: 0,
      maxBalance: Infinity,
      minInvoiceCount: 0,
      maxInvoiceCount: Infinity,
      minInvoiceAmount: 0,
      maxInvoiceAmount: Infinity,
      dateFrom: '',
      dateTo: '',
      logicOperator: 'AND',
      sortBy: 'balance',
      sortOrder: 'desc'
    });
  };

  const applyPresetFilter = (preset: typeof PRESET_FILTERS[0]) => {
    setFilters({
      ...filters,
      minBalance: preset.filter.minBalance,
      maxBalance: preset.filter.maxBalance,
      minInvoiceCount: preset.filter.minInvoiceCount,
      maxInvoiceCount: preset.filter.maxInvoiceCount,
      logicOperator: preset.logic || 'AND'
    });
    setShowFilters(true);
  };

  const exportToExcel = () => {
    const exportData = filteredCustomers.map((customer, index) => ({
      'Rank': index + 1,
      'Customer ID': customer.customer_id,
      'Customer Name': customer.customer_name,
      'Open Invoices': customer.invoice_count,
      'Outstanding Balance': customer.balance,
      'Oldest Invoice Date': customer.oldest_invoice_date || 'N/A',
      'Newest Invoice Date': customer.newest_invoice_date || 'N/A',
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Customer Analytics');
    XLSX.writeFile(workbook, `customer_analytics_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const activeFilterCount = [
    filters.minBalance > 0,
    filters.maxBalance !== Infinity,
    filters.minInvoiceCount > 0,
    filters.maxInvoiceCount !== Infinity,
    filters.minInvoiceAmount > 0,
    filters.maxInvoiceAmount !== Infinity,
    filters.dateFrom !== '',
    filters.dateTo !== ''
  ].filter(Boolean).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50">
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBack}
              className="p-2 hover:bg-blue-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-blue-600" />
            </button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Customer Analytics</h1>
              <p className="text-gray-600">Advanced customer filtering and analysis</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={exportToExcel}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Download size={18} />
              Export to Excel
            </button>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                showFilters ? 'bg-blue-600 text-white' : 'bg-white border-2 border-blue-600 text-blue-600 hover:bg-blue-50'
              }`}
            >
              <Filter size={18} />
              Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
            </button>
          </div>
        </div>

        {/* Preset Filters */}
        <div className="mb-6 flex flex-wrap gap-3">
          {PRESET_FILTERS.map((preset, index) => (
            <button
              key={index}
              onClick={() => applyPresetFilter(preset)}
              className="px-4 py-2 bg-white border-2 border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50 hover:border-blue-400 transition-colors text-sm font-medium"
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Advanced Filters Panel */}
        {showFilters && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6 border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Advanced Filters</h3>
              <button
                onClick={() => setShowFilters(false)}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Customer Total Balance Filters */}
              <div className="col-span-full">
                <h4 className="text-md font-bold text-gray-800 mb-3 border-b pb-2">Customer Total Balance Range</h4>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Min Customer Balance</label>
                <input
                  type="number"
                  value={filters.minBalance || ''}
                  onChange={(e) => setFilters({ ...filters, minBalance: Number(e.target.value) || 0 })}
                  placeholder="e.g., 500"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">Only show customers with total balance ≥ this amount</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Max Customer Balance</label>
                <input
                  type="number"
                  value={filters.maxBalance === Infinity ? '' : filters.maxBalance}
                  onChange={(e) => setFilters({ ...filters, maxBalance: e.target.value ? Number(e.target.value) : Infinity })}
                  placeholder="e.g., 10000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">Only show customers with total balance ≤ this amount</p>
              </div>

              {/* Individual Invoice Amount Filters */}
              <div className="col-span-full mt-4">
                <h4 className="text-md font-bold text-gray-800 mb-3 border-b pb-2">Individual Invoice Amount Range</h4>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Min Invoice Amount</label>
                <input
                  type="number"
                  value={filters.minInvoiceAmount || ''}
                  onChange={(e) => setFilters({ ...filters, minInvoiceAmount: Number(e.target.value) || 0 })}
                  placeholder="e.g., 20"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">Only count invoices with balance ≥ this amount</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Max Invoice Amount</label>
                <input
                  type="number"
                  value={filters.maxInvoiceAmount === Infinity ? '' : filters.maxInvoiceAmount}
                  onChange={(e) => setFilters({ ...filters, maxInvoiceAmount: e.target.value ? Number(e.target.value) : Infinity })}
                  placeholder="e.g., 35"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">Only count invoices with balance ≤ this amount</p>
              </div>

              {/* Invoice Count Filters */}
              <div className="col-span-full mt-4">
                <h4 className="text-md font-bold text-gray-800 mb-3 border-b pb-2">Invoice Count Range</h4>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Minimum Invoice Count</label>
                <input
                  type="number"
                  value={filters.minInvoiceCount || ''}
                  onChange={(e) => setFilters({ ...filters, minInvoiceCount: Number(e.target.value) || 0 })}
                  placeholder="e.g., 10"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Maximum Invoice Count</label>
                <input
                  type="number"
                  value={filters.maxInvoiceCount === Infinity ? '' : filters.maxInvoiceCount}
                  onChange={(e) => setFilters({ ...filters, maxInvoiceCount: e.target.value ? Number(e.target.value) : Infinity })}
                  placeholder="e.g., 50"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Date Range Filters */}
              <div className="col-span-full mt-4">
                <h4 className="text-md font-bold text-gray-800 mb-3 border-b pb-2">Invoice Date Range</h4>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Invoice Date From</label>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Invoice Date To</label>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Other Options */}
              <div className="col-span-full mt-4">
                <h4 className="text-md font-bold text-gray-800 mb-3 border-b pb-2">Display & Sorting Options</h4>
              </div>

              {/* Logic Operator */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Filter Logic</label>
                <select
                  value={filters.logicOperator}
                  onChange={(e) => setFilters({ ...filters, logicOperator: e.target.value as 'AND' | 'OR' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="AND">AND (Both conditions)</option>
                  <option value="OR">OR (Either condition)</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">How to combine balance and invoice count filters</p>
              </div>

              {/* Sort By */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Sort By</label>
                <select
                  value={filters.sortBy}
                  onChange={(e) => setFilters({ ...filters, sortBy: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="balance">Balance</option>
                  <option value="invoice_count">Invoice Count</option>
                  <option value="customer_name">Customer Name</option>
                </select>
              </div>

              {/* Sort Order */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Sort Order</label>
                <select
                  value={filters.sortOrder}
                  onChange={(e) => setFilters({ ...filters, sortOrder: e.target.value as 'asc' | 'desc' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="desc">Highest First</option>
                  <option value="asc">Lowest First</option>
                </select>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={resetFilters}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
              >
                Reset Filters
              </button>
              <div className="flex-1"></div>
              <div className="text-sm text-gray-600 py-2">
                Showing <span className="font-bold text-blue-600">{filteredCustomers.length}</span> of {allCustomers.length} customers
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading customer analytics...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-600 font-medium">Total Customers</span>
                  <Users className="w-5 h-5 text-blue-600" />
                </div>
                <p className="text-3xl font-bold text-gray-900">{stats.total_customers}</p>
                <p className="text-sm text-gray-600 mt-1">{stats.active_customers} active</p>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-600 font-medium">Total Outstanding Balance</span>
                  <DollarSign className="w-5 h-5 text-green-600" />
                </div>
                <p className="text-3xl font-bold text-gray-900">
                  ${stats.total_balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-600 font-medium">Average Balance</span>
                  <TrendingUp className="w-5 h-5 text-cyan-600" />
                </div>
                <p className="text-3xl font-bold text-gray-900">
                  ${stats.avg_balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>

            {/* Filtered Customers Table */}
            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
              <h2 className="text-xl font-bold text-gray-900 mb-6">
                Filtered Customers ({filteredCustomers.length})
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Rank</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Customer</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700">Open Invoices</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700">Balance</th>
                      <th className="text-center py-3 px-4 font-semibold text-gray-700">Date Range</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCustomers.slice(0, 100).map((customer, index) => (
                      <tr
                        key={customer.customer_id}
                        onClick={() => navigate(`/customers?view=${customer.customer_id}`)}
                        className="border-b border-gray-100 hover:bg-blue-50 transition-colors cursor-pointer"
                      >
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold text-sm">
                            {index + 1}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div>
                            <p className="font-semibold text-gray-900">{customer.customer_name}</p>
                            <p className="text-sm text-gray-600">{customer.customer_id}</p>
                          </div>
                        </td>
                        <td className="text-right py-3 px-4 text-gray-900 font-medium">{customer.invoice_count}</td>
                        <td className="text-right py-3 px-4 font-bold text-gray-900">
                          ${customer.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="text-center py-3 px-4 text-sm text-gray-600">
                          {customer.oldest_invoice_date && customer.newest_invoice_date ? (
                            <div>
                              <div>{customer.oldest_invoice_date}</div>
                              <div className="text-xs text-gray-500">to {customer.newest_invoice_date}</div>
                            </div>
                          ) : 'N/A'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredCustomers.length > 100 && (
                  <div className="mt-4 text-center text-sm text-gray-600">
                    Showing first 100 of {filteredCustomers.length} results. Use filters to narrow down or export to Excel for full list.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
