import { useState, useRef, useEffect } from 'react';
import { X, Save, Mic, Image as ImageIcon, FileText, Trash2, Download } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface TicketNote {
  id: string;
  note_text: string | null;
  has_voice_note: boolean;
  has_image: boolean;
  attachment_type: 'voice' | 'image' | 'document' | null;
  document_urls: string[] | null;
  created_at: string;
  created_by_user_id: string;
  user_profiles: {
    full_name: string;
  };
}

interface TicketNoteModalProps {
  ticketId: string;
  ticketNumber: string;
  onClose: () => void;
  onSaved?: () => void;
}

export default function TicketNoteModal({ ticketId, ticketNumber, onClose, onSaved }: TicketNoteModalProps) {
  const { user } = useAuth();
  const [noteText, setNoteText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [documentFiles, setDocumentFiles] = useState<File[]>([]);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [previousNotes, setPreviousNotes] = useState<TicketNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(true);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    console.log('[TicketNoteModal] Initialized with:', { ticketId, ticketNumber, ticketIdType: typeof ticketId });
    if (!ticketId || ticketId === 'undefined') {
      console.error('[TicketNoteModal] Invalid ticket ID received!');
      alert('Error: Invalid ticket ID. Please close and try again.');
      return;
    }
    loadPreviousNotes();
  }, [ticketId]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  const loadPreviousNotes = async () => {
    try {
      const { data, error } = await supabase
        .from('ticket_notes')
        .select('*, user_profiles!ticket_notes_created_by_user_id_fkey(full_name)')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPreviousNotes(data || []);
    } catch (error) {
      console.error('Error loading previous notes:', error);
    } finally {
      setLoadingNotes(false);
    }
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
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Error starting recording:', error);
      alert('Could not access microphone');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const preview = URL.createObjectURL(file);
      setImagePreview(preview);
    }
  };

  const handleDocumentSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setDocumentFiles(prev => [...prev, ...files]);
  };

  const removeDocument = (index: number) => {
    setDocumentFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!noteText && !audioBlob && !imageFile && documentFiles.length === 0) {
      alert('Please add a note or attachment');
      return;
    }

    // Validate ticket ID
    if (!ticketId || ticketId === 'undefined') {
      console.error('[TicketNoteModal] Cannot save - invalid ticket ID:', ticketId);
      alert('Error: Invalid ticket ID. Please close this window and try again.');
      return;
    }

    setSaving(true);
    try {
      console.log('[TicketNoteModal] Saving note for ticket:', ticketId);
      let attachmentType: 'voice' | 'image' | 'document' | null = null;
      let documentUrls: string[] | null = null;

      // Upload voice note
      if (audioBlob) {
        const fileName = `${user?.id}/voice_${Date.now()}.webm`;
        const { error } = await supabase.storage
          .from('ticket-note-attachments')
          .upload(fileName, audioBlob);

        if (error) throw error;
        attachmentType = 'voice';
      }

      // Upload image
      if (imageFile) {
        const fileName = `${user?.id}/image_${Date.now()}_${imageFile.name}`;
        const { error } = await supabase.storage
          .from('ticket-note-attachments')
          .upload(fileName, imageFile);

        if (error) throw error;
        attachmentType = 'image';
      }

      // Upload documents
      if (documentFiles.length > 0) {
        documentUrls = [];
        for (const file of documentFiles) {
          const fileName = `${user?.id}/doc_${Date.now()}_${file.name}`;
          const { error } = await supabase.storage
            .from('ticket-note-attachments')
            .upload(fileName, file);

          if (error) throw error;
          documentUrls.push(fileName);
        }
        attachmentType = 'document';
      }

      // Insert note record
      const { error: insertError } = await supabase
        .from('ticket_notes')
        .insert({
          ticket_id: ticketId,
          note_text: noteText || null,
          has_voice_note: !!audioBlob,
          has_image: !!imageFile,
          attachment_type: attachmentType,
          document_urls: documentUrls,
          created_by_user_id: user?.id
        });

      if (insertError) {
        console.error('[TicketNoteModal] Insert error:', insertError);
        throw insertError;
      }

      // Reload notes
      await loadPreviousNotes();

      // Reset form
      setNoteText('');
      setAudioBlob(null);
      setImageFile(null);
      setDocumentFiles([]);
      setImagePreview(null);

      if (onSaved) {
        onSaved();
      }
    } catch (error) {
      console.error('Error saving note:', error);
      alert('Failed to save note');
    } finally {
      setSaving(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const downloadAttachment = async (path: string, filename: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('ticket-note-attachments')
        .download(path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading attachment:', error);
      alert('Failed to download attachment');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Ticket Notes</h2>
            <p className="text-blue-100 text-sm">{ticketNumber}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-blue-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Add New Note Section */}
          <div className="border border-gray-200 rounded-lg p-4 space-y-4">
            <h3 className="font-semibold text-gray-900">Add Note</h3>

            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Type your note here..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              rows={4}
            />

            {/* Attachment Options */}
            <div className="flex gap-2">
              <button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={!!audioBlob || !!imageFile || documentFiles.length > 0}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  isRecording
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50'
                }`}
              >
                <Mic className="w-4 h-4" />
                {isRecording ? `Recording ${formatTime(recordingTime)}` : 'Record Voice'}
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={!!audioBlob || !!imageFile || documentFiles.length > 0}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                <ImageIcon className="w-4 h-4" />
                Add Image
              </button>

              <button
                onClick={() => documentInputRef.current?.click()}
                disabled={!!audioBlob || !!imageFile}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                <FileText className="w-4 h-4" />
                Add Documents
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
              />

              <input
                ref={documentInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.txt"
                multiple
                onChange={handleDocumentSelect}
                className="hidden"
              />
            </div>

            {/* Previews */}
            {audioBlob && (
              <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <Mic className="w-5 h-5 text-blue-600" />
                <span className="text-sm text-blue-900">Voice note recorded ({formatTime(recordingTime)})</span>
                <button
                  onClick={() => setAudioBlob(null)}
                  className="ml-auto text-red-600 hover:text-red-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {imagePreview && (
              <div className="relative">
                <img src={imagePreview} alt="Preview" className="max-h-48 rounded-lg border border-gray-200" />
                <button
                  onClick={() => {
                    setImageFile(null);
                    setImagePreview(null);
                  }}
                  className="absolute top-2 right-2 p-1 bg-red-600 text-white rounded-full hover:bg-red-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {documentFiles.length > 0 && (
              <div className="space-y-2">
                {documentFiles.map((file, index) => (
                  <div key={index} className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <FileText className="w-5 h-5 text-gray-600" />
                    <span className="text-sm text-gray-900 flex-1">{file.name}</span>
                    <button
                      onClick={() => removeDocument(index)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={saving || (!noteText && !audioBlob && !imageFile && documentFiles.length === 0)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Note'}
            </button>
          </div>

          {/* Previous Notes */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">Previous Notes ({previousNotes.length})</h3>

            {loadingNotes ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              </div>
            ) : previousNotes.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No notes yet
              </div>
            ) : (
              <div className="space-y-3">
                {previousNotes.map((note) => (
                  <div key={note.id} className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{note.user_profiles?.full_name || 'Unknown User'}</p>
                        <p className="text-xs text-gray-500">{new Date(note.created_at).toLocaleString()}</p>
                      </div>

                      {note.attachment_type && (
                        <div className="flex items-center gap-1 text-xs text-gray-600">
                          {note.attachment_type === 'voice' && <Mic className="w-3 h-3" />}
                          {note.attachment_type === 'image' && <ImageIcon className="w-3 h-3" />}
                          {note.attachment_type === 'document' && <FileText className="w-3 h-3" />}
                          <span>{note.attachment_type}</span>
                        </div>
                      )}
                    </div>

                    {note.note_text && (
                      <p className="text-gray-700 text-sm whitespace-pre-wrap">{note.note_text}</p>
                    )}

                    {note.document_urls && note.document_urls.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {note.document_urls.map((path, index) => {
                          const filename = path.split('/').pop() || 'document';
                          return (
                            <button
                              key={index}
                              onClick={() => downloadAttachment(path, filename)}
                              className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-sm w-full"
                            >
                              <FileText className="w-4 h-4 text-gray-600" />
                              <span className="flex-1 text-left truncate">{filename}</span>
                              <Download className="w-4 h-4 text-gray-600" />
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
