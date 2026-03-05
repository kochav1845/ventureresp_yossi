import { useState, useEffect, useCallback } from 'react';
import {
  Calendar, Upload, Download, Trash2, FileText, Paperclip,
  ChevronLeft, ChevronRight, X, Check, Clock, Mail, MailOpen,
  Pause, AlertCircle, RefreshCw, Eye
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface CustomerMonthlySheetProps {
  customerId: string;
  customerName: string;
  customerEmail?: string;
}

interface MonthData {
  month: number;
  year: number;
  status: string;
  emails_sent_count: number;
  emails_received_count: number;
  attachments_count: number;
  last_email_sent_at: string | null;
  last_response_at: string | null;
  postponed_until: string | null;
  notes: string | null;
  tracking_id: string | null;
}

interface MonthlyFile {
  id: string;
  filename: string;
  storage_path: string;
  file_size: number;
  mime_type: string;
  upload_source: string;
  created_at: string;
}

interface MonthlyEmail {
  id: string;
  direction: 'sent' | 'received';
  subject: string;
  date: string;
  status?: string;
  sender_email?: string;
  template_name?: string;
  open_count?: number;
  body_preview?: string;
  sent_by_name?: string;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; icon: any }> = {
  pending: { label: 'Pending', color: 'text-gray-500', bg: 'bg-gray-50', border: 'border-gray-200', icon: Clock },
  active: { label: 'Active', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', icon: Mail },
  sent: { label: 'Sent', color: 'text-sky-700', bg: 'bg-sky-50', border: 'border-sky-200', icon: MailOpen },
  responded: { label: 'Responded', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: Check },
  postponed: { label: 'Postponed', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', icon: Pause },
  inactive: { label: 'Inactive', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', icon: AlertCircle },
  no_response: { label: 'No Response', color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200', icon: Clock },
};

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'active', label: 'Active' },
  { value: 'sent', label: 'Sent' },
  { value: 'responded', label: 'Responded' },
  { value: 'postponed', label: 'Postponed' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'no_response', label: 'No Response' },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

export default function CustomerMonthlySheet({ customerId, customerName, customerEmail }: CustomerMonthlySheetProps) {
  const { profile } = useAuth();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [monthlyData, setMonthlyData] = useState<MonthData[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedMonth, setExpandedMonth] = useState<number | null>(null);
  const [monthFiles, setMonthFiles] = useState<MonthlyFile[]>([]);
  const [monthEmails, setMonthEmails] = useState<MonthlyEmail[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadingEmails, setLoadingEmails] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editingNotes, setEditingNotes] = useState<number | null>(null);
  const [noteText, setNoteText] = useState('');
  const [changingStatus, setChangingStatus] = useState<number | null>(null);

  const loadMonthlyData = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_customer_monthly_overview', {
        p_customer_id: customerId,
        p_year: selectedYear,
      });

      if (error) throw error;
      setMonthlyData(data || []);
    } catch (err) {
      console.error('Error loading monthly data:', err);
    } finally {
      setLoading(false);
    }
  }, [customerId, selectedYear]);

  useEffect(() => {
    loadMonthlyData();
  }, [loadMonthlyData]);

  const loadMonthFiles = async (month: number) => {
    setLoadingFiles(true);
    try {
      const { data, error } = await supabase
        .from('customer_monthly_files')
        .select('*')
        .eq('acumatica_customer_id', customerId)
        .eq('month', month)
        .eq('year', selectedYear)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMonthFiles(data || []);
    } catch (err) {
      console.error('Error loading month files:', err);
    } finally {
      setLoadingFiles(false);
    }
  };

  const loadMonthEmails = async (month: number) => {
    setLoadingEmails(true);
    try {
      const startDate = new Date(selectedYear, month - 1, 1).toISOString();
      const endDate = new Date(selectedYear, month, 1).toISOString();

      const emails: MonthlyEmail[] = [];

      const { data: sentLogs } = await supabase
        .from('customer_email_logs')
        .select('id, subject, sent_at, status, template_name, open_count, sent_by_user_id')
        .eq('customer_id', customerId)
        .gte('sent_at', startDate)
        .lt('sent_at', endDate)
        .order('sent_at', { ascending: false });

      if (sentLogs) {
        const userIds = [...new Set(sentLogs.filter(e => e.sent_by_user_id).map(e => e.sent_by_user_id))];
        let userMap = new Map<string, string>();
        if (userIds.length > 0) {
          const { data: users } = await supabase
            .from('user_profiles')
            .select('id, full_name')
            .in('id', userIds);
          if (users) {
            userMap = new Map(users.map(u => [u.id, u.full_name]));
          }
        }

        for (const log of sentLogs) {
          emails.push({
            id: log.id,
            direction: 'sent',
            subject: log.subject || '(No subject)',
            date: log.sent_at,
            status: log.status,
            template_name: log.template_name,
            open_count: log.open_count,
            sent_by_name: log.sent_by_user_id ? userMap.get(log.sent_by_user_id) || undefined : undefined,
          });
        }
      }

      const { data: acCustomer } = await supabase
        .from('acumatica_customers')
        .select('email_address, general_email, billing_email')
        .eq('customer_id', customerId)
        .maybeSingle();

      if (acCustomer) {
        const customerEmails = [
          acCustomer.email_address,
          acCustomer.general_email,
          acCustomer.billing_email,
        ].filter((e): e is string => !!e && e.trim() !== '');
        const uniqueEmails = [...new Set(customerEmails.map(e => e.toLowerCase()))];

        if (uniqueEmails.length > 0) {
          const { data: inbound } = await supabase
            .from('inbound_emails')
            .select('id, sender_email, subject, body, received_at, processing_status')
            .in('sender_email', uniqueEmails)
            .gte('received_at', startDate)
            .lt('received_at', endDate)
            .order('received_at', { ascending: false });

          if (inbound) {
            for (const email of inbound) {
              const bodyText = email.body?.replace(/<[^>]*>/g, '') || '';
              emails.push({
                id: email.id,
                direction: 'received',
                subject: email.subject || '(No subject)',
                date: email.received_at,
                sender_email: email.sender_email,
                body_preview: bodyText.slice(0, 120) + (bodyText.length > 120 ? '...' : ''),
              });
            }
          }

          const { data: replies } = await supabase
            .from('outbound_replies')
            .select('id, sent_to, subject, sent_at, sent_by')
            .in('sent_to', uniqueEmails)
            .gte('sent_at', startDate)
            .lt('sent_at', endDate)
            .order('sent_at', { ascending: false });

          if (replies) {
            const replyUserIds = [...new Set(replies.filter(r => r.sent_by).map(r => r.sent_by))];
            let replyUserMap = new Map<string, string>();
            if (replyUserIds.length > 0) {
              const { data: users } = await supabase
                .from('user_profiles')
                .select('id, full_name')
                .in('id', replyUserIds);
              if (users) {
                replyUserMap = new Map(users.map(u => [u.id, u.full_name]));
              }
            }

            for (const reply of replies) {
              emails.push({
                id: reply.id,
                direction: 'sent',
                subject: reply.subject || '(No subject)',
                date: reply.sent_at,
                status: 'sent',
                sent_by_name: reply.sent_by ? replyUserMap.get(reply.sent_by) || undefined : undefined,
              });
            }
          }
        }
      }

      emails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setMonthEmails(emails);
    } catch (err) {
      console.error('Error loading month emails:', err);
    } finally {
      setLoadingEmails(false);
    }
  };

  const handleMonthClick = async (month: number) => {
    if (expandedMonth === month) {
      setExpandedMonth(null);
      setMonthFiles([]);
      setMonthEmails([]);
      return;
    }
    setExpandedMonth(month);
    loadMonthFiles(month);
    loadMonthEmails(month);
  };

  const ensureTrackingRecord = async (month: number): Promise<string> => {
    const existing = monthlyData.find(m => m.month === month);
    if (existing?.tracking_id) return existing.tracking_id;

    const { data, error } = await supabase
      .from('customer_monthly_tracking')
      .upsert({
        acumatica_customer_id: customerId,
        month,
        year: selectedYear,
        status: 'pending',
        updated_by: profile?.id,
      }, { onConflict: 'acumatica_customer_id,month,year' })
      .select('id')
      .maybeSingle();

    if (error) throw error;
    return data?.id;
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, month: number) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const trackingId = await ensureTrackingRecord(month);

      for (const file of Array.from(files)) {
        const timestamp = Date.now();
        const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storagePath = `monthly/${customerId}/${selectedYear}/${month}/${timestamp}_${sanitizedName}`;

        const { error: uploadError } = await supabase.storage
          .from('customer-files')
          .upload(storagePath, file);

        if (uploadError) {
          console.error('Upload error:', uploadError);
          continue;
        }

        await supabase
          .from('customer_monthly_files')
          .insert({
            tracking_id: trackingId,
            acumatica_customer_id: customerId,
            month,
            year: selectedYear,
            filename: file.name,
            storage_path: storagePath,
            file_size: file.size,
            mime_type: file.type,
            upload_source: 'manual',
            uploaded_by: profile?.id,
          });
      }

      const currentData = monthlyData.find(m => m.month === month);
      if (currentData && ['pending', 'active', 'sent', 'no_response'].includes(currentData.status)) {
        await supabase
          .from('customer_monthly_tracking')
          .update({ status: 'responded', last_response_at: new Date().toISOString(), updated_by: profile?.id })
          .eq('acumatica_customer_id', customerId)
          .eq('month', month)
          .eq('year', selectedYear);
      }

      await loadMonthFiles(month);
      await loadMonthlyData();
    } catch (err) {
      console.error('Error uploading file:', err);
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleDownloadFile = async (file: MonthlyFile) => {
    try {
      const { data, error } = await supabase.storage
        .from('customer-files')
        .createSignedUrl(file.storage_path, 300);

      if (error) throw error;
      window.open(data.signedUrl, '_blank');
    } catch (err) {
      console.error('Error downloading file:', err);
    }
  };

  const handleDeleteFile = async (file: MonthlyFile) => {
    if (!confirm(`Delete "${file.filename}"?`)) return;
    try {
      await supabase.storage.from('customer-files').remove([file.storage_path]);
      await supabase.from('customer_monthly_files').delete().eq('id', file.id);
      if (expandedMonth !== null) {
        await loadMonthFiles(expandedMonth);
      }
      await loadMonthlyData();
    } catch (err) {
      console.error('Error deleting file:', err);
    }
  };

  const handleStatusChange = async (month: number, newStatus: string) => {
    try {
      await ensureTrackingRecord(month);
      const { error } = await supabase
        .from('customer_monthly_tracking')
        .update({ status: newStatus, updated_by: profile?.id })
        .eq('acumatica_customer_id', customerId)
        .eq('month', month)
        .eq('year', selectedYear);

      if (error) throw error;
      setChangingStatus(null);
      await loadMonthlyData();
    } catch (err) {
      console.error('Error updating status:', err);
    }
  };

  const handleSaveNotes = async (month: number) => {
    try {
      await ensureTrackingRecord(month);
      const { error } = await supabase
        .from('customer_monthly_tracking')
        .update({ notes: noteText, updated_by: profile?.id })
        .eq('acumatica_customer_id', customerId)
        .eq('month', month)
        .eq('year', selectedYear);

      if (error) throw error;
      setEditingNotes(null);
      await loadMonthlyData();
    } catch (err) {
      console.error('Error saving notes:', err);
    }
  };

  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw className="w-6 h-6 animate-spin text-gray-400 mr-3" />
        <span className="text-gray-500">Loading monthly tracking...</span>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Monthly Email Tracking</h3>
          <p className="text-sm text-gray-500 mt-1">
            Track responses, attachments, and status for each month
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedYear(selectedYear - 1)}
            className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-lg font-semibold text-gray-900 min-w-[60px] text-center">
            {selectedYear}
          </span>
          <button
            onClick={() => setSelectedYear(selectedYear + 1)}
            disabled={selectedYear >= currentYear}
            className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
        {monthlyData.map((md) => {
          const config = STATUS_CONFIG[md.status] || STATUS_CONFIG.pending;
          const StatusIcon = config.icon;
          const isCurrent = md.month === currentMonth && selectedYear === currentYear;
          const isExpanded = expandedMonth === md.month;
          const isFuture = selectedYear > currentYear || (selectedYear === currentYear && md.month > currentMonth);

          return (
            <button
              key={md.month}
              onClick={() => handleMonthClick(md.month)}
              className={`relative rounded-xl border-2 p-3 transition-all duration-200 text-left group ${
                isExpanded
                  ? 'border-blue-500 ring-2 ring-blue-200 shadow-lg'
                  : isCurrent
                  ? `${config.border} ring-1 ring-blue-100 shadow-md`
                  : isFuture
                  ? 'border-gray-100 bg-gray-50 opacity-50'
                  : `${config.border} hover:shadow-md hover:-translate-y-0.5`
              } ${config.bg}`}
            >
              {isCurrent && (
                <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-blue-500 rounded-full ring-2 ring-white" />
              )}

              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  {SHORT_MONTHS[md.month - 1]}
                </span>
                <StatusIcon className={`w-3.5 h-3.5 ${config.color}`} />
              </div>

              <div className={`text-xs font-semibold ${config.color} mb-2`}>
                {config.label}
              </div>

              <div className="flex items-center gap-2 text-[10px] text-gray-500">
                {md.attachments_count > 0 && (
                  <span className="flex items-center gap-0.5 bg-white/60 rounded px-1 py-0.5">
                    <Paperclip className="w-2.5 h-2.5" />
                    {md.attachments_count}
                  </span>
                )}
                {md.emails_sent_count > 0 && (
                  <span className="flex items-center gap-0.5 bg-white/60 rounded px-1 py-0.5">
                    <Mail className="w-2.5 h-2.5" />
                    {md.emails_sent_count}
                  </span>
                )}
                {md.emails_received_count > 0 && (
                  <span className="flex items-center gap-0.5 bg-white/60 rounded px-1 py-0.5">
                    <MailOpen className="w-2.5 h-2.5" />
                    {md.emails_received_count}
                  </span>
                )}
              </div>

              {md.notes && (
                <div className="mt-1.5 text-[10px] text-gray-400 truncate" title={md.notes}>
                  {md.notes}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {expandedMonth !== null && (
        <MonthDetail
          month={expandedMonth}
          year={selectedYear}
          customerId={customerId}
          customerName={customerName}
          data={monthlyData.find(m => m.month === expandedMonth)!}
          files={monthFiles}
          emails={monthEmails}
          loadingFiles={loadingFiles}
          loadingEmails={loadingEmails}
          uploading={uploading}
          editingNotes={editingNotes}
          noteText={noteText}
          changingStatus={changingStatus}
          onUpload={(e) => handleFileUpload(e, expandedMonth)}
          onDownload={handleDownloadFile}
          onDelete={handleDeleteFile}
          onStatusChange={(status) => handleStatusChange(expandedMonth, status)}
          onStartEditNotes={() => {
            const md = monthlyData.find(m => m.month === expandedMonth);
            setEditingNotes(expandedMonth);
            setNoteText(md?.notes || '');
          }}
          onSaveNotes={() => handleSaveNotes(expandedMonth)}
          onCancelEditNotes={() => setEditingNotes(null)}
          onNoteTextChange={setNoteText}
          onStartChangeStatus={() => setChangingStatus(expandedMonth)}
          onCancelChangeStatus={() => setChangingStatus(null)}
          onClose={() => { setExpandedMonth(null); setMonthFiles([]); setMonthEmails([]); }}
        />
      )}
    </div>
  );
}

interface MonthDetailProps {
  month: number;
  year: number;
  customerId: string;
  customerName: string;
  data: MonthData;
  files: MonthlyFile[];
  emails: MonthlyEmail[];
  loadingFiles: boolean;
  loadingEmails: boolean;
  uploading: boolean;
  editingNotes: number | null;
  noteText: string;
  changingStatus: number | null;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDownload: (file: MonthlyFile) => void;
  onDelete: (file: MonthlyFile) => void;
  onStatusChange: (status: string) => void;
  onStartEditNotes: () => void;
  onSaveNotes: () => void;
  onCancelEditNotes: () => void;
  onNoteTextChange: (text: string) => void;
  onStartChangeStatus: () => void;
  onCancelChangeStatus: () => void;
  onClose: () => void;
}

function MonthDetail({
  month, year, data, files, emails, loadingFiles, loadingEmails, uploading,
  editingNotes, noteText, changingStatus,
  onUpload, onDownload, onDelete, onStatusChange,
  onStartEditNotes, onSaveNotes, onCancelEditNotes, onNoteTextChange,
  onStartChangeStatus, onCancelChangeStatus, onClose,
}: MonthDetailProps) {
  const config = STATUS_CONFIG[data.status] || STATUS_CONFIG.pending;
  const StatusIcon = config.icon;

  const getFileIcon = (mimeType: string) => {
    if (mimeType?.includes('pdf')) return '📄';
    if (mimeType?.includes('image')) return '🖼️';
    if (mimeType?.includes('spreadsheet') || mimeType?.includes('excel')) return '📊';
    if (mimeType?.includes('word') || mimeType?.includes('document')) return '📝';
    return '📎';
  };

  return (
    <div className="bg-white rounded-xl border-2 border-blue-200 shadow-lg overflow-hidden animate-in slide-in-from-top-2">
      <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Calendar className="w-5 h-5 text-white/70" />
          <div>
            <h4 className="text-white font-semibold text-lg">
              {MONTH_NAMES[month - 1]} {year}
            </h4>
            <div className="flex items-center gap-2 mt-0.5">
              <StatusIcon className="w-3.5 h-3.5 text-white/70" />
              <span className="text-white/70 text-sm">{config.label}</span>
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
        >
          <X className="w-5 h-5 text-white/70" />
        </button>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</label>
              {changingStatus === month ? (
                <div className="mt-2 space-y-2">
                  {STATUS_OPTIONS.map((opt) => {
                    const optConfig = STATUS_CONFIG[opt.value];
                    return (
                      <button
                        key={opt.value}
                        onClick={() => onStatusChange(opt.value)}
                        className={`w-full text-left px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                          data.status === opt.value
                            ? `${optConfig.bg} ${optConfig.border} ${optConfig.color} ring-1 ring-current`
                            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                  <button
                    onClick={onCancelChangeStatus}
                    className="w-full text-center px-3 py-1.5 text-xs text-gray-400 hover:text-gray-600"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={onStartChangeStatus}
                  className={`mt-2 w-full text-left px-3 py-2 rounded-lg border ${config.bg} ${config.border} ${config.color} text-sm font-semibold hover:opacity-80 transition-opacity`}
                >
                  {config.label}
                  <span className="text-[10px] ml-2 opacity-60">(click to change)</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-lg font-bold text-gray-900">{data.emails_sent_count}</div>
                <div className="text-[10px] text-gray-500 uppercase font-medium">Sent</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-lg font-bold text-gray-900">{data.emails_received_count}</div>
                <div className="text-[10px] text-gray-500 uppercase font-medium">Received</div>
              </div>
            </div>

            {data.last_email_sent_at && (
              <div className="text-xs text-gray-500">
                <span className="font-medium">Last sent:</span>{' '}
                {new Date(data.last_email_sent_at).toLocaleDateString()}
              </div>
            )}
            {data.last_response_at && (
              <div className="text-xs text-gray-500">
                <span className="font-medium">Last response:</span>{' '}
                {new Date(data.last_response_at).toLocaleDateString()}
              </div>
            )}
            {data.postponed_until && (
              <div className="text-xs text-amber-600">
                <span className="font-medium">Postponed until:</span>{' '}
                {new Date(data.postponed_until).toLocaleDateString()}
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Notes</label>
              {editingNotes === month ? (
                <div className="mt-2">
                  <textarea
                    value={noteText}
                    onChange={(e) => onNoteTextChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none"
                    rows={3}
                    placeholder="Add notes about this month..."
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={onSaveNotes}
                      className="px-3 py-1 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Save
                    </button>
                    <button
                      onClick={onCancelEditNotes}
                      className="px-3 py-1 border border-gray-300 text-gray-600 text-xs rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={onStartEditNotes}
                  className="mt-2 w-full text-left px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors min-h-[60px]"
                >
                  {data.notes || <span className="text-gray-400 italic">Click to add notes...</span>}
                </button>
              )}
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Paperclip className="w-4 h-4 text-gray-500" />
                  <h5 className="text-sm font-semibold text-gray-900">
                    Attachments ({files.length})
                  </h5>
                </div>
                <label className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm cursor-pointer transition-all ${
                  uploading
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}>
                  <Upload className="w-4 h-4" />
                  {uploading ? 'Uploading...' : 'Upload File'}
                  <input
                    type="file"
                    multiple
                    onChange={onUpload}
                    disabled={uploading}
                    className="hidden"
                    accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.xls,.xlsx,.doc,.docx,.txt,.csv,.zip"
                  />
                </label>
              </div>

              {loadingFiles ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="w-5 h-5 animate-spin text-gray-400 mr-2" />
                  <span className="text-gray-500 text-sm">Loading files...</span>
                </div>
              ) : files.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                  <FileText className="w-8 h-8 text-gray-300 mb-2" />
                  <p className="text-gray-400 text-sm font-medium">No attachments for this month</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
                  {files.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors group"
                    >
                      <span className="text-lg flex-shrink-0">{getFileIcon(file.mime_type)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{file.filename}</p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-[10px] text-gray-400">{formatFileSize(file.file_size)}</span>
                          <span className="text-[10px] text-gray-400">
                            {new Date(file.created_at).toLocaleDateString()}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                            file.upload_source === 'email'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-gray-200 text-gray-600'
                          }`}>
                            {file.upload_source === 'email' ? 'Email' : 'Manual'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => onDownload(file)}
                          className="p-1.5 rounded-lg hover:bg-white text-gray-500 hover:text-blue-600 transition-colors"
                          title="Download"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onDelete(file)}
                          className="p-1.5 rounded-lg hover:bg-white text-gray-500 hover:text-red-600 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 mb-4">
                <Mail className="w-4 h-4 text-gray-500" />
                <h5 className="text-sm font-semibold text-gray-900">
                  Emails ({emails.length})
                </h5>
              </div>

              {loadingEmails ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="w-5 h-5 animate-spin text-gray-400 mr-2" />
                  <span className="text-gray-500 text-sm">Loading emails...</span>
                </div>
              ) : emails.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                  <Mail className="w-8 h-8 text-gray-300 mb-2" />
                  <p className="text-gray-400 text-sm font-medium">No emails for this month</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
                  {emails.map((email) => (
                    <div
                      key={`${email.direction}-${email.id}`}
                      className={`p-3 rounded-lg border transition-colors ${
                        email.direction === 'sent'
                          ? 'bg-blue-50/50 border-blue-100 hover:bg-blue-50'
                          : 'bg-emerald-50/50 border-emerald-100 hover:bg-emerald-50'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                          email.direction === 'sent'
                            ? 'bg-blue-100 text-blue-600'
                            : 'bg-emerald-100 text-emerald-600'
                        }`}>
                          {email.direction === 'sent' ? (
                            <Mail className="w-3.5 h-3.5" />
                          ) : (
                            <MailOpen className="w-3.5 h-3.5" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                              email.direction === 'sent'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-emerald-100 text-emerald-700'
                            }`}>
                              {email.direction === 'sent' ? 'Sent' : 'Received'}
                            </span>
                            <span className="text-[10px] text-gray-400">
                              {new Date(email.date).toLocaleDateString()} {new Date(email.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {email.status && email.direction === 'sent' && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                email.status === 'delivered' || email.status === 'opened' || email.status === 'clicked'
                                  ? 'bg-green-100 text-green-700'
                                  : email.status === 'bounced' || email.status === 'failed'
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-gray-100 text-gray-600'
                              }`}>
                                {email.status}
                              </span>
                            )}
                            {email.open_count && email.open_count > 0 ? (
                              <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                                <Eye className="w-2.5 h-2.5" /> {email.open_count}
                              </span>
                            ) : null}
                          </div>
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {email.subject}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {email.sent_by_name && (
                              <span className="text-[10px] text-gray-500">
                                by {email.sent_by_name}
                              </span>
                            )}
                            {email.template_name && (
                              <span className="text-[10px] text-gray-400">
                                Template: {email.template_name}
                              </span>
                            )}
                            {email.sender_email && (
                              <span className="text-[10px] text-gray-500">
                                from {email.sender_email}
                              </span>
                            )}
                          </div>
                          {email.body_preview && (
                            <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                              {email.body_preview}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
