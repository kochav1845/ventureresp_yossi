import { Edit3, MessageSquare } from 'lucide-react';

interface BatchActionToolbarProps {
  selectedCount: number;
  showBatchColorMenu: boolean;
  processingBatch: boolean;
  onClearSelection: () => void;
  onToggleBatchColorMenu: () => void;
  onBatchColorChange: (color: string | null) => void;
  onOpenBatchNoteModal: () => void;
}

export default function BatchActionToolbar({
  selectedCount,
  showBatchColorMenu,
  processingBatch,
  onClearSelection,
  onToggleBatchColorMenu,
  onBatchColorChange,
  onOpenBatchNoteModal
}: BatchActionToolbarProps) {
  return (
    <div className="mb-6 bg-blue-50 border-2 border-blue-300 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="font-semibold text-blue-900">
            {selectedCount} invoice(s) selected
          </span>
          <button
            onClick={onClearSelection}
            className="text-sm text-blue-600 hover:text-blue-800 underline"
          >
            Clear Selection
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <button
              onClick={onToggleBatchColorMenu}
              disabled={processingBatch}
              className="batch-color-trigger px-4 py-2 bg-white border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 font-medium flex items-center gap-2 disabled:opacity-50"
            >
              <Edit3 className="w-4 h-4" />
              Change Status
            </button>

            {showBatchColorMenu && (
              <div className="batch-color-menu absolute right-0 mt-2 bg-white rounded-lg shadow-xl border border-gray-200 p-2 min-w-[180px] z-50">
                <button
                  onClick={() => onBatchColorChange('red')}
                  disabled={processingBatch}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 rounded flex items-center gap-2 disabled:opacity-50"
                >
                  <span className="w-4 h-4 rounded-full bg-red-500 border-2 border-red-700"></span>
                  Will Not Pay
                </button>
                <button
                  onClick={() => onBatchColorChange('yellow')}
                  disabled={processingBatch}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-yellow-50 rounded flex items-center gap-2 disabled:opacity-50"
                >
                  <span className="w-4 h-4 rounded-full bg-yellow-400 border-2 border-yellow-600"></span>
                  Will Take Care
                </button>
                <button
                  onClick={() => onBatchColorChange('green')}
                  disabled={processingBatch}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-green-50 rounded flex items-center gap-2 disabled:opacity-50"
                >
                  <span className="w-4 h-4 rounded-full bg-green-500 border-2 border-green-700"></span>
                  Will Pay
                </button>
                <div className="border-t border-gray-200 my-1"></div>
                <button
                  onClick={() => onBatchColorChange(null)}
                  disabled={processingBatch}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 rounded text-gray-600 disabled:opacity-50"
                >
                  Clear Status
                </button>
              </div>
            )}
          </div>

          <button
            onClick={onOpenBatchNoteModal}
            disabled={processingBatch}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2 disabled:opacity-50"
          >
            <MessageSquare className="w-4 h-4" />
            Add Note
          </button>
        </div>
      </div>
    </div>
  );
}
