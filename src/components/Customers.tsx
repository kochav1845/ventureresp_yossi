import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { batchedInQuery } from '../lib/batchedQuery';
import { ArrowLeft, Plus, CreditCard as Edit2, Trash2, Users, RefreshCw, Mail, CheckSquare, Square, Power, FileText, Clock, Calendar, PauseCircle, Play, ChevronLeft, ChevronRight, Search, Download, Lock, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { useUserPermissions, PERMISSION_KEYS } from '../lib/permissions';
import CustomerFiles from './CustomerFiles';
import { exportToExcel as exportExcel, formatDate, formatCurrency } from '../lib/excelExport';

type Customer = {
  id: string;
  name: string;
  email: string;
  is_active: boolean;
  responded_this_month: boolean;
  postpone_until: string | null;
  postpone_reason: string | null;
  created_at: string;
  updated_at: string;
};

type ScheduledEmail = {
  id: string;
  scheduled_time: string;
  template_name: string;
  formula_name: string;
  timezone: string;
};

type CustomersProps = {
  onBack?: () => void;
};

export default function Customers({ onBack }: CustomersProps) {
  const { hasPermission, loading: permissionsLoading } = useUserPermissions();
  const navigate = useNavigate();
  const handleBack = onBack || (() => navigate(-1));
  const hasAccess = hasPermission(PERMISSION_KEYS.CUSTOMERS_VIEW, 'view');

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [viewingFiles, setViewingFiles] = useState<{ id: string; name: string } | null>(null);
  const [viewingSchedule, setViewingSchedule] = useState<{ id: string; name: string } | null>(null);
  const [scheduledEmails, setScheduledEmails] = useState<ScheduledEmail[]>([]);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sortColumn, setSortColumn] = useState<string>('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const pageSize = 1000;

  const [formData, setFormData] = useState({
    name: '',
    email: '',
  });

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async (page = 0) => {
    setLoading(true);
    setIsSearching(false);
    try {
      const { count } = await supabase
        .from('customers')
        .select('*', { count: 'exact', head: true });

      setTotalCount(count || 0);

      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) throw error;
      setCustomers(data || []);
      setCurrentPage(page);
    } catch (error) {
      console.error('Error loading customers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      loadCustomers(0);
      return;
    }

    setLoading(true);
    setIsSearching(true);
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .or(`name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCustomers(data || []);
      setTotalCount(data?.length || 0);
    } catch (error) {
      console.error('Error searching customers:', error);
    } finally {
      setLoading(false);
    }
  };

  const goToNextPage = () => {
    if ((currentPage + 1) * pageSize < totalCount) {
      loadCustomers(currentPage + 1);
    }
  };

  const goToPreviousPage = () => {
    if (currentPage > 0) {
      loadCustomers(currentPage - 1);
    }
  };

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const sortedCustomers = [...customers].sort((a, b) => {
    let aVal: any = a[sortColumn as keyof Customer];
    let bVal: any = b[sortColumn as keyof Customer];

    if (typeof aVal === 'string') aVal = aVal.toLowerCase();
    if (typeof bVal === 'string') bVal = bVal.toLowerCase();

    if (aVal === null || aVal === undefined) return 1;
    if (bVal === null || bVal === undefined) return -1;

    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const getSortIcon = (column: string) => {
    if (sortColumn !== column) {
      return <ArrowUpDown size={14} className="text-gray-400" />;
    }
    return sortDirection === 'asc' ?
      <ArrowUp size={14} className="text-blue-600" /> :
      <ArrowDown size={14} className="text-blue-600" />;
  };

  const handleCreate = () => {
    setEditingCustomer(null);
    setFormData({ name: '', email: '' });
    setShowForm(true);
  };

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormData({
      name: customer.name,
      email: customer.email,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this customer? This will also delete all their assignments and email logs.')) return;

    try {
      const { error } = await supabase
        .from('customers')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await loadCustomers(currentPage);
    } catch (error) {
      console.error('Error deleting customer:', error);
      alert('Error deleting customer');
    }
  };

  const handleToggleActive = async (id: string, currentValue: boolean) => {
    setUpdating(id);
    try {
      const { error } = await supabase
        .from('customers')
        .update({ is_active: !currentValue })
        .eq('id', id);

      if (error) throw error;
      setCustomers(customers.map(c => c.id === id ? { ...c, is_active: !currentValue } : c));
    } catch (error) {
      console.error('Error updating customer status:', error);
      alert('Error updating customer status');
    } finally {
      setUpdating(null);
    }
  };

  const handleToggleResponded = async (id: string, currentValue: boolean) => {
    setUpdating(id);
    try {
      const { error } = await supabase
        .from('customers')
        .update({ responded_this_month: !currentValue })
        .eq('id', id);

      if (error) throw error;
      setCustomers(customers.map(c => c.id === id ? { ...c, responded_this_month: !currentValue } : c));
    } catch (error) {
      console.error('Error updating response status:', error);
      alert('Error updating response status');
    } finally {
      setUpdating(null);
    }
  };

  const handleUnpostpone = async (id: string) => {
    if (!confirm('Remove the postponement for this customer? They will start receiving scheduled emails again.')) return;

    setUpdating(id);
    try {
      const { error } = await supabase
        .from('customers')
        .update({
          postpone_until: null,
          postpone_reason: null
        })
        .eq('id', id);

      if (error) throw error;
      setCustomers(customers.map(c => c.id === id ? { ...c, postpone_until: null, postpone_reason: null } : c));
    } catch (error) {
      console.error('Error removing postponement:', error);
      alert('Error removing postponement');
    } finally {
      setUpdating(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      alert('Please enter a customer name');
      return;
    }

    if (!formData.email.trim()) {
      alert('Please enter an email address');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      alert('Please enter a valid email address');
      return;
    }

    try {
      if (editingCustomer) {
        const { error } = await supabase
          .from('customers')
          .update({
            name: formData.name,
            email: formData.email,
          })
          .eq('id', editingCustomer.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('customers')
          .insert({
            name: formData.name,
            email: formData.email,
          });

        if (error) throw error;
      }

      setShowForm(false);
      await loadCustomers(0);
    } catch (error: any) {
      console.error('Error saving customer:', error);
      if (error.code === '23505') {
        alert('A customer with this email already exists');
      } else {
        alert('Error saving customer');
      }
    }
  };

  const loadScheduledEmails = async (customerId: string) => {
    setLoadingSchedule(true);
    try {
      const { data, error } = await supabase
        .from('customer_assignments')
        .select(`
          id,
          start_day_of_month,
          timezone,
          email_formulas!inner (
            name,
            schedule
          ),
          email_templates!inner (
            name
          )
        `)
        .eq('customer_id', customerId)
        .eq('is_active', true);

      if (error) throw error;

      const upcomingEmails: ScheduledEmail[] = [];
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();

      data?.forEach((assignment: any) => {
        const startDay = assignment.start_day_of_month;
        const schedule = assignment.email_formulas?.schedule || [];

        for (let monthOffset = 0; monthOffset < 6; monthOffset++) {
          const targetDate = new Date(currentYear, currentMonth + monthOffset, startDay);

          schedule.forEach((scheduleItem: any) => {
            const times = scheduleItem.times || [];

            times.forEach((sendTime: string) => {
              const emailDate = new Date(targetDate);
              emailDate.setDate(emailDate.getDate() + (scheduleItem.day - 1));

              const [hours, minutes] = sendTime.split(':');
              emailDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);

              if (emailDate > now) {
                upcomingEmails.push({
                  id: `${assignment.id}-${monthOffset}-${scheduleItem.day}-${sendTime}`,
                  scheduled_time: emailDate.toISOString(),
                  template_name: assignment.email_templates?.name || 'N/A',
                  formula_name: `${assignment.email_formulas?.name || 'N/A'} (Day ${scheduleItem.day})`,
                  timezone: assignment.timezone
                });
              }
            });
          });
        }
      });

      upcomingEmails.sort((a, b) =>
        new Date(a.scheduled_time).getTime() - new Date(b.scheduled_time).getTime()
      );

      setScheduledEmails(upcomingEmails.slice(0, 10));
    } catch (error) {
      console.error('Error loading scheduled emails:', error);
    } finally {
      setLoadingSchedule(false);
    }
  };

  const exportToExcel = async () => {
    if (customers.length === 0) {
      alert('No customers to export');
      return;
    }

    setExporting(true);
    try {
      const customerIds = customers.map(c => c.id);

      const { data: payments } = await supabase
        .from('acumatica_payments')
        .select('id, reference_number, customer_id, payment_amount, application_date, status, payment_method, cash_account, description')
        .in('customer_id', customerIds)
        .order('application_date', { ascending: false });

      const paymentRefs = (payments || []).map(p => p.reference_number);

      const attachments = await batchedInQuery(
        supabase,
        'payment_attachments',
        '*',
        'payment_reference_number',
        paymentRefs
      );

      const applications = await batchedInQuery(
        supabase,
        'payment_invoice_applications',
        '*',
        'payment_reference_number',
        paymentRefs
      );

      const attachmentsByPayment = new Map<string, any[]>();
      const applicationsByPayment = new Map<string, any[]>();

      (attachments || []).forEach(att => {
        if (!attachmentsByPayment.has(att.payment_reference_number)) {
          attachmentsByPayment.set(att.payment_reference_number, []);
        }
        attachmentsByPayment.get(att.payment_reference_number)!.push(att);
      });

      (applications || []).forEach(app => {
        if (!applicationsByPayment.has(app.payment_reference_number)) {
          applicationsByPayment.set(app.payment_reference_number, []);
        }
        applicationsByPayment.get(app.payment_reference_number)!.push(app);
      });

      const exportData: any[] = [];

      customers.forEach(customer => {
        const customerPayments = (payments || []).filter(p => p.customer_id === customer.id);

        if (customerPayments.length === 0) {
          exportData.push({
            customer_name: customer.name,
            customer_email: customer.email,
            customer_active: customer.is_active ? 'Yes' : 'No',
            payment_reference: '',
            payment_amount: '',
            payment_date: '',
            payment_status: '',
            payment_method: '',
            cash_account: '',
            description: '',
            attachments: '',
            invoices_applied: '',
            credit_memos_applied: ''
          });
        } else {
          customerPayments.forEach(payment => {
            const atts = attachmentsByPayment.get(payment.reference_number) || [];
            const apps = applicationsByPayment.get(payment.reference_number) || [];

            const invoices = apps.filter(a => a.doc_type === 'Invoice' || !a.doc_type);
            const creditMemos = apps.filter(a => a.doc_type === 'Credit Memo');

            const attDetails = atts.map(a =>
              `${a.file_name} (${a.file_type || 'unknown'}, ${(a.file_size / 1024).toFixed(1)}KB${a.is_check_image ? ', Check Image' : ''})`
            ).join(' | ');

            const invoiceDetails = invoices.map(a =>
              `${a.invoice_reference_number}: $${parseFloat(a.amount_paid || 0).toFixed(2)}`
            ).join(' | ');

            const creditMemoDetails = creditMemos.map(a =>
              `${a.invoice_reference_number}: $${parseFloat(a.amount_paid || 0).toFixed(2)}`
            ).join(' | ');

            exportData.push({
              customer_name: customer.name,
              customer_email: customer.email,
              customer_active: customer.is_active ? 'Yes' : 'No',
              payment_reference: payment.reference_number,
              payment_amount: payment.payment_amount || 0,
              payment_date: payment.application_date || '',
              payment_status: payment.status || '',
              payment_method: payment.payment_method || '',
              cash_account: payment.cash_account || '',
              description: payment.description || '',
              attachments: attDetails,
              invoices_applied: invoiceDetails,
              credit_memos_applied: creditMemoDetails
            });
          });
        }
      });

      exportExcel({
        filename: `customers_with_payments_${new Date().toISOString().split('T')[0]}`,
        sheetName: 'Customers & Payments',
        title: 'Customers with Payments Report',
        subtitle: `Generated on ${new Date().toLocaleDateString()}`,
        columns: [
          { header: 'Customer Name', key: 'customer_name', width: 25 },
          { header: 'Customer Email', key: 'customer_email', width: 30 },
          { header: 'Active', key: 'customer_active', width: 10 },
          { header: 'Payment Reference', key: 'payment_reference', width: 20 },
          { header: 'Payment Amount', key: 'payment_amount', width: 15, format: formatCurrency },
          { header: 'Payment Date', key: 'payment_date', width: 15, format: formatDate },
          { header: 'Status', key: 'payment_status', width: 12 },
          { header: 'Payment Method', key: 'payment_method', width: 15 },
          { header: 'Cash Account', key: 'cash_account', width: 15 },
          { header: 'Description', key: 'description', width: 30 },
          { header: 'Attachments', key: 'attachments', width: 40 },
          { header: 'Invoices Applied', key: 'invoices_applied', width: 30 },
          { header: 'Credit Memos Applied', key: 'credit_memos_applied', width: 30 }
        ],
        data: exportData
      });

      alert(`Exported ${customers.length} customers with ${payments?.length || 0} payments`);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      alert('Error exporting data');
    } finally {
      setExporting(false);
    }
  };

  if (viewingSchedule) {
    return (
      <div className="min-h-screen bg-gray-100 text-gray-900 p-8">
        <div className="max-w-6xl mx-auto">
          <button
            onClick={() => {
              setViewingSchedule(null);
              setScheduledEmails([]);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-50 border border-gray-300 rounded-lg transition-colors mb-6"
          >
            <ArrowLeft size={20} />
            Back to Customers
          </button>

          <div className="bg-white rounded-lg shadow border border-gray-300 p-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="bg-orange-600 p-2 rounded-lg">
                  <Clock size={24} className="text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Upcoming Emails</h2>
                  <p className="text-gray-600">{viewingSchedule.name}</p>
                </div>
              </div>
              <button
                onClick={() => loadScheduledEmails(viewingSchedule.id)}
                disabled={loadingSchedule}
                className="p-2 bg-white hover:bg-gray-50 border border-gray-300 text-gray-900 rounded-lg transition-colors"
              >
                <RefreshCw size={18} className={loadingSchedule ? 'animate-spin' : ''} />
              </button>
            </div>

            {loadingSchedule ? (
              <div className="text-center py-8">
                <RefreshCw className="animate-spin text-orange-600 mx-auto mb-4" size={32} />
                <p className="text-gray-600">Loading schedule...</p>
              </div>
            ) : scheduledEmails.length > 0 ? (
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {scheduledEmails.map((email) => {
                  const scheduledDate = new Date(email.scheduled_time);
                  const isToday = scheduledDate.toDateString() === new Date().toDateString();

                  return (
                    <div
                      key={email.id}
                      className={`p-4 rounded-lg border transition-all ${
                        isToday
                          ? 'bg-orange-50 border-orange-300'
                          : 'bg-white border-gray-300'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Mail size={16} className={isToday ? 'text-orange-600' : 'text-blue-600'} />
                          <span className={`text-sm font-medium ${isToday ? 'text-orange-800' : 'text-gray-900'}`}>
                            {email.template_name}
                          </span>
                        </div>
                        {isToday && (
                          <span className="px-2 py-0.5 bg-orange-200 border border-orange-400 text-orange-800 text-xs rounded">
                            Today
                          </span>
                        )}
                      </div>
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center gap-2 text-gray-600">
                          <Calendar size={12} />
                          <span>
                            {scheduledDate.toLocaleDateString('en-US', {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-600">
                          <Clock size={12} />
                          <span>
                            {scheduledDate.toLocaleTimeString('en-US', {
                              hour: 'numeric',
                              minute: '2-digit',
                              hour12: true
                            })} ({email.timezone?.replace('America/', '').replace('_', ' ') || 'UTC'})
                          </span>
                        </div>
                        <div className="text-gray-500">
                          Formula: {email.formula_name}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                <Calendar className="text-gray-400 mx-auto mb-4" size={48} />
                <p className="text-gray-600">No upcoming emails scheduled</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Wait for permissions to load before checking access
  if (permissionsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-blue-600">Loading permissions...</p>
        </div>
      </div>
    );
  }

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
              You do not have permission to view Customers.
            </p>
            <p className="text-sm text-gray-500">
              Please contact your administrator if you believe you should have access to this page.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (viewingFiles) {
    return (
      <CustomerFiles
        customerId={viewingFiles.id}
        customerName={viewingFiles.name}
        onBack={() => setViewingFiles(null)}
      />
    );
  }

  if (showForm) {
    return (
      <div className="min-h-screen bg-gray-100 p-8">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => setShowForm(false)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6 transition-colors"
          >
            <ArrowLeft size={20} />
            Back to Customers
          </button>

          <div className="bg-white rounded-lg shadow border border-gray-300 p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              {editingCustomer ? 'Edit Customer' : 'Add New Customer'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Customer Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-3 bg-white border border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., John Doe"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address *
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-3 bg-white border border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., john@example.com"
                />
              </div>

              <div className="flex gap-4">
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                >
                  {editingCustomer ? 'Update Customer' : 'Add Customer'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-6 py-3 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-7xl mx-auto">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6 transition-colors"
        >
          <ArrowLeft size={20} />
          Back to Dashboard
        </button>

        <div className="bg-white rounded-lg shadow border border-gray-300">
          <div className="p-6 border-b border-gray-300">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Users className="text-blue-600" size={24} />
                <h2 className="text-xl font-semibold text-gray-900">Customers</h2>
                <span className="text-gray-600 text-sm">({totalCount} total)</span>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={exportToExcel}
                  disabled={loading || exporting || customers.length === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                  title="Export customers with all payments and attachments"
                >
                  <Download size={18} className={exporting ? 'animate-bounce' : ''} />
                  {exporting ? 'Exporting...' : 'Export to Excel'}
                </button>
                <button
                  onClick={() => loadCustomers(0)}
                  disabled={loading}
                  className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 rounded-lg transition-colors"
                >
                  <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                  Refresh
                </button>
                <button
                  onClick={handleCreate}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  <Plus size={18} />
                  Add Customer
                </button>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Search by name or email (searches entire database)..."
                  className="w-full pl-10 pr-4 py-2 bg-white border border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <button
                onClick={handleSearch}
                disabled={loading}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg transition-colors"
              >
                Search
              </button>
              {isSearching && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    loadCustomers(0);
                  }}
                  className="px-4 py-2 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 rounded-lg transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="p-6">
            {loading ? (
              <div className="text-center py-12">
                <RefreshCw className="animate-spin text-blue-600 mx-auto mb-4" size={32} />
                <p className="text-gray-600">Loading customers...</p>
              </div>
            ) : customers.length === 0 ? (
              <div className="text-center py-12">
                <Users className="text-gray-400 mx-auto mb-4" size={48} />
                <p className="text-gray-600 mb-4">No customers added yet</p>
                <button
                  onClick={handleCreate}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  <Plus size={18} />
                  Add Your First Customer
                </button>
              </div>
            ) : (
              <>
                {!isSearching && (
                  <div className="flex items-center justify-between mb-4 px-4">
                    <button
                      onClick={goToPreviousPage}
                      disabled={currentPage === 0 || loading}
                      className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed text-gray-700 border border-gray-300 rounded-lg transition-colors"
                    >
                      <ChevronLeft size={20} />
                      Previous
                    </button>
                    <span className="text-gray-600">
                      Page {currentPage + 1} of {Math.ceil(totalCount / pageSize)} (Showing {currentPage * pageSize + 1}-{Math.min((currentPage + 1) * pageSize, totalCount)})
                    </span>
                    <button
                      onClick={goToNextPage}
                      disabled={(currentPage + 1) * pageSize >= totalCount || loading}
                      className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed text-gray-700 border border-gray-300 rounded-lg transition-colors"
                    >
                      Next
                      <ChevronRight size={20} />
                    </button>
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-gray-300">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-300">
                      <th
                        className="text-left py-3 px-4 text-gray-700 font-semibold text-sm border-r border-gray-300 cursor-pointer hover:bg-gray-100 transition-colors"
                        onClick={() => handleSort('name')}
                      >
                        <div className="flex items-center gap-2">
                          <span>Name</span>
                          {getSortIcon('name')}
                        </div>
                      </th>
                      <th
                        className="text-left py-3 px-4 text-gray-700 font-semibold text-sm border-r border-gray-300 cursor-pointer hover:bg-gray-100 transition-colors"
                        onClick={() => handleSort('email')}
                      >
                        <div className="flex items-center gap-2">
                          <span>Email</span>
                          {getSortIcon('email')}
                        </div>
                      </th>
                      <th
                        className="text-center py-3 px-4 text-gray-700 font-semibold text-sm border-r border-gray-300 cursor-pointer hover:bg-gray-100 transition-colors"
                        onClick={() => handleSort('is_active')}
                      >
                        <div className="flex items-center justify-center gap-2">
                          <span>Active</span>
                          {getSortIcon('is_active')}
                        </div>
                      </th>
                      <th
                        className="text-center py-3 px-4 text-gray-700 font-semibold text-sm border-r border-gray-300 cursor-pointer hover:bg-gray-100 transition-colors"
                        onClick={() => handleSort('responded_this_month')}
                      >
                        <div className="flex items-center justify-center gap-2">
                          <span>Responded This Month</span>
                          {getSortIcon('responded_this_month')}
                        </div>
                      </th>
                      <th className="text-center py-3 px-4 text-gray-700 font-semibold text-sm">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedCustomers.map((customer, index) => (
                      <tr key={customer.id} className={`border-b border-gray-300 hover:bg-gray-50 transition-colors ${
                        index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                      }`}>
                        <td className="py-4 px-4 border-r border-gray-300">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-full bg-blue-100">
                              <Mail size={20} className="text-blue-600" />
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-gray-900 font-medium">{customer.name}</span>
                              {customer.postpone_until && new Date(customer.postpone_until) > new Date() && (
                                <button
                                  onClick={() => handleUnpostpone(customer.id)}
                                  disabled={updating === customer.id}
                                  className={`flex items-center gap-1 px-2 py-0.5 bg-yellow-100 border border-yellow-300 hover:bg-yellow-200 rounded text-xs text-yellow-800 transition-colors ${updating === customer.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                                  title={`${customer.postpone_reason || 'Postponed'} - Click to remove postponement`}
                                >
                                  <PauseCircle size={12} />
                                  <span>Postponed until {new Date(customer.postpone_until).toLocaleDateString()}</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-4 text-gray-700 border-r border-gray-300">{customer.email}</td>
                        <td className="py-4 px-4 border-r border-gray-300">
                          <div className="flex justify-center">
                            <button
                              onClick={() => handleToggleActive(customer.id, customer.is_active)}
                              disabled={updating === customer.id}
                              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                                customer.is_active ? 'bg-green-600' : 'bg-gray-300'
                              } ${updating === customer.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                              <span
                                className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                                  customer.is_active ? 'translate-x-6' : 'translate-x-1'
                                }`}
                              />
                            </button>
                          </div>
                        </td>
                        <td className="py-4 px-4 border-r border-gray-300">
                          <div className="flex justify-center">
                            <button
                              onClick={() => handleToggleResponded(customer.id, customer.responded_this_month)}
                              disabled={updating === customer.id}
                              className={`p-2 rounded-lg transition-colors ${
                                updating === customer.id ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-100'
                              }`}
                            >
                              {customer.responded_this_month ? (
                                <CheckSquare className="text-green-600" size={24} />
                              ) : (
                                <Square className="text-gray-400" size={24} />
                              )}
                            </button>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex justify-center gap-2">
                            {customer.postpone_until && new Date(customer.postpone_until) > new Date() && (
                              <button
                                onClick={() => handleUnpostpone(customer.id)}
                                disabled={updating === customer.id}
                                className={`p-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors ${updating === customer.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                                title="Remove Postponement"
                              >
                                <Play size={18} />
                              </button>
                            )}
                            <button
                              onClick={() => {
                                setViewingSchedule({ id: customer.id, name: customer.name });
                                loadScheduledEmails(customer.id);
                              }}
                              className="p-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors"
                              title="View Schedule"
                            >
                              <Clock size={18} />
                            </button>
                            <button
                              onClick={() => setViewingFiles({ id: customer.id, name: customer.name })}
                              className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                              title="View Files"
                            >
                              <FileText size={18} />
                            </button>
                            <button
                              onClick={() => handleEdit(customer)}
                              className="p-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                              title="Edit Customer"
                            >
                              <Edit2 size={18} />
                            </button>
                            <button
                              onClick={() => handleDelete(customer.id)}
                              className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                              title="Delete Customer"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  </table>
                </div>
                {!isSearching && customers.length > 0 && (
                  <div className="flex items-center justify-between mt-4 px-4">
                    <button
                      onClick={goToPreviousPage}
                      disabled={currentPage === 0 || loading}
                      className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed text-gray-700 border border-gray-300 rounded-lg transition-colors"
                    >
                      <ChevronLeft size={20} />
                      Previous
                    </button>
                    <span className="text-gray-600">
                      Page {currentPage + 1} of {Math.ceil(totalCount / pageSize)}
                    </span>
                    <button
                      onClick={goToNextPage}
                      disabled={(currentPage + 1) * pageSize >= totalCount || loading}
                      className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed text-gray-700 border border-gray-300 rounded-lg transition-colors"
                    >
                      Next
                      <ChevronRight size={20} />
                    </button>
                  </div>
                )}
                {isSearching && (
                  <div className="mt-4 px-4 text-center text-gray-600 text-sm">
                    Showing {customers.length} search result{customers.length !== 1 ? 's' : ''} from entire database
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
