import { Calendar, DollarSign, MessageSquare, ExternalLink, CheckSquare, Square } from 'lucide-react';
import { Assignment } from './types';
import { isPromiseBroken } from './utils';
import { getAcumaticaInvoiceUrl } from '../../lib/acumaticaLinks';
import ColorStatusPicker from './ColorStatusPicker';

interface InvoiceItemProps {
  invoice: Assignment;
  isSelected: boolean;
  showColorPicker: boolean;
  onToggleSelection: () => void;
  onColorChange: (color: string | null) => void;
  onToggleColorPicker: () => void;
  onOpenMemo: () => void;
}

export default function InvoiceItem({
  invoice,
  isSelected,
  showColorPicker,
  onToggleSelection,
  onColorChange,
  onToggleColorPicker,
  onOpenMemo
}: InvoiceItemProps) {
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
                {invoice.color_status ? (
                  <span className={`px-3 py-1 inline-flex text-xs leading-5 font-bold rounded-full uppercase cursor-pointer hover:opacity-80 transition-opacity ${
                    invoice.color_status === 'red' ? 'bg-red-500 text-white border-2 border-red-700' :
                    invoice.color_status === 'yellow' ? 'bg-yellow-400 text-gray-900 border-2 border-yellow-600' :
                    invoice.color_status === 'orange' ? 'bg-yellow-400 text-gray-900 border-2 border-yellow-600' :
                    invoice.color_status === 'green' ? 'bg-green-500 text-white border-2 border-green-700' :
                    'bg-gray-200 text-gray-700'
                  }`}>
                    {invoice.color_status}
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
          <div className="grid grid-cols-2 gap-3 text-sm text-gray-600">
            <div className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              <span>Due: {new Date(invoice.due_date).toLocaleDateString()}</span>
            </div>
            <div className="flex items-center gap-1">
              <DollarSign className="w-4 h-4" />
              <span>Balance: ${(invoice.balance ?? 0).toFixed(2)}</span>
            </div>
          </div>
        </div>
        <button
          onClick={onOpenMemo}
          className="ml-4 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          title="View/Add Notes"
        >
          <MessageSquare className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
