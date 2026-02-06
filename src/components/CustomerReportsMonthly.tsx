import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Mail, Download, Filter, DollarSign, Calendar, CheckSquare, Square, CreditCard, Search, X, ArrowUpDown, FileSpreadsheet, Edit } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { generateCustomerInvoicePDF } from '../lib/pdfGenerator';
import { formatDate as formatDateUtil } from '../lib/dateUtils';
import { exportToExcel as exportExcel, formatDate, formatCurrency } from '../lib/excelExport';

interface CustomerReportsMonthlyProps {
  onBack?: () => void;
}

interface Customer {
  id: string;
  customer_id: string;
  customer_name: string;
  email: string;
  total_balance: number;
  unpaid_invoices: Invoice[];
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

export default function CustomerReportsMonthly({ onBack }: CustomerReportsMonthlyProps) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [selectedCustomers, setSelectedCustomers] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<DateFilter>('current_month');
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

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  useEffect(() => {
    loadCustomersWithInvoices();
    loadTemplates();
  }, []);

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

  useEffect(() => {
    applyFilters();
  }, [customers, dateFilter, customStartDate, customEndDate, minBalance, searchTerm, sortBy, sortOrder]);

  const loadCustomersWithInvoices = async () => {
    setLoading(true);
    try {
      let allInvoices: any[] = [];
      let from = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: invoices, error } = await supabase
          .from('acumatica_invoices')
          .select('id, customer, reference_number, date, due_date, dac_total, balance, status, description')
          .gt('balance', 0)
          .order('customer')
          .range(from, from + pageSize - 1);

        if (error) throw error;

        if (invoices && invoices.length > 0) {
          allInvoices = [...allInvoices, ...invoices];
          from += pageSize;
          hasMore = invoices.length === pageSize;
        } else {
          hasMore = false;
        }
      }

      let allCustomers: any[] = [];
      let customerFrom = 0;
      let hasMoreCustomers = true;

      while (hasMoreCustomers) {
        const { data: acumaticaCustomers, error: custError } = await supabase
          .from('acumatica_customers')
          .select('customer_id, customer_name, billing_email, general_email')
          .range(customerFrom, customerFrom + pageSize - 1);

        if (custError) throw custError;

        if (acumaticaCustomers && acumaticaCustomers.length > 0) {
          allCustomers = [...allCustomers, ...acumaticaCustomers];
          customerFrom += pageSize;
          hasMoreCustomers = acumaticaCustomers.length === pageSize;
        } else {
          hasMoreCustomers = false;
        }
      }

      const customerInfoMap = new Map(
        allCustomers.map((c: any) => [c.customer_id, {
          name: c.customer_name,
          email: c.billing_email || c.general_email || ''
        }])
      );

      const customerMap = new Map<string, Customer>();

      allInvoices.forEach((inv: any) => {
        const customerId = inv.customer;
        const customerInfo = customerInfoMap.get(customerId);

        if (!customerMap.has(customerId)) {
          customerMap.set(customerId, {
            id: customerId,
            customer_id: customerId,
            customer_name: customerInfo?.name || `Customer ${customerId}`,
            email: customerInfo?.email || '',
            total_balance: 0,
            unpaid_invoices: []
          });
        }

        const customer = customerMap.get(customerId)!;
        customer.total_balance += Number(inv.balance) || 0;
        customer.unpaid_invoices.push({
          id: inv.id,
          reference_number: inv.reference_number,
          invoice_date: inv.date,
          due_date: inv.due_date,
          amount: Number(inv.dac_total) || 0,
          balance: Number(inv.balance) || 0,
          status: inv.status,
          description: inv.description || ''
        });
      });

