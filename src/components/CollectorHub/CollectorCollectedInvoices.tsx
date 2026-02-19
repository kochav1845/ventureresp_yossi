import { useState, useEffect } from 'react';
import { DollarSign, Calendar, Clock, FileText, Ticket } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { format } from 'date-fns';

interface CollectedInvoice {
  invoice_reference_number: string;
  customer_name: string;
  customer_id: string;
  invoice_date: string | null;
  due_date: string | null;
  amount: number;
  balance: number;
  invoice_status: string;
  ticket_number: string | null;
  ticket_id: string | null;
  assigned_at: string | null;
}

interface Props {
  collectorId: string;
}

export default function CollectorCollectedInvoices({ collectorId }: Props) {
  const [invoices, setInvoices] = useState<CollectedInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInvoices();
  }, [collectorId]);

  const loadInvoices = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_collector_collected_invoices', {
        p_collector_id: collectorId
      });
      if (error) throw error;
      setInvoices(data || []);
    } catch (err) {
      console.error('Error loading collected invoices:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '--';
    try {
      return format(new Date(dateStr), 'MMM d, yyyy');
    } catch {
      return '--';
    }
  };

  const totalCollected = invoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);

  if (loading) {
    return (
      <div className="py-6 text-center">
        <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-emerald-600 mx-auto"></div>
        <p className="text-sm text-gray-500 mt-2">Loading collected invoices...</p>
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div className="text-center py-8">
        <DollarSign className="w-10 h-10 text-gray-300 mx-auto mb-2" />
        <p className="text-gray-400 text-sm">No collected invoices found</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h4 className="font-semibold text-lg text-gray-800">Collected Invoices</h4>
          <span className="px-2.5 py-0.5 rounded-full text-sm font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
            {invoices.length} invoices
          </span>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400">Total Collected</p>
          <p className="text-lg font-bold text-emerald-700">
            ${totalCollected.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
        <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-200">
          <div className="col-span-2">Reference</div>
          <div className="col-span-3">Customer</div>
          <div className="col-span-2">Invoice Date</div>
          <div className="col-span-2">Due Date</div>
          <div className="col-span-2 text-right">Amount</div>
          <div className="col-span-1">Ticket</div>
        </div>

        {invoices.map((inv) => (
          <div
            key={inv.invoice_reference_number}
            className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
          >
            <div className="hidden sm:grid grid-cols-12 gap-2 items-center px-4 py-3">
              <div className="col-span-2">
                <span className="font-mono text-sm font-medium text-gray-900">{inv.invoice_reference_number}</span>
              </div>
              <div className="col-span-3">
                <p className="text-sm text-gray-800 truncate">{inv.customer_name}</p>
                <p className="text-[11px] text-gray-400">{inv.customer_id}</p>
              </div>
              <div className="col-span-2">
                <div className="flex items-center gap-1.5 text-sm text-gray-700">
                  <Calendar className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                  {formatDate(inv.invoice_date)}
                </div>
              </div>
              <div className="col-span-2">
                <div className="flex items-center gap-1.5 text-sm text-gray-600">
                  <Clock className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                  {formatDate(inv.due_date)}
                </div>
              </div>
              <div className="col-span-2 text-right">
                <span className="text-sm font-semibold text-emerald-700">
                  ${(inv.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="col-span-1">
                {inv.ticket_number ? (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                    <Ticket className="w-3 h-3" />
                    {inv.ticket_number.replace('TKT', '')}
                  </span>
                ) : (
                  <span className="text-xs text-gray-300">--</span>
                )}
              </div>
            </div>

            <div className="sm:hidden px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-medium text-gray-900">{inv.invoice_reference_number}</span>
                <span className="text-sm font-semibold text-emerald-700">
                  ${(inv.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <p className="text-sm text-gray-700 truncate">{inv.customer_name}</p>
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {formatDate(inv.invoice_date)}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatDate(inv.due_date)}
                </span>
                {inv.ticket_number && (
                  <span className="flex items-center gap-1">
                    <Ticket className="w-3 h-3" />
                    {inv.ticket_number}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
