import { useState, useEffect } from 'react';
import { Calendar } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { CollectorActivity, ChangeLog } from './types';

interface Props {
  collectorId: string;
  dateRange: number;
}

export default function CollectorExpandedDetails({ collectorId, dateRange }: Props) {
  const [activity, setActivity] = useState<CollectorActivity[]>([]);
  const [changes, setChanges] = useState<ChangeLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDetails();
  }, [collectorId, dateRange]);

  const loadDetails = async () => {
    setLoading(true);
    try {
      const [activityResult, invoiceChanges, paymentChanges] = await Promise.all([
        supabase.rpc('get_collector_activity', {
          p_collector_id: collectorId,
          p_days_back: dateRange
        }),
        supabase
          .from('invoice_change_log')
          .select('*')
          .eq('changed_by', collectorId)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('payment_change_log')
          .select('*')
          .eq('changed_by', collectorId)
          .order('created_at', { ascending: false })
          .limit(50)
      ]);

      if (activityResult.data) setActivity(activityResult.data);

      const combined: ChangeLog[] = [
        ...(invoiceChanges.data || []).map((c: any) => ({
          changed_at: c.created_at,
          changed_by_email: '',
          change_type: c.change_type,
          field_name: c.field_name,
          old_value: c.old_value,
          new_value: c.new_value,
          invoice_reference_number: c.invoice_reference_number
        })),
        ...(paymentChanges.data || []).map((c: any) => ({
          changed_at: c.created_at,
          changed_by_email: '',
          change_type: c.change_type,
          field_name: c.field_name,
          old_value: c.old_value,
          new_value: c.new_value,
          payment_reference_number: c.payment_reference_number
        }))
      ].sort((a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime());

      setChanges(combined);
    } catch (err) {
      console.error('Error loading details:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="py-8 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="text-sm text-gray-500 mt-2">Loading activity...</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div>
        <h4 className="font-semibold text-lg mb-4 text-gray-800">Activity Timeline</h4>
        <div className="space-y-2 max-h-80 overflow-y-auto pr-2">
          {activity.length === 0 && (
            <p className="text-sm text-gray-500 py-4 text-center">No activity in this period</p>
          )}
          {activity.map((a, idx) => (
            <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
              <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">
                  {new Date(a.activity_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </p>
                <p className="text-xs text-gray-600 truncate">
                  {a.invoices_modified} invoices, {a.payments_modified} payments, {a.emails_sent} emails
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h4 className="font-semibold text-lg mb-4 text-gray-800">Recent Changes</h4>
        <div className="space-y-2 max-h-80 overflow-y-auto pr-2">
          {changes.length === 0 && (
            <p className="text-sm text-gray-500 py-4 text-center">No changes recorded</p>
          )}
          {changes.slice(0, 20).map((change, idx) => (
            <div key={idx} className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-blue-600">
                  {change.invoice_reference_number || change.payment_reference_number}
                </span>
                <span className="text-xs text-gray-400">
                  {new Date(change.changed_at).toLocaleString()}
                </span>
              </div>
              <p className="text-sm">
                <span className="font-medium text-gray-700">{change.field_name}</span>:
                <span className="text-red-500 mx-1">{change.old_value || 'none'}</span>
                <span className="text-gray-400">-&gt;</span>
                <span className="text-green-600 mx-1">{change.new_value}</span>
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
