import { useState, useEffect, useCallback, useRef } from 'react';
import { Check, X, Loader2, Smartphone } from 'lucide-react';
import { supabase } from '../../lib/supabase';

/**
 * Follows one app-change request inside the chat.
 *
 * The assistant files the request (request_app_change -> devbot_new); a Claude
 * session on the owner's PC does the work and streams its steps in here; the
 * OWNER approves by text message before anything goes live. Approvers can also
 * answer from here, which is the same path as the text.
 */

type Status =
  | 'new' | 'thinking' | 'asking' | 'waiting_approval'
  | 'approved' | 'deploying' | 'done' | 'rejected' | 'failed' | 'cancelled';

interface Request {
  id: number;
  status: Status;
  stage_note: string | null;
  summary: string | null;
  server: string | null;
  preview_url: string | null;
}

interface Message {
  id: number;
  role: 'admin' | 'owner' | 'bot' | 'progress' | 'system';
  body: string;
  created_at: string;
}

const LABEL: Record<Status, string> = {
  new: 'Queued',
  thinking: 'Working on it',
  asking: 'Needs your answer',
  waiting_approval: 'Waiting for the owner to approve by text',
  approved: 'Approved — going live',
  deploying: 'Going live',
  done: 'Live',
  rejected: 'Turned down',
  failed: 'Did not work',
  cancelled: 'Cancelled',
};

const TONE: Record<Status, string> = {
  new: 'bg-gray-50 border-gray-200 text-gray-700',
  thinking: 'bg-blue-50 border-blue-200 text-blue-800',
  asking: 'bg-amber-50 border-amber-200 text-amber-900',
  waiting_approval: 'bg-amber-50 border-amber-200 text-amber-900',
  approved: 'bg-blue-50 border-blue-200 text-blue-800',
  deploying: 'bg-blue-50 border-blue-200 text-blue-800',
  done: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  rejected: 'bg-gray-50 border-gray-200 text-gray-600',
  failed: 'bg-red-50 border-red-200 text-red-800',
  cancelled: 'bg-gray-50 border-gray-200 text-gray-600',
};

const SETTLED: Status[] = ['done', 'rejected', 'failed', 'cancelled'];

