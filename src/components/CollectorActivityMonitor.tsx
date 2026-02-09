import { useState, useEffect } from 'react';
import { ArrowLeft, Users, Activity, TrendingUp, Calendar, Clock, Eye, Filter, Download, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { format } from 'date-fns';

interface CollectorSummary {
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  total_actions: number;
  login_count: number;
  tickets_created: number;
  tickets_closed: number;
  notes_added: number;
  status_changes: number;
  invoice_color_changes: number;
  last_activity: string;
}

interface ActivityLog {
  id: string;
  user_id: string;
  action_type: string;
  entity_type: string | null;
  entity_id: string | null;
  details: any;
  created_at: string;
  user_name?: string;
}

interface CollectorActivityMonitorProps {
  onBack: () => void;
}

export default function CollectorActivityMonitor({ onBack }: CollectorActivityMonitorProps) {
  const [collectors, setCollectors] = useState<CollectorSummary[]>([]);
  const [selectedCollector, setSelectedCollector] = useState<string | null>(null);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(false);
  const [timeRange, setTimeRange] = useState(30);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');

  useEffect(() => {
    loadCollectorSummaries();
  }, [timeRange]);

  useEffect(() => {
    if (selectedCollector) {
      loadCollectorActivities(selectedCollector);
    }
  }, [selectedCollector, actionFilter]);

  const loadCollectorSummaries = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .rpc('get_collector_activity_summary', {
          p_user_id: null,
          p_days_back: timeRange
        });

      if (error) throw error;
      setCollectors(data || []);
    } catch (error) {
      console.error('Error loading collector summaries:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCollectorActivities = async (userId: string) => {
    try {
      setActivityLoading(true);

      let query = supabase
        .from('user_activity_logs')
        .select('*, user_profiles!inner(full_name)')
        .eq('user_id', userId)
        .gte('created_at', new Date(Date.now() - timeRange * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(500);

      if (actionFilter !== 'all') {
        query = query.eq('action_type', actionFilter);
      }

      const { data, error } = await query;

      if (error) throw error;

      const logsWithNames = (data || []).map((log: any) => ({
        ...log,
        user_name: log.user_profiles?.full_name
      }));

      setActivities(logsWithNames);
    } catch (error) {
      console.error('Error loading activities:', error);
    } finally {
      setActivityLoading(false);
    }
  };

  const getActionIcon = (actionType: string) => {
    const iconClass = "w-4 h-4";
    if (actionType.includes('login') || actionType.includes('logout')) return <Users className={iconClass} />;
    if (actionType.includes('ticket')) return <Activity className={iconClass} />;
    if (actionType.includes('status') || actionType.includes('color')) return <TrendingUp className={iconClass} />;
    return <Activity className={iconClass} />;
  };

  const getActionColor = (actionType: string) => {
    if (actionType.includes('login')) return 'bg-green-500/10 text-green-400 border-green-500/20';
    if (actionType.includes('logout')) return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
    if (actionType.includes('created')) return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    if (actionType.includes('closed')) return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    if (actionType.includes('note') || actionType.includes('memo')) return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
    if (actionType.includes('status') || actionType.includes('color')) return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
    if (actionType.includes('promise')) return 'bg-violet-500/10 text-violet-400 border-violet-500/20';
    return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
  };

  const formatActionType = (actionType: string) => {
    return actionType
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const formatDetails = (log: ActivityLog) => {
    const { details, entity_type, entity_id, action_type } = log;

    if (!details) return null;

    if (action_type === 'user_login' || action_type === 'user_logout') {
      return <span className="text-slate-400 text-sm">Session activity</span>;
    }

    if (action_type.includes('ticket')) {
      return (
        <div className="text-sm">
          {details.customer_name && (
            <div className="text-slate-300 font-medium">{details.customer_name}</div>
          )}
          {details.old_status && details.new_status && (
            <div className="text-slate-400 mt-1">
              <span className="px-2 py-0.5 rounded bg-slate-700 text-xs">{details.old_status}</span>
              {' → '}
              <span className="px-2 py-0.5 rounded bg-slate-700 text-xs">{details.new_status}</span>
            </div>
          )}
          {details.note_preview && (
            <div className="text-slate-400 italic mt-1 text-xs">"{details.note_preview}"</div>
          )}
        </div>
      );
    }

    if (action_type.includes('invoice')) {
      return (
        <div className="text-sm">
          <div className="text-slate-300 font-mono">{entity_id}</div>
          {details.customer && (
            <div className="text-slate-400 text-xs">{details.customer}</div>
          )}
          {details.old_color && details.new_color && (
            <div className="text-slate-400 mt-1 text-xs">
              <span className={`px-2 py-0.5 rounded ${details.old_color === 'red' ? 'bg-red-500/20 text-red-400' : details.old_color === 'yellow' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'}`}>
                {details.old_color || 'none'}
              </span>
              {' → '}
              <span className={`px-2 py-0.5 rounded ${details.new_color === 'red' ? 'bg-red-500/20 text-red-400' : details.new_color === 'yellow' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'}`}>
                {details.new_color}
              </span>
            </div>
          )}
          {details.balance && (
            <div className="text-slate-400 text-xs mt-1">
              Balance: ${Number(details.balance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          )}
        </div>
      );
    }

    if (action_type.includes('memo')) {
      return (
        <div className="text-sm">
          <div className="text-slate-300 font-mono">{entity_id}</div>
          {details.memo_text && (
            <div className="text-slate-400 italic mt-1 text-xs p-2 bg-slate-800/50 rounded border border-slate-700">
              "{details.memo_text}"
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  const filteredCollectors = collectors.filter(c =>
    c.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getActivityBadge = (count: number) => {
    if (count === 0) return 'bg-slate-500/10 text-slate-400';
    if (count < 10) return 'bg-yellow-500/10 text-yellow-400';
    if (count < 50) return 'bg-blue-500/10 text-blue-400';
    return 'bg-green-500/10 text-green-400';
  };

  if (selectedCollector) {
    const collector = collectors.find(c => c.user_id === selectedCollector);

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="max-w-7xl mx-auto p-6">
          <button
            onClick={() => setSelectedCollector(null)}
            className="mb-6 flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Collectors
          </button>

          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl border border-slate-700 p-6 mb-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-2xl font-bold text-white mb-1">{collector?.full_name}</h2>
                <p className="text-slate-400">{collector?.email}</p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                {collector?.role}
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
              <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                <div className="text-slate-400 text-xs mb-1">Total Actions</div>
                <div className="text-2xl font-bold text-white">{collector?.total_actions || 0}</div>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                <div className="text-slate-400 text-xs mb-1">Logins</div>
                <div className="text-2xl font-bold text-green-400">{collector?.login_count || 0}</div>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                <div className="text-slate-400 text-xs mb-1">Tickets Created</div>
                <div className="text-2xl font-bold text-blue-400">{collector?.tickets_created || 0}</div>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                <div className="text-slate-400 text-xs mb-1">Tickets Closed</div>
                <div className="text-2xl font-bold text-slate-400">{collector?.tickets_closed || 0}</div>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                <div className="text-slate-400 text-xs mb-1">Notes Added</div>
                <div className="text-2xl font-bold text-cyan-400">{collector?.notes_added || 0}</div>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                <div className="text-slate-400 text-xs mb-1">Status Changes</div>
                <div className="text-2xl font-bold text-orange-400">{collector?.status_changes || 0}</div>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                <div className="text-slate-400 text-xs mb-1">Color Changes</div>
                <div className="text-2xl font-bold text-violet-400">{collector?.invoice_color_changes || 0}</div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl border border-slate-700 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white">Activity Timeline</h3>
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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

            {activityLoading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                <p className="text-slate-400 mt-4">Loading activities...</p>
              </div>
            ) : activities.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                No activities found for this period
              </div>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {activities.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start gap-4 p-4 bg-slate-900/50 rounded-lg border border-slate-700 hover:border-slate-600 transition-colors"
                  >
                    <div className={`p-2 rounded-lg border ${getActionColor(log.action_type)}`}>
                      {getActionIcon(log.action_type)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-white">{formatActionType(log.action_type)}</span>
                        <span className="text-slate-500 text-xs">•</span>
                        <span className="text-slate-400 text-sm">{format(new Date(log.created_at), 'MMM d, yyyy h:mm a')}</span>
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-7xl mx-auto p-6">
        <button
          onClick={onBack}
          className="mb-6 flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Dashboard
        </button>

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Collector Activity Monitor</h1>
          <p className="text-slate-400">Track and analyze collector productivity and actions</p>
        </div>

        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search collectors..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <select
            value={timeRange}
            onChange={(e) => setTimeRange(Number(e.target.value))}
            className="px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="7">Last 7 Days</option>
            <option value="14">Last 14 Days</option>
            <option value="30">Last 30 Days</option>
            <option value="60">Last 60 Days</option>
            <option value="90">Last 90 Days</option>
          </select>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
            <p className="text-slate-400 mt-4">Loading collector data...</p>
          </div>
        ) : filteredCollectors.length === 0 ? (
          <div className="text-center py-12 bg-slate-800 rounded-xl border border-slate-700">
            <Users className="w-16 h-16 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400">No collectors found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCollectors.map((collector) => (
              <div
                key={collector.user_id}
                className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl border border-slate-700 p-6 hover:border-blue-500/50 transition-all cursor-pointer group"
                onClick={() => setSelectedCollector(collector.user_id)}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-bold text-white mb-1 truncate group-hover:text-blue-400 transition-colors">
                      {collector.full_name}
                    </h3>
                    <p className="text-slate-400 text-sm truncate">{collector.email}</p>
                  </div>
                  <span className="ml-2 px-2 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">
                    {collector.role}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700">
                    <div className="text-slate-400 text-xs mb-1">Total Actions</div>
                    <div className="text-xl font-bold text-white">{collector.total_actions}</div>
                  </div>
                  <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700">
                    <div className="text-slate-400 text-xs mb-1">Logins</div>
                    <div className="text-xl font-bold text-green-400">{collector.login_count}</div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mb-4">
                  <span className={`px-2 py-1 rounded text-xs font-medium border ${getActivityBadge(collector.tickets_created)}`}>
                    {collector.tickets_created} Tickets
                  </span>
                  <span className={`px-2 py-1 rounded text-xs font-medium border ${getActivityBadge(collector.notes_added)}`}>
                    {collector.notes_added} Notes
                  </span>
                  <span className={`px-2 py-1 rounded text-xs font-medium border ${getActivityBadge(collector.status_changes)}`}>
                    {collector.status_changes} Status
                  </span>
                </div>

                {collector.last_activity && (
                  <div className="flex items-center gap-2 text-slate-400 text-sm pt-3 border-t border-slate-700">
                    <Clock className="w-4 h-4" />
                    <span>Last active {format(new Date(collector.last_activity), 'MMM d, h:mm a')}</span>
                  </div>
                )}

                <button className="mt-4 w-full px-4 py-2 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20 hover:bg-blue-500/20 transition-colors flex items-center justify-center gap-2">
                  <Eye className="w-4 h-4" />
                  View Details
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
