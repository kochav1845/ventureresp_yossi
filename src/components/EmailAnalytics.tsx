import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Send, TrendingUp, Calendar, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface EmailAnalyticsProps {
  onBack?: () => void;
}

interface EmailStats {
  census_sent: number;
  reports_sent: number;
  total_emails: number;
  avg_per_day: number;
}

interface FormulaStats {
  formula_name: string;
  emails_sent: number;
}

export default function EmailAnalytics({ onBack }: EmailAnalyticsProps) {
  const navigate = useNavigate();
  const [stats, setStats] = useState<EmailStats>({
    census_sent: 0,
    reports_sent: 0,
    total_emails: 0,
    avg_per_day: 0
  });
  const [formulaStats, setFormulaStats] = useState<FormulaStats[]>([]);
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
    loadEmailAnalytics();
  }, [timeRange]);

  const loadEmailAnalytics = async () => {
    setLoading(true);
    try {
      const daysAgo = parseInt(timeRange);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysAgo);
      const startStr = startDate.toISOString();

      const { data: logs, error: logsError } = await supabase
        .from('cron_job_logs')
        .select('job_name, response_data, executed_at')
        .gte('executed_at', startStr)
        .in('job_name', ['send_census_emails', 'send_report_emails', 'process_email_formula']);

      if (logsError) throw logsError;

      let censusCount = 0;
      let reportsCount = 0;
      const formulaMap = new Map<string, number>();

      logs?.forEach(log => {
        if (log.job_name === 'send_census_emails') {
          censusCount += log.response_data?.emails_sent || 0;
        } else if (log.job_name === 'send_report_emails') {
          reportsCount += log.response_data?.emails_sent || 0;
        } else if (log.job_name === 'process_email_formula') {
          const formulaName = log.response_data?.formula_name || 'Unknown';
          const sent = log.response_data?.emails_sent || 0;
          formulaMap.set(formulaName, (formulaMap.get(formulaName) || 0) + sent);
        }
      });

      const totalEmails = censusCount + reportsCount + Array.from(formulaMap.values()).reduce((sum, val) => sum + val, 0);
      const avgPerDay = totalEmails / daysAgo;

      const formulaStatsArray: FormulaStats[] = Array.from(formulaMap.entries())
        .map(([formula_name, emails_sent]) => ({ formula_name, emails_sent }))
        .sort((a, b) => b.emails_sent - a.emails_sent);

      setStats({
        census_sent: censusCount,
        reports_sent: reportsCount,
        total_emails: totalEmails,
        avg_per_day: avgPerDay
      });
      setFormulaStats(formulaStatsArray);
    } catch (error) {
      console.error('Error loading email analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-indigo-50">
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={handleBack}
            className="p-2 hover:bg-indigo-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-indigo-600" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Email Analytics</h1>
            <p className="text-gray-600">Census emails, reports, and automated communications</p>
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Time Range</label>
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
          >
            <option value="7">Last 7 Days</option>
            <option value="30">Last 30 Days</option>
            <option value="60">Last 60 Days</option>
            <option value="90">Last 90 Days</option>
          </select>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading email analytics...</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-600 font-medium">Total Emails Sent</span>
                  <Mail className="w-5 h-5 text-indigo-600" />
                </div>
                <p className="text-3xl font-bold text-gray-900">{stats.total_emails}</p>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-600 font-medium">Census Emails</span>
                  <Users className="w-5 h-5 text-blue-600" />
                </div>
                <p className="text-3xl font-bold text-gray-900">{stats.census_sent}</p>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-600 font-medium">Report Emails</span>
                  <Send className="w-5 h-5 text-green-600" />
                </div>
                <p className="text-3xl font-bold text-gray-900">{stats.reports_sent}</p>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-600 font-medium">Avg Per Day</span>
                  <TrendingUp className="w-5 h-5 text-purple-600" />
                </div>
                <p className="text-3xl font-bold text-gray-900">{stats.avg_per_day.toFixed(1)}</p>
              </div>
            </div>

            {formulaStats.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Email Formulas Performance</h2>
                <div className="space-y-3">
                  {formulaStats.map((formula, index) => (
                    <div key={index} className="flex items-center justify-between p-4 bg-indigo-50 rounded-lg">
                      <span className="font-semibold text-gray-900">{formula.formula_name}</span>
                      <span className="px-3 py-1 bg-indigo-600 text-white rounded-full text-sm font-bold">
                        {formula.emails_sent} emails
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-gradient-to-r from-indigo-500 to-purple-500 rounded-xl shadow-lg p-6 text-white">
              <div className="flex items-center gap-3 mb-4">
                <Calendar className="w-6 h-6" />
                <h2 className="text-xl font-bold">Email Activity Summary</h2>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-indigo-100 text-sm">Time Period</p>
                  <p className="text-2xl font-bold">{timeRange} Days</p>
                </div>
                <div>
                  <p className="text-indigo-100 text-sm">Total Communications</p>
                  <p className="text-2xl font-bold">{stats.total_emails.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
