import { useState, useEffect } from 'react';
import { formatDistanceToNow, format } from 'date-fns';
import {
  Clock, AlertCircle, ArrowRightLeft, Flag, FileText,
  Plus, Loader2, MessageSquare, Paperclip, Image
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface ActivityEntry {
  id: string;
  type: 'activity' | 'note';
  activity_type?: string;
  description: string;
  created_at: string;
  created_by_name: string;
  metadata?: Record<string, any>;
  has_attachments?: boolean;
  has_image?: boolean;
  document_urls?: string[];
}

interface TicketHistoryProps {
  ticketId: string;
}

const ACTIVITY_ICONS: Record<string, typeof Clock> = {
  created: Plus,
  status_change: ArrowRightLeft,
  priority_changed: Flag,
  note: MessageSquare,
  invoice_added: FileText,
};

const ACTIVITY_COLORS: Record<string, string> = {
  created: 'bg-emerald-500',
  status_change: 'bg-blue-500',
  priority_changed: 'bg-amber-500',
  note: 'bg-teal-500',
  invoice_added: 'bg-cyan-500',
};

const ACTIVITY_LABELS: Record<string, string> = {
  created: 'Created',
  status_change: 'Status Change',
  priority_changed: 'Priority Change',
  note: 'Note',
  invoice_added: 'Invoice Added',
};

export default function TicketHistory({ ticketId }: TicketHistoryProps) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      setError(null);

      try {
        const [activityResult, notesResult] = await Promise.all([
          supabase
            .from('ticket_activity_log')
            .select(`
              id,
              activity_type,
              description,
              created_at,
              metadata,
              created_by:user_profiles!ticket_activity_log_created_by_fkey(full_name, email)
            `)
            .eq('ticket_id', ticketId)
            .order('created_at', { ascending: false }),
          supabase
            .from('ticket_notes')
            .select(`
              id,
              note_text,
              has_voice_note,
              has_image,
              document_urls,
              created_at,
              created_by:user_profiles!ticket_notes_created_by_user_id_fkey(full_name, email)
            `)
            .eq('ticket_id', ticketId)
            .order('created_at', { ascending: false })
        ]);

        if (activityResult.error) throw activityResult.error;
        if (notesResult.error) throw notesResult.error;

        const activityEntries: ActivityEntry[] = (activityResult.data || []).map((a: any) => ({
          id: a.id,
          type: 'activity' as const,
          activity_type: a.activity_type,
          description: a.description,
          created_at: a.created_at,
          created_by_name: a.created_by?.full_name || a.created_by?.email || 'System',
          metadata: a.metadata,
        }));

        const noteEntries: ActivityEntry[] = (notesResult.data || []).map((n: any) => ({
          id: n.id,
          type: 'note' as const,
          activity_type: 'note',
          description: n.note_text,
          created_at: n.created_at,
          created_by_name: n.created_by?.full_name || n.created_by?.email || 'System',
          has_image: n.has_image,
          has_attachments: n.document_urls && n.document_urls.length > 0,
          document_urls: n.document_urls,
        }));

        const combined = [...activityEntries, ...noteEntries]
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        const seen = new Set<string>();
        const deduplicated = combined.filter(entry => {
          const key = `${entry.activity_type}-${entry.description}-${Math.floor(new Date(entry.created_at).getTime() / 2000)}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        setEntries(deduplicated);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [ticketId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
        <span className="ml-2 text-sm text-gray-500">Loading history...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 py-4 px-3 text-sm text-red-600 bg-red-50 rounded-lg">
        <AlertCircle className="w-4 h-4 flex-shrink-0" />
        Failed to load history: {error}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-6 text-sm text-gray-500">
        No activity recorded for this ticket yet.
      </div>
    );
  }

  return (
    <div className="relative pl-6">
      <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-gray-200" />

      <div className="space-y-0">
        {entries.map((entry, index) => {
          const IconComponent = ACTIVITY_ICONS[entry.activity_type || ''] || Clock;
          const dotColor = ACTIVITY_COLORS[entry.activity_type || ''] || 'bg-gray-400';
          const label = ACTIVITY_LABELS[entry.activity_type || ''] || entry.activity_type || 'Activity';
          const isFirst = index === 0;

          return (
            <div key={entry.id} className="relative pb-4 last:pb-0">
              <div className={`absolute -left-6 top-1 w-[22px] h-[22px] rounded-full flex items-center justify-center ${dotColor} ${isFirst ? 'ring-2 ring-offset-1 ring-blue-200' : ''}`}>
                <IconComponent className="w-3 h-3 text-white" />
              </div>

              <div className={`ml-3 p-3 rounded-lg border transition-colors ${isFirst ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-100 hover:border-gray-200'}`}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    entry.activity_type === 'created' ? 'bg-emerald-100 text-emerald-800' :
                    entry.activity_type === 'status_change' ? 'bg-blue-100 text-blue-800' :
                    entry.activity_type === 'priority_changed' ? 'bg-amber-100 text-amber-800' :
                    entry.activity_type === 'note' && entry.type === 'note' ? 'bg-teal-100 text-teal-800' :
                    entry.activity_type === 'note' ? 'bg-teal-100 text-teal-800' :
                    entry.activity_type === 'invoice_added' ? 'bg-cyan-100 text-cyan-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {label}
                  </span>
                  <span className="text-xs text-gray-400" title={format(new Date(entry.created_at), 'PPpp')}>
                    {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                  </span>
                </div>

                <p className="text-sm text-gray-800 leading-relaxed">
                  {entry.description}
                </p>

                <div className="flex items-center gap-3 mt-1.5">
                  <span className="text-xs text-gray-500">
                    by {entry.created_by_name}
                  </span>
                  <span className="text-xs text-gray-400">
                    {format(new Date(entry.created_at), 'MMM d, yyyy h:mm a')}
                  </span>
                  {entry.has_image && (
                    <span className="flex items-center gap-1 text-xs text-blue-600">
                      <Image className="w-3 h-3" /> Image
                    </span>
                  )}
                  {entry.has_attachments && (
                    <span className="flex items-center gap-1 text-xs text-blue-600">
                      <Paperclip className="w-3 h-3" /> Attachment
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
