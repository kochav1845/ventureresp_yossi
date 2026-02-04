import { ExternalLink, MessageSquare, CheckSquare, Square, Paperclip } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Assignment } from './types';
import { isPromiseBroken } from './utils';
import { getAcumaticaInvoiceUrl } from '../../lib/acumaticaLinks';
import ColorStatusPicker from './ColorStatusPicker';

interface IndividualInvoiceCardProps {
  invoice: Assignment;
  isSelected: boolean;
  showColorPicker: boolean;
  onToggleSelection: () => void;
  onColorChange: (color: string | null) => void;
  onToggleColorPicker: () => void;
  onOpenMemo: () => void;
}

export default function IndividualInvoiceCard({
  invoice,
  isSelected,
  showColorPicker,
  onToggleSelection,
  onColorChange,
  onToggleColorPicker,
  onOpenMemo
}: IndividualInvoiceCardProps) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
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
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <span className="font-mono font-semibold text-lg text-gray-900">
              Invoice #{invoice.invoice_reference_number}
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
          <h3 className="font-semibold text-gray-900 mb-1">
            {invoice.customer_name}
          </h3>
          <p className="text-sm text-gray-600 mb-3">
            Customer ID: {invoice.customer}
          </p>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Invoice Date</p>
              <p className="font-medium text-gray-900">
                {new Date(invoice.date).toLocaleDateString()}
              </p>
            </div>
            <div>
              <p className="text-gray-500">Due Date</p>
              <p className="font-medium text-gray-900">
                {new Date(invoice.due_date).toLocaleDateString()}
              </p>
            </div>
            <div>
              <p className="text-gray-500">Balance Due</p>
              <p className="font-bold text-red-600 text-lg">
                ${(invoice.balance ?? 0).toFixed(2)}
              </p>
            </div>
          </div>
          {invoice.assignment_notes && (
            <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-gray-700 italic">{invoice.assignment_notes}</p>
            </div>
          )}
          {invoice.memo_count && invoice.memo_count > 0 && (
            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="w-4 h-4 text-amber-600" />
                {invoice.has_attachments && (
                  <Paperclip className="w-4 h-4 text-amber-600" />
                )}
                <span className="font-semibold text-amber-900 text-sm">
                  {invoice.memo_count} Memo{invoice.memo_count !== 1 ? 's' : ''}
                  {invoice.has_attachments && ' (with attachment)'}
                </span>
              </div>
              {invoice.last_memo && (
                <div className="text-sm text-amber-800">
                  <p className="line-clamp-2">{invoice.last_memo.memo_text}</p>
                  <p className="text-xs text-amber-600 mt-1">
                    {formatDistanceToNow(new Date(invoice.last_memo.created_at), { addSuffix: true })}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
        <button
          onClick={onOpenMemo}
          className={`ml-4 p-2 rounded-lg transition-colors relative ${
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
  );
}
