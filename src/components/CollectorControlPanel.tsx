import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  ArrowLeft, Search, FileText, DollarSign, Users, Mail,
  Calendar, Filter, CheckCircle, XCircle, Clock, Edit2,
  Save, X, Plus, Trash2, Send, Eye
} from 'lucide-react';

interface Invoice {
  id: string;
  reference_number: string;
  customer: string;
  customer_name: string;
  date: string;
  due_date: string;
  amount: number;
  balance: number;
  status: string;
  color_status: string | null;
  description: string;
  last_modified_by: string | null;
  last_modified_at: string | null;
}

interface Assignment {
  id: string;
  customer_id: string;
  customer_name: string;
  assigned_date: string;
  priority: string;
  notes: string;
  status: string;
  target_collection_amount: number;
}

interface EmailSchedule {
  id: string;
  customer_id: string;
  customer_name: string;
  invoice_id: string | null;
  scheduled_date: string;
  email_type: string;
  subject: string;
  status: string;
}

export default function CollectorControlPanel({ onBack }: { onBack: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const handleBack = onBack || (() => navigate(-1));
  const [activeTab, setActiveTab] = useState<'invoices' | 'assignments' | 'emails'>('invoices');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [emailSchedules, setEmailSchedules] = useState<EmailSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [editingInvoice, setEditingInvoice] = useState<string | null>(null);
  const [colorStatusChange, setColorStatusChange] = useState<{ [key: string]: string }>({});
  const [showNewAssignment, setShowNewAssignment] = useState(false);
  const [showNewEmail, setShowNewEmail] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);

  useEffect(() => {
    loadData();
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    const { data } = await supabase
      .from('acumatica_customers')
      .select('customer_id, customer_name')
      .order('customer_name');
    if (data) setCustomers(data);
  };

  const loadData = async () => {
    setLoading(true);
    await Promise.all([
      loadInvoices(),
      loadAssignments(),
      loadEmailSchedules()
    ]);
    setLoading(false);
  };

  const loadInvoices = async () => {
    const { data: assignmentData } = await supabase
      .from('collector_assignments')
      .select('customer_id')
      .eq('collector_id', user?.id)
      .eq('status', 'active');

    if (!assignmentData || assignmentData.length === 0) {
      setInvoices([]);
      return;
    }

    const customerIds = assignmentData.map(a => a.customer_id);

    const { data } = await supabase
      .from('acumatica_invoices')
      .select('*')
      .in('customer', customerIds)
      .order('date', { ascending: false });

    if (data) setInvoices(data);
  };

  const loadAssignments = async () => {
    const { data } = await supabase
      .from('collector_assignments')
      .select(`
        *,
        customer:acumatica_customers!collector_assignments_customer_id_fkey(customer_name)
      `)
      .eq('collector_id', user?.id)
      .order('assigned_date', { ascending: false });

    if (data) {
      const formatted = data.map(a => ({
        ...a,
        customer_name: a.customer?.customer_name || 'Unknown'
      }));
      setAssignments(formatted);
    }
  };

  const loadEmailSchedules = async () => {
    const { data } = await supabase
      .from('collector_email_schedules')
      .select(`
        *,
        customer:acumatica_customers!collector_email_schedules_customer_id_fkey(customer_name)
      `)
      .eq('collector_id', user?.id)
      .order('scheduled_date', { ascending: true });

    if (data) {
      const formatted = data.map(e => ({
        ...e,
        customer_name: e.customer?.customer_name || 'Unknown'
      }));
      setEmailSchedules(formatted);
    }
  };

  const handleColorChange = async (invoiceId: string, newColor: string) => {
    try {
      const { error } = await supabase.rpc('execute', {
        query: `
          SET LOCAL app.current_user_id = '${user?.id}';
          UPDATE acumatica_invoices
          SET color_status = '${newColor}'
          WHERE id = '${invoiceId}';
        `
      });

      if (!error) {
        await loadInvoices();
        setEditingInvoice(null);
        setColorStatusChange({});
      }
    } catch (err) {
      console.error('Error updating color:', err);
    }
  };

  const updateInvoiceColor = async (invoiceId: string, newColor: string) => {
    const { error } = await supabase
      .from('acumatica_invoices')
      .update({
        color_status: newColor,
        last_modified_by: user?.id,
        last_modified_at: new Date().toISOString()
      })
      .eq('id', invoiceId);

    if (!error) {
      await loadInvoices();
      setEditingInvoice(null);
    }
  };

  const createAssignment = async (customerId: string, notes: string, priority: string) => {
    const { error } = await supabase
      .from('collector_assignments')
      .insert({
        collector_id: user?.id,
        customer_id: customerId,
        notes,
        priority,
        status: 'active',
        assigned_by: user?.id
      });

    if (!error) {
      await loadAssignments();
      setShowNewAssignment(false);
    }
  };

  const scheduleEmail = async (emailData: any) => {
    const { error } = await supabase
      .from('collector_email_schedules')
      .insert({
        ...emailData,
        collector_id: user?.id,
        created_by: user?.id
      });

    if (!error) {
      await loadEmailSchedules();
      setShowNewEmail(false);
    }
  };

  const filteredInvoices = invoices.filter(inv => {
    const matchesSearch =
      inv.reference_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.customer_name.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFilter =
      filterStatus === 'all' ||
      (filterStatus === 'open' && inv.status === 'Open') ||
      (filterStatus === 'overdue' && new Date(inv.due_date) < new Date()) ||
      (filterStatus === 'red' && inv.color_status === 'red') ||
      (filterStatus === 'yellow' && inv.color_status === 'yellow') ||
      (filterStatus === 'green' && inv.color_status === 'green');

    return matchesSearch && matchesFilter;
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 shadow-lg">
        <div className="max-w-7xl mx-auto">
          <button
            onClick={handleBack}
            className="flex items-center text-white hover:text-blue-100 mb-4 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back to Dashboard
          </button>
          <h1 className="text-3xl font-bold">Collector Control Panel</h1>
          <p className="text-blue-100 mt-2">Full control over your assignments, invoices, and communications</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        <div className="bg-white rounded-lg shadow-sm mb-6">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              <button
                onClick={() => setActiveTab('invoices')}
                className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'invoices'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <FileText className="w-5 h-5 inline mr-2" />
                Invoices ({filteredInvoices.length})
              </button>
              <button
                onClick={() => setActiveTab('assignments')}
                className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'assignments'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Users className="w-5 h-5 inline mr-2" />
                Assignments ({assignments.length})
              </button>
              <button
                onClick={() => setActiveTab('emails')}
                className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'emails'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Mail className="w-5 h-5 inline mr-2" />
                Email Schedule ({emailSchedules.length})
              </button>
            </nav>
          </div>

          {activeTab === 'invoices' && (
            <div className="p-6">
              <div className="flex gap-4 mb-6">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="Search invoices..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">All Invoices</option>
                  <option value="open">Open</option>
                  <option value="overdue">Overdue</option>
                  <option value="red">Red Status</option>
                  <option value="yellow">Yellow Status</option>
                  <option value="green">Green Status</option>
                </select>
              </div>

              <div className="max-h-[calc(100vh-450px)] overflow-x-auto overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#64748b #e2e8f0' }}>
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase bg-gray-50">Invoice #</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase bg-gray-50">Customer</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase bg-gray-50">Due Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase bg-gray-50">Balance</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase bg-gray-50">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase bg-gray-50">Color</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase bg-gray-50">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredInvoices.map((invoice) => (
                      <tr key={invoice.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {invoice.reference_number}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {invoice.customer_name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {new Date(invoice.due_date).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                          ${invoice.balance?.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            invoice.status === 'Open' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                          }`}>
                            {invoice.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          {editingInvoice === invoice.id ? (
                            <div className="flex gap-2">
                              <button
                                onClick={() => updateInvoiceColor(invoice.id, 'red')}
                                className="w-8 h-8 rounded bg-red-500 hover:bg-red-600 transition-colors"
                              />
                              <button
                                onClick={() => updateInvoiceColor(invoice.id, 'yellow')}
                                className="w-8 h-8 rounded bg-yellow-400 hover:bg-yellow-500 transition-colors"
                              />
                              <button
                                onClick={() => updateInvoiceColor(invoice.id, 'green')}
                                className="w-8 h-8 rounded bg-green-500 hover:bg-green-600 transition-colors"
                              />
                              <button
                                onClick={() => setEditingInvoice(null)}
                                className="w-8 h-8 rounded bg-gray-300 hover:bg-gray-400 flex items-center justify-center"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <div
                                className={`w-6 h-6 rounded ${
                                  invoice.color_status === 'red' ? 'bg-red-500' :
                                  invoice.color_status === 'yellow' ? 'bg-yellow-400' :
                                  invoice.color_status === 'green' ? 'bg-green-500' :
                                  'bg-gray-300'
                                }`}
                              />
                              <button
                                onClick={() => setEditingInvoice(invoice.id)}
                                className="text-blue-600 hover:text-blue-800"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <button
                            onClick={() => {
                              setShowNewEmail(true);
                            }}
                            className="text-blue-600 hover:text-blue-800 mr-2"
                          >
                            <Mail className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'assignments' && (
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold">My Assignments</h2>
                <button
                  onClick={() => setShowNewAssignment(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  New Assignment
                </button>
              </div>

              <div className="grid gap-4">
                {assignments.map((assignment) => (
                  <div key={assignment.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-semibold text-lg">{assignment.customer_name}</h3>
                        <p className="text-sm text-gray-600 mt-1">{assignment.notes}</p>
                        <div className="flex gap-4 mt-2 text-sm text-gray-500">
                          <span>Priority: <span className={`font-medium ${
                            assignment.priority === 'high' ? 'text-red-600' :
                            assignment.priority === 'medium' ? 'text-yellow-600' :
                            'text-green-600'
                          }`}>{assignment.priority}</span></span>
                          <span>Assigned: {new Date(assignment.assigned_date).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <span className={`px-3 py-1 rounded text-sm font-medium ${
                        assignment.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {assignment.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'emails' && (
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold">Email Schedule</h2>
                <button
                  onClick={() => setShowNewEmail(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Schedule Email
                </button>
              </div>

              <div className="space-y-4">
                {emailSchedules.map((schedule) => (
                  <div key={schedule.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <Mail className="w-5 h-5 text-blue-600" />
                          <div>
                            <h3 className="font-semibold">{schedule.subject}</h3>
                            <p className="text-sm text-gray-600">To: {schedule.customer_name}</p>
                          </div>
                        </div>
                        <div className="flex gap-4 mt-2 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            {new Date(schedule.scheduled_date).toLocaleString()}
                          </span>
                          <span className="flex items-center gap-1">
                            {schedule.status === 'sent' ? <CheckCircle className="w-4 h-4 text-green-600" /> :
                             schedule.status === 'pending' ? <Clock className="w-4 h-4 text-yellow-600" /> :
                             <XCircle className="w-4 h-4 text-red-600" />}
                            {schedule.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
