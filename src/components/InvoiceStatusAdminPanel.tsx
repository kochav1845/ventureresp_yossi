import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingUp, Activity, MessageSquare, Filter, Calendar } from 'lucide-react';
import { supabase } from '../lib/supabase';
import AutoRedStatusUpdater from './AutoRedStatusUpdater';

interface AdminPanelProps {
  onBack?: () => void;
}

export default function InvoiceStatusAdminPanel({ onBack }: AdminPanelProps) {
  const navigate = useNavigate();
  const handleBack = onBack || (() => navigate(-1));
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month' | 'all'>('today');
  const [statusChanges, setStatusChanges] = useState<any[]>([]);
  const [memoActivity, setMemoActivity] = useState<any[]>([]);
  const [userStats, setUserStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [timeRange]);

  const getDateFilter = () => {
    const now = new Date();
    switch (timeRange) {
      case 'today':
        return new Date(now.setHours(0, 0, 0, 0)).toISOString();
      case 'week':
        return new Date(now.setDate(now.getDate() - 7)).toISOString();
      case 'month':
        return new Date(now.setMonth(now.getMonth() - 1)).toISOString();
      default:
        return null;
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const dateFilter = getDateFilter();

      // Load status changes
      let statusQuery = supabase
        .from('invoice_status_changes')
        .select('*')
        .order('changed_at', { ascending: false });

      if (dateFilter) {
        statusQuery = statusQuery.gte('changed_at', dateFilter);
      }

      const { data: statusData } = await statusQuery;

      setStatusChanges(statusData || []);
      setMemoActivity([]);

      // Calculate user statistics
      calculateUserStats(statusData || [], []);
    } catch (error) {
      console.error('Error loading admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateUserStats = (statusData: any[], memoData: any[]) => {
    const userMap = new Map();

    // Count status changes by user and status type
    statusData.forEach((change) => {
      const email = change.changed_by_email || 'Unknown';
      if (!userMap.has(email)) {
        userMap.set(email, {
          email,
          totalChanges: 0,
          toRed: 0,
          toGreen: 0,
          toOrange: 0,
          toYellow: 0,
          memoCount: 0
        });
      }
      const stats = userMap.get(email);
      stats.totalChanges++;

      switch (change.new_status) {
        case 'red': stats.toRed++; break;
        case 'green': stats.toGreen++; break;
        case 'orange': stats.toOrange++; break;
        case 'yellow': stats.toYellow++; break;
      }
    });


    const stats = Array.from(userMap.values()).sort((a, b) =>
      (b.totalChanges + b.memoCount) - (a.totalChanges + a.memoCount)
    );

    setUserStats(stats);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString();
  };

  const statusColors = {
    green: { bg: 'bg-green-100', text: 'text-green-700', label: 'Green' },
    yellow: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Yellow' },
    orange: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Orange' },
    red: { bg: 'bg-red-100', text: 'text-red-700', label: 'Red' }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-blue-600">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={handleBack}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-blue-900">Invoice Status Admin Panel</h1>
            <p className="text-blue-600">Complete activity logs and user statistics</p>
          </div>
        </div>

        {/* Time Range Filter */}
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-gray-600" />
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as any)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="today">Today</option>
            <option value="week">Last 7 Days</option>
            <option value="month">Last 30 Days</option>
            <option value="all">All Time</option>
          </select>
        </div>
      </div>

      {/* Auto Red Status Updater */}
      <AutoRedStatusUpdater />

      {/* User Statistics Grid */}
      <div className="bg-white rounded-xl shadow-md border border-blue-100 p-6">
        <div className="flex items-center gap-3 mb-6">
          <TrendingUp className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-bold text-blue-900">User Activity Statistics</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">User</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">Total Changes</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-red-700">To Red</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-green-700">To Green</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-orange-700">To Orange</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-blue-700">Memos</th>
              </tr>
            </thead>
            <tbody>
              {userStats.map((stat, idx) => (
                <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 text-sm text-gray-900">{stat.email}</td>
                  <td className="py-3 px-4 text-sm text-center font-semibold">{stat.totalChanges}</td>
                  <td className="py-3 px-4 text-sm text-center text-red-600">{stat.toRed}</td>
                  <td className="py-3 px-4 text-sm text-center text-green-600">{stat.toGreen}</td>
                  <td className="py-3 px-4 text-sm text-center text-orange-600">{stat.toOrange}</td>
                  <td className="py-3 px-4 text-sm text-center text-blue-600">{stat.memoCount}</td>
                </tr>
              ))}
              {userStats.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-500">
                    No activity in this time range
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Status Change Log */}
      <div className="bg-white rounded-xl shadow-md border border-blue-100 p-6">
        <div className="flex items-center gap-3 mb-6">
          <Activity className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-bold text-blue-900">Status Change Log</h2>
        </div>

        <div className="space-y-2 max-h-96 overflow-y-auto">
          {statusChanges.map((change) => (
            <div key={change.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
              <div className="flex items-center gap-3">
                <Calendar className="w-4 h-4 text-gray-400" />
                <span className="text-xs text-gray-500">{formatDate(change.changed_at)}</span>
                <span className="text-sm font-medium text-gray-900">{change.changed_by_email || 'Unknown'}</span>
                <span className="text-sm text-gray-600">changed Invoice</span>
                <span className="text-sm font-mono text-blue-600">#{change.invoice_reference}</span>
              </div>
              <div className="flex items-center gap-2">
                {change.old_status ? (
                  <span className={`px-2 py-1 rounded text-xs ${statusColors[change.old_status as keyof typeof statusColors]?.bg || 'bg-gray-100'} ${statusColors[change.old_status as keyof typeof statusColors]?.text || 'text-gray-600'}`}>
                    {statusColors[change.old_status as keyof typeof statusColors]?.label || change.old_status}
                  </span>
                ) : (
                  <span className="px-2 py-1 rounded text-xs bg-gray-100 text-gray-600">None</span>
                )}
                <span className="text-gray-400">→</span>
                {change.new_status ? (
                  <span className={`px-2 py-1 rounded text-xs ${statusColors[change.new_status as keyof typeof statusColors]?.bg || 'bg-gray-100'} ${statusColors[change.new_status as keyof typeof statusColors]?.text || 'text-gray-600'}`}>
                    {statusColors[change.new_status as keyof typeof statusColors]?.label || change.new_status}
                  </span>
                ) : (
                  <span className="px-2 py-1 rounded text-xs bg-gray-100 text-gray-600">None</span>
                )}
              </div>
            </div>
          ))}
          {statusChanges.length === 0 && (
            <p className="text-center text-gray-500 py-8">No status changes in this time range</p>
          )}
        </div>
      </div>

      {/* Memo Activity Log */}
      <div className="bg-white rounded-xl shadow-md border border-blue-100 p-6">
        <div className="flex items-center gap-3 mb-6">
          <MessageSquare className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-bold text-blue-900">Memo Activity Log</h2>
        </div>

        <div className="space-y-2 max-h-96 overflow-y-auto">
          {memoActivity.map((memo) => (
            <div key={memo.id} className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <span className="text-xs text-gray-500">{formatDate(memo.created_at)}</span>
                  <span className="text-sm font-medium text-gray-900">{memo.user?.email || 'Unknown'}</span>
                  <span className="text-sm text-gray-600">added memo to Invoice</span>
                  <span className="text-sm font-mono text-blue-600">#{memo.invoice_reference}</span>
                </div>
                {memo.attachment_type && (
                  <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded">
                    {memo.attachment_type}
                  </span>
                )}
              </div>
              {memo.memo_text && (
                <p className="text-sm text-gray-600 ml-7 mt-1">{memo.memo_text}</p>
              )}
            </div>
          ))}
          {memoActivity.length === 0 && (
            <p className="text-center text-gray-500 py-8">No memo activity in this time range</p>
          )}
        </div>
      </div>
    </div>
  );
}
