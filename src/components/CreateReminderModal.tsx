import { useState } from 'react';
import { X, Clock, Calendar, FileText } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface CreateReminderModalProps {
  type: 'ticket' | 'invoice';
  ticketId?: string;
  ticketNumber?: string;
  invoiceReference?: string;
  customerName?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateReminderModal({
  type,
  ticketId,
  ticketNumber,
  invoiceReference,
  customerName,
  onClose,
  onSuccess
}: CreateReminderModalProps) {
  const { profile } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [reminderDate, setReminderDate] = useState('');
  const [reminderTime, setReminderTime] = useState('09:00');
  const [sendEmail, setSendEmail] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!profile?.id || !reminderDate || !title.trim()) {
      alert('Please fill in all required fields');
      return;
    }

    setLoading(true);
    try {
      const reminderDateTime = new Date(`${reminderDate}T${reminderTime}`);

      const reminderData: any = {
        user_id: profile.id,
        reminder_date: reminderDateTime.toISOString(),
        title: title.trim(),
        description: description.trim() || null,
        send_email_notification: sendEmail,
        status: 'pending'
      };

      if (type === 'ticket' && ticketId) {
        reminderData.ticket_id = ticketId;
      }

      if (invoiceReference) {
        reminderData.invoice_reference_number = invoiceReference;
      }

      const { error } = await supabase
        .from('invoice_reminders')
        .insert(reminderData);

      if (error) throw error;

      alert('Reminder created successfully!');
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error creating reminder:', error);
      alert('Failed to create reminder: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Clock className="w-6 h-6 text-blue-600" />
              Create Reminder
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {type === 'ticket'
                ? `Ticket ${ticketNumber} - ${customerName}`
                : `Invoice ${invoiceReference} - ${customerName}`
              }
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={type === 'ticket'
                ? `Follow up on ticket ${ticketNumber}`
                : `Follow up on invoice ${invoiceReference}`
              }
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description (Optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add notes about why you're setting this reminder..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Reminder Date *
              </label>
              <input
                type="date"
                value={reminderDate}
                onChange={(e) => setReminderDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Time
              </label>
              <input
                type="time"
                value={reminderTime}
                onChange={(e) => setReminderTime(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <input
              type="checkbox"
              id="sendEmail"
              checked={sendEmail}
              onChange={(e) => setSendEmail(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <label htmlFor="sendEmail" className="text-sm text-gray-700 cursor-pointer">
              Send me an email notification at the reminder time
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !reminderDate || !title.trim()}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Creating...' : 'Create Reminder'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
