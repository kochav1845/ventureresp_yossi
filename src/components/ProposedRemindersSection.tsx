import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Sparkles, Mail, Check, X as XIcon, Calendar, RefreshCw,
  Settings as SettingsIcon, AlertCircle, FileText, Building2, Bot,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { formatDate as formatDateUtil } from '../lib/dateUtils';

type ProposedReminder = {
  id: string;
  title: string;
  description: string | null;
  reminder_date: string;
  priority: string;
  reminder_type: string;
  invoice_reference_number: string | null;
  user_id: string | null;
  source_email_id: string | null;
  proposed_by_rule_id: string | null;
  proposal_status: string;
  created_at: string;
  inbound_emails?: {
    id: string;
    sender_email: string;
    subject: string;
    received_at: string;
    acumatica_customer_name: string | null;
  } | null;
  proposed_reminder_rules?: {
    id: string;
    name: string;
    rule_type: string;
  } | null;
  user_profiles?: {
    id: string;
    full_name: string | null;
    email: string;
  } | null;
};

type Props = {
  onChange?: () => void;
};

export default function ProposedRemindersSection({ onChange }: Props) {
  const { user } = useAuth();
  const rawNavigate = useNavigate();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const navigate = (path: string, options?: any) => {
    if (path.startsWith('/') && orgSlug && !path.startsWith(`/${orgSlug}`)) {
      rawNavigate(`/${orgSlug}${path}`, options);
    } else {
      rawNavigate(path, options);
    }
  };

  const [proposals, setProposals] = useState<ProposedReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState<string>('');

  useEffect(() => {
    loadProposals();
  }, [scope]);

  const loadProposals = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('invoice_reminders')
        .select(`
          *,
          inbound_emails:source_email_id (
            id,
            sender_email,
            subject,
            received_at,
            acumatica_customer_name
          ),
          proposed_reminder_rules:proposed_by_rule_id (
            id,
            name,
            rule_type
          ),
          user_profiles:user_id (
            id,
            full_name,
            email
          )
        `)
        .eq('is_proposed', true)
        .eq('proposal_status', 'pending')
        .order('created_at', { ascending: false })
        .limit(200);

      if (scope === 'mine' && user?.id) {
        query = query.eq('user_id', user.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      setProposals(data as any || []);
    } catch (err) {
      console.error('Error loading proposed reminders:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (proposal: ProposedReminder) => {
    setActionInFlight(proposal.id);
    try {
      const newDate = editingId === proposal.id && editDate
        ? new Date(editDate).toISOString()
        : null;

      const { error } = await supabase.rpc('accept_proposed_reminder', {
        p_id: proposal.id,
        p_user_id: proposal.user_id || user?.id,
        p_reminder_date: newDate,
      });
      if (error) throw error;
      setEditingId(null);
      setEditDate('');
      await loadProposals();
      onChange?.();
    } catch (err) {
      console.error('Error accepting proposal:', err);
      alert('Failed to accept proposed reminder');
    } finally {
      setActionInFlight(null);
    }
  };

  const handleDismiss = async (proposalId: string) => {
    setActionInFlight(proposalId);
    try {
      const { error } = await supabase.rpc('dismiss_proposed_reminder', {
        p_id: proposalId,
      });
      if (error) throw error;
      await loadProposals();
      onChange?.();
    } catch (err) {
      console.error('Error dismissing proposal:', err);
      alert('Failed to dismiss proposed reminder');
    } finally {
      setActionInFlight(null);
    }
  };

  const handleOpenEmail = (emailId: string) => {
    navigate('/inbox', { state: { openEmailId: emailId } });
  };

  const getPriorityClass = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-500/10 border-red-500/40 text-red-300';
      case 'high': return 'bg-orange-500/10 border-orange-500/40 text-orange-300';
      case 'medium': return 'bg-amber-500/10 border-amber-500/40 text-amber-300';
      case 'low': return 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300';
      default: return 'bg-slate-500/10 border-slate-500/40 text-slate-300';
    }
  };

  return (
    <div className="bg-slate-800/40 rounded-xl border border-slate-700">
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <Sparkles className="w-5 h-5 text-amber-300" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Proposed Reminders</h2>
            <p className="text-xs text-slate-400">
              Suggestions generated from incoming emails. Accept to add to your reminders.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-0.5 flex">
            <button
              onClick={() => setScope('mine')}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                scope === 'mine' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              For me
            </button>
            <button
              onClick={() => setScope('all')}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                scope === 'all' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              All
            </button>
          </div>
          <button
            onClick={loadProposals}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => navigate('/proposed-reminder-rules')}
            className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition-colors"
          >
            <SettingsIcon className="w-4 h-4" />
            Rules
          </button>
        </div>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-400"></div>
          </div>
        ) : proposals.length === 0 ? (
          <div className="text-center py-10">
            <Sparkles className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">No proposed reminders right now</p>
            <p className="text-slate-500 text-xs mt-1">
              When matching emails arrive, suggestions will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {proposals.map((p) => {
              const isEditing = editingId === p.id;
              return (
                <div
                  key={p.id}
                  className="bg-slate-900/60 border border-slate-700 rounded-lg p-4 hover:border-amber-500/40 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg border ${getPriorityClass(p.priority)} shrink-0`}>
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-white font-medium leading-snug">{p.title}</h3>
                        <span className={`shrink-0 text-[10px] uppercase tracking-wide px-2 py-0.5 rounded border ${getPriorityClass(p.priority)}`}>
                          {p.priority}
                        </span>
                      </div>

                      {p.description && (
                        <p className="text-sm text-slate-300 mt-1 whitespace-pre-wrap">{p.description}</p>
                      )}

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Suggested: {formatDateUtil(p.reminder_date)}
                        </span>
                        {p.invoice_reference_number && (
                          <span className="flex items-center gap-1 text-blue-300">
                            <FileText className="w-3 h-3" />
                            {p.invoice_reference_number}
                          </span>
                        )}
                        {p.inbound_emails?.acumatica_customer_name && (
                          <span className="flex items-center gap-1">
                            <Building2 className="w-3 h-3" />
                            {p.inbound_emails.acumatica_customer_name}
                          </span>
                        )}
                        {p.user_profiles && (
                          <span className="text-slate-500">
                            For: {p.user_profiles.full_name || p.user_profiles.email}
                          </span>
                        )}
                        {p.proposed_reminder_rules && (
                          <span className="flex items-center gap-1 text-amber-300">
                            <Bot className="w-3 h-3" />
                            Rule: {p.proposed_reminder_rules.name}
                          </span>
                        )}
                      </div>

                      {p.inbound_emails && (
                        <button
                          onClick={() => handleOpenEmail(p.inbound_emails!.id)}
                          className="mt-3 flex items-center gap-2 text-xs text-blue-300 hover:text-blue-200 hover:underline"
                        >
                          <Mail className="w-3.5 h-3.5" />
                          <span className="truncate max-w-md">
                            From {p.inbound_emails.sender_email}: {p.inbound_emails.subject}
                          </span>
                        </button>
                      )}

                      {isEditing && (
                        <div className="mt-3 flex items-center gap-2">
                          <input
                            type="datetime-local"
                            value={editDate}
                            onChange={(e) => setEditDate(e.target.value)}
                            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-amber-500"
                          />
                          <button
                            onClick={() => { setEditingId(null); setEditDate(''); }}
                            className="text-xs text-slate-400 hover:text-white"
                          >
                            Cancel
                          </button>
                        </div>
                      )}

                      <div className="flex items-center gap-2 mt-3">
                        <button
                          onClick={() => handleAccept(p)}
                          disabled={actionInFlight === p.id}
                          className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-medium disabled:opacity-60 transition-colors"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Accept
                        </button>
                        {!isEditing && (
                          <button
                            onClick={() => {
                              setEditingId(p.id);
                              setEditDate(p.reminder_date.slice(0, 16));
                            }}
                            className="flex items-center gap-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs font-medium transition-colors"
                          >
                            <Calendar className="w-3.5 h-3.5" />
                            Reschedule
                          </button>
                        )}
                        <button
                          onClick={() => handleDismiss(p.id)}
                          disabled={actionInFlight === p.id}
                          className="flex items-center gap-1 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-300 rounded text-xs font-medium disabled:opacity-60 transition-colors"
                        >
                          <XIcon className="w-3.5 h-3.5" />
                          Dismiss
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {proposals.length > 0 && (
        <div className="px-4 py-3 border-t border-slate-700 flex items-center gap-2 text-xs text-slate-500">
          <AlertCircle className="w-3.5 h-3.5" />
          Proposals are auto-generated. Review them before accepting.
        </div>
      )}
    </div>
  );
}
