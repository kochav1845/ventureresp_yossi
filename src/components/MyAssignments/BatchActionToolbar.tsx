import { useState, useEffect } from 'react';
import { Edit3, MessageSquare } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface ColorStatusOption {
  status_name: string;
  display_name: string;
  color_class: string;
}

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
  const [colorOptions, setColorOptions] = useState<ColorStatusOption[]>([]);

  useEffect(() => {
    loadColorOptions();
  }, []);

  const loadColorOptions = async () => {
    try {
      const { data, error } = await supabase
        .from('invoice_color_status_options')
        .select('status_name, display_name, color_class')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      setColorOptions(data || []);
    } catch (error) {
      console.error('Error loading color options:', error);
    }
  };

  const getColorClasses = (colorClass: string) => {
    const parts = colorClass.split(' ');
    const bgColor = parts.find(p => p.startsWith('bg-')) || 'bg-gray-500';
    const borderColor = parts.find(p => p.startsWith('border-')) || 'border-gray-700';
    const hoverBg = bgColor.replace('bg-', 'hover:bg-').replace(/(-\d+)$/, '-50');
    return { bgColor, borderColor, hoverBg };
  };

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
                {colorOptions.map((option) => {
                  const { bgColor, borderColor } = getColorClasses(option.color_class);
                  return (
                    <button
                      key={option.status_name}
                      onClick={() => onBatchColorChange(option.status_name)}
                      disabled={processingBatch}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 rounded flex items-center gap-2 disabled:opacity-50"
                    >
                      <span className={`w-4 h-4 rounded-full ${bgColor} border-2 ${borderColor}`}></span>
                      {option.display_name}
                    </button>
                  );
                })}
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
