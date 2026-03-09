import { useState } from 'react';
import { Edit3, AlertTriangle, X, ChevronDown } from 'lucide-react';
import { TicketStatusOption } from './types';

interface TicketBatchActionToolbarProps {
  selectedCount: number;
  totalCount: number;
  statusOptions: TicketStatusOption[];
  processing: boolean;
  onToggleSelectAll: () => void;
  onClearSelection: () => void;
  onBatchStatusChange: (newStatus: string) => void;
  onBatchPriorityChange: (newPriority: string) => void;
}

const priorityOptions = [
  { value: 'urgent', label: 'Urgent', color: 'bg-red-500' },
  { value: 'high', label: 'High', color: 'bg-orange-500' },
  { value: 'medium', label: 'Medium', color: 'bg-yellow-500' },
  { value: 'low', label: 'Low', color: 'bg-green-500' },
];

export default function TicketBatchActionToolbar({
  selectedCount,
  totalCount,
  statusOptions,
  processing,
  onToggleSelectAll,
  onClearSelection,
  onBatchStatusChange,
  onBatchPriorityChange
}: TicketBatchActionToolbarProps) {
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showPriorityMenu, setShowPriorityMenu] = useState(false);

  if (selectedCount === 0) {
    return (
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={onToggleSelectAll}
          className="px-3 py-1.5 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Select All Tickets ({totalCount})
        </button>
      </div>
    );
  }

  return (
    <div className="mb-4 bg-blue-50 border-2 border-blue-300 rounded-lg p-4 sticky top-0 z-10">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <span className="font-semibold text-blue-900">
            {selectedCount} ticket{selectedCount !== 1 ? 's' : ''} selected
          </span>
          <button
            onClick={onToggleSelectAll}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            {selectedCount === totalCount ? 'Deselect All' : 'Select All'}
          </button>
          <button
            onClick={onClearSelection}
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            <X className="w-3.5 h-3.5" />
            Clear
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <button
              onClick={() => { setShowStatusMenu(!showStatusMenu); setShowPriorityMenu(false); }}
              disabled={processing}
              className="px-4 py-2 bg-white border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 font-medium flex items-center gap-2 disabled:opacity-50 text-sm"
            >
              <Edit3 className="w-4 h-4" />
              Change Status
              <ChevronDown className="w-3.5 h-3.5" />
            </button>

            {showStatusMenu && (
              <div className="absolute right-0 mt-2 bg-white rounded-lg shadow-xl border border-gray-200 p-2 min-w-[200px] z-50">
                {statusOptions.map((option) => {
                  const parts = option.color_class.split(' ');
                  const bgColor = parts.find(p => p.startsWith('bg-')) || 'bg-gray-500';
                  return (
                    <button
                      key={option.status_name}
                      onClick={() => {
                        onBatchStatusChange(option.status_name);
                        setShowStatusMenu(false);
                      }}
                      disabled={processing}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 rounded flex items-center gap-2 disabled:opacity-50"
                    >
                      <span className={`w-3 h-3 rounded-full ${bgColor}`}></span>
                      {option.display_name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="relative">
            <button
              onClick={() => { setShowPriorityMenu(!showPriorityMenu); setShowStatusMenu(false); }}
              disabled={processing}
              className="px-4 py-2 bg-white border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 font-medium flex items-center gap-2 disabled:opacity-50 text-sm"
            >
              <AlertTriangle className="w-4 h-4" />
              Change Priority
              <ChevronDown className="w-3.5 h-3.5" />
            </button>

            {showPriorityMenu && (
              <div className="absolute right-0 mt-2 bg-white rounded-lg shadow-xl border border-gray-200 p-2 min-w-[180px] z-50">
                {priorityOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => {
                      onBatchPriorityChange(option.value);
                      setShowPriorityMenu(false);
                    }}
                    disabled={processing}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 rounded flex items-center gap-2 disabled:opacity-50"
                  >
                    <span className={`w-3 h-3 rounded-full ${option.color}`}></span>
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {processing && (
        <div className="mt-3 flex items-center gap-2 text-sm text-blue-700">
          <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          Updating tickets...
        </div>
      )}
    </div>
  );
}
