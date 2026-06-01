import { useState, useEffect } from 'react';
import {
  X, Send, Loader2, Mail, Sparkles, Bell, Ticket, Clock,
  ChevronDown, ChevronUp, RefreshCw, CheckCircle, AlertTriangle,
  Settings, Server,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../contexts/ToastContext';
import { TicketGroup } from './types';

interface TicketEmailComposerProps {
  isOpen: boolean;
  ticket: TicketGroup;
  onClose: () => void;
  onEmailSent?: () => void;
}

interface EmailThread {
  id: string;
  direction: 'inbound' | 'outbound';
  from_email: string;
  to_email: string;
  subject: string;
  body_text: string;
  body_html: string;
  created_at: string;
  sent_by_name?: string;
  ai_analysis?: any;
  ai_suggested_action?: string;
}

interface SmtpConfig {
  id: string;
  name: string;
  from_email: string;
  from_name: string;
  is_default: boolean;
}

export default function TicketEmailComposer({ isOpen, ticket, onClose, onEmailSent }: TicketEmailComposerProps) {
  const { showToast } = useToast();
  const [toEmail, setToEmail] = useState('');
  const [subject, setSubject] = useState(`Regarding Account ${ticket.customer_name} - Ticket #${ticket.ticket_number}`);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sendVia, setSendVia] = useState<'sendgrid' | 'smtp'>('sendgrid');
  const [smtpConfigs, setSmtpConfigs] = useState<SmtpConfig[]>([]);
  const [selectedSmtpId, setSelectedSmtpId] = useState('');
  const [emailThreads, setEmailThreads] = useState<EmailThread[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);

  // Action preferences
  const [afterSendAction, setAfterSendAction] = useState<'none' | 'reminder' | 'ticket' | 'both'>('none');
  const [reminderDate, setReminderDate] = useState('');
  const [reminderNote, setReminderNote] = useState('');
  const [autoCreateTicket, setAutoCreateTicket] = useState(false);
  const [ticketCreationMode, setTicketCreationMode] = useState<'manual' | 'auto'>('manual');

  useEffect(() => {
    if (isOpen) {
      fetchEmailThreads();
      fetchSmtpConfigs();
      fetchCustomerEmail();
      fetchEmailSettings();
    }
  }, [isOpen, ticket.ticket_id]);

  const fetchEmailSettings = async () => {
    try {
      const { data } = await supabase
        .from('email_settings')
        .select('default_send_method, smtp_enabled')
        .limit(1)
        .maybeSingle();
      if (data?.smtp_enabled && data?.default_send_method === 'smtp') {
        setSendVia('smtp');
      }
    } catch {
      // ignore
    }
  };

  const fetchSmtpConfigs = async () => {
    try {
      const { data } = await supabase
        .from('smtp_configurations')
        .select('id, name, from_email, from_name, is_default')
        .eq('is_active', true)
        .order('is_default', { ascending: false });
      if (data && data.length > 0) {
        setSmtpConfigs(data);
        const defaultConfig = data.find(c => c.is_default) || data[0];
        setSelectedSmtpId(defaultConfig.id);
      }
    } catch {
      // ignore - user may not have permission
    }
  };

  const fetchCustomerEmail = async () => {
    try {
      const { data } = await supabase
        .from('acumatica_customers')
        .select('email')
        .eq('customer_id', ticket.customer_id)
        .maybeSingle();
      if (data?.email) {
        setToEmail(data.email);
      }
    } catch {
      // ignore
    }
  };

  const fetchEmailThreads = async () => {
    setLoadingThreads(true);
    try {
      const { data, error } = await supabase
        .from('ticket_email_threads')
        .select('*')
        .eq('ticket_id', ticket.ticket_id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setEmailThreads(data || []);
    } catch {
      setEmailThreads([]);
    } finally {
      setLoadingThreads(false);
    }
  };

  const analyzeWithAI = async (emailText: string) => {
    if (!emailText.trim()) return;
    setAiAnalyzing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat-assistant`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `Analyze this customer email reply and suggest what action to take. The customer is "${ticket.customer_name}" with ticket #${ticket.ticket_number}. Their reply: "${emailText}". Should we: create a new ticket, set a reminder, escalate, close the ticket, or just acknowledge? Give a brief recommendation in 1-2 sentences.`,
          conversation_history: [],
        }),
      });

      const data = await response.json();
      if (data.reply) {
        setAiSuggestion(data.reply);
      }
    } catch (err: any) {
      showToast('AI analysis unavailable', 'error');
    } finally {
      setAiAnalyzing(false);
    }
  };

  const handleSend = async () => {
    if (!toEmail || !subject || !body.trim()) {
      showToast('Please fill in all fields', 'error');
      return;
    }

    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-ticket-email`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ticket_id: ticket.ticket_id,
          customer_id: ticket.customer_id,
          to_email: toEmail,
          subject,
          body_text: body,
          send_via: sendVia,
          smtp_config_id: sendVia === 'smtp' ? selectedSmtpId : null,
          after_send_action: afterSendAction,
          reminder_date: reminderDate || null,
          reminder_note: reminderNote || null,
          auto_create_ticket: autoCreateTicket,
          ticket_creation_mode: ticketCreationMode,
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to send email');

      showToast('Email sent successfully', 'success');
      fetchEmailThreads();
      setBody('');
      onEmailSent?.();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center">
              <Mail className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Send Email</h2>
              <p className="text-xs text-gray-500">Ticket #{ticket.ticket_number} - {ticket.customer_name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Email Thread History */}
          {emailThreads.length > 0 && (
            <div className="px-6 py-3 border-b border-gray-100">
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                Email History ({emailThreads.length} messages)
              </button>
              {showHistory && (
                <div className="mt-3 space-y-3 max-h-60 overflow-y-auto">
                  {emailThreads.map((thread) => (
                    <div
                      key={thread.id}
                      className={`p-3 rounded-lg text-sm ${
                        thread.direction === 'outbound'
                          ? 'bg-blue-50 border border-blue-100'
                          : 'bg-gray-50 border border-gray-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs font-medium ${
                          thread.direction === 'outbound' ? 'text-blue-700' : 'text-gray-700'
                        }`}>
                          {thread.direction === 'outbound' ? 'Sent' : 'Received'} - {thread.from_email}
                        </span>
                        <span className="text-[10px] text-gray-400">
                          {new Date(thread.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 font-medium mb-0.5">{thread.subject}</p>
                      <p className="text-xs text-gray-500 line-clamp-2">{thread.body_text}</p>
                      {thread.ai_suggested_action && (
                        <div className="mt-2 flex items-center gap-1.5 px-2 py-1 bg-amber-50 rounded text-[10px] text-amber-700">
                          <Sparkles className="w-3 h-3" />
                          AI: {thread.ai_suggested_action}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Compose */}
          <div className="px-6 py-4 space-y-4">
            {/* Send method */}
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">Send via</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSendVia('sendgrid')}
                    className={`flex-1 py-2 px-3 rounded-lg border text-xs font-medium transition-all ${
                      sendVia === 'sendgrid'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <Mail className="w-3.5 h-3.5 inline mr-1.5" />
                    SendGrid
                  </button>
                  <button
                    type="button"
                    onClick={() => setSendVia('smtp')}
                    disabled={smtpConfigs.length === 0}
                    className={`flex-1 py-2 px-3 rounded-lg border text-xs font-medium transition-all ${
                      sendVia === 'smtp'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    } disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    <Server className="w-3.5 h-3.5 inline mr-1.5" />
                    SMTP {smtpConfigs.length === 0 && '(not configured)'}
                  </button>
                </div>
              </div>
              {sendVia === 'smtp' && smtpConfigs.length > 0 && (
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">SMTP Account</label>
                  <select
                    value={selectedSmtpId}
                    onChange={(e) => setSelectedSmtpId(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {smtpConfigs.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.from_email})</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* To */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
              <input
                type="email"
                value={toEmail}
                onChange={(e) => setToEmail(e.target.value)}
                placeholder="customer@example.com"
                className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Subject */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Body */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-gray-600">Message</label>
                <button
                  onClick={() => analyzeWithAI(body)}
                  disabled={!body.trim() || aiAnalyzing}
                  className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md disabled:opacity-40 transition-colors"
                >
                  {aiAnalyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  AI Analyze
                </button>
              </div>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={6}
                placeholder="Type your message..."
                className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              />
            </div>

            {/* AI Suggestion */}
            {aiSuggestion && (
              <div className="flex items-start gap-2.5 p-3.5 bg-amber-50 border border-amber-200 rounded-lg">
                <Sparkles className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-medium text-amber-800 mb-0.5">AI Suggestion</p>
                  <p className="text-xs text-amber-700">{aiSuggestion}</p>
                </div>
              </div>
            )}

            {/* After-send actions */}
            <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/50 space-y-3">
              <h4 className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                <Settings className="w-3.5 h-3.5" />
                After Sending
              </h4>

              <div className="grid grid-cols-2 gap-2">
                {([
                  { value: 'none', label: 'No follow-up', icon: CheckCircle },
                  { value: 'reminder', label: 'Set reminder', icon: Bell },
                  { value: 'ticket', label: 'Create ticket', icon: Ticket },
                  { value: 'both', label: 'Reminder + Ticket', icon: AlertTriangle },
                ] as const).map(option => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setAfterSendAction(option.value)}
                    className={`flex items-center gap-2 py-2 px-3 rounded-lg border text-xs font-medium transition-all ${
                      afterSendAction === option.value
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <option.icon className="w-3.5 h-3.5" />
                    {option.label}
                  </button>
                ))}
              </div>

              {(afterSendAction === 'reminder' || afterSendAction === 'both') && (
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="block text-[11px] font-medium text-gray-600 mb-1">Remind on</label>
                    <input
                      type="date"
                      value={reminderDate}
                      onChange={(e) => setReminderDate(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-gray-600 mb-1">Reminder note</label>
                    <input
                      type="text"
                      value={reminderNote}
                      onChange={(e) => setReminderNote(e.target.value)}
                      placeholder="Follow up on response..."
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}

              {(afterSendAction === 'ticket' || afterSendAction === 'both') && (
                <div className="pt-2">
                  <label className="block text-[11px] font-medium text-gray-600 mb-1.5">Ticket Creation</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setTicketCreationMode('manual')}
                      className={`flex-1 py-2 px-3 rounded-lg border text-xs font-medium transition-all ${
                        ticketCreationMode === 'manual'
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <Clock className="w-3.5 h-3.5 inline mr-1" />
                      Manual (ask me)
                    </button>
                    <button
                      type="button"
                      onClick={() => setTicketCreationMode('auto')}
                      className={`flex-1 py-2 px-3 rounded-lg border text-xs font-medium transition-all ${
                        ticketCreationMode === 'auto'
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <RefreshCw className="w-3.5 h-3.5 inline mr-1" />
                      Auto (AI decides)
                    </button>
                  </div>
                  <p className="mt-1.5 text-[10px] text-gray-500">
                    {ticketCreationMode === 'manual'
                      ? 'You will be prompted to review before a new ticket is created from the response.'
                      : 'AI will analyze the response and automatically create a ticket if it determines one is needed.'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !toEmail || !subject || !body.trim()}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send Email
          </button>
        </div>
      </div>
    </div>
  );
}
