import React, { useState, useEffect } from 'react';
import { ChevronDown, History, MessageSquare, Upload, X, Image, Mic, Video, FileText } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface InvoiceStatusControlProps {
  invoiceReference: string;
  customerId?: string;
  currentUser: any;
  isAdmin: boolean;
}

type StatusType = 'white' | 'red' | 'green' | 'orange';

const statusColors = {
  white: { bg: 'bg-white', border: 'border-gray-300', text: 'text-gray-700', label: 'Not Started' },
  red: { bg: 'bg-red-100', border: 'border-red-400', text: 'text-red-700', label: 'Customer Not Paying' },
  green: { bg: 'bg-green-100', border: 'border-green-400', text: 'text-green-700', label: 'Needs to be Contacted' },
  orange: { bg: 'bg-orange-100', border: 'border-orange-400', text: 'text-orange-700', label: 'Working on It' }
};

export default function InvoiceStatusControl({ invoiceReference, customerId, currentUser, isAdmin }: InvoiceStatusControlProps) {
  const [currentStatus, setCurrentStatus] = useState<StatusType>('white');
  const [showDropdown, setShowDropdown] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showMemoDialog, setShowMemoDialog] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [memos, setMemos] = useState<any[]>([]);
  const [memoText, setMemoText] = useState('');
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadCurrentStatus();
    loadMemos();
  }, [invoiceReference]);

  const loadCurrentStatus = async () => {
    const { data } = await supabase
      .from('invoice_current_status')
      .select('status')
      .eq('invoice_reference', invoiceReference)
      .maybeSingle();

    if (data) {
      setCurrentStatus(data.status as StatusType);
    }
  };

  const loadHistory = async () => {
    const { data } = await supabase
      .from('invoice_status_history')
      .select(`
        *,
        user:changed_by(email)
      `)
      .eq('invoice_reference', invoiceReference)
      .order('changed_at', { ascending: false });

    setHistory(data || []);
  };

  const loadMemos = async () => {
    const { data } = await supabase
      .from('invoice_memos')
      .select(`
        *,
        user:created_by_user_id(email)
      `)
      .eq('invoice_reference', invoiceReference)
      .order('created_at', { ascending: false });

    setMemos(data || []);
  };

  const changeStatus = async (newStatus: StatusType) => {
    setLoading(true);
    try {
      const { data: existing } = await supabase
        .from('invoice_current_status')
        .select('status')
        .eq('invoice_reference', invoiceReference)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('invoice_current_status')
          .update({
            status: newStatus,
            last_updated_at: new Date().toISOString(),
            last_updated_by: currentUser.id
          })
          .eq('invoice_reference', invoiceReference);
      } else {
        await supabase
          .from('invoice_current_status')
          .insert({
            invoice_reference: invoiceReference,
            customer_id: customerId,
            status: newStatus,
            last_updated_by: currentUser.id
          });
      }

      setCurrentStatus(newStatus);
      setShowDropdown(false);
    } catch (error) {
      console.error('Error updating status:', error);
    } finally {
      setLoading(false);
    }
  };

  const uploadAttachment = async (file: File): Promise<string | null> => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${currentUser.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('invoice-memos')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('invoice-memos')
        .getPublicUrl(fileName);

      return publicUrl;
    } catch (error) {
      console.error('Error uploading file:', error);
      return null;
    }
  };

  const saveMemo = async () => {
    if (!memoText.trim() && !attachmentFile) return;

    setLoading(true);
    try {
      let attachmentUrl = null;
      let attachmentType = null;

      if (attachmentFile) {
        attachmentUrl = await uploadAttachment(attachmentFile);
        if (attachmentFile.type.startsWith('image/')) attachmentType = 'image';
        else if (attachmentFile.type.startsWith('audio/')) attachmentType = 'audio';
        else if (attachmentFile.type.startsWith('video/')) attachmentType = 'video';
        else attachmentType = 'document';
      }

      // Get invoice_id from reference number
      const { data: invoiceData, error: invoiceError } = await supabase
        .from('acumatica_invoices')
        .select('id')
        .eq('reference_number', invoiceReference)
        .single();

      if (invoiceError || !invoiceData) {
        throw new Error('Invoice not found');
      }

      await supabase
        .from('invoice_memos')
        .insert({
          invoice_id: invoiceData.id,
          invoice_reference: invoiceReference,
          customer_id: customerId,
          created_by_user_id: currentUser.id,
          created_by_user_email: currentUser.email,
          memo_text: memoText,
          image_url: attachmentType === 'image' ? attachmentUrl : null,
          voice_note_url: attachmentType === 'voice' ? attachmentUrl : null,
          attachment_type: attachmentType,
          has_image: attachmentType === 'image',
          has_voice_note: attachmentType === 'voice'
        });

      setMemoText('');
      setAttachmentFile(null);
      setShowMemoDialog(false);
      loadMemos();
    } catch (error) {
      console.error('Error saving memo:', error);
    } finally {
      setLoading(false);
    }
  };

  const getAttachmentIcon = (type: string) => {
    switch (type) {
      case 'image': return <Image className="w-4 h-4" />;
      case 'audio': return <Mic className="w-4 h-4" />;
      case 'video': return <Video className="w-4 h-4" />;
      default: return <FileText className="w-4 h-4" />;
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString();
  };

  return (
    <div className="flex items-center gap-2">
      {/* Status Dropdown */}
      <div className="relative">
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 ${statusColors[currentStatus].bg} ${statusColors[currentStatus].border} ${statusColors[currentStatus].text} text-xs font-medium transition-all hover:opacity-80`}
          disabled={loading}
        >
          <span>{statusColors[currentStatus].label}</span>
          <ChevronDown className="w-3 h-3" />
        </button>

        {showDropdown && (
          <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 min-w-[180px]">
            {(Object.keys(statusColors) as StatusType[]).map((status) => (
              <button
                key={status}
                onClick={() => changeStatus(status)}
                className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${statusColors[status].text} flex items-center gap-2`}
              >
                <div className={`w-3 h-3 rounded-full ${statusColors[status].bg} ${statusColors[status].border} border-2`}></div>
                {statusColors[status].label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* History Button */}
      {isAdmin && (
        <button
          onClick={() => {
            setShowHistory(true);
            loadHistory();
          }}
          className="p-1.5 hover:bg-gray-100 rounded transition-colors"
          title="View recent changes"
        >
          <History className="w-4 h-4 text-gray-600" />
        </button>
      )}

      {/* Memo Button */}
      <button
        onClick={() => setShowMemoDialog(true)}
        className="p-1.5 hover:bg-gray-100 rounded transition-colors relative"
        title="Add memo"
      >
        <MessageSquare className="w-4 h-4 text-gray-600" />
        {memos.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
            {memos.length}
          </span>
        )}
      </button>

      {/* History Modal */}
      {showHistory && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowHistory(false)}>
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Status Change History - Invoice #{invoiceReference}</h3>
              <button onClick={() => setShowHistory(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              {history.map((entry) => (
                <div key={entry.id} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-900">{entry.user?.email || 'Unknown User'}</span>
                    <span className="text-xs text-gray-500">{formatDate(entry.changed_at)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className={`px-2 py-1 rounded ${statusColors[entry.old_status as StatusType]?.bg || 'bg-gray-100'}`}>
                      {statusColors[entry.old_status as StatusType]?.label || 'Unknown'}
                    </span>
                    <span className="text-gray-400">→</span>
                    <span className={`px-2 py-1 rounded ${statusColors[entry.new_status as StatusType].bg}`}>
                      {statusColors[entry.new_status as StatusType].label}
                    </span>
                  </div>
                  {entry.notes && (
                    <p className="text-sm text-gray-600 mt-2">{entry.notes}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Memo Modal */}
      {showMemoDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowMemoDialog(false)}>
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Memos - Invoice #{invoiceReference}</h3>
              <button onClick={() => setShowMemoDialog(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Add Memo Form */}
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <textarea
                value={memoText}
                onChange={(e) => setMemoText(e.target.value)}
                placeholder="Add a memo, note, or comment..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
                rows={3}
              />

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                  <Upload className="w-4 h-4 text-gray-600" />
                  <span className="text-sm text-gray-700">
                    {attachmentFile ? attachmentFile.name : 'Attach file'}
                  </span>
                  <input
                    type="file"
                    onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)}
                    className="hidden"
                    accept="image/*,audio/*,video/*,.pdf,.doc,.docx"
                  />
                </label>

                <button
                  onClick={saveMemo}
                  disabled={loading || (!memoText.trim() && !attachmentFile)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Saving...' : 'Add Memo'}
                </button>
              </div>
            </div>

            {/* Existing Memos */}
            <div className="space-y-3">
              <h4 className="font-semibold text-gray-900">Previous Memos</h4>
              {memos.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">No memos yet</p>
              ) : (
                memos.map((memo) => (
                  <div key={memo.id} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-900">{memo.user?.email || 'Unknown User'}</span>
                      <span className="text-xs text-gray-500">{formatDate(memo.created_at)}</span>
                    </div>
                    {memo.memo_text && (
                      <p className="text-sm text-gray-700 mb-2">{memo.memo_text}</p>
                    )}
                    {memo.voice_note_url && (
                      <a
                        href={memo.voice_note_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
                      >
                        {getAttachmentIcon('voice')}
                        <span>Play voice note</span>
                      </a>
                    )}
                    {memo.image_url && (
                      <a
                        href={memo.image_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
                      >
                        {getAttachmentIcon('image')}
                        <span>View image</span>
                      </a>
                    )}
                    {memo.document_urls && memo.document_urls.length > 0 && (
                      <div className="space-y-1">
                        {memo.document_urls.map((url: string, idx: number) => (
                          <a
                            key={idx}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
                          >
                            {getAttachmentIcon('document')}
                            <span>{memo.document_names?.[idx] || `Document ${idx + 1}`}</span>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