      const customersArray = Array.from(customerMap.values());
      setCustomers(customersArray);
    } catch (error) {
      console.error('Error loading customers:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...customers];

    filtered = filtered.filter(c => c.total_balance >= minBalance);

    if (dateFilter !== 'all') {
      filtered = filtered.map(customer => {
        const filteredInvoices = customer.unpaid_invoices.filter(inv => {
          const invDate = new Date(inv.invoice_date);

          if (dateFilter === 'current_month') {
            const now = new Date();
            return invDate.getMonth() === now.getMonth() &&
                   invDate.getFullYear() === now.getFullYear();
          } else if (dateFilter === 'custom' && customStartDate && customEndDate) {
            const start = new Date(customStartDate);
            const end = new Date(customEndDate);
            return invDate >= start && invDate <= end;
          }
          return true;
        });

        return {
          ...customer,
          unpaid_invoices: filteredInvoices,
          total_balance: filteredInvoices.reduce((sum, inv) => sum + inv.balance, 0)
        };
      }).filter(c => c.unpaid_invoices.length > 0);
    }

    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase().trim();
      filtered = filtered.filter(customer => {
        const nameMatch = customer.customer_name.toLowerCase().includes(searchLower);
        const emailMatch = customer.email.toLowerCase().includes(searchLower);
        const balanceMatch = customer.total_balance.toString().includes(searchLower);
        const invoiceCountMatch = customer.unpaid_invoices.length.toString().includes(searchLower);
        const customerIdMatch = customer.customer_id.toLowerCase().includes(searchLower);

        return nameMatch || emailMatch || balanceMatch || invoiceCountMatch || customerIdMatch;
      });
    }

    filtered.sort((a, b) => {
      let comparison = 0;

      if (sortBy === 'name') {
        comparison = a.customer_name.localeCompare(b.customer_name);
      } else if (sortBy === 'balance') {
        comparison = a.total_balance - b.total_balance;
      } else if (sortBy === 'invoices') {
        comparison = a.unpaid_invoices.length - b.unpaid_invoices.length;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    setFilteredCustomers(filtered);
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
    setSelectedCustomers(new Set(filteredCustomers.map(c => c.customer_id)));
  };

  const deselectAll = () => {
    setSelectedCustomers(new Set());
  };

  const generatePDFs = async () => {
    const toGenerate = filteredCustomers.filter(c => selectedCustomers.has(c.customer_id));
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
        const pdfBlob = await generateCustomerInvoicePDF(customer);
        newPDFs.set(customer.customer_id, pdfBlob);
        setProgress(prev => [...prev, `✓ ${customer.customer_name} - PDF ready`]);
      } catch (error) {
        setProgress(prev => [...prev, `✗ ${customer.customer_name} - Failed`]);
        console.error('PDF generation error:', error);
      }

      await new Promise(resolve => setTimeout(resolve, 200));
    }

    setGeneratedPDFs(newPDFs);
    setProgress(prev => [...prev, `\n✓ Generated ${newPDFs.size} PDFs successfully!`]);

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
      const customer = filteredCustomers.find(c => c.customer_id === customerId);
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

  const handleExportToExcel = () => {
    if (filteredCustomers.length === 0) {
      alert('No customers to export');
      return;
    }

    setExportingExcel(true);
    try {
      const exportData: any[] = [];

      filteredCustomers.forEach(customer => {
        customer.unpaid_invoices.forEach(invoice => {
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
        });
      });

      exportExcel({
        filename: `customer_unpaid_invoices_${new Date().toISOString().split('T')[0]}`,
        sheetName: 'Customer Invoices',
        title: 'Customer Unpaid Invoices Report',
        subtitle: `Generated on ${new Date().toLocaleDateString()} - ${filteredCustomers.length} customers, ${exportData.length} invoices`,
        columns: [
          { header: 'Customer Name', key: 'customer_name', width: 30 },
          { header: 'Customer Email', key: 'customer_email', width: 30 },
          { header: 'Invoice Reference', key: 'invoice_reference', width: 20 },
          { header: 'Invoice Date', key: 'invoice_date', width: 15, format: formatDate },
          { header: 'Due Date', key: 'due_date', width: 15, format: formatDate },
          { header: 'Amount', key: 'amount', width: 15, format: formatCurrency },
          { header: 'Balance', key: 'balance', width: 15, format: formatCurrency },
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

    const toSend = filteredCustomers.filter(c =>
      selectedCustomers.has(c.customer_id) && c.email
    );

    if (toSend.length === 0) {
      alert('No customers with valid email addresses');
      return;
    }

    setSendingEmails(true);
    setEmailProgress([]);

    const dateFrom = dateFilter === 'custom' ? customStartDate : '';
    const dateTo = dateFilter === 'custom' ? customEndDate : new Date().toISOString().split('T')[0];

    for (let i = 0; i < toSend.length; i++) {
      const customer = toSend[i];
      setEmailProgress(prev => [
        ...prev,
        `[${i + 1}/${toSend.length}] Sending to ${customer.customer_name} (${customer.email})...`
      ]);

      try {
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

        const oldestInvoice = customer.unpaid_invoices.reduce((oldest, inv) =>
          new Date(inv.invoice_date) < new Date(oldest.invoice_date) ? inv : oldest
        , customer.unpaid_invoices[0]);

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
                total_invoices: customer.unpaid_invoices.length,
                invoices: customer.unpaid_invoices,
                date_from: dateFrom,
                date_to: dateTo,
                oldest_invoice_date: oldestInvoice?.invoice_date || '',
                days_overdue: daysOverdue,
                payment_url: customerPaymentUrl,
              },
              pdfBase64: base64PDF,
              sentByUserId: profile?.id,
            })
          }
        );

        if (response.ok) {
          setEmailProgress(prev => [...prev, `✓ ${customer.customer_name} - Email sent`]);
        } else {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          const errorMessage = errorData.error || errorData.details || 'Failed to send';
          setEmailProgress(prev => [...prev, `✗ ${customer.customer_name} - ${errorMessage}`]);
          console.error('Email error for', customer.customer_name, errorData);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        setEmailProgress(prev => [...prev, `✗ ${customer.customer_name} - ${errorMsg}`]);
        console.error('Email error:', error);
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    setEmailProgress(prev => [...prev, `\n✓ Email batch completed!`]);

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


  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-950">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

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
            <div className="text-2xl font-bold text-white">{filteredCustomers.length}</div>
          </div>
          <div className="bg-slate-900 rounded-lg p-4 border border-slate-800">
            <div className="text-slate-400 text-sm mb-1">Total Unpaid Balance</div>
            <div className="text-2xl font-bold text-red-400">
              {formatCurrency(filteredCustomers.reduce((sum, c) => sum + c.total_balance, 0))}
            </div>
          </div>
          <div className="bg-slate-900 rounded-lg p-4 border border-slate-800">
            <div className="text-slate-400 text-sm mb-1">Total Invoices</div>
            <div className="text-2xl font-bold text-white">
              {filteredCustomers.reduce((sum, c) => sum + c.unpaid_invoices.length, 0)}
            </div>
          </div>
          <div className="bg-slate-900 rounded-lg p-4 border border-slate-800">
            <div className="text-slate-400 text-sm mb-1">Selected Customers</div>
            <div className="text-2xl font-bold text-blue-400">{selectedCustomers.size}</div>
          </div>
        </div>

        <div className="bg-slate-900 rounded-lg p-6 mb-6 border border-slate-800">
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
                placeholder="Search by name, email, customer ID, balance, or invoice count..."
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
            <div className="flex items-center justify-between mt-1">
              <p className="text-xs text-slate-500">
                Try searching: customer name, email address, balance amount (e.g., "1500"), or number of invoices (e.g., "5")
              </p>
              {searchTerm && (
                <p className="text-xs text-blue-400 font-medium">
                  Found {filteredCustomers.length} result{filteredCustomers.length !== 1 ? 's' : ''}
                </p>
              )}
            </div>
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
                <option value="current_month">Current Month</option>
                <option value="all">All Unpaid</option>
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

          <div className="flex gap-3 mt-6">
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
              {selectedCustomers.size} of {filteredCustomers.length} selected
            </div>
          </div>
        </div>

        <div className="bg-slate-900 rounded-lg p-6 mb-6 border border-slate-800">
          <div className="mb-4 flex items-center gap-3">
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
          <div className="flex flex-wrap gap-4">
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
              disabled={exportingExcel || filteredCustomers.length === 0}
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

        <div className="space-y-4">
          {filteredCustomers.map((customer) => (
            <div
              key={customer.customer_id}
              className={`bg-slate-900 rounded-lg border transition-all ${
                selectedCustomers.has(customer.customer_id)
                  ? 'border-blue-500 bg-slate-800'
                  : 'border-slate-800'
              }`}
            >
              <div
                onClick={() => toggleCustomer(customer.customer_id)}
                className="p-6 cursor-pointer hover:bg-slate-800 transition-colors"
              >
                <div className="flex items-start gap-4">
                  <div className="mt-1">
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
                          {customer.unpaid_invoices.length} unpaid invoice{customer.unpaid_invoices.length !== 1 ? 's' : ''}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 space-y-2">
                      {customer.unpaid_invoices.map((invoice) => (
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
                  </div>
                </div>
              </div>
            </div>
          ))}

          {filteredCustomers.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              No customers found matching the current filters
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
