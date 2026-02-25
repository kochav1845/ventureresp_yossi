import { RefreshCw, Check, AlertTriangle, Download, XCircle } from 'lucide-react';
import { ComparisonState, FetchState } from './types';

interface SyncCheckCellProps {
  comparison: ComparisonState | undefined;
  fetchState: FetchState | undefined;
  onCompare: () => void;
  onFetch: () => void;
}

export default function SyncCheckCell({ comparison, fetchState, onCompare, onFetch }: SyncCheckCellProps) {
  const handleCompare = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCompare();
  };

  const handleFetch = (e: React.MouseEvent) => {
    e.stopPropagation();
    onFetch();
  };

  if (fetchState?.loading) {
    return (
      <td className="px-3 py-3">
        <div className="flex flex-col items-center gap-1">
          <RefreshCw size={14} className="animate-spin text-blue-500" />
          <span className="text-xs text-blue-600 font-medium">Syncing...</span>
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
    const { acumaticaCount, dbCount, difference } = comparison.result;
    const inSync = difference === 0;
    const missing = difference > 0;

    return (
      <td className="px-3 py-3">
        <div className="flex flex-col items-center gap-1.5 min-w-[130px]">
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

          <div className="flex items-center gap-1.5">
            {missing && (
              <button
                onClick={handleFetch}
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-white bg-amber-500 rounded-md hover:bg-amber-600 transition-colors shadow-sm"
              >
                <Download size={10} />
                Fetch
              </button>
            )}
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
