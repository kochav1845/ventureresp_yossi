import { useState } from 'react';
import { X, AlertCircle } from 'lucide-react';

interface TicketStatusChangeModalProps {
  ticketId: string;
  ticketNumber: string;
  currentStatus: string;
  newStatus: string;
  currentStatusDisplay?: string;
  newStatusDisplay?: string;
  onConfirm: (note: string) => void;
  onCancel: () => void;
}

export default function TicketStatusChangeModal({
  ticketNumber,
  currentStatus,
  newStatus,
  currentStatusDisplay,
  newStatusDisplay,
  onConfirm,
  onCancel
}: TicketStatusChangeModalProps) {
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const handleConfirm = () => {
    if (!note.trim()) {
      setError('Please provide a reason for changing the status');
      return;
    }

    onConfirm(note);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-6 h-6 text-orange-600" />
            <h2 className="text-xl font-bold text-gray-900">Status Change Required Note</h2>
          </div>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-gray-700">
              <span className="font-semibold">Ticket:</span> {ticketNumber}
            </p>
            <p className="text-sm text-gray-700 mt-1">
              <span className="font-semibold">Status Change:</span>{' '}
              <span className="text-gray-600">{currentStatusDisplay || currentStatus}</span>
              {' → '}
              <span className="text-blue-600 font-semibold">{newStatusDisplay || newStatus}</span>
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Reason for Status Change <span className="text-red-600">*</span>
            </label>
            <textarea
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                setError('');
              }}
              placeholder="Please explain why you are changing the status..."
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none ${
                error ? 'border-red-500' : 'border-gray-300'
              }`}
              rows={4}
              autoFocus
            />
            {error && (
              <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
                <AlertCircle size={14} />
                {error}
              </p>
            )}
          </div>

          <div className="flex items-center gap-3 pt-4">
            <button
              onClick={handleConfirm}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
            >
              Confirm Status Change
            </button>
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
