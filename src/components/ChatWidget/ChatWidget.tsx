import { useState, useRef, useEffect, useCallback } from 'react';
import {
  MessageSquare,
  X,
  Send,
  Sparkles,
  Loader2,
  ChevronDown,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  RotateCcw,
  Minimize2,
  FileSpreadsheet,
  FileText,
  ArrowUp,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface ReportData {
  __report: boolean;
  title: string;
  report_type: string;
  columns: string[];
  rows: any[][];
  row_count: number;
  generated_at: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isLoading?: boolean;
  report?: ReportData;
}

const SUGGESTED_QUESTIONS = [
  {
    label: 'High-risk customers',
    question: 'Who are the customers that haven\'t paid invoices in more than a year or owe more than $500,000?',
  },
  {
    label: 'Best collector',
    question: 'Which representative is performing the best based on closed tickets and collections?',
  },
  {
    label: 'Recent payments',
    question: 'How much in payments have we received in the past two months?',
  },
  {
    label: 'Aging summary',
    question: 'Give me the accounts receivable aging summary with bucket totals.',
  },
  {
    label: 'Top balances',
    question: 'Show me the top 10 customers by outstanding balance.',
  },
  {
    label: 'Monthly trend',
    question: 'What is the monthly payment collection trend for this year?',
  },
];

function downloadExcel(report: ReportData) {
  import('xlsx').then((XLSX) => {
    const wsData = [report.columns, ...report.rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    const colWidths = report.columns.map((col, i) => {
      const maxLen = Math.max(
        col.length,
        ...report.rows.map(r => String(r[i] ?? '').length)
      );
      return { wch: Math.min(maxLen + 2, 40) };
    });
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    XLSX.writeFile(wb, `${report.title.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`);
  });
}

function downloadPDF(report: ReportData) {
  const html = `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <h1 style="font-size: 20px; color: #1a1a1a; margin-bottom: 4px;">${report.title}</h1>
      <p style="font-size: 12px; color: #666; margin-bottom: 16px;">Generated: ${new Date(report.generated_at).toLocaleString()} | ${report.row_count} records</p>
      <table style="width: 100%; border-collapse: collapse; font-size: 10px;">
        <thead>
          <tr>${report.columns.map(c => `<th style="border: 1px solid #ddd; padding: 6px 8px; background: #f5f5f5; text-align: left; font-weight: 600;">${c}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${report.rows.map((row, i) => `<tr style="background: ${i % 2 ? '#fafafa' : '#fff'};">${row.map(cell => {
            const val = typeof cell === 'number' ? cell.toLocaleString('en-US', cell % 1 ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : {}) : cell ?? '';
            return `<td style="border: 1px solid #ddd; padding: 5px 8px;">${val}</td>`;
          }).join('')}</tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;

  import('html2pdf.js').then((html2pdfModule) => {
    const html2pdf = html2pdfModule.default;
    const el = document.createElement('div');
    el.innerHTML = html;
    document.body.appendChild(el);
    html2pdf().set({
      margin: 10,
      filename: `${report.title.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: report.columns.length > 6 ? 'landscape' : 'portrait' },
    }).from(el).save().then(() => {
      document.body.removeChild(el);
    });
  });
}

