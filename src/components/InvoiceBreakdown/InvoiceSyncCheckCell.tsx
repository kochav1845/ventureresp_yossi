import { useState } from 'react';
import { RefreshCw, Check, AlertTriangle, Download, XCircle, StopCircle } from 'lucide-react';
import { ComparisonState, FetchState, INVOICE_TYPE_CONFIG, formatNumber } from './types';

interface InvoiceSyncCheckCellProps {
  comparison: ComparisonState | undefined;
  fetchState: FetchState | undefined;
  onCompare: () => void;
  onFetch: () => void;
  onCancel?: () => void;
  cellKey: string;
}

export default function InvoiceSyncCheckCell({ comparison, fetchState, onCompare, onFetch, onCancel }: InvoiceSyncCheckCellProps) {
  const [showTypeBreakdown, setShowTypeBreakdown] = useState(true);

  const handleCompare = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCompare();
  };

  const handleFetch = (e: React.MouseEvent) => {
    e.stopPropagation();
    onFetch();
  };

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCancel?.();
  };

  if (fetchState?.loading) {
    const progress = fetchState.progress;
    const pct = progress && progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : null;

    return (
      <td className="px-3 py-3">
        <div className="flex flex-col items-center gap-1.5 min-w-[130px]">
          <RefreshCw size={14} className="animate-spin text-blue-500" />
          {progress && progress.total > 0 ? (
            <span className="text-xs text-blue-600 font-medium">
              Syncing {formatNumber(progress.total)} invoices...
            </span>
          ) : (
            <span className="text-xs text-blue-600 font-medium">Syncing...</span>
          )}
          {progress && progress.total > 0 && (
            <>
              <div className="w-full max-w-[100px] bg-gray-200 rounded-full h-1.5">
                <div
                  className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-[10px] text-gray-500 tabular-nums">
                {progress.current}/{progress.total} ({pct}%)
              </span>
            </>
          )}
          {onCancel && (
            <button
              onClick={handleCancel}
              className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-red-600 bg-red-50 border border-red-200 rounded hover:bg-red-100 transition-colors"
            >
              <StopCircle size={10} />
              Cancel
            </button>
          )}
        </div>
      </td>
    );
  }

  if (comparison?.loading) {
    return (
      <td className="px-3 py-3">
        <div className="flex flex-col items-center gap-1">
          <RefreshCw size={14} className="animate-spin text-gray-400" />
          <span className="text-xs text-gray-500">Checking...</span>
        </div>
      </td>
    );
  }

  if (fetchState?.error) {
    return (
      <td className="px-3 py-3">
        <div className="flex flex-col items-center gap-1">
          <XCircle size={14} className="text-red-400" />
          <span className="text-xs text-red-500 max-w-[120px] text-center" title={fetchState.error}>
            {fetchState.error === 'Cancelled' ? 'Cancelled' : 'Sync error'}
          </span>
          <button
            onClick={handleFetch}
            className="text-[10px] text-blue-600 hover:text-blue-800 font-medium"
          >
            Retry
          </button>
        </div>
      </td>
    );
  }

  if (comparison?.error) {
    return (
      <td className="px-3 py-3">
        <div className="flex flex-col items-center gap-1">
          <XCircle size={14} className="text-red-400" />
          <span className="text-xs text-red-500 max-w-[100px] truncate" title={comparison.error}>
            Error
          </span>
          <button
            onClick={handleCompare}
            className="text-[10px] text-blue-600 hover:text-blue-800 font-medium"
          >
            Retry
          </button>
        </div>
      </td>
    );
  }

  if (comparison?.result) {
    const { acumaticaCount, dbCount, difference, byType } = comparison.result;
    const inSync = difference === 0;
    const missing = difference > 0;

    const typeOrder = ['Invoice', 'Credit Memo', 'Debit Memo', 'Credit WO', 'Overdue Charge'];
    const typeEntries = Object.entries(byType || {})
      .sort((a, b) => {
        const ai = typeOrder.indexOf(a[0]);
        const bi = typeOrder.indexOf(b[0]);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });

    return (
      <td className="px-3 py-3 relative">
        <div className="flex flex-col items-center gap-1.5 min-w-[180px]">
          {fetchState?.result && (
            <div className="text-[10px] text-emerald-700 font-medium bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              +{fetchState.result.created} new, ~{fetchState.result.updated} upd
            </div>
          )}

          {inSync ? (
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
                <Check size={12} className="text-emerald-600" />
              </div>
              <span className="text-xs font-semibold text-emerald-600">In Sync</span>
            </div>
          ) : missing ? (
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center">
                <AlertTriangle size={12} className="text-amber-600" />
              </div>
              <span className="text-xs font-semibold text-amber-600">Missing {difference}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center">
                <AlertTriangle size={12} className="text-blue-600" />
              </div>
              <span className="text-xs font-semibold text-blue-600">+{Math.abs(difference)} extra</span>
            </div>
          )}

          <div className="text-[10px] text-gray-400 leading-tight text-center">
            Acumatica: {acumaticaCount} | DB: {dbCount}
          </div>

          {typeEntries.length > 0 && (
            <div className="w-full">
              <button
                onClick={(e) => { e.stopPropagation(); setShowTypeBreakdown(!showTypeBreakdown); }}
                className="text-[10px] text-gray-500 hover:text-blue-600 font-medium mb-1 w-full text-center"
              >
                {showTypeBreakdown ? 'Hide' : 'Show'} type breakdown
              </button>
              {showTypeBreakdown && (
                <div className="space-y-0.5 w-full">
                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 text-[9px] font-semibold text-gray-400 uppercase tracking-wider px-1 pb-0.5 border-b border-gray-100">
                    <span>Type</span>
                    <span className="text-right">Acum</span>
                    <span className="text-right">DB</span>
                    <span className="text-right">Diff</span>
                  </div>
                  {typeEntries.map(([typeName, counts]) => {
                    const config = INVOICE_TYPE_CONFIG[typeName];
                    const typeInSync = counts.difference === 0;
                    const typeMissing = counts.difference > 0;
                    return (
                      <div
                        key={typeName}
                        className={`grid grid-cols-[1fr_auto_auto_auto] gap-x-2 text-[10px] px-1 py-0.5 rounded ${
                          !typeInSync ? 'bg-amber-50/60' : ''
                        }`}
                      >
                        <span
                          className="font-medium truncate"
                          style={{ color: config?.color || '#6b7280' }}
                          title={typeName}
                        >
                          {config?.label || typeName}
                        </span>
                        <span className="text-right tabular-nums text-gray-600">{counts.acumatica}</span>
                        <span className="text-right tabular-nums text-gray-600">{counts.db}</span>
                        <span className={`text-right tabular-nums font-semibold ${
                          typeInSync ? 'text-emerald-600' : typeMissing ? 'text-amber-600' : 'text-blue-600'
                        }`}>
                          {typeInSync ? '0' : typeMissing ? `-${counts.difference}` : `+${Math.abs(counts.difference)}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-1.5 flex-wrap justify-center">
            <button
              onClick={handleFetch}
              className={`flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded-md transition-colors shadow-sm ${
                !inSync
                  ? 'text-white bg-amber-500 hover:bg-amber-600'
                  : 'text-gray-600 bg-gray-100 hover:bg-gray-200'
              }`}
            >
              <Download size={10} />
              Fetch
            </button>
            <button
              onClick={handleCompare}
              className="px-2 py-1 text-[10px] text-gray-400 hover:text-blue-600 font-medium transition-colors rounded-md hover:bg-gray-100"
            >
              Re-check
            </button>
          </div>
        </div>
      </td>
    );
  }

  return (
    <td className="px-3 py-3 text-center">
      <button
        onClick={handleCompare}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
      >
        <RefreshCw size={12} />
        Compare
      </button>
    </td>
  );
}
