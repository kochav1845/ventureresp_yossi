import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Plus, Calendar, Clock, AlertCircle, CheckCircle, Edit2, Trash2, Mail, Phone, Video, DollarSign, MessageSquare, FileText, Filter, X, Save, Ticket, Users, Send, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { formatDate as formatDateUtil, formatDateTime as formatDateTimeUtil } from '../lib/dateUtils';

interface Reminder {
  id: string;
  invoice_id: uuid;
  ticket_id?: uuid;
  reminder_date: string;
  title: string;
  priority: string;
  reminder_type: string;
  notes: string | null;
  send_email_notification: boolean;
  email_sent: boolean;
  completed_at: string | null;
  created_at: string;
  invoice_reference?: string;
  ticket_number?: string;
  customer_name?: string;
}

interface RemindersPortalProps {
  onBack?: () => void;
}

type FilterType = 'all' | 'today' | 'tomorrow' | 'week' | 'overdue' | 'completed';

export default function RemindersPortal({ onBack }: RemindersPortalProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const handleBack = onBack || (() => navigate(-1));
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [filteredReminders, setFilteredReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [sendingEmails, setSendingEmails] = useState(false);
  const [showCollectorModal, setShowCollectorModal] = useState(false);
  const [prefilledInvoiceData, setPrefilledInvoiceData] = useState<any>(null);

  useEffect(() => {
    loadReminders();

    // Check if we should open the create modal with prefilled data
    const state = location.state as any;
    if (state?.createReminder) {
      setPrefilledInvoiceData({
        invoiceId: state.invoiceId,
        invoiceReference: state.invoiceReference,
        ticketId: state.ticketId,
        ticketNumber: state.ticketNumber,
        customerName: state.customerName,
        promiseDate: state.promiseDate
      });
      setShowCreateModal(true);

      // Clear the state so it doesn't trigger again on component update
      window.history.replaceState({}, document.title);
    }
  }, []);

  useEffect(() => {
    applyFilter();
  }, [reminders, filter]);

  const loadReminders = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('invoice_reminders')
        .select(`
          *,
          acumatica_invoices (
            reference_number,
            customer_name
          ),
          collection_tickets (
            ticket_number,
            customer_name
          )
        `)
        .eq('user_id', user?.id)
        .order('reminder_date', { ascending: true });

      if (error) throw error;

      const flattenedData = (data || []).map(item => ({
        ...item,
        // Use invoice_reference_number if available, otherwise fall back to joined data
        invoice_reference: item.invoice_reference_number || item.acumatica_invoices?.reference_number,
        customer_name: item.collection_tickets?.customer_name || item.acumatica_invoices?.customer_name,
        ticket_number: item.collection_tickets?.ticket_number
      }));

      // Enrich reminders with customer names from invoices if needed
      const enrichedData = await Promise.all(
        flattenedData.map(async (item) => {
          // If we have an invoice reference but no customer name, look it up
          if (item.invoice_reference && !item.customer_name) {
            const { data: invoiceData } = await supabase
              .from('acumatica_invoices')
              .select('customer_name')
              .eq('reference_number', item.invoice_reference)
              .maybeSingle();

            if (invoiceData) {
              return { ...item, customer_name: invoiceData.customer_name };
            }
          }
          return item;
        })
      );

      setReminders(enrichedData);
    } catch (error) {
      console.error('Error loading reminders:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyFilter = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);

    let filtered = reminders;

    switch (filter) {
      case 'today':
        filtered = reminders.filter(r => {
          const rDate = new Date(r.reminder_date);
          return rDate >= today && rDate < tomorrow && !r.completed_at;
        });
        break;
      case 'tomorrow':
        filtered = reminders.filter(r => {
          const rDate = new Date(r.reminder_date);
          const dayAfter = new Date(tomorrow);
          dayAfter.setDate(dayAfter.getDate() + 1);
          return rDate >= tomorrow && rDate < dayAfter && !r.completed_at;
        });
        break;
      case 'week':
        filtered = reminders.filter(r => {
          const rDate = new Date(r.reminder_date);
          return rDate >= today && rDate <= weekEnd && !r.completed_at;
        });
        break;
      case 'overdue':
        filtered = reminders.filter(r => {
          const rDate = new Date(r.reminder_date);
          return rDate < today && !r.completed_at;
        });
        break;
      case 'completed':
        filtered = reminders.filter(r => r.completed_at);
        break;
      default:
        filtered = reminders.filter(r => !r.completed_at);
    }

    setFilteredReminders(filtered);
  };

  const handleCompleteReminder = async (reminderId: string) => {
    const { error } = await supabase
      .from('invoice_reminders')
      .update({
        completed_at: new Date().toISOString(),
        completed_by_user_id: user?.id
      })
      .eq('id', reminderId);

    if (error) {
      console.error('Error completing reminder:', error);
      alert('Failed to mark reminder as complete');
      return;
    }

    await loadReminders();
  };

  const handleUncompleteReminder = async (reminderId: string) => {
    const { error } = await supabase
      .from('invoice_reminders')
      .update({
        completed_at: null,
        completed_by_user_id: null
      })
      .eq('id', reminderId);

    if (error) {
      console.error('Error uncompleting reminder:', error);
      return;
    }

    await loadReminders();
  };

  const handleDeleteReminder = async (reminderId: string) => {
    if (!confirm('Delete this reminder?')) return;

    const { error } = await supabase
      .from('invoice_reminders')
      .delete()
      .eq('id', reminderId);

    if (error) {
      console.error('Error deleting reminder:', error);
      return;
    }

    await loadReminders();
  };

  const getReminderIcon = (type: string) => {
    switch (type) {
      case 'call': return <Phone className="w-4 h-4" />;
      case 'email': return <Mail className="w-4 h-4" />;
      case 'meeting': return <Video className="w-4 h-4" />;
      case 'payment': return <DollarSign className="w-4 h-4" />;
      case 'follow_up': return <MessageSquare className="w-4 h-4" />;
      default: return <FileText className="w-4 h-4" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-500/10 border-red-500 text-red-400';
      case 'high': return 'bg-orange-500/10 border-orange-500 text-orange-400';
      case 'medium': return 'bg-yellow-500/10 border-yellow-500 text-yellow-400';
      case 'low': return 'bg-green-500/10 border-green-500 text-green-400';
      default: return 'bg-slate-500/10 border-slate-500 text-slate-400';
    }
  };


  const isOverdue = (dateString: string) => {
    return new Date(dateString) < new Date() && filter !== 'completed';
  };

  const triggerReminderEmails = async (recipientEmails: string[]) => {
    setSendingEmails(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert('Not authenticated');
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-reminder-emails`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ recipient_emails: recipientEmails }),
        }
      );

      const result = await response.json();

      if (response.ok) {
        const sentCount = result.results?.filter((r: any) => r.status === 'sent').length || 0;
        alert(`Email reminders processed.\n\nTotal processed: ${result.total || 0}\nEmails sent: ${sentCount}`);
        loadReminders();
      } else {
        alert(`Error: ${result.error || 'Failed to send emails'}`);
      }
    } catch (error) {
      console.error('Error triggering emails:', error);
      alert('Failed to trigger reminder emails');
    } finally {
      setSendingEmails(false);
      setShowCollectorModal(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBack}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg border border-slate-700 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <h1 className="text-3xl font-bold text-white">Reminders Portal</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCollectorModal(true)}
              disabled={sendingEmails}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Send email reminders to selected collectors"
            >
              <Mail className="w-4 h-4" />
              {sendingEmails ? 'Sending...' : 'Send Email Reminders'}
            </button>
            <button
              onClick={() => {
                setEditingReminder(null);
                setShowCreateModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Reminder
            </button>
          </div>
        </div>

        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
              filter === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            All Active
          </button>
          <button
            onClick={() => setFilter('today')}
            className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
              filter === 'today'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Today
          </button>
          <button
            onClick={() => setFilter('tomorrow')}
            className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
              filter === 'tomorrow'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Tomorrow
          </button>
          <button
            onClick={() => setFilter('week')}
            className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
              filter === 'week'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            This Week
          </button>
          <button
            onClick={() => setFilter('overdue')}
            className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
              filter === 'overdue'
                ? 'bg-red-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Overdue
          </button>
          <button
            onClick={() => setFilter('completed')}
            className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
              filter === 'completed'
                ? 'bg-green-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Completed
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          </div>
        ) : filteredReminders.length === 0 ? (
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-12 text-center">
            <Calendar className="w-16 h-16 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400 text-lg">No reminders found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredReminders.map((reminder) => (
              <div
                key={reminder.id}
                className={`bg-slate-800 rounded-lg border p-4 transition-all ${
                  reminder.completed_at
                    ? 'border-slate-700 opacity-60'
                    : isOverdue(reminder.reminder_date)
                    ? 'border-red-500/50 bg-red-500/5'
                    : 'border-slate-700 hover:border-slate-600'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`p-3 rounded-lg ${getPriorityColor(reminder.priority)}`}>
                    {getReminderIcon(reminder.reminder_type)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div className="flex-1">
                        <h3 className={`text-lg font-semibold ${reminder.completed_at ? 'text-slate-400 line-through' : 'text-white'}`}>
                          {reminder.title}
                        </h3>
                        {(reminder.invoice_reference || reminder.ticket_number || reminder.customer_name) && (
                          <div className="flex items-center gap-2 text-slate-400 text-sm mt-1 flex-wrap">
                            {reminder.ticket_number && (
                              <>
                                <button
                                  onClick={() => navigate(`/collection-ticketing?ticketId=${reminder.ticket_id}`)}
                                  className="flex items-center gap-1 text-purple-400 hover:text-purple-300 hover:underline"
                                >
                                  <Ticket className="w-3 h-3" />
                                  Ticket #{reminder.ticket_number}
                                </button>
                                {reminder.invoice_reference && <span>•</span>}
                              </>
                            )}
                            {reminder.invoice_reference && (
                              <>
                                <button
                                  onClick={() => navigate(`/customers?invoice=${reminder.invoice_reference}`)}
                                  className="flex items-center gap-1 text-blue-400 hover:text-blue-300 hover:underline"
                                >
                                  <FileText className="w-3 h-3" />
                                  Invoice: {reminder.invoice_reference}
                                </button>
                                {reminder.customer_name && <span>•</span>}
                              </>
                            )}
                            {reminder.customer_name && <span>{reminder.customer_name}</span>}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {reminder.send_email_notification && (
                          <div className="flex items-center gap-1 px-2 py-1 bg-blue-500/10 border border-blue-500/30 rounded text-blue-400 text-xs">
                            <Mail className="w-3 h-3" />
                            {reminder.email_sent ? 'Sent' : 'Pending'}
                          </div>
                        )}
                        <span className={`px-2 py-1 rounded text-xs font-medium border ${getPriorityColor(reminder.priority)}`}>
                          {reminder.priority.toUpperCase()}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-sm text-slate-400 mb-3">
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        <span className={isOverdue(reminder.reminder_date) && !reminder.completed_at ? 'text-red-400 font-medium' : ''}>
                          {formatDateUtil(reminder.reminder_date)}
                        </span>
                      </div>
                      {isOverdue(reminder.reminder_date) && !reminder.completed_at && (
                        <span className="flex items-center gap-1 text-red-400 font-medium">
                          <AlertCircle className="w-4 h-4" />
                          Overdue
                        </span>
                      )}
                      {reminder.completed_at && (
                        <span className="flex items-center gap-1 text-green-400">
                          <CheckCircle className="w-4 h-4" />
                          Completed {new Date(reminder.completed_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>

                    {reminder.notes && (
                      <p className="text-slate-300 text-sm bg-slate-900 rounded p-3 mb-3">
                        {reminder.notes}
                      </p>
                    )}

                    <div className="flex items-center gap-2">
                      {!reminder.completed_at ? (
                        <>
                          <button
                            onClick={() => handleCompleteReminder(reminder.id)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-medium transition-colors"
                          >
                            <CheckCircle className="w-4 h-4" />
                            Mark Complete
                          </button>
                          <button
                            onClick={() => {
                              setEditingReminder(reminder);
                              setShowCreateModal(true);
                            }}
                            className="flex items-center gap-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm font-medium transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                            Edit
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleUncompleteReminder(reminder.id)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm font-medium transition-colors"
                        >
                          Reopen
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteReminder(reminder.id)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded text-sm font-medium transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreateModal && (
        <ReminderModal
          reminder={editingReminder}
          prefilledData={prefilledInvoiceData}
          onClose={() => {
            setShowCreateModal(false);
            setEditingReminder(null);
            setPrefilledInvoiceData(null);
          }}
          onSave={() => {
            setShowCreateModal(false);
            setEditingReminder(null);
            setPrefilledInvoiceData(null);
            loadReminders();
          }}
        />
      )}

      {showCollectorModal && (
        <CollectorEmailModal
          sending={sendingEmails}
          onClose={() => setShowCollectorModal(false)}
          onSend={(emails) => triggerReminderEmails(emails)}
        />
      )}
    </div>
  );
}

interface CollectorEmailModalProps {
  sending: boolean;
  onClose: () => void;
  onSend: (emails: string[]) => void;
}

interface Collector {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

function CollectorEmailModal({ sending, onClose, onSend }: CollectorEmailModalProps) {
  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadCollectors();
  }, []);

  const loadCollectors = async () => {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('id, full_name, email, role')
      .in('role', ['collector', 'admin', 'manager'])
      .order('full_name');

    if (!error && data) {
      setCollectors(data);
      setSelectedIds(new Set(data.map(c => c.id)));
    }
    setLoading(false);
  };

  const toggleCollector = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(c => c.id)));
    }
  };

  const filtered = collectors.filter(c =>
    c.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase())
  );

  const selectedEmails = collectors
    .filter(c => selectedIds.has(c.id))
    .map(c => c.email);

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-6 z-50"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-lg max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-teal-400" />
              Send Reminders to Collectors
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              Select which collectors should receive the email reminders
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 border-b border-slate-700">
          <input
            type="text"
            placeholder="Search collectors..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-900 text-white rounded-lg px-4 py-2.5 border border-slate-600 focus:outline-none focus:border-teal-500 text-sm"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500"></div>
            </div>
          ) : (
            <>
              <button
                onClick={toggleAll}
                className="flex items-center gap-2 text-sm text-slate-300 hover:text-white mb-3 transition-colors"
              >
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                  selectedIds.size === filtered.length
                    ? 'bg-teal-600 border-teal-600'
                    : 'border-slate-500'
                }`}>
                  {selectedIds.size === filtered.length && <Check className="w-3 h-3 text-white" />}
                </div>
                {selectedIds.size === filtered.length ? 'Deselect All' : 'Select All'}
                <span className="text-slate-500">({filtered.length} collectors)</span>
              </button>

              <div className="space-y-1">
                {filtered.map((collector) => (
                  <button
                    key={collector.id}
                    onClick={() => toggleCollector(collector.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all text-left ${
                      selectedIds.has(collector.id)
                        ? 'bg-teal-600/10 border border-teal-600/30'
                        : 'bg-slate-900/50 border border-transparent hover:bg-slate-700/50'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                      selectedIds.has(collector.id)
                        ? 'bg-teal-600 border-teal-600'
                        : 'border-slate-500'
                    }`}>
                      {selectedIds.has(collector.id) && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium text-sm truncate">
                        {collector.full_name || collector.email.split('@')[0]}
                      </p>
                      <p className="text-slate-400 text-xs truncate">{collector.email}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                      collector.role === 'admin' ? 'bg-red-500/10 text-red-400' :
                      collector.role === 'manager' ? 'bg-blue-500/10 text-blue-400' :
                      'bg-slate-500/10 text-slate-400'
                    }`}>
                      {collector.role}
                    </span>
                  </button>
                ))}
              </div>

              {filtered.length === 0 && (
                <p className="text-slate-500 text-center py-8">No collectors found</p>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-between p-5 border-t border-slate-700 bg-slate-800/80">
          <p className="text-sm text-slate-400">
            {selectedIds.size} collector{selectedIds.size !== 1 ? 's' : ''} selected
          </p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onSend(selectedEmails)}
              disabled={sending || selectedIds.size === 0}
              className="flex items-center gap-2 px-5 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Send className="w-4 h-4" />
              {sending ? 'Sending...' : `Send to ${selectedIds.size} Collector${selectedIds.size !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ReminderModalProps {
  reminder: Reminder | null;
  prefilledData?: {
    invoiceId?: string;
    invoiceReference?: string;
    ticketId?: string;
    ticketNumber?: string;
    customerName: string;
    promiseDate?: string;
  } | null;
  onClose: () => void;
  onSave: () => void;
}

function ReminderModal({ reminder, prefilledData, onClose, onSave }: ReminderModalProps) {
  const { user } = useAuth();
  const defaultMessage = prefilledData
    ? prefilledData.promiseDate
      ? prefilledData.ticketId
        ? `Payment promised for ticket #${prefilledData.ticketNumber} - ${prefilledData.customerName}`
        : `Payment promised for ${prefilledData.invoiceReference}`
      : prefilledData.ticketId
        ? `Follow up on ticket #${prefilledData.ticketNumber}`
        : `Follow up on invoice ${prefilledData.invoiceReference}`
    : '';
  const defaultDate = prefilledData?.promiseDate || '';
  const [message, setMessage] = useState(reminder?.title || defaultMessage);
  const [date, setDate] = useState(reminder?.reminder_date?.split('T')[0] || defaultDate);
  const [time, setTime] = useState(
    reminder?.reminder_date ? new Date(reminder.reminder_date).toTimeString().slice(0, 5) : '09:00'
  );
  const [priority, setPriority] = useState(reminder?.priority || 'medium');
  const [type, setType] = useState(reminder?.reminder_type || 'payment');
  const [notes, setNotes] = useState(reminder?.notes || '');
  const [sendEmail, setSendEmail] = useState(reminder?.send_email_notification || false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!message.trim() || !date) {
      alert('Please fill in all required fields');
      return;
    }

    setSaving(true);
    try {
      const reminderDateTime = new Date(`${date}T${time}`).toISOString();

      if (reminder) {
        const { error } = await supabase
          .from('invoice_reminders')
          .update({
            title: message.trim(),
            reminder_date: reminderDateTime,
            priority,
            reminder_type: type,
            notes: notes.trim() || null,
            send_email_notification: sendEmail
          })
          .eq('id', reminder.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('invoice_reminders')
          .insert({
            user_id: user?.id,
            invoice_id: prefilledData?.invoiceId || null,
            invoice_reference_number: prefilledData?.invoiceReference || null,
            ticket_id: prefilledData?.ticketId || null,
            title: message.trim(),
            reminder_date: reminderDateTime,
            priority,
            reminder_type: type,
            notes: notes.trim() || null,
            send_email_notification: sendEmail
          });

        if (error) throw error;
      }

      onSave();
    } catch (error) {
      console.error('Error saving reminder:', error);
      alert('Failed to save reminder');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-6 z-50"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 rounded-lg border border-slate-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <h2 className="text-2xl font-bold text-white">
            {reminder ? 'Edit Reminder' : 'Create Reminder'}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {prefilledData && (
            <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-4 mb-4">
              <div className="flex items-start gap-3">
                {prefilledData.ticketId ? (
                  <><Ticket className="w-5 h-5 text-blue-400 mt-0.5" />
                  <div>
                    <h3 className="text-white font-medium">Linked to Collection Ticket</h3>
                    <p className="text-slate-300 text-sm mt-1">
                      Ticket: <span className="font-semibold">#{prefilledData.ticketNumber}</span>
                    </p>
                    <p className="text-slate-400 text-sm">
                      Customer: {prefilledData.customerName}
                    </p>
                  </div></>
                ) : (
                  <><FileText className="w-5 h-5 text-blue-400 mt-0.5" />
                  <div>
                    <h3 className="text-white font-medium">Linked to Invoice</h3>
                    <p className="text-slate-300 text-sm mt-1">
                      Invoice: <span className="font-semibold">{prefilledData.invoiceReference}</span>
                    </p>
                    <p className="text-slate-400 text-sm">
                      Customer: {prefilledData.customerName}
                    </p>
                  </div></>
                )}
              </div>
            </div>
          )}

          <div>
            <label className="block text-slate-300 font-medium mb-2">Reminder Message *</label>
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g., Call ABC Company about invoice"
              className="w-full bg-slate-900 text-white rounded-lg px-4 py-3 border border-slate-700 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 font-medium mb-2">Date *</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-slate-900 text-white rounded-lg px-4 py-3 border border-slate-700 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-2">Time *</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full bg-slate-900 text-white rounded-lg px-4 py-3 border border-slate-700 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 font-medium mb-2">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full bg-slate-900 text-white rounded-lg px-4 py-3 border border-slate-700 focus:outline-none focus:border-blue-500"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-2">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full bg-slate-900 text-white rounded-lg px-4 py-3 border border-slate-700 focus:outline-none focus:border-blue-500"
              >
                <option value="general">General</option>
                <option value="call">Call</option>
                <option value="email">Email</option>
                <option value="meeting">Meeting</option>
                <option value="payment">Payment</option>
                <option value="follow_up">Follow Up</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-2">Additional Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any additional details..."
              className="w-full bg-slate-900 text-white rounded-lg px-4 py-3 border border-slate-700 focus:outline-none focus:border-blue-500 resize-none"
              rows={3}
            />
          </div>

          <div className="flex items-center gap-3 p-4 bg-slate-900 rounded-lg border border-slate-700">
            <input
              type="checkbox"
              id="sendEmail"
              checked={sendEmail}
              onChange={(e) => setSendEmail(e.target.checked)}
              className="w-5 h-5 text-blue-600 bg-slate-800 border-slate-600 rounded focus:ring-blue-500"
            />
            <label htmlFor="sendEmail" className="flex-1">
              <div className="flex items-center gap-2 text-white font-medium">
                <Mail className="w-4 h-4" />
                Send email notification
              </div>
              <p className="text-slate-400 text-sm mt-1">
                You'll receive an email when this reminder is due with a link to mark it complete
              </p>
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !message.trim() || !date}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Reminder'}
          </button>
        </div>
      </div>
    </div>
  );
}
