import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Bell, CheckCircle, Clock, AlertCircle, ChevronRight, ExternalLink } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface ActiveReminder {
  id: string;
  invoice_id: string | null;
  ticket_id: string | null;
  reminder_date: string;
  title: string;
  priority: string;
  reminder_type: string;
  notes: string | null;
  invoice_reference: string | null;
  ticket_number: string | null;
  customer_name: string | null;
}

interface ReminderPopupProps {
  onViewAll: () => void;
}

export default function ReminderPopup({ onViewAll }: ReminderPopupProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [reminders, setReminders] = useState<ActiveReminder[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      checkForActiveReminders();
    }
  }, [user]);

  const checkForActiveReminders = async () => {
    try {
      const dismissedDate = localStorage.getItem('reminders_dismissed_date');
      const today = new Date().toDateString();

      if (dismissedDate === today) {
        setDismissed(true);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.rpc('get_todays_active_reminders', {
        p_user_id: user?.id
      });

      if (error) throw error;

      setReminders(data || []);
    } catch (error) {
      console.error('Error loading active reminders:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = () => {
    const today = new Date().toDateString();
    localStorage.setItem('reminders_dismissed_date', today);
    setDismissed(true);
  };

  const handleComplete = async (reminderId: string) => {
    const { error } = await supabase
      .from('invoice_reminders')
      .update({
        completed_at: new Date().toISOString(),
        completed_by_user_id: user?.id
      })
      .eq('id', reminderId);

    if (error) {
      console.error('Error completing reminder:', error);
      return;
    }

    setReminders(prev => prev.filter(r => r.id !== reminderId));

    await supabase.from('reminder_notifications').insert({
      reminder_id: reminderId,
      user_id: user?.id,
      notification_type: 'popup',
      dismissed_at: new Date().toISOString()
    });
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'text-red-400 bg-red-500/10 border-red-500';
      case 'high': return 'text-orange-400 bg-orange-500/10 border-orange-500';
      case 'medium': return 'text-yellow-400 bg-yellow-500/10 border-yellow-500';
      case 'low': return 'text-green-400 bg-green-500/10 border-green-500';
      default: return 'text-slate-400 bg-slate-500/10 border-slate-500';
    }
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const isOverdue = (dateString: string) => {
    return new Date(dateString) < new Date();
  };

  if (loading || dismissed || reminders.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 w-96 animate-slide-in-right">
      <div className="bg-slate-800 border-2 border-blue-500 rounded-lg shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-white/20 p-2 rounded-lg">
                <Bell className="w-5 h-5 text-white animate-pulse" />
              </div>
              <div>
                <h3 className="text-white font-bold text-lg">Active Reminders</h3>
                <p className="text-blue-100 text-sm">You have {reminders.length} reminder{reminders.length !== 1 ? 's' : ''} due</p>
              </div>
            </div>
            <button
              onClick={handleDismiss}
              className="text-white/80 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {reminders.slice(0, 5).map((reminder) => (
            <div
              key={reminder.id}
              className={`p-4 border-b border-slate-700 ${
                isOverdue(reminder.reminder_date) ? 'bg-red-500/5' : 'bg-slate-900/50'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-1 p-2 rounded-lg border ${getPriorityColor(reminder.priority)}`}>
                  {isOverdue(reminder.reminder_date) ? (
                    <AlertCircle className="w-4 h-4" />
                  ) : (
                    <Clock className="w-4 h-4" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-white font-medium text-sm line-clamp-2">
                    {reminder.title}
                  </h4>
                  {(reminder.invoice_reference || reminder.ticket_number || reminder.customer_name) && (
                    <div className="flex flex-wrap items-center gap-2 text-xs mt-1">
                      {reminder.invoice_reference && (
                        <button
                          onClick={() => navigate(`/customers?invoice=${reminder.invoice_reference}`)}
                          className="flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors"
                        >
                          Invoice: {reminder.invoice_reference}
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      )}
                      {reminder.ticket_number && (
                        <button
                          onClick={() => navigate(`/collection-ticketing?ticketId=${reminder.ticket_id}`)}
                          className="flex items-center gap-1 text-purple-400 hover:text-purple-300 transition-colors"
                        >
                          Ticket #{reminder.ticket_number}
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      )}
                      {reminder.customer_name && (
                        <span className="text-slate-400">{reminder.customer_name}</span>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`text-xs ${isOverdue(reminder.reminder_date) ? 'text-red-400 font-medium' : 'text-slate-400'}`}>
                      {isOverdue(reminder.reminder_date) ? 'Overdue' : formatTime(reminder.reminder_date)}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded border ${getPriorityColor(reminder.priority)}`}>
                      {reminder.priority}
                    </span>
                  </div>
                  {reminder.notes && (
                    <p className="text-slate-500 text-xs mt-2 line-clamp-2">{reminder.notes}</p>
                  )}
                  <button
                    onClick={() => handleComplete(reminder.id)}
                    className="mt-2 flex items-center gap-1 text-xs text-green-400 hover:text-green-300 transition-colors"
                  >
                    <CheckCircle className="w-3 h-3" />
                    Mark Complete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="p-3 bg-slate-900 border-t border-slate-700">
          <button
            onClick={onViewAll}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            View All Reminders
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
