import { useState, useEffect } from 'react';
import { Mail, Plus, Trash2, Send, Loader2, UserPlus, X, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Recipient {
  id: string;
  email: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

export default function SyncReportRecipients() {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    loadRecipients();
  }, []);

  const loadRecipients = async () => {
    try {
      const { data, error } = await supabase
        .from('sync_report_recipients')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;
      setRecipients(data || []);
    } catch (err: any) {
      console.error('Error loading recipients:', err);
    } finally {
      setLoading(false);
    }
  };

  const addRecipient = async () => {
    if (!newEmail.trim()) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('sync_report_recipients')
        .insert({
          email: newEmail.trim(),
          name: newName.trim(),
          is_active: true,
          created_by: user?.id,
        });

      if (error) throw error;

      setNewEmail('');
      setNewName('');
      setAdding(false);
      loadRecipients();
      showMessage('Recipient added', 'success');
    } catch (err: any) {
      showMessage(err.message, 'error');
    }
  };

  const toggleActive = async (id: string, currentActive: boolean) => {
    try {
      const { error } = await supabase
        .from('sync_report_recipients')
        .update({ is_active: !currentActive })
        .eq('id', id);

      if (error) throw error;
      loadRecipients();
    } catch (err: any) {
      showMessage(err.message, 'error');
    }
  };

  const removeRecipient = async (id: string) => {
    try {
      const { error } = await supabase
        .from('sync_report_recipients')
        .delete()
        .eq('id', id);

      if (error) throw error;
      loadRecipients();
      showMessage('Recipient removed', 'success');
    } catch (err: any) {
      showMessage(err.message, 'error');
    }
  };

  const sendTestReport = async () => {
    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-sync-report`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({}),
        }
      );

      const result = await response.json();

      if (result.success) {
        showMessage(`Report sent to ${result.recipientCount} recipient(s)`, 'success');
      } else {
        showMessage(result.error || 'Failed to send report', 'error');
      }
    } catch (err: any) {
      showMessage(err.message, 'error');
    } finally {
      setSending(false);
    }
  };

  const showMessage = (text: string, type: 'success' | 'error') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  };

  const activeCount = recipients.filter(r => r.is_active).length;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="bg-gradient-to-r from-teal-600 to-emerald-600 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
              <Mail className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Daily Sync Report Emails</h2>
              <p className="text-teal-100 text-sm">Sent twice daily at 8:00 AM & 5:00 PM Eastern</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={sendTestReport}
              disabled={sending || activeCount === 0}
              className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 disabled:bg-white/10 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
            >
              {sending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {sending ? 'Sending...' : 'Send Report Now'}
            </button>
          </div>
        </div>
      </div>

      <div className="p-6">
        {message && (
          <div className={`mb-4 p-3 rounded-lg text-sm font-medium ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {message.text}
          </div>
        )}

        <div className="mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
          <p className="text-sm text-slate-600">
            Each report includes sync status for all entities, recent activity summary, cron job health,
            error alerts, and a button to trigger a manual sync directly from the email.
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {activeCount} active recipient{activeCount !== 1 ? 's' : ''}
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="space-y-2">
            {recipients.map((recipient) => (
              <div
                key={recipient.id}
                className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                  recipient.is_active
                    ? 'bg-white border-slate-200'
                    : 'bg-slate-50 border-slate-100 opacity-60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggleActive(recipient.id, recipient.is_active)}
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                      recipient.is_active
                        ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200'
                        : 'bg-slate-200 text-slate-400 hover:bg-slate-300'
                    }`}
                    title={recipient.is_active ? 'Disable' : 'Enable'}
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {recipient.name || recipient.email}
                    </p>
                    {recipient.name && (
                      <p className="text-xs text-slate-500">{recipient.email}</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => removeRecipient(recipient.id)}
                  className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}

            {recipients.length === 0 && !adding && (
              <div className="text-center py-8 text-slate-500">
                <Mail className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No recipients configured yet</p>
              </div>
            )}
          </div>
        )}

        {adding ? (
          <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Name (optional)"
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
              />
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="Email address"
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                onKeyDown={(e) => e.key === 'Enter' && addRecipient()}
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={addRecipient}
                disabled={!newEmail.trim()}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
              >
                Add Recipient
              </button>
              <button
                onClick={() => { setAdding(false); setNewEmail(''); setNewName(''); }}
                className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg text-sm font-medium transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-slate-300 hover:border-teal-400 hover:bg-teal-50 text-slate-500 hover:text-teal-600 rounded-lg text-sm font-medium transition-all"
          >
            <UserPlus className="w-4 h-4" />
            Add Recipient
          </button>
        )}
      </div>
    </div>
  );
}
