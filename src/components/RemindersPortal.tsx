import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Calendar, Clock, AlertCircle, CheckCircle, Edit2, Trash2, Mail, Phone, Video, DollarSign, MessageSquare, FileText, Filter, X, Save } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { formatDate as formatDateUtil, formatDateTime as formatDateTimeUtil } from '../lib/dateUtils';

interface Reminder {
  id: string;
  invoice_id: uuid;
  reminder_date: string;
  reminder_message: string;
  priority: string;
  reminder_type: string;
  notes: string | null;
  send_email_notification: boolean;
  email_sent: boolean;
  completed_at: string | null;
  created_at: string;
  invoice_reference?: string;
  customer_name?: string;
}

interface RemindersPortalProps {
  onBack?: () => void;
}

type FilterType = 'all' | 'today' | 'tomorrow' | 'week' | 'overdue' | 'completed';

export default function RemindersPortal({ onBack }: RemindersPortalProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const handleBack = onBack || (() => navigate(-1));
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [filteredReminders, setFilteredReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [sendingEmails, setSendingEmails] = useState(false);

  useEffect(() => {
    loadReminders();
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
          )
        `)
        .eq('user_id', user?.id)
        .order('reminder_date', { ascending: true });

      if (error) throw error;

      const flattenedData = (data || []).map(item => ({
        ...item,
        invoice_reference: item.acumatica_invoices?.reference_number,
        customer_name: item.acumatica_invoices?.customer_name
      }));

      setReminders(flattenedData);
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

  const triggerReminderEmails = async () => {
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
        }
      );

      const result = await response.json();

      if (response.ok) {
        alert(`✅ ${result.message}\n\nTotal processed: ${result.total || 0}\nEmails sent: ${result.results?.filter((r: any) => r.status === 'sent').length || 0}`);
        loadReminders();
      } else {
        alert(`❌ Error: ${result.error || 'Failed to send emails'}`);
      }
    } catch (error) {
      console.error('Error triggering emails:', error);
      alert('Failed to trigger reminder emails');
    } finally {
      setSendingEmails(false);
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
              onClick={triggerReminderEmails}
              disabled={sendingEmails}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Manually send email notifications for due reminders"
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
                          {reminder.reminder_message}
                        </h3>
                        {(reminder.invoice_reference || reminder.customer_name) && (
                          <p className="text-slate-400 text-sm mt-1">
                            {reminder.invoice_reference && `Invoice: ${reminder.invoice_reference}`}
                            {reminder.invoice_reference && reminder.customer_name && ' • '}
                            {reminder.customer_name}
                          </p>
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
          onClose={() => {
            setShowCreateModal(false);
            setEditingReminder(null);
          }}
          onSave={() => {
            setShowCreateModal(false);
            setEditingReminder(null);
            loadReminders();
          }}
        />
      )}
    </div>
  );
}

interface ReminderModalProps {
  reminder: Reminder | null;
  onClose: () => void;
  onSave: () => void;
}

function ReminderModal({ reminder, onClose, onSave }: ReminderModalProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const handleBack = onBack || (() => navigate(-1));
  const [message, setMessage] = useState(reminder?.reminder_message || '');
  const [date, setDate] = useState(reminder?.reminder_date?.split('T')[0] || '');
  const [time, setTime] = useState(
    reminder?.reminder_date ? new Date(reminder.reminder_date).toTimeString().slice(0, 5) : '09:00'
  );
  const [priority, setPriority] = useState(reminder?.priority || 'medium');
  const [type, setType] = useState(reminder?.reminder_type || 'general');
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
            reminder_message: message.trim(),
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
            invoice_id: null,
            reminder_message: message.trim(),
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
