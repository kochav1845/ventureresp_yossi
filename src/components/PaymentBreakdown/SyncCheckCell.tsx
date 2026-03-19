import { useState } from 'react';
import { RefreshCw, Check, AlertTriangle, Download, XCircle, Search, Wrench, X, StopCircle, Trash2 } from 'lucide-react';
import { ComparisonState, FetchState, VerifyState, PAYMENT_TYPE_CONFIG, formatCurrency } from './types';

interface SyncCheckCellProps {
  comparison: ComparisonState | undefined;
  fetchState: FetchState | undefined;
  verification: VerifyState | undefined;
  onCompare: () => void;
  onFetch: () => void;
  onVerify: (fix: boolean) => void;
  onCancel?: () => void;
  onDeletePayment?: (referenceNumber: string, type: string) => Promise<void>;
  onDeleteAllExtra?: (payments: { reference_number: string; type: string }[]) => Promise<void>;
  cellKey: string;
}

export default function SyncCheckCell({ comparison, fetchState, verification, onCompare, onFetch, onVerify, onCancel, onDeletePayment, onDeleteAllExtra }: SyncCheckCellProps) {
  const [showVerifyDetail, setShowVerifyDetail] = useState(false);
  const [showTypeBreakdown, setShowTypeBreakdown] = useState(true);
  const [deletingPayments, setDeletingPayments] = useState<Set<string>>(new Set());
  const [deletingAll, setDeletingAll] = useState(false);

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

  const handleDeletePayment = async (e: React.MouseEvent, referenceNumber: string, type: string) => {
    e.stopPropagation();
    if (!onDeletePayment) return;
    const key = `${type}:${referenceNumber}`;
    setDeletingPayments(prev => new Set(prev).add(key));
    try {
      await onDeletePayment(referenceNumber, type);
    } finally {
      setDeletingPayments(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const handleDeleteAllExtra = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onDeleteAllExtra || !verification?.result) return;
    const notFound = verification.result.stalePayments.filter(
      p => !p.acumatica_date && p.acumatica_status === 'NOT FOUND IN ACUMATICA'
    );
    if (notFound.length === 0) return;
    setDeletingAll(true);
    try {
      await onDeleteAllExtra(notFound.map(p => ({ reference_number: p.reference_number, type: p.type })));
    } finally {
      setDeletingAll(false);
    }
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
    const { acumaticaCount, dbCount, difference, byType } = comparison.result;
    const inSync = difference === 0;
    const missing = difference > 0;
    const hasExtra = difference < 0;
    const verifyResult = verification?.result;

    const typeEntries = Object.entries(byType || {}).sort((a, b) => {
      const order = ['Payment', 'Prepayment', 'Credit Memo', 'Voided Payment', 'Voided Check', 'Refund', 'Balance WO'];
      return (order.indexOf(a[0]) === -1 ? 99 : order.indexOf(a[0])) - (order.indexOf(b[0]) === -1 ? 99 : order.indexOf(b[0]));
    });

    return (
      <td className="px-3 py-3 relative">
        <div className="flex flex-col items-center gap-1.5 min-w-[180px]">
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
                    const config = PAYMENT_TYPE_CONFIG[typeName];
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
              onClick={(e) => handleVerify(e, false)}
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-md hover:bg-teal-100 transition-colors"
              title="Check for stale/moved payment dates"
            >
              <Search size={10} />
              Verify
            </button>
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
            className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-xl p-3 min-w-[380px] max-h-[400px] overflow-y-auto"
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

            {(() => {
              const notFoundPayments = verifyResult.stalePayments.filter(
                p => !p.acumatica_date && p.acumatica_status === 'NOT FOUND IN ACUMATICA'
              );
              return notFoundPayments.length > 1 && onDeleteAllExtra ? (
                <button
                  onClick={handleDeleteAllExtra}
                  disabled={deletingAll}
                  className="flex items-center gap-1 w-full px-2 py-1.5 mb-2 text-[10px] font-semibold text-white bg-red-500 rounded-md hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed justify-center"
                >
                  {deletingAll ? (
                    <RefreshCw size={10} className="animate-spin" />
                  ) : (
                    <Trash2 size={10} />
                  )}
                  {deletingAll ? 'Deleting...' : `Delete All ${notFoundPayments.length} Not Found in Acumatica`}
                </button>
              ) : null;
            })()}

            <div className="space-y-1.5">
              {verifyResult.stalePayments.map((p, i) => {
                const isNotFound = !p.acumatica_date && p.acumatica_status === 'NOT FOUND IN ACUMATICA';
                const deleteKey = `${p.type}:${p.reference_number}`;
                const isDeleting = deletingPayments.has(deleteKey);
                return (
                  <div key={i} className={`flex items-start gap-2 text-[11px] p-1.5 rounded border ${
                    isNotFound ? 'bg-red-50/50 border-red-200' : 'bg-gray-50 border-gray-100'
                  }`}>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-800">#{p.reference_number} ({p.type})</div>
                      <div className="text-gray-500 truncate">{p.customer_name}</div>
                      <div className="text-gray-400">{formatCurrency(p.amount)}</div>
                    </div>
                    <div className="text-right shrink-0 flex flex-col items-end gap-1">
                      <div className="text-red-500 line-through">{p.db_date?.split('T')[0]}</div>
                      <div className={`font-medium ${p.acumatica_date ? 'text-emerald-600' : 'text-red-600'}`}>
                        {p.acumatica_date ? p.acumatica_date.split('T')[0] : p.acumatica_status}
                      </div>
                      {isNotFound && onDeletePayment && (
                        <button
                          onClick={(e) => handleDeletePayment(e, p.reference_number, p.type)}
                          disabled={isDeleting || deletingAll}
                          className="flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-semibold text-red-700 bg-red-100 border border-red-300 rounded hover:bg-red-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isDeleting ? (
                            <RefreshCw size={8} className="animate-spin" />
                          ) : (
                            <Trash2 size={8} />
                          )}
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
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
