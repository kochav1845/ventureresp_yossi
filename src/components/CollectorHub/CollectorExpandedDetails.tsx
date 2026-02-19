import { useState, useEffect } from 'react';
import { Users, Activity, TrendingUp, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ActivityLog } from './types';
import { format } from 'date-fns';

interface Props {
  collectorId: string;
  dateRange: number;
}

export default function CollectorExpandedDetails({ collectorId, dateRange }: Props) {
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState<string>('all');

  useEffect(() => {
    loadActivities();
  }, [collectorId, dateRange, actionFilter]);

  const loadActivities = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('user_activity_logs')
        .select('*, user_profiles!inner(full_name)')
        .eq('user_id', collectorId)
        .gte('created_at', new Date(Date.now() - dateRange * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(200);

      if (actionFilter !== 'all') {
        query = query.eq('action_type', actionFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      setActivities((data || []).map((log: any) => ({
        ...log,
        user_name: log.user_profiles?.full_name
      })));
    } catch (err) {
      console.error('Error loading activities:', err);
    } finally {
      setLoading(false);
    }
  };

  const getActionIcon = (actionType: string) => {
    const iconClass = "w-3.5 h-3.5";
    if (actionType.includes('login') || actionType.includes('logout')) return <Users className={iconClass} />;
    if (actionType.includes('ticket')) return <Activity className={iconClass} />;
    if (actionType.includes('status') || actionType.includes('color')) return <TrendingUp className={iconClass} />;
    return <Activity className={iconClass} />;
  };

  const getActionColor = (actionType: string) => {
    if (actionType.includes('login')) return 'bg-green-100 text-green-700 border-green-200';
    if (actionType.includes('logout')) return 'bg-gray-100 text-gray-600 border-gray-200';
    if (actionType.includes('created')) return 'bg-blue-100 text-blue-700 border-blue-200';
    if (actionType.includes('closed')) return 'bg-slate-100 text-slate-600 border-slate-200';
    if (actionType.includes('note') || actionType.includes('memo')) return 'bg-cyan-100 text-cyan-700 border-cyan-200';
    if (actionType.includes('status') || actionType.includes('color')) return 'bg-orange-100 text-orange-700 border-orange-200';
    if (actionType.includes('promise')) return 'bg-teal-100 text-teal-700 border-teal-200';
    return 'bg-gray-100 text-gray-600 border-gray-200';
  };

  const formatActionType = (actionType: string) => {
    return actionType.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  const formatDetails = (log: ActivityLog) => {
    const { details, entity_id, action_type } = log;
    if (!details) return null;

    if (action_type === 'user_login' || action_type === 'user_logout') {
      return <span className="text-gray-400 text-xs">Session activity</span>;
    }

    if (action_type.includes('ticket')) {
      return (
        <div className="text-xs mt-1">
          {details.customer_name && <span className="font-medium text-gray-700">{details.customer_name}</span>}
          {details.old_status && details.new_status && (
            <span className="ml-2 text-gray-500">
              {details.old_status} -&gt; {details.new_status}
            </span>
          )}
          {details.note_preview && (
            <div className="text-gray-400 italic mt-0.5 truncate max-w-md">"{details.note_preview}"</div>
          )}
        </div>
      );
    }

    if (action_type.includes('invoice')) {
      return (
        <div className="text-xs mt-1">
          <span className="font-mono text-gray-700">{entity_id}</span>
          {details.customer && <span className="ml-2 text-gray-500">{details.customer}</span>}
          {details.old_color && details.new_color && (
            <span className="ml-2">
              <span className={`px-1.5 py-0.5 rounded text-xs ${details.old_color === 'red' ? 'bg-red-100 text-red-600' : details.old_color === 'orange' ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'}`}>
                {details.old_color || 'none'}
              </span>
              {' -> '}
              <span className={`px-1.5 py-0.5 rounded text-xs ${details.new_color === 'red' ? 'bg-red-100 text-red-600' : details.new_color === 'orange' ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'}`}>
                {details.new_color}
              </span>
            </span>
          )}
        </div>
      );
    }

    if (action_type.includes('memo')) {
      return (
        <div className="text-xs mt-1">
          <span className="font-mono text-gray-700">{entity_id}</span>
          {details.memo_text && (
            <div className="text-gray-400 italic mt-0.5 truncate max-w-md">"{details.memo_text}"</div>
          )}
        </div>
      );
    }

    return null;
  };

  if (loading) {
    return (
      <div className="py-8 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="text-sm text-gray-500 mt-2">Loading activity timeline...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-semibold text-lg text-gray-800">Activity Timeline</h4>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="all">All Actions</option>
          <option value="user_login">Logins</option>
          <option value="user_logout">Logouts</option>
          <option value="ticket_created">Tickets Created</option>
          <option value="ticket_closed">Tickets Closed</option>
          <option value="ticket_note_added">Notes Added</option>
          <option value="invoice_color_changed">Color Changes</option>
          <option value="ticket_status_changed">Status Changes</option>
        </select>
      </div>

      {activities.length === 0 ? (
        <div className="text-center py-8 text-gray-400">No activities found for this period</div>
      ) : (
        <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
          {activities.map((log) => (
            <div
              key={log.id}
              className="flex items-start gap-3 p-3 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
            >
              <div className={`p-1.5 rounded-lg border flex-shrink-0 ${getActionColor(log.action_type)}`}>
                {getActionIcon(log.action_type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-gray-900">{formatActionType(log.action_type)}</span>
                  <span className="text-gray-300">|</span>
                  <span className="text-gray-400 text-xs flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {format(new Date(log.created_at), 'MMM d, h:mm a')}
                  </span>
                </div>
                {formatDetails(log)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
