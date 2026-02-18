import { Calendar, DollarSign, MessageSquare, ExternalLink, CheckSquare, Square, Paperclip, Bell } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Assignment } from './types';
import { isPromiseBroken } from './utils';
import { getAcumaticaInvoiceUrl } from '../../lib/acumaticaLinks';
import ColorStatusPicker from './ColorStatusPicker';

interface ColorStatusOption {
  status_name: string;
  display_name: string;
  color_class: string;
}

interface InvoiceItemProps {
  invoice: Assignment;
  isSelected: boolean;
  showColorPicker: boolean;
  colorOptions?: ColorStatusOption[];
  onToggleSelection: () => void;
  onColorChange: (color: string | null) => void;
  onToggleColorPicker: () => void;
  onOpenMemo: () => void;
  onOpenReminder?: () => void;
}

export default function InvoiceItem({
  invoice,
  isSelected,
  showColorPicker,
  colorOptions = [],
  onToggleSelection,
  onColorChange,
  onToggleColorPicker,
  onOpenMemo,
  onOpenReminder
}: InvoiceItemProps) {
  const getColorDisplay = () => {
    if (!invoice.color_status) return null;

    const option = colorOptions.find(opt => opt.status_name === invoice.color_status);
    if (option) {
      const parts = option.color_class.split(' ');
      const bgColor = parts.find(p => p.startsWith('bg-')) || 'bg-gray-500';
      const borderColor = parts.find(p => p.startsWith('border-')) || 'border-gray-700';

      return {
        displayName: option.display_name,
        bgColor,
        borderColor
      };
    }

    // Fallback to old hardcoded values if option not found
    const fallbackMap: Record<string, { displayName: string; bgColor: string; borderColor: string }> = {
      'red': { displayName: 'Will Not Pay', bgColor: 'bg-red-500', borderColor: 'border-red-700' },
      'yellow': { displayName: 'Will Take Care', bgColor: 'bg-yellow-400', borderColor: 'border-yellow-600' },
      'orange': { displayName: 'Will Take Care', bgColor: 'bg-yellow-400', borderColor: 'border-yellow-600' },
      'green': { displayName: 'Will Pay', bgColor: 'bg-green-500', borderColor: 'border-green-700' }
    };

    return fallbackMap[invoice.color_status] || {
      displayName: invoice.color_status,
      bgColor: 'bg-gray-500',
      borderColor: 'border-gray-700'
    };
  };

  const colorDisplay = getColorDisplay();

  return (
    <div className="bg-white p-4 rounded-lg border border-gray-200 hover:border-blue-300 transition-colors">
      <div className="flex items-start justify-between">
        <button
          onClick={onToggleSelection}
          className="mr-3 mt-1 text-blue-600 hover:text-blue-800"
        >
          {isSelected ? (
            <CheckSquare className="w-5 h-5" />
          ) : (
            <Square className="w-5 h-5" />
          )}
        </button>

        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <span className="font-mono font-semibold text-gray-900">
              #{invoice.invoice_reference_number}
            </span>
            <a
              href={getAcumaticaInvoiceUrl(invoice.invoice_reference_number)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800"
              title="View in Acumatica"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
            <span className={`px-2 py-1 rounded text-xs font-medium ${
              invoice.invoice_status === 'Open'
                ? 'bg-green-100 text-green-800'
                : 'bg-gray-100 text-gray-800'
            }`}>
              {invoice.invoice_status}
            </span>
            {isPromiseBroken(invoice) && (
              <span className="px-2 py-1 rounded text-xs font-bold bg-red-600 text-white animate-pulse border-2 border-red-800 shadow-lg" title={`Promised payment date was ${new Date(invoice.promise_date!).toLocaleDateString()}`}>
                BROKEN PROMISE
              </span>
            )}
            <div className="relative color-picker-container">
              <button
                onClick={onToggleColorPicker}
                className="focus:outline-none"
              >
                {colorDisplay ? (
                  <span className={`px-3 py-1 inline-flex text-xs leading-5 font-bold rounded-full uppercase cursor-pointer hover:opacity-80 transition-opacity text-white border-2 ${colorDisplay.bgColor} ${colorDisplay.borderColor}`}>
                    {colorDisplay.displayName}
                  </span>
                ) : (
                  <span className="px-3 py-1 text-xs text-gray-400 cursor-pointer hover:text-gray-600 border border-gray-300 rounded-full">Set Status</span>
                )}
              </button>

              {showColorPicker && (
                <ColorStatusPicker
                  currentStatus={invoice.color_status}
                  onColorChange={onColorChange}
                  onClose={onToggleColorPicker}
                />
              )}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-sm text-gray-600">
            {invoice.date && (
              <div className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                <span>Inv: {new Date(invoice.date).toLocaleDateString()}</span>
              </div>
            )}
            <div className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              <span>Due: {new Date(invoice.due_date).toLocaleDateString()}</span>
            </div>
            <div className="flex items-center gap-1">
              <DollarSign className="w-4 h-4" />
              {invoice.amount !== invoice.balance ? (
                <span>
                  <span className="text-gray-500 line-through mr-1">${(invoice.amount ?? 0).toFixed(2)}</span>
                  <span className="font-semibold text-orange-600">${(invoice.balance ?? 0).toFixed(2)}</span>
                  <span className="ml-1 text-xs text-orange-600">(short-paid)</span>
                </span>
              ) : (
                <span>Balance: ${(invoice.balance ?? 0).toFixed(2)}</span>
              )}
            </div>
          </div>
          {invoice.memo_count && invoice.memo_count > 0 && (
            <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-3 h-3 text-amber-600" />
                {invoice.has_attachments && (
                  <Paperclip className="w-3 h-3 text-amber-600" />
                )}
                <span className="font-semibold text-amber-900">
                  {invoice.memo_count} Memo{invoice.memo_count !== 1 ? 's' : ''}
                </span>
              </div>
              {invoice.last_memo && (
                <div className="mt-1 text-amber-800">
                  <p className="line-clamp-1">{invoice.last_memo.memo_text}</p>
                  <p className="text-amber-600 mt-0.5">
                    {formatDistanceToNow(new Date(invoice.last_memo.created_at), { addSuffix: true })}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-2 ml-4">
          {onOpenReminder && (
            <button
              onClick={onOpenReminder}
              className="p-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              title="Set Reminder"
            >
              <Bell className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={onOpenMemo}
            className={`p-2 rounded-lg transition-colors relative ${
              invoice.memo_count && invoice.memo_count > 0
                ? 'bg-amber-600 text-white hover:bg-amber-700'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
            title="View/Add Notes"
          >
            <MessageSquare className="w-5 h-5" />
            {invoice.memo_count && invoice.memo_count > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                {invoice.memo_count}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
