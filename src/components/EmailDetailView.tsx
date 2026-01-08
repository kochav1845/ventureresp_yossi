import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Mail, Calendar, User, FileText, Download, AlertCircle, CheckCircle, Clock, XCircle, Edit, Send, Paperclip } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

type EmailDetailProps = {
  email: {
    id: string;
    customer_id: string | null;
    sender_email: string;
    subject: string;
    body: string;
    received_at: string;
    processing_status: string;
    customers?: {
      id: string;
      name: string;
      email: string;
    } | null;
    email_analysis?: {
      detected_intent: string;
      confidence_score: number;
      action_taken: string;
      keywords_found: string[];
      reasoning?: string;
    }[];
    customer_files?: {
      id: string;
      filename: string;
      storage_path: string;
      file_size: number;
      mime_type: string;
      created_at: string;
    }[];
  };
  onBack?: () => void;
};

export default function EmailDetailView({ email, onBack }: EmailDetailProps) {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const handleBack = onBack || (() => navigate(-1));
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState('');
  const [showReply, setShowReply] = useState(false);
  const [replySubject, setReplySubject] = useState(`Re: ${email.subject || '(No Subject)'}`);
  const [replyBody, setReplyBody] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [threadMessages, setThreadMessages] = useState<any[]>([]);
  const [loadingThread, setLoadingThread] = useState(true);

  useEffect(() => {
    loadThreadMessages();
  }, [email.id]);

  const loadThreadMessages = async () => {
    setLoadingThread(true);
    try {
      const threadId = email.thread_id || email.id;

      const { data: inboundEmails, error: inboundError } = await supabase
        .from('inbound_emails')
        .select('*')
        .or(`id.eq.${threadId},thread_id.eq.${threadId}`)
        .order('received_at', { ascending: true });

      if (inboundError) throw inboundError;

      const emailIds = inboundEmails?.map(e => e.id) || [];
      const batchSize = 100;
      const allOutboundReplies: any[] = [];
      const allFilesData: any[] = [];

      for (let i = 0; i < emailIds.length; i += batchSize) {
        const batch = emailIds.slice(i, i + batchSize);

        const { data: outboundReplies, error: outboundError } = await supabase
          .from('outbound_replies')
          .select('*')
          .in('inbound_email_id', batch)
          .order('sent_at', { ascending: true });

        if (outboundError) throw outboundError;
        if (outboundReplies) allOutboundReplies.push(...outboundReplies);

        const { data: filesData, error: filesError } = await supabase
          .from('customer_files')
          .select('*')
          .in('inbound_email_id', batch);

        if (filesError) throw filesError;
        if (filesData) allFilesData.push(...filesData);
      }

      const outboundReplies = allOutboundReplies;
      const allFiles = allFilesData;

      const filesMap = new Map();
      (allFiles || []).forEach(file => {
        if (!filesMap.has(file.inbound_email_id)) {
          filesMap.set(file.inbound_email_id, []);
        }
        filesMap.get(file.inbound_email_id).push(file);
      });

      const allMessages = [
        ...(inboundEmails || []).map(e => ({
          ...e,
          type: 'inbound',
          timestamp: e.received_at,
          attachments: filesMap.get(e.id) || []
        })),
        ...(outboundReplies || []).map(r => ({
          ...r,
          type: 'outbound',
          timestamp: r.sent_at || r.created_at,
          attachments: []
        }))
      ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      setThreadMessages(allMessages);
    } catch (error) {
      console.error('Error loading thread:', error);
    } finally {
      setLoadingThread(false);
    }
  };

  const analysis = email.email_analysis?.[0];

  const handleManualAction = async (action: 'marked_responded' | 'paused_emails' | 'deactivated_customer') => {
    if (!email.customer_id) {
      setMessage('Cannot perform action: customer not found');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    setProcessing(true);
    try {
      if (!profile) throw new Error('Not authenticated');

      if (action === 'marked_responded') {
        await supabase
          .from('customers')
          .update({ responded_this_month: true })
          .eq('id', email.customer_id);
      } else if (action === 'deactivated_customer') {
        await supabase
          .from('customers')
          .update({ is_active: false })
          .eq('id', email.customer_id);
      }

      await supabase
        .from('email_analysis')
        .insert({
          inbound_email_id: email.id,
          detected_intent: 'general',
          confidence_score: 1.0,
          keywords_found: [],
          action_taken: action,
          processed_by_admin: profile.id,
          notes: 'Manually processed by admin',
        });

      await supabase
        .from('inbound_emails')
        .update({ processing_status: 'processed' })
        .eq('id', email.id);

      setMessage('Action completed successfully');
      setTimeout(() => {
        setMessage('');
        onBack();
      }, 2000);
    } catch (error) {
      console.error('Error performing action:', error);
      setMessage('Error performing action');
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setProcessing(false);
    }
  };

  const handlePostpone = async (days: number) => {
    if (!email.customer_id) {
      setMessage('Cannot postpone: customer not found');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    setProcessing(true);
    try {
      const postponeDate = new Date();
      postponeDate.setDate(postponeDate.getDate() + days);

      await supabase
        .from('customers')
        .update({
          postpone_until: postponeDate.toISOString(),
          postpone_reason: `Postponed for ${days} day(s) by admin`
        })
        .eq('id', email.customer_id);

      if (!profile) throw new Error('Not authenticated');

      await supabase
        .from('email_analysis')
        .insert({
          inbound_email_id: email.id,
          detected_intent: 'postpone',
          confidence_score: 1.0,
          keywords_found: [],
          action_taken: 'postponed_emails',
          processed_by_admin: profile.id,
          notes: `Manually postponed for ${days} day(s) until ${postponeDate.toLocaleDateString()}`,
        });

      await supabase
        .from('inbound_emails')
        .update({ processing_status: 'processed' })
        .eq('id', email.id);

      setMessage(`Customer postponed for ${days} day(s)`);
      setTimeout(() => {
        setMessage('');
        onBack();
      }, 2000);
    } catch (error) {
      console.error('Error postponing:', error);
      setMessage('Error postponing customer');
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setProcessing(false);
    }
  };

  const downloadFile = async (file: any) => {
    try {
      const { data, error } = await supabase.storage
        .from('customer-files')
        .download(file.storage_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading file:', error);
      alert('Error downloading file');
    }
  };

  const getIntentColor = (intent: string) => {
    switch (intent) {
      case 'file_attached':
        return 'text-green-400 bg-green-500/20 border-green-500/30';
      case 'postpone':
        return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30';
      case 'stop':
        return 'text-red-400 bg-red-500/20 border-red-500/30';
      case 'unclear':
        return 'text-slate-400 bg-slate-500/20 border-slate-500/30';
      default:
        return 'text-blue-400 bg-blue-500/20 border-blue-500/30';
    }
  };

  const getIntentIcon = (intent: string) => {
    switch (intent) {
      case 'file_attached':
        return <CheckCircle size={20} />;
      case 'postpone':
        return <Clock size={20} />;
      case 'stop':
        return <XCircle size={20} />;
      default:
        return <Mail size={20} />;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const cleanEmailBody = (body: string) => {
    let cleanedBody = body;

    cleanedBody = cleanedBody.split(/_{20,}/)[0];
    cleanedBody = cleanedBody.split(/[-\s]*On .+wrote\s*[-\s]*/i)[0];
    cleanedBody = cleanedBody.split(/From:\s*.+\nSent:/i)[0];

    return cleanedBody
      .split('\n')
      .map(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith('>')) {
          return '';
        }
        return trimmed;
      })
      .filter(line => line && !line.match(/^[-=_]+$/))
      .join('\n')
      .trim();
  };

  const handleSendReply = async () => {
    if (!replyBody.trim()) {
      setMessage('Reply body cannot be empty');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    setSendingReply(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email-reply`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            to: email.sender_email,
            subject: replySubject,
            body: replyBody,
            inbound_email_id: email.id,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to send email');
      }

      setMessage('Reply sent successfully!');
      setShowReply(false);
      setReplyBody('');
      await loadThreadMessages();
      setTimeout(() => setMessage(''), 3000);
    } catch (error: any) {
      console.error('Error sending reply:', error);
      setMessage(`Error: ${error.message}`);
      setTimeout(() => setMessage(''), 5000);
    } finally {
      setSendingReply(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-blue-50 to-white p-8">
      <div className="max-w-5xl mx-auto">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-blue-600 hover:text-blue-900 mb-6 transition-colors"
        >
          <ArrowLeft size={20} />
          Back to Inbox
        </button>

        {message && (
          <div className="mb-6 p-4 bg-blue-100 border border-blue-300 rounded-lg">
            <p className="text-blue-900">{message}</p>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-xl border border-blue-200">
          <div className="p-6 border-b border-blue-200">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-blue-900 mb-2">
                  {email.subject || '(No Subject)'}
                </h2>
                <div className="flex flex-wrap gap-4 text-sm text-blue-600">
                  <div className="flex items-center gap-2">
                    <User size={16} />
                    <span>{email.customers?.name || 'Unknown Sender'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail size={16} />
                    <span>{email.sender_email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar size={16} />
                    <span>{new Date(email.received_at).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>

            {analysis && (
              <div className="flex flex-wrap gap-3">
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${getIntentColor(analysis.detected_intent)}`}>
                  {getIntentIcon(analysis.detected_intent)}
                  <span className="text-sm capitalize">{analysis.detected_intent.replace('_', ' ')}</span>
                  <span className="text-xs opacity-70">
                    ({Math.round(analysis.confidence_score * 100)}% confidence)
                  </span>
                </div>

                {analysis.action_taken !== 'none' && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-blue-500/30 bg-blue-500/20 text-blue-400">
                    <CheckCircle size={16} />
                    <span className="text-sm capitalize">{analysis.action_taken.replace('_', ' ')}</span>
                  </div>
                )}
              </div>
            )}

            {analysis?.keywords_found && analysis.keywords_found.length > 0 && (
              <div className="mt-4">
                <p className="text-xs text-blue-600 mb-2">Keywords detected:</p>
                <div className="flex flex-wrap gap-2">
                  {analysis.keywords_found.map((keyword, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-1 bg-blue-100 text-blue-900 text-xs rounded"
                    >
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {analysis?.reasoning && (
              <div className="mt-4">
                <p className="text-xs text-blue-600 mb-2">AI Analysis:</p>
                <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                  <p className="text-blue-900 text-sm">{analysis.reasoning}</p>
                </div>
              </div>
            )}
          </div>

          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-blue-900">Conversation</h3>
              <button
                onClick={() => setShowReply(!showReply)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                <Send size={16} />
                Reply
              </button>
            </div>
            {loadingThread ? (
              <div className="text-center py-8">
                <p className="text-blue-600">Loading conversation...</p>
              </div>
            ) : (
              <div className="space-y-4">
                {threadMessages.map((msg, idx) => {
                  const isCustomer = msg.type === 'inbound';
                  const messageBody = isCustomer ? cleanEmailBody(msg.body) : msg.body;
                  const senderName = isCustomer ? (email.customers?.name || 'Customer') : 'Venture Team';
                  const timestamp = new Date(msg.timestamp).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                  });
                  const hasAttachments = msg.attachments && msg.attachments.length > 0;

                  return (
                    <div
                      key={`${msg.type}-${msg.id}-${idx}`}
                      className={`flex ${isCustomer ? 'justify-start' : 'justify-end'}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                          isCustomer
                            ? 'bg-blue-100 text-blue-900 rounded-tl-sm border border-blue-200'
                            : 'bg-blue-600 text-white rounded-tr-sm'
                        }`}
                      >
                        <p className="text-sm font-medium mb-1 opacity-70">
                          {senderName}
                        </p>
                        <p className="text-sm whitespace-pre-wrap leading-relaxed">{messageBody}</p>
                        {hasAttachments && (
                          <div className={`mt-3 pt-3 border-t ${isCustomer ? 'border-blue-300' : 'border-blue-400'}`}>
                            <div className="flex items-center gap-2 text-xs opacity-80">
                              <Paperclip size={14} />
                              <span className="font-medium">
                                {msg.attachments.length} {msg.attachments.length === 1 ? 'attachment' : 'attachments'}
                              </span>
                            </div>
                            <div className="mt-2 space-y-1">
                              {msg.attachments.map((file: any) => (
                                <div
                                  key={file.id}
                                  className={`flex items-center justify-between gap-2 p-2 rounded-lg ${
                                    isCustomer ? 'bg-blue-200/50' : 'bg-blue-700/50'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <FileText size={14} className="flex-shrink-0" />
                                    <span className="text-xs truncate">{file.filename}</span>
                                  </div>
                                  <button
                                    onClick={() => downloadFile(file)}
                                    className={`flex-shrink-0 p-1 rounded hover:bg-opacity-20 transition-colors ${
                                      isCustomer ? 'hover:bg-blue-900' : 'hover:bg-white'
                                    }`}
                                    title="Download"
                                  >
                                    <Download size={12} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        <p className="text-xs opacity-60 mt-2">{timestamp}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {showReply && (
              <div className="mt-6 space-y-4 bg-blue-50 rounded-lg p-6 border border-blue-200">
                <h4 className="text-lg font-semibold text-blue-900 flex items-center gap-2">
                  <Send size={20} className="text-blue-600" />
                  Reply to {email.sender_email}
                </h4>

                <div>
                  <textarea
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    rows={4}
                    placeholder="Type your message..."
                    className="w-full px-4 py-3 bg-white border border-blue-300 rounded-2xl text-blue-900 placeholder-blue-400 focus:outline-none focus:border-blue-500 resize-none"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleSendReply}
                    disabled={sendingReply || !replyBody.trim()}
                    className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed text-white rounded-xl transition-colors font-medium"
                  >
                    <Send size={18} />
                    {sendingReply ? 'Sending...' : 'Send'}
                  </button>
                  <button
                    onClick={() => setShowReply(false)}
                    disabled={sendingReply}
                    className="px-6 py-3 bg-blue-200 hover:bg-blue-300 disabled:bg-blue-100 text-blue-900 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {email.customer_files && email.customer_files.length > 0 && (
            <div className="p-6 border-t border-blue-200">
              <h3 className="text-lg font-semibold text-blue-900 mb-4 flex items-center gap-2">
                <FileText size={20} className="text-green-600" />
                Attachments ({email.customer_files.length})
              </h3>
              <div className="space-y-3">
                {email.customer_files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200 hover:border-blue-300 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="p-2 bg-green-100 rounded-lg">
                        <FileText size={20} className="text-green-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-blue-900 font-medium truncate">{file.filename}</p>
                        <p className="text-xs text-blue-600">
                          {formatFileSize(file.file_size)} • {file.mime_type}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => downloadFile(file)}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                    >
                      <Download size={16} />
                      Download
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {email.customer_id && email.processing_status !== 'processed' && (
            <div className="p-6 border-t border-blue-200 bg-blue-50">
              <h3 className="text-lg font-semibold text-blue-900 mb-4 flex items-center gap-2">
                <Edit size={20} />
                Manual Actions
              </h3>
              <p className="text-sm text-blue-600 mb-4">
                This email requires manual review. Choose an action to take:
              </p>

              <div className="mb-6">
                <h4 className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-2">
                  <Clock size={16} />
                  Postpone Emails
                </h4>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handlePostpone(1)}
                    disabled={processing}
                    className="px-3 py-2 bg-yellow-500 hover:bg-yellow-600 disabled:bg-yellow-700 text-white rounded-lg transition-colors text-sm"
                  >
                    1 Day
                  </button>
                  <button
                    onClick={() => handlePostpone(2)}
                    disabled={processing}
                    className="px-3 py-2 bg-yellow-500 hover:bg-yellow-600 disabled:bg-yellow-700 text-white rounded-lg transition-colors text-sm"
                  >
                    2 Days
                  </button>
                  <button
                    onClick={() => handlePostpone(3)}
                    disabled={processing}
                    className="px-3 py-2 bg-yellow-500 hover:bg-yellow-600 disabled:bg-yellow-700 text-white rounded-lg transition-colors text-sm"
                  >
                    3 Days
                  </button>
                  <button
                    onClick={() => handlePostpone(7)}
                    disabled={processing}
                    className="px-3 py-2 bg-yellow-500 hover:bg-yellow-600 disabled:bg-yellow-700 text-white rounded-lg transition-colors text-sm"
                  >
                    1 Week
                  </button>
                  <button
                    onClick={() => handlePostpone(14)}
                    disabled={processing}
                    className="px-3 py-2 bg-yellow-500 hover:bg-yellow-600 disabled:bg-yellow-700 text-white rounded-lg transition-colors text-sm"
                  >
                    2 Weeks
                  </button>
                  <button
                    onClick={() => handlePostpone(30)}
                    disabled={processing}
                    className="px-3 py-2 bg-yellow-500 hover:bg-yellow-600 disabled:bg-yellow-700 text-white rounded-lg transition-colors text-sm"
                  >
                    1 Month
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => handleManualAction('marked_responded')}
                  disabled={processing}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-800 text-white rounded-lg transition-colors"
                >
                  <CheckCircle size={16} />
                  Mark as Responded
                </button>
                <button
                  onClick={() => handleManualAction('deactivated_customer')}
                  disabled={processing}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-800 text-white rounded-lg transition-colors"
                >
                  <XCircle size={16} />
                  Deactivate Customer
                </button>
              </div>
            </div>
          )}

          {!email.customer_id && (
            <div className="p-6 border-t border-red-200 bg-red-50">
              <div className="flex items-start gap-3">
                <AlertCircle className="text-red-600 flex-shrink-0" size={24} />
                <div>
                  <h3 className="text-lg font-semibold text-red-900 mb-2">Customer Not Found</h3>
                  <p className="text-sm text-red-800">
                    This email was sent from <strong>{email.sender_email}</strong>, which doesn't match any customer in the system.
                    You may need to add this customer manually or ignore this email.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
