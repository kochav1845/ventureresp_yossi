import { useState, useEffect } from 'react';
import { Bell, Calendar, Clock, AlertCircle, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface ReminderCounts {
  today_count: number;
  tomorrow_count: number;
  this_week_count: number;
  next_week_count: number;
  overdue_count: number;
  total_active_count: number;
}

interface RemindersSidebarProps {
  onNavigateToReminders: () => void;
}

export default function RemindersSidebar({ onNavigateToReminders }: RemindersSidebarProps) {
  const { user } = useAuth();
  const [counts, setCounts] = useState<ReminderCounts>({
    today_count: 0,
    tomorrow_count: 0,
    this_week_count: 0,
    next_week_count: 0,
    overdue_count: 0,
    total_active_count: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadReminderCounts();
      const interval = setInterval(loadReminderCounts, 60000);
      return () => clearInterval(interval);
    }
  }, [user]);

  const loadReminderCounts = async () => {
    try {
      const { data, error } = await supabase.rpc('get_reminder_counts', {
        p_user_id: user?.id
      });

      if (error) throw error;

      if (data && data.length > 0) {
        setCounts(data[0]);
      }
    } catch (error) {
      console.error('Error loading reminder counts:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
        <div className="animate-pulse">
          <div className="h-6 bg-slate-700 rounded mb-4"></div>
          <div className="space-y-2">
            <div className="h-10 bg-slate-700 rounded"></div>
            <div className="h-10 bg-slate-700 rounded"></div>
            <div className="h-10 bg-slate-700 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
      <div className="p-4 bg-gradient-to-r from-blue-600 to-blue-700 border-b border-blue-500">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-white" />
          <h3 className="text-lg font-bold text-white">Reminders</h3>
        </div>
        {counts.total_active_count > 0 && (
          <p className="text-blue-100 text-sm mt-1">
            {counts.total_active_count} active reminder{counts.total_active_count !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      <div className="p-4 space-y-2">
        {counts.overdue_count > 0 && (
          <button
            onClick={onNavigateToReminders}
            className="w-full flex items-center justify-between p-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-lg transition-colors group"
          >
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-400" />
              <div className="text-left">
                <p className="text-white font-medium">Overdue</p>
                <p className="text-red-400 text-sm">{counts.overdue_count} reminder{counts.overdue_count !== 1 ? 's' : ''}</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-red-400 group-hover:translate-x-1 transition-transform" />
          </button>
        )}

        <button
          onClick={onNavigateToReminders}
          className="w-full flex items-center justify-between p-3 bg-slate-700/50 hover:bg-slate-700 border border-slate-600 rounded-lg transition-colors group"
        >
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-blue-400" />
            <div className="text-left">
              <p className="text-white font-medium">Today</p>
              <p className="text-slate-400 text-sm">{counts.today_count} reminder{counts.today_count !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400 group-hover:translate-x-1 transition-transform" />
        </button>

        <button
          onClick={onNavigateToReminders}
          className="w-full flex items-center justify-between p-3 bg-slate-700/50 hover:bg-slate-700 border border-slate-600 rounded-lg transition-colors group"
        >
          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-green-400" />
            <div className="text-left">
              <p className="text-white font-medium">Tomorrow</p>
              <p className="text-slate-400 text-sm">{counts.tomorrow_count} reminder{counts.tomorrow_count !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400 group-hover:translate-x-1 transition-transform" />
        </button>

        <button
          onClick={onNavigateToReminders}
          className="w-full flex items-center justify-between p-3 bg-slate-700/50 hover:bg-slate-700 border border-slate-600 rounded-lg transition-colors group"
        >
          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-purple-400" />
            <div className="text-left">
              <p className="text-white font-medium">This Week</p>
              <p className="text-slate-400 text-sm">{counts.this_week_count} reminder{counts.this_week_count !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400 group-hover:translate-x-1 transition-transform" />
        </button>

        <button
          onClick={onNavigateToReminders}
          className="w-full flex items-center justify-between p-3 bg-slate-700/50 hover:bg-slate-700 border border-slate-600 rounded-lg transition-colors group"
        >
          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-orange-400" />
            <div className="text-left">
              <p className="text-white font-medium">Next Week</p>
              <p className="text-slate-400 text-sm">{counts.next_week_count} reminder{counts.next_week_count !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400 group-hover:translate-x-1 transition-transform" />
        </button>
      </div>

      {counts.total_active_count === 0 && (
        <div className="p-6 text-center">
          <Bell className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">No active reminders</p>
        </div>
      )}
    </div>
  );
}
