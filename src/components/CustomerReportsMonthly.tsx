import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Mail, Download, Filter, DollarSign, Calendar, CheckSquare, Square, CreditCard, Search, X, ArrowUpDown, FileSpreadsheet, Edit, ChevronDown, ChevronRight, RefreshCw, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { generateCustomerInvoicePDF } from '../lib/pdfGenerator';
import { formatDate as formatDateUtil } from '../lib/dateUtils';
import { exportToExcel as exportExcel, formatDate, formatCurrency as excelFormatCurrency } from '../lib/excelExport';

interface CustomerReportsMonthlyProps {
  onBack?: () => void;
}

interface CustomerSummary {
  customer_id: string;
  customer_name: string;
  email: string;
  total_balance: number;
  total_amount: number;
  invoice_count: number;
}

interface Invoice {
  id: string;
  reference_number: string;
  invoice_date: string;
  due_date: string;
  amount: number;
  balance: number;
  status: string;
  description: string;
}

interface ReportTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  include_invoice_table: boolean;
  include_payment_table: boolean;
  include_pdf_attachment: boolean;
  is_default: boolean;
}

type DateFilter = 'current_month' | 'all' | 'custom';

const PAGE_SIZE = 50;

export default function CustomerReportsMonthly({ onBack }: CustomerReportsMonthlyProps) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedCustomers, setSelectedCustomers] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [minBalance, setMinBalance] = useState<number>(0);
  const [generatingPDFs, setGeneratingPDFs] = useState(false);
  const [sendingEmails, setSendingEmails] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);
  const [emailProgress, setEmailProgress] = useState<string[]>([]);
  const [generatedPDFs, setGeneratedPDFs] = useState<Map<string, Blob>>(new Map());
  const [paymentUrl, setPaymentUrl] = useState<string>('https://venture.bolt.host/pay');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'balance' | 'invoices'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [exportingExcel, setExportingExcel] = useState(false);
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());
  const [customerInvoices, setCustomerInvoices] = useState<Map<string, Invoice[]>>(new Map());
  const [loadingInvoices, setLoadingInvoices] = useState<Set<string>>(new Set());
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  const getDateRange = useCallback((): { from: string | null; to: string | null } => {
    if (dateFilter === 'current_month') {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const firstDay = new Date(year, month, 1).toISOString().split('T')[0];
      const lastDay = new Date(year, month + 1, 0).toISOString().split('T')[0];
      return { from: firstDay, to: lastDay };
    }
    if (dateFilter === 'custom' && customStartDate && customEndDate) {
      return { from: customStartDate, to: customEndDate };
    }
    return { from: null, to: null };
  }, [dateFilter, customStartDate, customEndDate]);

  const loadCustomers = useCallback(async (offset = 0, append = false) => {
    if (offset === 0) setLoading(true);
    else setLoadingMore(true);

    try {
      const { from, to } = getDateRange();

      const [{ data, error }, { data: countData, error: countError }] = await Promise.all([
        supabase.rpc('get_customers_unpaid_summary', {
          p_date_from: from,
          p_date_to: to,
          p_search: searchTerm.trim() || null,
          p_min_balance: minBalance || 0,
          p_sort_by: sortBy,
          p_sort_order: sortOrder,
          p_limit: PAGE_SIZE,
          p_offset: offset,
        }),
        supabase.rpc('get_customers_unpaid_summary_count', {
          p_date_from: from,
          p_date_to: to,
          p_search: searchTerm.trim() || null,
          p_min_balance: minBalance || 0,
        }),
      ]);

      if (error) throw error;
      if (countError) throw countError;

      const mapped = (data || []).map((c: any) => ({
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        email: c.email || '',
        total_balance: Number(c.total_balance) || 0,
        total_amount: Number(c.total_amount) || 0,
        invoice_count: Number(c.invoice_count) || 0,
      }));

      if (append) {
        setCustomers(prev => [...prev, ...mapped]);
      } else {
        setCustomers(mapped);
      }
      setTotalCount(Number(countData) || 0);
    } catch (error) {
      console.error('Error loading customers:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [getDateRange, searchTerm, minBalance, sortBy, sortOrder]);

  const loadCustomerInvoices = async (customerId: string): Promise<Invoice[]> => {
    setLoadingInvoices(prev => new Set(prev).add(customerId));
    try {
      const { from, to } = getDateRange();
      const { data, error } = await supabase.rpc('get_customer_unpaid_invoices', {
        p_customer_id: customerId,
        p_date_from: from,
        p_date_to: to,
      });

      if (error) throw error;

      const invoices: Invoice[] = (data || []).map((inv: any) => ({
        id: inv.id,
        reference_number: inv.reference_number,
        invoice_date: inv.invoice_date,
        due_date: inv.due_date,
        amount: Number(inv.amount) || 0,
        balance: Number(inv.balance) || 0,
        status: inv.status,
        description: inv.description || '',
      }));

      setCustomerInvoices(prev => new Map(prev).set(customerId, invoices));
      return invoices;
    } catch (error) {
      console.error('Error loading invoices for', customerId, error);
      return [];
    } finally {
      setLoadingInvoices(prev => {
        const next = new Set(prev);
        next.delete(customerId);
        return next;
      });
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      loadCustomers(0, false);
    }, 300);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [loadCustomers]);

  const loadTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('customer_report_templates')
        .select('*')
        .order('is_default', { ascending: false })
        .order('name');

      if (error) throw error;

      setTemplates(data || []);

      const defaultTemplate = data?.find(t => t.is_default);
      if (defaultTemplate) {
        setSelectedTemplateId(defaultTemplate.id);
      } else if (data && data.length > 0) {
        setSelectedTemplateId(data[0].id);
      }
    } catch (error) {
      console.error('Error loading templates:', error);
    }
  };

  const toggleExpand = async (customerId: string) => {
    const next = new Set(expandedCustomers);
    if (next.has(customerId)) {
      next.delete(customerId);
    } else {
      next.add(customerId);
      if (!customerInvoices.has(customerId)) {
        await loadCustomerInvoices(customerId);
      }
    }
    setExpandedCustomers(next);
  };

  const toggleCustomer = (customerId: string) => {
    const newSelected = new Set(selectedCustomers);
    if (newSelected.has(customerId)) {
      newSelected.delete(customerId);
    } else {
      newSelected.add(customerId);
    }
    setSelectedCustomers(newSelected);
  };

  const selectAll = () => {
    setSelectedCustomers(new Set(customers.map(c => c.customer_id)));
  };

  const deselectAll = () => {
    setSelectedCustomers(new Set());
  };

  const loadMore = () => {
    if (customers.length < totalCount) {
      loadCustomers(customers.length, true);
    }
  };

  const getCustomerWithInvoices = async (customer: CustomerSummary) => {
    let invoices = customerInvoices.get(customer.customer_id);
    if (!invoices) {
      invoices = await loadCustomerInvoices(customer.customer_id);
    }
    return {
      ...customer,
      unpaid_invoices: invoices,
    };
  };

  const generatePDFs = async () => {
    const toGenerate = customers.filter(c => selectedCustomers.has(c.customer_id));
    if (toGenerate.length === 0) return;

    setGeneratingPDFs(true);
    setProgress([]);
    const newPDFs = new Map<string, Blob>();

    for (let i = 0; i < toGenerate.length; i++) {
      const customer = toGenerate[i];
      setProgress(prev => [
        ...prev,
        `[${i + 1}/${toGenerate.length}] Generating PDF for ${customer.customer_name}...`
      ]);

      try {
        const fullCustomer = await getCustomerWithInvoices(customer);
        const pdfBlob = await generateCustomerInvoicePDF(fullCustomer);
        newPDFs.set(customer.customer_id, pdfBlob);
        setProgress(prev => [...prev, `Done - ${customer.customer_name} - PDF ready`]);
      } catch (error) {
        setProgress(prev => [...prev, `Failed - ${customer.customer_name}`]);
        console.error('PDF generation error:', error);
      }

      await new Promise(resolve => setTimeout(resolve, 200));
    }

    setGeneratedPDFs(newPDFs);
    setProgress(prev => [...prev, `\nGenerated ${newPDFs.size} PDFs successfully!`]);

    setTimeout(() => {
      setGeneratingPDFs(false);
    }, 2000);
  };


  const downloadAll = () => {
    if (generatedPDFs.size === 0) {
      alert('Please generate PDFs first');
      return;
    }

    generatedPDFs.forEach((blob, customerId) => {
      const customer = customers.find(c => c.customer_id === customerId);
      if (!customer) return;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Invoice_${customer.customer_name.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  };

  const handleExportToExcel = async () => {
    if (customers.length === 0) {
      alert('No customers to export');
      return;
    }

    setExportingExcel(true);
    try {
      const exportData: any[] = [];

      for (const customer of customers) {
        const fullCustomer = await getCustomerWithInvoices(customer);
        for (const invoice of fullCustomer.unpaid_invoices) {
          exportData.push({
            customer_name: customer.customer_name,
            customer_email: customer.email || '',
            invoice_reference: invoice.reference_number,
            invoice_date: invoice.invoice_date,
            due_date: invoice.due_date,
            amount: invoice.amount,
            balance: invoice.balance,
            status: invoice.status,
            description: invoice.description || ''
          });
        }
      }

      exportExcel({
        filename: `customer_unpaid_invoices_${new Date().toISOString().split('T')[0]}`,
        sheetName: 'Customer Invoices',
        title: 'Customer Unpaid Invoices Report',
        subtitle: `Generated on ${new Date().toLocaleDateString()} - ${customers.length} customers, ${exportData.length} invoices`,
        columns: [
          { header: 'Customer Name', key: 'customer_name', width: 30 },
          { header: 'Customer Email', key: 'customer_email', width: 30 },
          { header: 'Invoice Reference', key: 'invoice_reference', width: 20 },
          { header: 'Invoice Date', key: 'invoice_date', width: 15, format: formatDate },
          { header: 'Due Date', key: 'due_date', width: 15, format: formatDate },
          { header: 'Amount', key: 'amount', width: 15, format: excelFormatCurrency },
          { header: 'Balance', key: 'balance', width: 15, format: excelFormatCurrency },
          { header: 'Status', key: 'status', width: 12 },
          { header: 'Description', key: 'description', width: 30 }
        ],
        data: exportData
      });
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      alert('Error exporting data');
    } finally {
      setExportingExcel(false);
    }
  };

  const sendEmails = async () => {
    if (!selectedTemplateId) {
      alert('Please select a template');
      return;
    }

    const selectedTemplate = templates.find(t => t.id === selectedTemplateId);
    if (!selectedTemplate) {
      alert('Selected template not found');
      return;
    }

    if (selectedTemplate.include_pdf_attachment && generatedPDFs.size === 0) {
      alert('Please generate PDFs first or disable PDF attachment in template');
      return;
    }

    const toSend = customers.filter(c =>
      selectedCustomers.has(c.customer_id) && c.email
    );

    if (toSend.length === 0) {
      alert('No customers with valid email addresses');
      return;
    }

    setSendingEmails(true);
    setEmailProgress([]);

    const { from: dateFrom, to: dateTo } = getDateRange();

    for (let i = 0; i < toSend.length; i++) {
      const customer = toSend[i];
      setEmailProgress(prev => [
        ...prev,
        `[${i + 1}/${toSend.length}] Sending to ${customer.customer_name} (${customer.email})...`
      ]);

      try {
        const fullCustomer = await getCustomerWithInvoices(customer);
        const invoices = fullCustomer.unpaid_invoices;

        let base64PDF: string | undefined;

        if (selectedTemplate.include_pdf_attachment) {
          const pdfBlob = generatedPDFs.get(customer.customer_id);
          if (pdfBlob) {
            const reader = new FileReader();
            const base64Promise = new Promise<string>((resolve) => {
              reader.onloadend = () => {
                const base64 = (reader.result as string).split(',')[1];
                resolve(base64);
              };
              reader.readAsDataURL(pdfBlob);
            });
            base64PDF = await base64Promise;
          }
        }

        const customerPaymentUrl = paymentUrl ? `${paymentUrl}?customer_id=${encodeURIComponent(customer.customer_id)}&customer_email=${encodeURIComponent(customer.email)}` : '';

        const oldestInvoice = invoices.length > 0 ? invoices.reduce((oldest, inv) =>
          new Date(inv.invoice_date) < new Date(oldest.invoice_date) ? inv : oldest
        , invoices[0]) : null;

        const daysOverdue = oldestInvoice?.due_date ?
          Math.max(0, Math.floor((new Date().getTime() - new Date(oldestInvoice.due_date).getTime()) / (1000 * 60 * 60 * 24))) : 0;

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-customer-invoice-email`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              templateId: selectedTemplateId,
              templateName: selectedTemplate.name,
              template: {
                subject: selectedTemplate.subject,
                body: selectedTemplate.body,
                include_invoice_table: selectedTemplate.include_invoice_table,
                include_payment_table: selectedTemplate.include_payment_table,
              },
              customerData: {
                customer_name: customer.customer_name,
                customer_id: customer.customer_id,
                customer_email: customer.email,
                balance: customer.total_balance,
                total_invoices: invoices.length,
                invoices: invoices,
                date_from: dateFrom || '',
                date_to: dateTo || new Date().toISOString().split('T')[0],
                oldest_invoice_date: oldestInvoice?.invoice_date || '',
                days_overdue: daysOverdue,
                payment_url: customerPaymentUrl,
              },
              pdfBase64: base64PDF,
              sentByUserId: profile?.id,
              department: 'ar',
            })
          }
        );

        if (response.ok) {
          setEmailProgress(prev => [...prev, `Done - ${customer.customer_name} - Email sent`]);
        } else {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          const errorMessage = errorData.error || errorData.details || 'Failed to send';
          setEmailProgress(prev => [...prev, `Failed - ${customer.customer_name} - ${errorMessage}`]);
          console.error('Email error for', customer.customer_name, errorData);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        setEmailProgress(prev => [...prev, `Failed - ${customer.customer_name} - ${errorMsg}`]);
        console.error('Email error:', error);
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    setEmailProgress(prev => [...prev, `\nEmail batch completed!`]);

    setTimeout(() => {
      setSendingEmails(false);
    }, 3000);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const totalBalance = customers.reduce((sum, c) => sum + c.total_balance, 0);
  const totalInvoices = customers.reduce((sum, c) => sum + c.invoice_count, 0);

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6">
      <div className="max-w-7xl mx-auto">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Back
        </button>

        <h1 className="text-3xl font-bold mb-8">Customer Reports Monthly</h1>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-900 rounded-lg p-4 border border-slate-800">
            <div className="text-slate-400 text-sm mb-1">Total Customers</div>
            <div className="text-2xl font-bold text-white">
              {totalCount}
              {customers.length < totalCount && (
                <span className="text-sm font-normal text-slate-500 ml-2">({customers.length} loaded)</span>
              )}
            </div>
          </div>
          <div className="bg-slate-900 rounded-lg p-4 border border-slate-800">
            <div className="text-slate-400 text-sm mb-1">Total Unpaid Balance</div>
            <div className="text-2xl font-bold text-red-400">
              {formatCurrency(totalBalance)}
            </div>
          </div>
          <div className="bg-slate-900 rounded-lg p-4 border border-slate-800">
            <div className="text-slate-400 text-sm mb-1">Total Invoices</div>
            <div className="text-2xl font-bold text-white">
              {totalInvoices.toLocaleString()}
            </div>
          </div>
          <div className="bg-slate-900 rounded-lg p-4 border border-slate-800">
            <div className="text-slate-400 text-sm mb-1">Selected Customers</div>
            <div className="text-2xl font-bold text-blue-400">{selectedCustomers.size}</div>
          </div>
        </div>

        <div className="bg-slate-900 rounded-lg p-6 mb-6 border border-slate-800" data-tour="report-filters">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-5 h-5" />
            <h2 className="text-xl font-semibold">Search & Filters</h2>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-400 mb-2">
              <Search className="w-4 h-4 inline mr-2" />
              Search Customers
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name, email, or customer ID..."
                className="w-full px-4 py-3 pr-10 bg-slate-800 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 placeholder-slate-500"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                  title="Clear search"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
            {loading && (
              <div className="flex items-center gap-2 mt-2 text-xs text-blue-400">
                <Loader2 className="w-3 h-3 animate-spin" />
                Searching...
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 mb-4 p-3 bg-slate-800 rounded-lg">
            <ArrowUpDown className="w-4 h-4 text-slate-400" />
            <span className="text-sm text-slate-400">Sort by:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'name' | 'balance' | 'invoices')}
              className="px-3 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="name">Customer Name</option>
              <option value="balance">Balance Amount</option>
              <option value="invoices">Number of Invoices</option>
            </select>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
              className="px-3 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                <Calendar className="w-4 h-4 inline mr-2" />
                Date Filter
              </label>
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value as DateFilter)}
                className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Unpaid</option>
                <option value="current_month">Current Month</option>
                <option value="custom">Custom Date Range</option>
              </select>
            </div>

            {dateFilter === 'custom' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Start Date</label>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">End Date</label>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                <DollarSign className="w-4 h-4 inline mr-2" />
                Minimum Balance
              </label>
              <input
                type="number"
                value={minBalance}
                onChange={(e) => setMinBalance(Number(e.target.value))}
                className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
                placeholder="0.00"
                step="0.01"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                <CreditCard className="w-4 h-4 inline mr-2" />
                Payment Options
              </label>
              <div className="space-y-3">
                <input
                  type="url"
                  value={paymentUrl}
                  onChange={(e) => setPaymentUrl(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
                  placeholder="https://yoursite.com/pay"
                />
                <p className="text-xs text-slate-500">Payment portal link for customers</p>
              </div>
            </div>
          </div>

          <div className="flex gap-3 mt-6" data-tour="report-select-all">
            <button
              onClick={selectAll}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
            >
              Select All
            </button>
            <button
              onClick={deselectAll}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg font-medium transition-colors"
            >
              Deselect All
            </button>
            <div className="flex-1"></div>
            <div className="text-slate-400">
              {selectedCustomers.size} of {totalCount} selected
            </div>
          </div>
        </div>

        <div className="bg-slate-900 rounded-lg p-6 mb-6 border border-slate-800">
          <div className="mb-4 flex items-center gap-3" data-tour="report-template">
            <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
              <Mail className="w-4 h-4" />
              Email Template:
            </label>
            <select
              value={selectedTemplateId || ''}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="flex-1 max-w-md px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
            >
              {templates.length === 0 && (
                <option value="">No templates available</option>
              )}
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name} {template.is_default ? '(Default)' : ''}
                </option>
              ))}
            </select>
            <button
              onClick={() => navigate('/customer-report-templates')}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg font-medium transition-colors"
              title="Manage Templates"
            >
              <Edit className="w-4 h-4" />
              Manage Templates
            </button>
          </div>
          <div className="flex flex-wrap gap-4" data-tour="report-actions">
            <button
              onClick={generatePDFs}
              disabled={generatingPDFs || selectedCustomers.size === 0}
              className="flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
            >
              <FileText className="w-5 h-5" />
              {generatingPDFs ? 'Generating...' : 'Generate PDFs'}
            </button>
            <button
              onClick={sendEmails}
              disabled={sendingEmails || selectedCustomers.size === 0}
              className="flex items-center gap-2 px-6 py-3 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
            >
              <Mail className="w-5 h-5" />
              {sendingEmails ? 'Sending...' : 'Send Emails'}
            </button>
            <button
              onClick={downloadAll}
              disabled={generatedPDFs.size === 0}
              className="flex items-center gap-2 px-6 py-3 bg-slate-600 hover:bg-slate-700 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
            >
              <Download className="w-5 h-5" />
              Download All ({generatedPDFs.size})
            </button>
            <button
              onClick={handleExportToExcel}
              disabled={exportingExcel || customers.length === 0}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
            >
              <FileSpreadsheet className={`w-5 h-5 ${exportingExcel ? 'animate-bounce' : ''}`} />
              {exportingExcel ? 'Exporting...' : 'Export to Excel'}
            </button>
          </div>

          {progress.length > 0 && (
            <div className="mt-4 p-4 bg-slate-800 rounded-lg max-h-60 overflow-y-auto">
              {progress.map((msg, idx) => (
                <div key={idx} className="text-sm text-slate-300 py-1">{msg}</div>
              ))}
            </div>
          )}

          {emailProgress.length > 0 && (
            <div className="mt-4 p-4 bg-slate-800 rounded-lg max-h-60 overflow-y-auto">
              {emailProgress.map((msg, idx) => (
                <div key={idx} className="text-sm text-slate-300 py-1">{msg}</div>
              ))}
            </div>
          )}
        </div>

        {loading && customers.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw size={32} className="animate-spin text-blue-500 mr-3" />
            <span className="text-slate-400">Loading customers...</span>
          </div>
        ) : (
          <div className="space-y-4" data-tour="report-list">
            {customers.map((customer) => {
              const isExpanded = expandedCustomers.has(customer.customer_id);
              const invoices = customerInvoices.get(customer.customer_id);
              const isLoadingInv = loadingInvoices.has(customer.customer_id);

              return (
                <div
                  key={customer.customer_id}
                  className={`bg-slate-900 rounded-lg border transition-all ${
                    selectedCustomers.has(customer.customer_id)
                      ? 'border-blue-500 bg-slate-800'
                      : 'border-slate-800'
                  }`}
                >
                  <div className="p-6">
                    <div className="flex items-start gap-4">
                      <div
                        className="mt-1 cursor-pointer"
                        onClick={() => toggleCustomer(customer.customer_id)}
                      >
                        {selectedCustomers.has(customer.customer_id) ? (
                          <CheckSquare className="w-6 h-6 text-blue-500" />
                        ) : (
                          <Square className="w-6 h-6 text-slate-600" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h3 className="text-xl font-bold text-white">{customer.customer_name}</h3>
                            <p className="text-slate-400">{customer.customer_id}</p>
                            {customer.email && (
                              <p className="text-sm text-slate-500">{customer.email}</p>
                            )}
                          </div>
                          <div className="text-right">
                            <div className="text-2xl font-bold text-red-400">
                              {formatCurrency(customer.total_balance)}
                            </div>
                            <div className="text-sm text-slate-400">
                              {customer.invoice_count} unpaid invoice{customer.invoice_count !== 1 ? 's' : ''}
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => toggleExpand(customer.customer_id)}
                          className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors mt-2"
                        >
                          {isLoadingInv ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : isExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                          {isExpanded ? 'Hide invoices' : 'Show invoices'}
                        </button>

                        {isExpanded && invoices && (
                          <div className="mt-4 space-y-2">
                            {invoices.map((invoice) => (
                              <div
                                key={invoice.id}
                                className="flex items-center justify-between p-3 bg-slate-800 rounded-lg"
                              >
                                <div>
                                  <div className="font-medium">{invoice.reference_number}</div>
                                  <div className="text-sm text-slate-400">
                                    Invoice Date: {formatDateUtil(invoice.invoice_date)} | Due: {formatDateUtil(invoice.due_date)}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="font-bold">{formatCurrency(invoice.balance)}</div>
                                  <div className="text-sm text-slate-400">
                                    of {formatCurrency(invoice.amount)}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {customers.length < totalCount && (
              <div className="flex justify-center py-4">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="flex items-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  {loadingMore ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : null}
                  {loadingMore ? 'Loading...' : `Load More (${customers.length} of ${totalCount})`}
                </button>
              </div>
            )}

            {!loading && customers.length === 0 && (
              <div className="text-center py-12 text-slate-400">
                No customers found matching the current filters
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
