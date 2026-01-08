import { useState, useEffect, useRef } from 'react';
import { X, Save, Mic, Image as ImageIcon, Trash2, Calendar, Clock, FileText, ArrowLeft, Play, Pause, StopCircle, Mail } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { formatDateTime as formatDateTimeUtil } from '../lib/dateUtils';

interface InvoiceMemoModalProps {
  invoice: any;
  onClose: () => void;
}

interface Memo {
  id: string;
  invoice_id: string;
  invoice_reference: string;
  customer_id: string;
  created_by_user_id: string;
  created_by_user_email: string;
  memo_text: string;
  attachment_type: string;
  has_voice_note: boolean;
  has_image: boolean;
  voice_note_url: string | null;
  voice_note_duration: number | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
  user_email?: string;
  user_color?: string;
  voice_signed_url?: string | null;
  image_signed_url?: string | null;
}

interface ActivityLog {
  id: string;
  user_id: string;
  activity_type: string;
  old_value: string | null;
  new_value: string | null;
  description: string;
  created_at: string;
  user_email?: string;
  user_color?: string;
}

interface Reminder {
  id: string;
  reminder_date: string;
  reminder_message: string;
  is_triggered: boolean;
  triggered_at: string | null;
  created_at: string;
}

export default function InvoiceMemoModal({ invoice, onClose }: InvoiceMemoModalProps) {
  const { user } = useAuth();
  const [memos, setMemos] = useState<Memo[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [newMemo, setNewMemo] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'memos' | 'activity' | 'reminders'>('memos');

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Image upload state
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Reminder state
  const [reminderDate, setReminderDate] = useState('');
  const [reminderTime, setReminderTime] = useState('09:00');
  const [reminderMessage, setReminderMessage] = useState('');
  const [sendEmailNotification, setSendEmailNotification] = useState(false);

  useEffect(() => {
    console.log('[InvoiceMemoModal] Component initialized with invoice:', {
      invoiceId: invoice?.id,
      invoiceRefNumber: invoice?.reference_number,
      customer: invoice?.customer,
      fullInvoiceObject: invoice
    });
    loadAllData();
  }, [invoice.id]);

  useEffect(() => {
    return () => {
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  const loadAllData = async () => {
    setLoading(true);
    await Promise.all([loadMemos(), loadActivityLogs(), loadReminders()]);
    setLoading(false);
  };

  const loadMemos = async () => {
    const { data: memosData, error } = await supabase
      .from('invoice_memos')
      .select('*')
      .eq('invoice_id', invoice.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading memos:', error);
      return;
    }

    const userIds = [...new Set(memosData?.map(m => m.created_by_user_id))];
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, email, assigned_color')
      .in('id', userIds);

    const profileMap = new Map(profiles?.map(p => [p.id, { email: p.email, color: p.assigned_color }]));

    const enrichedMemos = await Promise.all(
      (memosData || []).map(async (memo) => {
        let voiceUrl = null;
        let imageUrl = null;

        if (memo.has_voice_note && memo.voice_note_url) {
          const { data } = await supabase.storage
            .from('invoice-memo-attachments')
            .createSignedUrl(memo.voice_note_url, 3600);
          voiceUrl = data?.signedUrl || null;
        }

        if (memo.has_image && memo.image_url) {
          const { data } = await supabase.storage
            .from('invoice-memo-attachments')
            .createSignedUrl(memo.image_url, 3600);
          imageUrl = data?.signedUrl || null;
        }

        return {
          ...memo,
          user_email: profileMap.get(memo.created_by_user_id)?.email,
          user_color: profileMap.get(memo.created_by_user_id)?.color,
          voice_signed_url: voiceUrl,
          image_signed_url: imageUrl
        };
      })
    );

    setMemos(enrichedMemos);
  };

  const loadActivityLogs = async () => {
    const { data: logsData, error } = await supabase
      .from('invoice_activity_log')
      .select('*')
      .eq('invoice_id', invoice.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading activity logs:', error);
      return;
    }

    const userIds = [...new Set(logsData?.map(l => l.user_id))];
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, email, assigned_color')
      .in('id', userIds);

    const profileMap = new Map(profiles?.map(p => [p.id, { email: p.email, color: p.assigned_color }]));

    const enrichedLogs = (logsData || []).map(log => ({
      ...log,
      user_email: profileMap.get(log.user_id)?.email,
      user_color: profileMap.get(log.user_id)?.color
    }));

    setActivityLogs(enrichedLogs);
  };

  const loadReminders = async () => {
    const { data, error } = await supabase
      .from('invoice_reminders')
      .select('*')
      .eq('invoice_id', invoice.id)
      .eq('user_id', user?.id)
      .order('reminder_date', { ascending: true });

    if (error) {
      console.error('Error loading reminders:', error);
      return;
    }

    setReminders(data || []);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);

      recordingIntervalRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Error starting recording:', error);
      alert('Could not access microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
    }
    setAudioBlob(null);
    setRecordingDuration(0);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        alert('Image must be less than 10MB');
        return;
      }
      setSelectedImage(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const clearImage = () => {
    setSelectedImage(null);
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
      setImagePreview(null);
    }
  };

  const handleSaveMemo = async () => {
    if (!newMemo.trim() && !audioBlob && !selectedImage) {
      alert('Please add some content to the memo');
      return;
    }

    console.log('[InvoiceMemoModal] Saving memo for invoice:', {
      invoiceId: invoice.id,
      invoiceRefNumber: invoice.reference_number,
      customer: invoice.customer,
      fullInvoiceObject: invoice
    });

    setSaving(true);
    try {
      let voiceNoteUrl = null;
      let imageUrl = null;
      let attachmentType = 'text';

      if (audioBlob) {
        const fileName = `voice_${Date.now()}.webm`;
        const filePath = `${invoice.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('invoice-memo-attachments')
          .upload(filePath, audioBlob, {
            contentType: 'audio/webm'
          });

        if (uploadError) throw uploadError;
        voiceNoteUrl = filePath;
        attachmentType = selectedImage ? 'mixed' : 'voice';
      }

      if (selectedImage) {
        const fileExt = selectedImage.name.split('.').pop();
        const fileName = `image_${Date.now()}.${fileExt}`;
        const filePath = `${invoice.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('invoice-memo-attachments')
          .upload(filePath, selectedImage, {
            contentType: selectedImage.type
          });

        if (uploadError) throw uploadError;
        imageUrl = filePath;
        attachmentType = audioBlob ? 'mixed' : 'image';
      }

      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('email')
        .eq('id', user?.id)
        .single();

      const memoData = {
        invoice_id: invoice.id,
        invoice_reference: invoice.reference_number,
        customer_id: invoice.customer,
        created_by_user_id: user?.id,
        created_by_user_email: profiles?.email || user?.email,
        memo_text: newMemo.trim() || null,
        attachment_type: attachmentType,
        has_voice_note: !!audioBlob,
        has_image: !!selectedImage,
        voice_note_url: voiceNoteUrl,
        voice_note_duration: recordingDuration,
        image_url: imageUrl
      };

      console.log('[InvoiceMemoModal] Inserting memo with data:', memoData);

      const { error } = await supabase
        .from('invoice_memos')
        .insert(memoData);

      if (error) {
        console.error('[InvoiceMemoModal] Error inserting memo:', error);
        throw error;
      }

      console.log('[InvoiceMemoModal] Memo saved successfully');

      await supabase
        .from('invoice_activity_log')
        .insert({
          invoice_id: invoice.id,
          user_id: user?.id,
          activity_type: 'memo_added',
          description: `Added a memo${audioBlob ? ' with voice note' : ''}${selectedImage ? ' with image' : ''}`
        });

      setNewMemo('');
      setAudioBlob(null);
      setRecordingDuration(0);
      clearImage();
      await loadMemos();
      await loadActivityLogs();
    } catch (error) {
      console.error('Error saving memo:', error);
      alert('Failed to save memo: ' + (error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMemo = async (memoId: string, voiceUrl: string | null, imageUrl: string | null) => {
    if (!confirm('Delete this memo?')) return;

    try {
      const filesToDelete = [];
      if (voiceUrl) filesToDelete.push(voiceUrl);
      if (imageUrl) filesToDelete.push(imageUrl);

      if (filesToDelete.length > 0) {
        await supabase.storage
          .from('invoice-memo-attachments')
          .remove(filesToDelete);
      }

      const { error } = await supabase
        .from('invoice_memos')
        .delete()
        .eq('id', memoId);

      if (error) throw error;

      await loadMemos();
    } catch (error) {
      console.error('Error deleting memo:', error);
      alert('Failed to delete memo');
    }
  };

  const handleSaveReminder = async () => {
    if (!reminderDate || !reminderMessage.trim()) {
      alert('Please fill in all reminder fields');
      return;
    }

    const reminderDateTime = new Date(`${reminderDate}T${reminderTime}`).toISOString();

    const { error } = await supabase
      .from('invoice_reminders')
      .insert({
        invoice_id: invoice.id,
        user_id: user?.id,
        reminder_date: reminderDateTime,
        reminder_message: reminderMessage.trim(),
        send_email_notification: sendEmailNotification,
        priority: 'medium',
        reminder_type: 'general'
      });

    if (error) {
      console.error('Error saving reminder:', error);
      alert('Failed to save reminder');
      return;
    }

    setReminderDate('');
    setReminderTime('09:00');
    setReminderMessage('');
    setSendEmailNotification(false);
    await loadReminders();
  };

  const handleDeleteReminder = async (reminderId: string) => {
    if (!confirm('Delete this reminder?')) return;

    const { error } = await supabase
      .from('invoice_reminders')
      .delete()
      .eq('id', reminderId);

    if (error) {
      console.error('Error deleting reminder:', error);
      return;
    }

    await loadReminders();
  };


  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'color_change':
        return '🎨';
      case 'memo_added':
        return '📝';
      default:
        return '📋';
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-6 z-50"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 border border-slate-700 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div>
            <h2 className="text-2xl font-bold text-white">
              Invoice {invoice.reference_number}
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              {invoice.customer_name || invoice.customer}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex border-b border-slate-700">
          <button
            onClick={() => setActiveTab('memos')}
            className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === 'memos'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            <FileText className="w-4 h-4 inline mr-2" />
            Memos & Notes
          </button>
          <button
            onClick={() => setActiveTab('activity')}
            className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === 'activity'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            <FileText className="w-4 h-4 inline mr-2" />
            Activity Log
          </button>
          <button
            onClick={() => setActiveTab('reminders')}
            className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === 'reminders'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            <Calendar className="w-4 h-4 inline mr-2" />
            Reminders
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          ) : activeTab === 'memos' ? (
            <div className="space-y-4">
              <div className="bg-slate-900 rounded-lg p-4">
                <textarea
                  value={newMemo}
                  onChange={(e) => setNewMemo(e.target.value)}
                  placeholder="Add a text note..."
                  className="w-full bg-slate-800 text-white rounded-lg px-4 py-3 border border-slate-700 focus:outline-none focus:border-blue-500 resize-none"
                  rows={3}
                  disabled={saving}
                />

                {imagePreview && (
                  <div className="mt-3 relative">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="max-h-48 rounded-lg"
                    />
                    <button
                      onClick={clearImage}
                      className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {audioBlob && (
                  <div className="mt-3 bg-slate-800 rounded-lg p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Mic className="w-4 h-4 text-green-400" />
                      <span className="text-slate-300 text-sm">Voice note recorded</span>
                      <span className="text-slate-400 text-sm">({formatDuration(recordingDuration)})</span>
                    </div>
                    <button
                      onClick={cancelRecording}
                      className="text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}

                <div className="flex items-center gap-2 mt-3">
                  {!isRecording ? (
                    <>
                      <button
                        onClick={handleSaveMemo}
                        disabled={saving || (!newMemo.trim() && !audioBlob && !selectedImage)}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                      >
                        <Save className="w-4 h-4" />
                        {saving ? 'Saving...' : 'Save Memo'}
                      </button>

                      <button
                        onClick={startRecording}
                        disabled={saving || audioBlob !== null}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                      >
                        <Mic className="w-4 h-4" />
                        Record Voice
                      </button>

                      <input
                        ref={imageInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleImageSelect}
                      />
                      <button
                        onClick={() => imageInputRef.current?.click()}
                        disabled={saving || selectedImage !== null}
                        className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                      >
                        <ImageIcon className="w-4 h-4" />
                        Add Image
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg font-medium">
                        <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                        Recording... {formatDuration(recordingDuration)}
                      </div>
                      <button
                        onClick={stopRecording}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
                      >
                        <StopCircle className="w-4 h-4" />
                        Stop
                      </button>
                    </>
                  )}
                </div>
              </div>

              {memos.map((memo) => (
                <div key={memo.id} className="bg-slate-900 rounded-lg p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-start gap-3 flex-1">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                        style={{ backgroundColor: memo.user_color || '#3B82F6' }}
                      >
                        {memo.user_email?.[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-medium">{memo.user_email}</span>
                          <span className="text-slate-500 text-sm">{formatDateTimeUtil(memo.created_at)}</span>
                        </div>
                        {memo.memo_text && (
                          <p className="text-slate-300 mt-2">{memo.memo_text}</p>
                        )}
                      </div>
                    </div>
                    {memo.created_by_user_id === user?.id && (
                      <button
                        onClick={() => handleDeleteMemo(memo.id, memo.voice_note_url, memo.image_url)}
                        className="text-red-400 hover:text-red-300 transition-colors flex-shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {memo.has_voice_note && memo.voice_signed_url && (
                    <div className="mt-3 bg-slate-800 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Mic className="w-4 h-4 text-green-400" />
                        <span className="text-slate-300 text-sm">Voice Note</span>
                        {memo.voice_note_duration && (
                          <span className="text-slate-400 text-sm">({formatDuration(memo.voice_note_duration)})</span>
                        )}
                      </div>
                      <audio
                        controls
                        src={memo.voice_signed_url}
                        className="w-full"
                      >
                        Your browser does not support audio playback.
                      </audio>
                    </div>
                  )}

                  {memo.has_image && memo.image_signed_url && (
                    <div className="mt-3">
                      <img
                        src={memo.image_signed_url}
                        alt="Memo attachment"
                        className="max-h-64 rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => window.open(memo.image_signed_url!, '_blank')}
                      />
                    </div>
                  )}
                </div>
              ))}

              {memos.length === 0 && (
                <div className="text-center py-12 text-slate-500">
                  No memos yet. Add one above to get started.
                </div>
              )}
            </div>
          ) : activeTab === 'activity' ? (
            <div className="space-y-3">
              {activityLogs.map((log) => (
                <div key={log.id} className="bg-slate-900 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{getActivityIcon(log.activity_type)}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                          style={{ backgroundColor: log.user_color || '#3B82F6' }}
                        >
                          {log.user_email?.[0]?.toUpperCase()}
                        </div>
                        <span className="text-white font-medium">{log.user_email}</span>
                        <span className="text-slate-500 text-sm">{formatDateTimeUtil(log.created_at)}</span>
                      </div>
                      <p className="text-slate-300 mt-2">{log.description}</p>
                      {log.old_value && log.new_value && (
                        <div className="mt-2 text-sm text-slate-400">
                          <span className="line-through">{log.old_value}</span>
                          {' → '}
                          <span className="text-green-400">{log.new_value}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {activityLogs.length === 0 && (
                <div className="text-center py-12 text-slate-500">
                  No activity logged yet.
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-slate-900 rounded-lg p-4">
                <h3 className="text-white font-medium mb-3">Schedule New Reminder</h3>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-slate-400 text-sm mb-2">Date</label>
                    <input
                      type="date"
                      value={reminderDate}
                      onChange={(e) => setReminderDate(e.target.value)}
                      className="w-full bg-slate-800 text-white rounded-lg px-3 py-2 border border-slate-700 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-sm mb-2">Time</label>
                    <input
                      type="time"
                      value={reminderTime}
                      onChange={(e) => setReminderTime(e.target.value)}
                      className="w-full bg-slate-800 text-white rounded-lg px-3 py-2 border border-slate-700 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
                <textarea
                  value={reminderMessage}
                  onChange={(e) => setReminderMessage(e.target.value)}
                  placeholder="Reminder message..."
                  className="w-full bg-slate-800 text-white rounded-lg px-3 py-2 border border-slate-700 focus:outline-none focus:border-blue-500 resize-none"
                  rows={2}
                />
                <div className="mt-3 flex items-center gap-3 p-3 bg-slate-800 rounded-lg border border-slate-700">
                  <input
                    type="checkbox"
                    id="emailNotif"
                    checked={sendEmailNotification}
                    onChange={(e) => setSendEmailNotification(e.target.checked)}
                    className="w-4 h-4 text-blue-600 bg-slate-700 border-slate-600 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="emailNotif" className="flex-1">
                    <div className="flex items-center gap-2 text-white text-sm font-medium">
                      <Mail className="w-4 h-4" />
                      Send email reminder
                    </div>
                    <p className="text-slate-400 text-xs mt-1">
                      Get an email notification when this reminder is due
                    </p>
                  </label>
                </div>
                <button
                  onClick={handleSaveReminder}
                  disabled={!reminderDate || !reminderMessage.trim()}
                  className="mt-3 flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                >
                  <Calendar className="w-4 h-4" />
                  Save Reminder
                </button>
              </div>

              {reminders.map((reminder) => (
                <div
                  key={reminder.id}
                  className={`bg-slate-900 rounded-lg p-4 ${
                    reminder.is_triggered ? 'opacity-50' : ''
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Clock className="w-4 h-4 text-blue-400" />
                        <span className="text-white font-medium">
                          {formatDateTimeUtil(reminder.reminder_date)}
                        </span>
                        {reminder.is_triggered && (
                          <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded">
                            Triggered
                          </span>
                        )}
                      </div>
                      <p className="text-slate-300">{reminder.reminder_message}</p>
                    </div>
                    {!reminder.is_triggered && (
                      <button
                        onClick={() => handleDeleteReminder(reminder.id)}
                        className="text-red-400 hover:text-red-300 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {reminders.length === 0 && (
                <div className="text-center py-12 text-slate-500">
                  No reminders set. Schedule one above.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
