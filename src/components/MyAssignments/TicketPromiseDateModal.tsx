import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Calendar, Bell } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface TicketPromiseDateModalProps {
  ticketId: string;
  ticketNumber: string;
  customerName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function TicketPromiseDateModal({
  ticketId,
  ticketNumber,
  customerName,
  onClose,
  onSuccess
}: TicketPromiseDateModalProps) {
  const navigate = useNavigate();
  const [promiseDate, setPromiseDate] = useState('');
  const [createReminder, setCreateReminder] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!promiseDate) {
      setError('Please select a promise date');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error: ticketError } = await supabase
        .from('collection_tickets')
        .update({
          promise_date: promiseDate,
          promise_by_user_id: user.id,
          status: 'promised'
        })
        .eq('id', ticketId);

      if (ticketError) throw ticketError;

      // Log the promise date activity
      await supabase
        .from('ticket_activity_log')
        .insert({
          ticket_id: ticketId,
          activity_type: 'note',
          description: `Promise date set to ${new Date(promiseDate).toLocaleDateString()} - Customer promised to pay off ticket`,
          created_by: user.id,
          metadata: {
            promise_date: promiseDate,
            customer_name: customerName
          }
        });

      onClose();

      if (createReminder) {
        // Navigate immediately - don't call onSuccess to avoid page reload
        navigate('/reminders', {
          state: {
            createReminder: true,
            ticketId: ticketId,
            ticketNumber: ticketNumber,
            customerName: customerName,
            promiseDate: promiseDate
          }
        });
      } else {
        // Only trigger success callback if we're staying on the page
        onSuccess();
      }
    } catch (err) {
      console.error('Error saving promise date:', err);
      setError(err instanceof Error ? err.message : 'Failed to save promise date');
    } finally {
      setSaving(false);
    }
  };

  const minDate = new Date().toISOString().split('T')[0];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Set Promise Date</h2>
            <p className="text-sm text-gray-600 mt-1">Ticket #{ticketNumber}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-900">
              <strong>{customerName}</strong> has promised to pay off this ticket
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
              <Calendar className="w-4 h-4" />
              Promise Payment Date
            </label>
            <input
              type="date"
              value={promiseDate}
              onChange={(e) => setPromiseDate(e.target.value)}
              min={minDate}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              When did the customer promise to pay?
            </p>
          </div>

          <div className="border-t pt-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={createReminder}
                onChange={(e) => setCreateReminder(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <Bell className="w-4 h-4 text-gray-600" />
              <span className="text-sm font-medium text-gray-700">
                Open reminders page to create a follow-up reminder
              </span>
            </label>
            {createReminder && (
              <p className="text-xs text-gray-500 mt-2 ml-6">
                You'll be taken to the reminders page where you can add notes and customize the reminder
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 p-6 border-t bg-gray-50">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !promiseDate}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Promise Date'}
          </button>
        </div>
      </div>
    </div>
  );
}
