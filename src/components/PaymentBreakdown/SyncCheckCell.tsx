import { useState } from 'react';
import { RefreshCw, Check, AlertTriangle, Download, XCircle, Search, Wrench, X, StopCircle } from 'lucide-react';
import { ComparisonState, FetchState, VerifyState, formatCurrency } from './types';

interface SyncCheckCellProps {
  comparison: ComparisonState | undefined;
  fetchState: FetchState | undefined;
  verification: VerifyState | undefined;
  onCompare: () => void;
  onFetch: () => void;
  onVerify: (fix: boolean) => void;
  onCancel?: () => void;
  cellKey: string;
}

export default function SyncCheckCell({ comparison, fetchState, verification, onCompare, onFetch, onVerify, onCancel }: SyncCheckCellProps) {
  const [showVerifyDetail, setShowVerifyDetail] = useState(false);

  const handleCompare = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCompare();
  };

  const handleFetch = (e: React.MouseEvent) => {
    e.stopPropagation();
    onFetch();
  };

  const handleVerify = (e: React.MouseEvent, fix: boolean) => {
    e.stopPropagation();
    onVerify(fix);
  };

  const handleToggleDetail = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowVerifyDetail(!showVerifyDetail);
  };

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCancel?.();
  };

  if (fetchState?.loading) {
    const progress = fetchState.progress;
    const hasMissingInfo = progress && progress.missing !== undefined;
    const pct = progress && progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : null;
    const isAnalyzing = progress && progress.total === 0 && progress.totalInAcumatica !== undefined;

    return (
      <td className="px-3 py-3">
        <div className="flex flex-col items-center gap-1.5 min-w-[130px]">
          <RefreshCw size={14} className="animate-spin text-blue-500" />

          {isAnalyzing ? (
            <span className="text-xs text-blue-600 font-medium">All in sync</span>
          ) : hasMissingInfo && progress.total > 0 ? (
            <span className="text-xs text-blue-600 font-medium">
              Fetching {progress.missing} missing...
            </span>
          ) : (
            <span className="text-xs text-blue-600 font-medium">Syncing...</span>
          )}

          {hasMissingInfo && (
            <span className="text-[10px] text-gray-400">
              {progress.alreadyInDb} of {progress.totalInAcumatica} already synced
            </span>
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

  if (verification?.loading) {
    return (
      <td className="px-3 py-3">
        <div className="flex flex-col items-center gap-1">
          <Search size={14} className="animate-pulse text-teal-500" />
          <span className="text-xs text-teal-600 font-medium">Verifying...</span>
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
    const { acumaticaCount, dbCount, difference } = comparison.result;
    const inSync = difference === 0;
    const missing = difference > 0;
    const hasExtra = difference < 0;
    const verifyResult = verification?.result;

    return (
      <td className="px-3 py-3 relative">
        <div className="flex flex-col items-center gap-1.5 min-w-[130px]">
          {fetchState?.result && (
            <div className="text-[10px] text-emerald-700 font-medium bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              +{fetchState.result.created} new, ~{fetchState.result.updated} upd
            </div>
          )}

          {verifyResult && verifyResult.fixedPayments.length > 0 && (
            <div className="text-[10px] text-teal-700 font-medium bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
              Fixed {verifyResult.fixedPayments.length} stale dates
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

          {verifyResult && verifyResult.stalePayments.length > 0 && (
            <button
              onClick={handleToggleDetail}
              className="text-[10px] text-teal-600 hover:text-teal-800 font-medium underline"
            >
              {showVerifyDetail ? 'Hide' : 'Show'} {verifyResult.stalePayments.length} stale
            </button>
          )}

          {verifyResult && verifyResult.stalePayments.length === 0 && verifyResult.inDbNotAcumatica === 0 && (
            <div className="text-[10px] text-emerald-600 font-medium">
              Dates verified
            </div>
          )}

          <div className="flex items-center gap-1.5 flex-wrap justify-center">
            {missing && (
              <button
                onClick={handleFetch}
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-white bg-amber-500 rounded-md hover:bg-amber-600 transition-colors shadow-sm"
              >
                <Download size={10} />
                Fetch
              </button>
            )}
            {(hasExtra || !inSync) && (
              <button
                onClick={(e) => handleVerify(e, false)}
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-md hover:bg-teal-100 transition-colors"
                title="Check for stale/moved payment dates"
              >
                <Search size={10} />
                Verify
              </button>
            )}
            {verifyResult && verifyResult.stalePayments.length > 0 && (
              <button
                onClick={(e) => handleVerify(e, true)}
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-white bg-teal-600 rounded-md hover:bg-teal-700 transition-colors shadow-sm"
                title="Fix stale dates using Acumatica data"
              >
                <Wrench size={10} />
                Fix Dates
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

        {showVerifyDetail && verifyResult && verifyResult.stalePayments.length > 0 && (
          <div
            className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-xl p-3 min-w-[340px] max-h-[300px] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-gray-800">
                Stale Payments ({verifyResult.stalePayments.length})
              </h4>
              <button onClick={handleToggleDetail} className="text-gray-400 hover:text-gray-600">
                <X size={14} />
              </button>
            </div>
            <div className="text-[10px] text-gray-500 mb-2">
              These payments are in your DB for this date range but no longer in Acumatica for this range.
            </div>
            <div className="space-y-1.5">
              {verifyResult.stalePayments.map((p, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px] p-1.5 bg-gray-50 rounded border border-gray-100">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-800">#{p.reference_number} ({p.type})</div>
                    <div className="text-gray-500 truncate">{p.customer_name}</div>
                    <div className="text-gray-400">{formatCurrency(p.amount)}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-red-500 line-through">{p.db_date?.split('T')[0]}</div>
                    <div className="text-emerald-600 font-medium">
                      {p.acumatica_date ? p.acumatica_date.split('T')[0] : p.acumatica_status}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
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
