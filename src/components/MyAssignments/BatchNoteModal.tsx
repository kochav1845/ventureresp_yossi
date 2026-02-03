interface BatchNoteModalProps {
  selectedCount: number;
  batchNote: string;
  createReminder: boolean;
  reminderDate: string;
  processingBatch: boolean;
  onBatchNoteChange: (note: string) => void;
  onCreateReminderChange: (value: boolean) => void;
  onReminderDateChange: (date: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

export default function BatchNoteModal({
  selectedCount,
  batchNote,
  createReminder,
  reminderDate,
  processingBatch,
  onBatchNoteChange,
  onCreateReminderChange,
  onReminderDateChange,
  onSubmit,
  onClose
}: BatchNoteModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">
            Add Note to {selectedCount} Invoice(s)
          </h2>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Note Text
            </label>
            <textarea
              value={batchNote}
              onChange={(e) => onBatchNoteChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={4}
              placeholder="Enter note to add to all selected invoices..."
            />
          </div>

          <div className="border-t border-gray-200 pt-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={createReminder}
                onChange={(e) => onCreateReminderChange(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">
                Also create a reminder for each invoice
              </span>
            </label>

            {createReminder && (
              <div className="mt-3 ml-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reminder Date
                </label>
                <input
                  type="datetime-local"
                  value={reminderDate}
                  onChange={(e) => onReminderDateChange(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={processingBatch}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={processingBatch || !batchNote.trim() || (createReminder && !reminderDate)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {processingBatch ? 'Adding...' : `Add Note to ${selectedCount} Invoice(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}