export default function ChangeRequestPanel({
  requestId,
  workerOnline,
}: {
  requestId: number;
  workerOnline: boolean;
}) {
  const [request, setRequest] = useState<Request | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [canApprove, setCanApprove] = useState(false);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const [{ data: r }, { data: m }] = await Promise.all([
      supabase
        .from('devbot_requests')
        .select('id, status, stage_note, summary, server, preview_url')
        .eq('id', requestId)
        .maybeSingle(),
      supabase
        .from('devbot_messages')
        .select('id, role, body, created_at')
        .eq('request_id', requestId)
        .order('id', { ascending: true })
        .limit(200),
    ]);
    if (r) setRequest(r as Request);
    setMessages((m || []) as Message[]);
    return r as Request | null;
  }, [requestId]);

  useEffect(() => {
    supabase.rpc('devbot_can_approve').then(({ data }) => setCanApprove(!!data));
  }, []);

  // Poll while it is moving; stop once it has settled.
  useEffect(() => {
    let live = true;
    const run = async () => {
      const r = await load();
      if (!live) return;
      if (!r || !SETTLED.includes(r.status)) {
        timer.current = setTimeout(run, 4000);
      }
    };
    run();
    return () => { live = false; if (timer.current) clearTimeout(timer.current); };
  }, [load]);

  const send = async () => {
    const body = reply.trim();
    if (!body) return;
    setBusy(true);
    setError(null);
    try {
      const { error: e } = await supabase.rpc('devbot_say', { p_request: requestId, p_body: body });
      if (e) throw e;
      setReply('');
      await load();
    } catch (e: any) {
      setError(e.message || 'Could not send that');
    } finally {
      setBusy(false);
    }
  };

  const decide = async (yes: boolean, note?: string) => {
    setBusy(true);
    setError(null);
    try {
      const { error: e } = await supabase.rpc('devbot_approve', {
        p_request: requestId, p_yes: yes, p_note: note ?? null,
      });
      if (e) throw e;
      await load();
    } catch (e: any) {
      setError(e.message || 'Could not record that');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    try {
      await supabase.rpc('devbot_cancel', { p_request: requestId });
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (!request) {
    return (
      <div className="mt-3 pt-3 border-t border-gray-100">
        <p className="flex items-center gap-1.5 text-xs text-gray-500">
          <Loader2 size={12} className="animate-spin" />
          Filing change #{requestId}…
        </p>
      </div>
    );
  }

  const working = ['thinking', 'approved', 'deploying'].includes(request.status);
  // The bot's own replies and the status lines; the running commentary is the tail.
  const spoken = messages.filter((m) => m.role !== 'progress');
  const lastProgress = [...messages].reverse().find((m) => m.role === 'progress');

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <div className={`rounded-xl border p-3 ${TONE[request.status]}`}>
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <p className="text-xs font-semibold">
            Change #{request.id} · {LABEL[request.status]}
          </p>
          {working && <Loader2 size={12} className="animate-spin shrink-0" />}
        </div>

        {request.stage_note && (
          <p className="text-[11px] opacity-80 mb-1.5">{request.stage_note}</p>
        )}

        {request.status === 'new' && !workerOnline && (
          <p className="text-[11px] opacity-80 mb-1.5">
            The owner's PC is not checked in, so this will start when it next comes online.
          </p>
        )}

        {request.summary && (
          <p className="text-[11px] mb-1.5 whitespace-pre-wrap">{request.summary}</p>
        )}

        {request.server && (
          <p className="text-[11px] mb-1.5">
            <span className="font-medium">Also changes:</span> {request.server}
          </p>
        )}

        {request.preview_url && (
          <a
            href={request.preview_url}
            target="_blank"
            rel="noreferrer"
            className="inline-block text-[11px] underline mb-1.5"
          >
            Look at the preview
          </a>
        )}

        {spoken.length > 0 && (
          <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
            {spoken.map((m) => (
              <p key={m.id} className="text-[11px] whitespace-pre-wrap">
                <span className="font-medium">
                  {m.role === 'bot' ? 'Bot' : m.role === 'owner' ? 'Owner' : m.role === 'admin' ? 'You' : '—'}:
                </span>{' '}
                {m.body}
              </p>
            ))}
          </div>
        )}

        {lastProgress && working && (
          <p className="mt-1.5 text-[11px] opacity-70 truncate">{lastProgress.body}</p>
        )}

        {request.status === 'waiting_approval' && (
          <p className="mt-2 flex items-center gap-1.5 text-[11px] font-medium">
            <Smartphone size={12} />
            Texted to the owner. Nothing goes live until he replies YES.
          </p>
        )}

        {error && <p className="mt-1.5 text-[11px] text-red-700">{error}</p>}

        {/* Answer the bot's question, or add something. */}
        {['asking', 'new', 'thinking'].includes(request.status) && (
          <div className="mt-2 flex gap-1.5">
            <input
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
              placeholder={request.status === 'asking' ? 'Answer the bot…' : 'Add a detail…'}
              className="flex-1 min-w-0 px-2 py-1 rounded-lg border border-gray-200 bg-white text-[11px] text-gray-800"
            />
            <button
              onClick={send}
              disabled={busy || !reply.trim()}
              className="px-2.5 py-1 bg-gray-800 hover:bg-gray-900 disabled:opacity-50 rounded-lg text-white text-[11px] font-medium"
            >
              Send
            </button>
          </div>
        )}

        {/* The owner can also decide here; it is the same path as the text. */}
        {canApprove && request.status === 'waiting_approval' && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              onClick={() => decide(true)}
              disabled={busy}
              className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg text-white text-[11px] font-medium"
            >
              <Check size={11} /> Put it live
            </button>
            <button
              onClick={() => {
                const note = window.prompt('What should change?');
                if (note && note.trim()) decide(false, note.trim());
              }}
              disabled={busy}
              className="px-2.5 py-1 bg-white hover:bg-gray-50 disabled:opacity-50 border border-gray-200 rounded-lg text-gray-700 text-[11px] font-medium"
            >
              Send back
            </button>
            <button
              onClick={() => decide(false)}
              disabled={busy}
              className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-gray-50 disabled:opacity-50 border border-gray-200 rounded-lg text-gray-700 text-[11px] font-medium"
            >
              <X size={11} /> No
            </button>
          </div>
        )}

        {!SETTLED.includes(request.status) && request.status !== 'deploying' && (
          <button
            onClick={cancel}
            disabled={busy}
            className="mt-2 text-[11px] underline opacity-70 hover:opacity-100 disabled:opacity-40"
          >
            Cancel this change
          </button>
        )}
      </div>
    </div>
  );
}
