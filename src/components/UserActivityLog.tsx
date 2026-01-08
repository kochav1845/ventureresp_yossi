import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Activity, Clock, FileText, User, FolderOpen, AlertCircle } from 'lucide-react';

interface ActivityLog {
  id: string;
  user_id: string;
  action_type: string;
  entity_type: string | null;
  entity_id: string | null;
  details: any;
  created_at: string;
}

interface UserActivityLogProps {
  userId: string;
  userName: string;
  onClose: () => void;
}

export default function UserActivityLog({ userId, userName, onClose }: UserActivityLogProps) {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    loadActivityLogs();
  }, [userId]);

  const loadActivityLogs = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('user_activity_logs')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error('Error loading activity logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const getActionIcon = (actionType: string) => {
    if (actionType.includes('status')) return <AlertCircle className="w-4 h-4" />;
    if (actionType.includes('memo')) return <FileText className="w-4 h-4" />;
    if (actionType.includes('user')) return <User className="w-4 h-4" />;
    if (actionType.includes('customer')) return <FolderOpen className="w-4 h-4" />;
    return <Activity className="w-4 h-4" />;
  };

  const getActionColor = (actionType: string) => {
    if (actionType.includes('status')) return 'text-orange-400 bg-orange-400/10';
    if (actionType.includes('memo')) return 'text-blue-400 bg-blue-400/10';
    if (actionType.includes('user') || actionType.includes('role')) return 'text-purple-400 bg-purple-400/10';
    if (actionType.includes('customer')) return 'text-green-400 bg-green-400/10';
    return 'text-gray-400 bg-gray-400/10';
  };

  const formatActionType = (actionType: string) => {
    return actionType
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const formatDetails = (log: ActivityLog) => {
    const { details, entity_type, entity_id } = log;

    switch (log.action_type) {
      case 'invoice_status_changed':
        return (
          <div className="text-sm text-slate-400">
            Changed invoice <span className="text-blue-400 font-mono">{entity_id}</span> status from{' '}
            <span className="px-2 py-0.5 rounded bg-slate-700 text-slate-300">{details?.old_status || 'none'}</span> to{' '}
            <span className="px-2 py-0.5 rounded bg-slate-700 text-slate-300">{details?.new_status}</span>
          </div>
        );

      case 'invoice_status_set':
        return (
          <div className="text-sm text-slate-400">
            Set invoice <span className="text-blue-400 font-mono">{entity_id}</span> status to{' '}
            <span className="px-2 py-0.5 rounded bg-slate-700 text-slate-300">{details?.status}</span>
          </div>
        );

      case 'memo_added':
        return (
          <div className="text-sm text-slate-400">
            Added memo to invoice <span className="text-blue-400 font-mono">{entity_id}</span>
            {details?.memo_text && (
              <div className="mt-1 p-2 bg-slate-800 rounded border border-slate-700 text-slate-300 italic">
                "{details.memo_text}"
              </div>
            )}
            {details?.has_attachment && (
              <span className="ml-2 text-amber-400">📎 with attachment</span>
            )}
          </div>
        );

      case 'memo_updated':
        return (
          <div className="text-sm text-slate-400">
            Updated memo on invoice <span className="text-blue-400 font-mono">{entity_id}</span>
          </div>
        );

      case 'memo_deleted':
        return (
          <div className="text-sm text-slate-400">
            Deleted memo from invoice <span className="text-blue-400 font-mono">{entity_id}</span>
          </div>
        );

      case 'user_role_changed':
        return (
          <div className="text-sm text-slate-400">
            Changed role for <span className="text-purple-400">{details?.target_user_email}</span> from{' '}
            <span className="px-2 py-0.5 rounded bg-slate-700 text-slate-300">{details?.old_role}</span> to{' '}
            <span className="px-2 py-0.5 rounded bg-slate-700 text-slate-300">{details?.new_role}</span>
          </div>
        );

      case 'user_color_changed':
        return (
          <div className="text-sm text-slate-400">
            Changed color for <span className="text-purple-400">{details?.target_user_email}</span>
            <div className="flex items-center gap-3 mt-2">
              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-full border-2 border-slate-600"
                  style={{ backgroundColor: details?.old_color || '#e5e7eb' }}
                />
                <span className="text-xs text-slate-500">{details?.old_color || 'default'}</span>
              </div>
              <span className="text-slate-500">→</span>
              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-full border-2 border-slate-600"
                  style={{ backgroundColor: details?.new_color || '#e5e7eb' }}
                />
                <span className="text-xs text-slate-500">{details?.new_color || 'default'}</span>
              </div>
            </div>
          </div>
        );

      case 'user_profile_updated':
        return (
          <div className="text-sm text-slate-400">
            Updated profile field <span className="text-blue-400">{details?.field}</span>
            {details?.old_value && details?.new_value && (
              <div className="mt-1">
                <span className="line-through text-slate-500">{details.old_value}</span> →{' '}
                <span className="text-green-400">{details.new_value}</span>
              </div>
            )}
          </div>
        );

      case 'customer_assigned':
        return (
          <div className="text-sm text-slate-400">
            Assigned customer <span className="text-green-400">{details?.customer_name || entity_id}</span> to a user
          </div>
        );

      case 'customer_unassigned':
        return (
          <div className="text-sm text-slate-400">
            Unassigned customer <span className="text-green-400">{details?.customer_name || entity_id}</span>
          </div>
        );

      default:
        return (
          <div className="text-sm text-slate-400">
            {entity_type && <span className="capitalize">{entity_type}: </span>}
            {entity_id && <span className="text-blue-400 font-mono">{entity_id}</span>}
            {details && Object.keys(details).length > 0 && (
              <pre className="mt-1 text-xs text-slate-500 overflow-auto">
                {JSON.stringify(details, null, 2)}
              </pre>
            )}
          </div>
        );
    }
  };

  const filteredLogs = logs.filter(log => {
    if (filter === 'all') return true;
    return log.action_type.includes(filter);
  });

  const actionTypes = Array.from(new Set(logs.map(log => {
    if (log.action_type.includes('status')) return 'status';
    if (log.action_type.includes('memo')) return 'memo';
    if (log.action_type.includes('user') || log.action_type.includes('role')) return 'user';
    if (log.action_type.includes('customer')) return 'customer';
    return 'other';
  })));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 overflow-y-auto p-4">
      <div className="bg-slate-800 rounded-lg shadow-xl w-full max-w-4xl my-8">
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                  <Activity className="w-6 h-6" />
                  Activity Log
                </h2>
                <p className="text-slate-400 mt-1">
                  Activity history for {userName}
                </p>
              </div>
            </div>
            <button
              onClick={loadActivityLogs}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors"
            >
              Refresh
            </button>
          </div>

          <div className="mt-4 flex gap-2 flex-wrap">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                filter === 'all'
                  ? 'bg-blue-500 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              All ({logs.length})
            </button>
            {actionTypes.map(type => (
              <button
                key={type}
                onClick={() => setFilter(type)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors capitalize ${
                  filter === type
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {type} ({logs.filter(log => log.action_type.includes(type)).length})
              </button>
            ))}
          </div>
        </div>

        <div className="p-6 max-h-[600px] overflow-y-auto">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
              <p className="text-slate-400 mt-4">Loading activity logs...</p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-12">
              <Activity className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400">No activity logs found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredLogs.map((log, index) => (
                <div
                  key={log.id}
                  className="relative pl-8 pb-4 border-l-2 border-slate-700 last:border-l-0"
                >
                  <div
                    className={`absolute left-[-9px] top-0 p-1.5 rounded-full ${getActionColor(
                      log.action_type
                    )}`}
                  >
                    {getActionIcon(log.action_type)}
                  </div>

                  <div className="bg-slate-900 rounded-lg p-4 ml-4">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-white">
                        {formatActionType(log.action_type)}
                      </h3>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Clock className="w-3 h-3" />
                        {new Date(log.created_at).toLocaleString()}
                      </div>
                    </div>
                    {formatDetails(log)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
