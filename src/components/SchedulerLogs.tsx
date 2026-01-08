import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, RefreshCw, Clock, CheckCircle, XCircle, Mail, AlertTriangle, ChevronDown, ChevronUp, Users } from 'lucide-react';
import { formatDateTime as formatDateTimeUtil } from '../lib/dateUtils';

interface RecipientDetail {
  customer_id: string;
  customer_name: string;
  customer_email: string;
  assignment_id: string;
  template_id: string;
  subject: string;
  status: 'sent' | 'failed';
  sendgrid_message_id?: string;
  error?: string;
  sent_at: string;
}

interface SkippedCustomer {
  customer_id: string;
  customer_name: string;
  customer_email: string;
  reason: string;
  timestamp: string;
}

interface SchedulerLog {
  id: string;
  execution_id: string;
  executed_at: string;
  execution_time_ms: number;
  total_assignments_checked: number;
  emails_queued: number;
  emails_sent: number;
  emails_failed: number;
  test_mode: boolean;
  detailed_recipients: RecipientDetail[];
  skipped_customers: SkippedCustomer[];
  error_summary: string | null;
}

interface Props {
  onBack?: () => void;
}

export default function SchedulerLogs({ onBack }: Props) {
  const navigate = useNavigate();
  const handleBack = onBack || (() => navigate(-1));
  const [logs, setLogs] = useState<SchedulerLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  useEffect(() => {
    loadLogs();
    const interval = setInterval(loadLogs, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('scheduler_execution_logs')
        .select('*')
        .order('executed_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      setLogs(data || []);
    } catch (error) {
      console.error('Error loading scheduler logs:', error);
    } finally {
      setLoading(false);
    }
  };


  const formatExecutionTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const toggleExpanded = (executionId: string) => {
    setExpandedLog(expandedLog === executionId ? null : executionId);
  };

  const sentRecipients = (log: SchedulerLog) =>
    log.detailed_recipients.filter(r => r.status === 'sent');

  const failedRecipients = (log: SchedulerLog) =>
    log.detailed_recipients.filter(r => r.status === 'failed');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <header className="bg-slate-800/50 backdrop-blur-sm border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={handleBack}
                className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
              >
                <ArrowLeft className="text-slate-400" size={24} />
              </button>
              <div className="flex items-center gap-3">
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-2 rounded-lg">
                  <Mail size={24} className="text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-white">Detailed Email Logs</h1>
                  <p className="text-sm text-slate-400">Track exactly which emails were sent</p>
                </div>
              </div>
            </div>
            <button
              onClick={loadLogs}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white rounded-lg transition-colors"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="text-center py-12">
            <RefreshCw className="animate-spin text-blue-400 mx-auto mb-4" size={32} />
            <p className="text-slate-400">Loading detailed logs...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl shadow-xl border border-slate-700 p-12 text-center">
            <Mail className="text-slate-600 mx-auto mb-4" size={48} />
            <p className="text-slate-400">No execution logs found</p>
            <p className="text-slate-500 text-sm mt-2">Logs will appear here once the scheduler runs</p>
          </div>
        ) : (
          <div className="space-y-4">
            {logs.map((log) => (
              <div
                key={log.id}
                className="bg-slate-800/50 backdrop-blur-sm rounded-2xl shadow-xl border border-slate-700 overflow-hidden"
              >
                <div
                  className="p-6 cursor-pointer hover:bg-slate-700/30 transition-colors"
                  onClick={() => toggleExpanded(log.execution_id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-4 mb-3">
                        <div className="flex items-center gap-2">
                          <Clock className="text-blue-400" size={18} />
                          <span className="text-white font-medium">{formatDateTimeUtil(log.executed_at)}</span>
                        </div>
                        {log.test_mode && (
                          <div className="flex items-center gap-1 px-2 py-1 bg-amber-500/20 border border-amber-500/30 rounded-md">
                            <AlertTriangle size={14} className="text-amber-400" />
                            <span className="text-xs text-amber-400 font-medium">TEST MODE</span>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <div>
                          <p className="text-slate-400 text-xs mb-1">Assignments</p>
                          <p className="text-white font-medium">{log.total_assignments_checked}</p>
                        </div>
                        <div>
                          <p className="text-slate-400 text-xs mb-1">Queued</p>
                          <p className="text-white font-medium">{log.emails_queued}</p>
                        </div>
                        <div>
                          <p className="text-slate-400 text-xs mb-1">Sent</p>
                          <div className="flex items-center gap-1">
                            <CheckCircle className="text-green-400" size={16} />
                            <span className="text-green-400 font-medium">{log.emails_sent}</span>
                          </div>
                        </div>
                        <div>
                          <p className="text-slate-400 text-xs mb-1">Failed</p>
                          <div className="flex items-center gap-1">
                            <XCircle className="text-red-400" size={16} />
                            <span className="text-red-400 font-medium">{log.emails_failed}</span>
                          </div>
                        </div>
                        <div>
                          <p className="text-slate-400 text-xs mb-1">Skipped</p>
                          <div className="flex items-center gap-1">
                            <Users className="text-slate-400" size={16} />
                            <span className="text-slate-300 font-medium">{log.skipped_customers.length}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="ml-4">
                      {expandedLog === log.execution_id ? (
                        <ChevronUp className="text-slate-400" size={24} />
                      ) : (
                        <ChevronDown className="text-slate-400" size={24} />
                      )}
                    </div>
                  </div>
                </div>

                {expandedLog === log.execution_id && (
                  <div className="border-t border-slate-700">
                    <div className="p-6 space-y-6">
                      {sentRecipients(log).length > 0 && (
                        <div>
                          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                            <CheckCircle className="text-green-400" size={20} />
                            Successfully Sent ({sentRecipients(log).length})
                          </h3>
                          <div className="bg-slate-700/30 rounded-lg p-4 space-y-3">
                            {sentRecipients(log).map((recipient, idx) => (
                              <div key={idx} className="flex items-start justify-between border-b border-slate-600/50 last:border-0 pb-3 last:pb-0">
                                <div className="flex-1">
                                  <p className="text-white font-medium">{recipient.customer_email}</p>
                                  <p className="text-slate-400 text-sm">{recipient.customer_name}</p>
                                  <p className="text-slate-500 text-xs mt-1">{recipient.subject}</p>
                                  {recipient.sendgrid_message_id && (
                                    <p className="text-slate-600 text-xs mt-1 font-mono">
                                      ID: {recipient.sendgrid_message_id}
                                    </p>
                                  )}
                                </div>
                                <div className="text-right ml-4">
                                  <p className="text-slate-400 text-xs">{formatDateTimeUtil(recipient.sent_at)}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {failedRecipients(log).length > 0 && (
                        <div>
                          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                            <XCircle className="text-red-400" size={20} />
                            Failed to Send ({failedRecipients(log).length})
                          </h3>
                          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 space-y-3">
                            {failedRecipients(log).map((recipient, idx) => (
                              <div key={idx} className="border-b border-red-500/20 last:border-0 pb-3 last:pb-0">
                                <p className="text-white font-medium">{recipient.customer_email}</p>
                                <p className="text-slate-400 text-sm">{recipient.customer_name}</p>
                                <p className="text-slate-500 text-xs mt-1">{recipient.subject}</p>
                                {recipient.error && (
                                  <p className="text-red-300 text-xs mt-2 font-mono bg-red-900/20 p-2 rounded">
                                    {recipient.error}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {log.skipped_customers.length > 0 && (
                        <div>
                          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                            <Users className="text-slate-400" size={20} />
                            Skipped Customers ({log.skipped_customers.length})
                          </h3>
                          <div className="bg-slate-700/30 rounded-lg p-4 space-y-3">
                            {log.skipped_customers.map((customer, idx) => (
                              <div key={idx} className="flex items-start justify-between border-b border-slate-600/50 last:border-0 pb-3 last:pb-0">
                                <div className="flex-1">
                                  <p className="text-white font-medium">{customer.customer_email}</p>
                                  <p className="text-slate-400 text-sm">{customer.customer_name}</p>
                                  <p className="text-slate-500 text-xs mt-1 italic">{customer.reason}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {log.error_summary && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                          <p className="text-red-300 text-sm font-mono">{log.error_summary}</p>
                        </div>
                      )}

                      <div className="pt-4 border-t border-slate-700">
                        <p className="text-slate-500 text-xs">
                          Execution ID: <span className="font-mono">{log.execution_id}</span>
                          {' • '}
                          Duration: {formatExecutionTime(log.execution_time_ms)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
