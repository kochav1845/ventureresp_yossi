import { useState } from 'react';
import { RefreshCw, Check, AlertTriangle, Download, XCircle, StopCircle, Trash2, Search, X } from 'lucide-react';
import { ComparisonState, FetchState, VerificationState, INVOICE_TYPE_CONFIG, formatNumber, formatCurrency } from './types';

interface InvoiceSyncCheckCellProps {
  comparison: ComparisonState | undefined;
  fetchState: FetchState | undefined;
  verification: VerificationState | undefined;
  onCompare: () => void;
  onFetch: () => void;
  onCancel?: () => void;
  onVerify?: (deleteExtras: boolean) => void;
  onDeleteInvoice?: (referenceNumber: string, type: string) => Promise<void>;
  onDeleteAllExtra?: (invoices: { reference_number: string; type: string }[]) => Promise<void>;
  cellKey: string;
}

export default function InvoiceSyncCheckCell({
  comparison, fetchState, verification,
  onCompare, onFetch, onCancel, onVerify,
  onDeleteInvoice, onDeleteAllExtra,
}: InvoiceSyncCheckCellProps) {
  const [showTypeBreakdown, setShowTypeBreakdown] = useState(true);
  const [showExtrasDetail, setShowExtrasDetail] = useState(false);
  const [deletingInvoices, setDeletingInvoices] = useState<Set<string>>(new Set());
  const [deletingAll, setDeletingAll] = useState(false);

  const handleCompare = (e: React.MouseEvent) => { e.stopPropagation(); onCompare(); };
  const handleFetch = (e: React.MouseEvent) => { e.stopPropagation(); onFetch(); };
  const handleCancel = (e: React.MouseEvent) => { e.stopPropagation(); onCancel?.(); };

  const handleVerify = (e: React.MouseEvent, deleteExtras: boolean) => {
    e.stopPropagation();
    onVerify?.(deleteExtras);
  };

  const handleToggleDetail = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowExtrasDetail(!showExtrasDetail);
  };

  const handleDeleteInvoice = async (e: React.MouseEvent, referenceNumber: string, type: string) => {
    e.stopPropagation();
    if (!onDeleteInvoice) return;
    const key = `${type}:${referenceNumber}`;
    setDeletingInvoices(prev => new Set(prev).add(key));
    try {
      await onDeleteInvoice(referenceNumber, type);
    } finally {
      setDeletingInvoices(prev => { const n = new Set(prev); n.delete(key); return n; });
    }
  };

  const handleDeleteAllExtra = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onDeleteAllExtra || !verification?.result) return;
    const extras = verification.result.extras;
    if (extras.length === 0) return;
    setDeletingAll(true);
    try {
      await onDeleteAllExtra(extras.map(inv => ({ reference_number: inv.reference_number, type: inv.type })));
    } finally {
      setDeletingAll(false);
    }
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

  if (verification?.loading) {
    const isDeleteMode = verification.mode === 'delete';
    return (
      <td className="px-3 py-3">
        <div className="flex flex-col items-center gap-1">
          {isDeleteMode ? (
            <Trash2 size={14} className="animate-pulse text-red-500" />
          ) : (
            <Search size={14} className="animate-pulse text-teal-500" />
          )}
          <span className={`text-xs font-medium ${isDeleteMode ? 'text-red-600' : 'text-teal-600'}`}>
            {isDeleteMode ? 'Deleting extras...' : 'Finding extras...'}
          </span>
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
          <button onClick={handleFetch} className="text-[10px] text-blue-600 hover:text-blue-800 font-medium">
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
          <span className="text-xs text-red-500 max-w-[100px] truncate" title={comparison.error}>Error</span>
          <button onClick={handleCompare} className="text-[10px] text-blue-600 hover:text-blue-800 font-medium">
            Retry
          </button>
        </div>
      </td>
    );
  }

  if (comparison?.result) {
    const { acumaticaCount, dbCount, difference, byType, trulyMissing, extrasInDb, dbTotalForRange } = comparison.result;
    const actualMissing = trulyMissing ?? difference;
    const inSync = actualMissing === 0 && (!extrasInDb || extrasInDb === 0);
    const missing = actualMissing > 0;
    const hasExtra = (extrasInDb || 0) > 0;
    const verifyResult = verification?.result;

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

          {verifyResult && verifyResult.deletedCount > 0 && (
            <div className="text-[10px] text-red-700 font-medium bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
              Deleted {verifyResult.deletedCount} extras
            </div>
          )}

          {inSync ? (
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
                <Check size={12} className="text-emerald-600" />
              </div>
              <span className="text-xs font-semibold text-emerald-600">In Sync</span>
            </div>
          ) : hasExtra && actualMissing === 0 ? (
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center">
                <AlertTriangle size={12} className="text-amber-600" />
              </div>
              <span className="text-xs font-semibold text-amber-600">{extrasInDb} orphaned in DB</span>
            </div>
          ) : missing ? (
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center">
                <AlertTriangle size={12} className="text-amber-600" />
              </div>
              <span className="text-xs font-semibold text-amber-600">Missing {actualMissing}</span>
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
            Acumatica: {acumaticaCount} | In DB: {dbCount}
            {hasExtra && (
              <span className="block text-amber-600 font-medium">
                DB total for range: {dbTotalForRange} ({extrasInDb} orphaned)
              </span>
            )}
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
                          typeInSync ? 'text-emerald-600' : typeMissing ? 'text-amber-600' : 'text-emerald-600'
                        }`}>
                          {counts.difference === 0 ? '0' : `-${counts.difference}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {verifyResult && verifyResult.extras.length > 0 && (
            <button
              onClick={handleToggleDetail}
              className="text-[10px] text-blue-600 hover:text-blue-800 font-medium underline"
            >
              {showExtrasDetail ? 'Hide' : 'Show'} {verifyResult.extras.length} extra{verifyResult.extras.length !== 1 ? 's' : ''}
            </button>
          )}

          {verifyResult && verifyResult.extras.length === 0 && verifyResult.extraCount === 0 && verification?.mode === 'verify' && (
            <div className="text-[10px] text-emerald-600 font-medium">
              No extras found
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
            {hasExtra && onVerify && (
              <button
                onClick={(e) => handleVerify(e, false)}
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-md hover:bg-teal-100 transition-colors"
                title="Find which invoices are in DB but not in Acumatica"
              >
                <Search size={10} />
                Find Extras
              </button>
            )}
            {hasExtra && onVerify && (
              <button
                onClick={(e) => handleVerify(e, true)}
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-white bg-red-500 rounded-md hover:bg-red-600 transition-colors shadow-sm"
                title="Delete records not found in Acumatica"
              >
                <Trash2 size={10} />
                Delete Extras
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

        {showExtrasDetail && verifyResult && verifyResult.extras.length > 0 && (
          <div
            className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-xl p-3 min-w-[380px] max-h-[400px] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-gray-800">
                Extra Invoices ({verifyResult.extras.length})
              </h4>
              <button onClick={handleToggleDetail} className="text-gray-400 hover:text-gray-600">
                <X size={14} />
              </button>
            </div>
            <div className="text-[10px] text-gray-500 mb-2">
              These invoices exist in your DB but were not found in Acumatica for this date range.
            </div>

            {verifyResult.extras.length > 1 && onDeleteAllExtra && (
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
                {deletingAll ? 'Deleting...' : `Delete All ${verifyResult.extras.length} Extras`}
              </button>
            )}

            <div className="space-y-1.5">
              {verifyResult.extras.map((inv, i) => {
                const deleteKey = `${inv.type}:${inv.reference_number}`;
                const isDeleting = deletingInvoices.has(deleteKey);
                return (
                  <div key={i} className="flex items-start gap-2 text-[11px] p-1.5 rounded border bg-red-50/50 border-red-200">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-800">#{inv.reference_number} ({inv.type})</div>
                      <div className="text-gray-500 truncate">{inv.customer_name}</div>
                      <div className="text-gray-400">{formatCurrency(inv.amount)} | Bal: {formatCurrency(inv.balance)}</div>
                      <div className="text-gray-400">Status: {inv.status}</div>
                    </div>
                    <div className="text-right shrink-0 flex flex-col items-end gap-1">
                      <span className="text-[9px] font-medium text-red-600 bg-red-100 px-1.5 py-0.5 rounded">
                        NOT IN ACUMATICA
                      </span>
                      {onDeleteInvoice && (
                        <button
                          onClick={(e) => handleDeleteInvoice(e, inv.reference_number, inv.type)}
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
