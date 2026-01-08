import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, LogIn, Activity, Clock } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface UserActivityAnalyticsProps {
  onBack?: () => void;
}

interface UserActivity {
  user_id: string;
  full_name: string;
  email: string;
  total_logins: number;
  last_login: string;
  total_actions: number;
  most_common_action: string;
}

export default function UserActivityAnalytics({ onBack }: UserActivityAnalyticsProps) {
  const navigate = useNavigate();
  const [activities, setActivities] = useState<UserActivity[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [activeToday, setActiveToday] = useState(0);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('30');

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate('/dashboard');
    }
  };

  useEffect(() => {
    loadUserActivity();
  }, [timeRange]);

  const loadUserActivity = async () => {
    setLoading(true);
    try {
      const { data: users, error: usersError } = await supabase
        .from('user_profiles')
        .select('id, full_name, email');

      if (usersError) throw usersError;

      const daysAgo = parseInt(timeRange);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysAgo);
      const startStr = startDate.toISOString();

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString();

      const userActivityData: UserActivity[] = [];

      for (const user of users || []) {
        const { data: logs, error: logsError } = await supabase
          .from('user_activity_logs')
          .select('action_type, created_at')
          .eq('user_id', user.id)
          .gte('created_at', startStr)
          .order('created_at', { ascending: false });

        if (logsError) throw logsError;

        const logins = logs?.filter(l => l.action_type === 'login').length || 0;
        const lastLogin = logs?.find(l => l.action_type === 'login')?.created_at || '';

        const actionCounts = new Map<string, number>();
        logs?.forEach(log => {
          actionCounts.set(log.action_type, (actionCounts.get(log.action_type) || 0) + 1);
        });

        const mostCommon = Array.from(actionCounts.entries())
          .sort((a, b) => b[1] - a[1])[0]?.[0] || 'None';

        userActivityData.push({
          user_id: user.id,
          full_name: user.full_name || 'Unknown',
          email: user.email,
          total_logins: logins,
          last_login: lastLogin,
          total_actions: logs?.length || 0,
          most_common_action: mostCommon
        });
      }

      const { count: activeCount } = await supabase
        .from('user_activity_logs')
        .select('user_id', { count: 'exact', head: true })
        .gte('created_at', todayStr);

      const uniqueActiveToday = new Set(
        (await supabase
          .from('user_activity_logs')
          .select('user_id')
          .gte('created_at', todayStr)).data?.map(l => l.user_id) || []
      ).size;

      userActivityData.sort((a, b) => b.total_actions - a.total_actions);

      setActivities(userActivityData);
      setTotalUsers(users?.length || 0);
      setActiveToday(uniqueActiveToday);
    } catch (error) {
      console.error('Error loading user activity:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50">
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={handleBack}
            className="p-2 hover:bg-blue-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-blue-600" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">User Activity Analytics</h1>
            <p className="text-gray-600">Track user logins and system activity</p>
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Time Range</label>
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="7">Last 7 Days</option>
            <option value="30">Last 30 Days</option>
            <option value="60">Last 60 Days</option>
            <option value="90">Last 90 Days</option>
          </select>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading user activity...</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-600 font-medium">Total Users</span>
                  <Users className="w-5 h-5 text-blue-600" />
                </div>
                <p className="text-3xl font-bold text-gray-900">{totalUsers}</p>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-600 font-medium">Active Today</span>
                  <Activity className="w-5 h-5 text-green-600" />
                </div>
                <p className="text-3xl font-bold text-gray-900">{activeToday}</p>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-600 font-medium">Total Logins ({timeRange} days)</span>
                  <LogIn className="w-5 h-5 text-purple-600" />
                </div>
                <p className="text-3xl font-bold text-gray-900">
                  {activities.reduce((sum, a) => sum + a.total_logins, 0)}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">User Activity Details</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">User</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700">Logins</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700">Total Actions</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Most Common Action</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Last Login</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activities.map((activity) => (
                      <tr key={activity.user_id} className="border-b border-gray-100 hover:bg-blue-50 transition-colors">
                        <td className="py-3 px-4">
                          <div>
                            <p className="font-semibold text-gray-900">{activity.full_name}</p>
                            <p className="text-sm text-gray-600">{activity.email}</p>
                          </div>
                        </td>
                        <td className="text-right py-3 px-4 text-gray-900">{activity.total_logins}</td>
                        <td className="text-right py-3 px-4 text-gray-900">{activity.total_actions}</td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">
                            {activity.most_common_action}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-600">
                          {activity.last_login ? new Date(activity.last_login).toLocaleString() : 'Never'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