function formatMessage(content: string): string {
  return content
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>')
    .replace(/\$([0-9,]+\.?\d*)/g, '<span class="font-semibold text-emerald-600">$$$1</span>');
}

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const [pulseAnimation, setPulseAnimation] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setPulseAnimation(false), 10000);
    return () => clearTimeout(timer);
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    };

    const loadingMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isLoading: true,
    };

    setMessages(prev => [...prev, userMsg, loadingMsg]);
    setInput('');
    setIsLoading(true);
    setShowSuggestions(false);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const conversationHistory = messages
        .filter(m => !m.isLoading)
        .map(m => ({ role: m.role, content: m.content }));

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat-assistant`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: text.trim(),
          conversation_history: conversationHistory,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get response');
      }

      setMessages(prev =>
        prev.map(m =>
          m.id === loadingMsg.id
            ? { ...m, content: data.reply, isLoading: false, report: data.report || undefined }
            : m
        )
      );

      if (voiceEnabled && data.reply) {
        speakText(data.reply);
      }
    } catch (err: any) {
      setMessages(prev =>
        prev.map(m =>
          m.id === loadingMsg.id
            ? {
                ...m,
                content: `Sorry, I encountered an error: ${err.message}. Please try again.`,
                isLoading: false,
              }
            : m
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const startListening = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Speech recognition is not supported in this browser.');
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((result: any) => result[0].transcript)
        .join('');
      setInput(transcript);
    };

    recognition.onend = () => {
      setIsListening(false);
      if (input.trim()) {
        sendMessage(input);
      }
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setIsListening(false);
  };

  const speakText = (text: string) => {
    const cleanText = text
      .replace(/\*\*/g, '')
      .replace(/\n/g, '. ')
      .replace(/\$([0-9,]+)/g, '$1 dollars');

    const utterance = new SpeechSynthesisUtterance(cleanText.slice(0, 500));
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  const clearChat = () => {
    setMessages([]);
    setShowSuggestions(true);
    speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  if (!isOpen) {
    return (
      <button
        data-tour="chat-widget"
        onClick={() => {
          setIsOpen(true);
          setPulseAnimation(false);
        }}
        className={`fixed bottom-6 right-6 z-50 w-14 h-14 bg-gradient-to-br from-gray-800 to-gray-900 text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 transition-all duration-300 group ${
          pulseAnimation ? 'animate-bounce' : ''
        }`}
        title="AI Assistant"
      >
        <MessageSquare size={22} className="group-hover:scale-110 transition-transform" />
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-white" />
      </button>
    );
  }

  if (isMinimized) {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <button
          onClick={() => setIsMinimized(false)}
          className="flex items-center gap-2 px-4 py-2.5 bg-white text-gray-800 rounded-full shadow-xl border border-gray-200 hover:shadow-2xl transition-all"
        >
          <Sparkles size={16} className="text-gray-600" />
          <span className="text-sm font-medium">AI Assistant</span>
          {messages.length > 0 && (
            <span className="bg-gray-800 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
              {messages.filter(m => m.role === 'assistant' && !m.isLoading).length}
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[400px] h-[620px] flex flex-col bg-[#f7f7f5] rounded-3xl shadow-2xl border border-gray-200/80 overflow-hidden animate-in">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200/60">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gray-800 rounded-full flex items-center justify-center">
            <Sparkles size={14} className="text-white" />
          </div>
          <span className="text-sm font-semibold text-gray-800">AI Assistant</span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setVoiceEnabled(!voiceEnabled)}
            className={`p-2 rounded-full transition-colors ${
              voiceEnabled
                ? 'bg-emerald-100 text-emerald-600'
                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200/60'
            }`}
            title={voiceEnabled ? 'Disable voice' : 'Enable voice'}
          >
            {voiceEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
          </button>
          <button
            onClick={clearChat}
            className="p-2 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-200/60 transition-colors"
            title="Clear chat"
          >
            <RotateCcw size={15} />
          </button>
          <button
            onClick={() => setIsMinimized(true)}
            className="p-2 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-200/60 transition-colors"
            title="Minimize"
          >
            <Minimize2 size={15} />
          </button>
          <button
            onClick={() => {
              setIsOpen(false);
              stopSpeaking();
            }}
            className="p-2 rounded-full text-gray-400 hover:text-red-500 hover:bg-gray-200/60 transition-colors"
            title="Close"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {messages.length === 0 && showSuggestions && (
          <div className="flex flex-col h-full justify-between">
            <div className="flex-1 flex items-center justify-center">
              <h2 className="text-2xl font-semibold text-gray-800 text-center px-4">
                What can I help with?
              </h2>
            </div>

            <div className="flex flex-wrap gap-2 justify-center pb-2">
              {SUGGESTED_QUESTIONS.slice(0, 4).map((sq, idx) => (
                <button
                  key={idx}
                  onClick={() => sendMessage(sq.question)}
                  className="px-4 py-2.5 bg-white border border-gray-200 rounded-2xl text-sm text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
                >
                  {sq.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-gray-800 text-white'
                  : 'bg-white text-gray-800 border border-gray-200 shadow-sm'
              }`}
            >
              {msg.isLoading ? (
                <div className="flex items-center gap-2.5">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              ) : (
                <>
                  <div
                    className="whitespace-pre-wrap break-words chat-content"
                    dangerouslySetInnerHTML={{ __html: formatMessage(msg.content) }}
                  />
                  {msg.report && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <p className="text-xs text-gray-500 mb-2">
                        Report: {msg.report.row_count} records
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => downloadExcel(msg.report!)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl text-emerald-700 text-xs font-medium transition-colors"
                        >
                          <FileSpreadsheet size={13} />
                          Excel
                        </button>
                        <button
                          onClick={() => downloadPDF(msg.report!)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl text-blue-700 text-xs font-medium transition-colors"
                        >
                          <FileText size={13} />
                          PDF
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ))}

        {isSpeaking && (
          <div className="flex justify-center">
            <button
              onClick={stopSpeaking}
              className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs text-gray-600 hover:bg-gray-50 transition-colors shadow-sm"
            >
              <div className="flex items-center gap-0.5">
                <span className="w-1 h-3 bg-gray-500 rounded-full animate-pulse" />
                <span className="w-1 h-4 bg-gray-500 rounded-full animate-pulse [animation-delay:150ms]" />
                <span className="w-1 h-2 bg-gray-500 rounded-full animate-pulse [animation-delay:300ms]" />
              </div>
              Speaking... tap to stop
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Scroll indicator */}
      {messages.length > 3 && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-[120px] left-1/2 -translate-x-1/2 p-1.5 bg-white border border-gray-200 rounded-full text-gray-500 hover:text-gray-700 shadow-md transition-colors"
        >
          <ChevronDown size={14} />
        </button>
      )}

      {/* Input area */}
      <div className="px-4 pb-3 pt-2">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything"
            className="w-full text-sm text-gray-800 px-4 pt-3 pb-1 resize-none outline-none placeholder-gray-400 max-h-24 bg-transparent"
            rows={1}
            disabled={isLoading}
          />
          <div className="flex items-center justify-between px-3 pb-2.5">
            <div className="flex items-center gap-1">
              <button
                onClick={isListening ? stopListening : startListening}
                className={`p-2 rounded-full transition-colors ${
                  isListening
                    ? 'text-red-500 bg-red-50 animate-pulse'
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                }`}
                title={isListening ? 'Stop listening' : 'Voice input'}
              >
                {isListening ? <MicOff size={16} /> : <Mic size={16} />}
              </button>
            </div>
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isLoading}
              className="w-8 h-8 bg-gray-800 hover:bg-gray-700 text-white rounded-full transition-all disabled:opacity-20 disabled:cursor-not-allowed flex items-center justify-center flex-shrink-0"
            >
              {isLoading ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <ArrowUp size={15} strokeWidth={2.5} />
              )}
            </button>
          </div>
        </div>
        <p className="text-[11px] text-gray-400 text-center mt-2">
          AI can make mistakes. Please double-check responses.
        </p>
      </div>
    </div>
  );
}
