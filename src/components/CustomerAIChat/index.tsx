import { useState, useRef, useEffect, useCallback } from 'react';
import {
  MessageSquare,
  X,
  Send,
  Sparkles,
  Loader2,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  RotateCcw,
  Ticket,
  Bell,
  Bot,
  ChevronDown,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isLoading?: boolean;
}

interface CustomerAIChatProps {
  customerId: string;
  customerName: string;
}

const SUGGESTED_QUESTIONS = [
  { label: 'Avg days to pay', question: 'What is this customer\'s average number of days to pay their invoices?' },
  { label: 'Payment trend', question: 'How much has this customer paid in the last 6 months, broken down by month?' },
  { label: 'Open invoices', question: 'How many open invoices does this customer have and what is the total balance?' },
  { label: 'Overdue > 90 days', question: 'Which invoices are open for more than 90 days and what are their amounts?' },
  { label: 'Large invoices', question: 'Are there any open invoices over $25,000 that have been open more than 3 months?' },
  { label: 'Last year comparison', question: 'How much did this customer pay in the same month last year compared to this year?' },
  { label: 'Create ticket', question: 'Create a collection ticket for all overdue invoices over 60 days with high priority.' },
  { label: 'Set reminder', question: 'Create a reminder for next week to follow up on this customer\'s overdue balance.' },
];

function formatMessage(content: string): string {
  return content
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>')
    .replace(/\$([0-9,]+\.?\d*)/g, '<span class="font-semibold text-emerald-600">$$$1</span>')
    .replace(/- /g, '<span class="text-gray-400 mr-1">&#8226;</span> ');
}

export default function CustomerAIChat({ customerId, customerName }: CustomerAIChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [useElevenLabs, setUseElevenLabs] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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

  const speakWithElevenLabs = async (text: string) => {
    try {
      setIsSpeaking(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/text-to-speech`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        throw new Error('TTS unavailable');
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
      };
      audio.onerror = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
      };

      await audio.play();
    } catch {
      speakWithBrowser(text);
    }
  };

  const speakWithBrowser = (text: string) => {
    const cleanText = text
      .replace(/\*\*/g, '')
      .replace(/\n/g, '. ')
      .replace(/\$([0-9,]+)/g, '$1 dollars');

    const utterance = new SpeechSynthesisUtterance(cleanText.slice(0, 800));
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  const speakText = (text: string) => {
    if (useElevenLabs) {
      speakWithElevenLabs(text);
    } else {
      speakWithBrowser(text);
    }
  };

  const stopSpeaking = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

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

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/customer-ai-chat`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: text.trim(),
          conversation_history: conversationHistory,
          customer_id: customerId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get response');
      }

      setMessages(prev =>
        prev.map(m =>
          m.id === loadingMsg.id
            ? { ...m, content: data.reply, isLoading: false }
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
            ? { ...m, content: `Sorry, I encountered an error: ${err.message}`, isLoading: false }
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
      alert('Speech recognition is not supported in this browser. Use Chrome for voice input.');
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    let finalTranscript = '';

    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      setInput(finalTranscript + interim);
    };

    recognition.onend = () => {
      setIsListening(false);
      if (finalTranscript.trim()) {
        sendMessage(finalTranscript.trim());
      }
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    finalTranscript = '';
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setIsListening(false);
  };

  const clearChat = () => {
    setMessages([]);
    setShowSuggestions(true);
    stopSpeaking();
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-full shadow-lg hover:shadow-xl hover:from-blue-700 hover:to-blue-800 transition-all duration-200 group"
      >
        <Bot className="w-5 h-5" />
        <span className="text-sm font-medium">Ask AI about {customerName.split(' ')[0]}</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[420px] h-[600px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
            <Bot className="w-4.5 h-4.5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold leading-tight">Customer Assistant</h3>
            <p className="text-[11px] text-blue-100 leading-tight">{customerName}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setVoiceEnabled(!voiceEnabled);
              if (isSpeaking) stopSpeaking();
            }}
            className={`p-1.5 rounded-lg transition-colors ${voiceEnabled ? 'bg-white/20' : 'hover:bg-white/10'}`}
            title={voiceEnabled ? 'Disable voice responses' : 'Enable voice responses'}
          >
            {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          <button
            onClick={clearChat}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            title="Clear chat"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Voice mode indicator */}
      {voiceEnabled && (
        <div className="px-4 py-1.5 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
          <span className="text-[11px] text-blue-700 font-medium flex items-center gap-1">
            <Volume2 className="w-3 h-3" /> Voice responses on
          </span>
          <button
            onClick={() => setUseElevenLabs(!useElevenLabs)}
            className="text-[10px] text-blue-600 hover:text-blue-800 font-medium"
          >
            {useElevenLabs ? 'ElevenLabs' : 'Browser TTS'}
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-6">
            <div className="w-12 h-12 mx-auto rounded-full bg-blue-50 flex items-center justify-center mb-3">
              <Sparkles className="w-6 h-6 text-blue-500" />
            </div>
            <h4 className="text-sm font-semibold text-gray-900 mb-1">AI Customer Assistant</h4>
            <p className="text-xs text-gray-500 mb-4 max-w-[280px] mx-auto">
              Ask anything about {customerName}: payment history, overdue invoices, trends, or create tickets & reminders.
            </p>
          </div>
        )}

        {showSuggestions && messages.length === 0 && (
          <div className="grid grid-cols-2 gap-1.5">
            {SUGGESTED_QUESTIONS.map((sq, i) => (
              <button
                key={i}
                onClick={() => sendMessage(sq.question)}
                className="text-left px-2.5 py-2 rounded-lg bg-gray-50 hover:bg-blue-50 border border-gray-100 hover:border-blue-200 transition-colors group"
              >
                <span className="text-[11px] font-medium text-gray-700 group-hover:text-blue-700 flex items-center gap-1">
                  {sq.label.includes('ticket') && <Ticket className="w-3 h-3 text-amber-500" />}
                  {sq.label.includes('reminder') && <Bell className="w-3 h-3 text-purple-500" />}
                  {!sq.label.includes('ticket') && !sq.label.includes('reminder') && <ChevronDown className="w-3 h-3 text-gray-400 rotate-[-90deg]" />}
                  {sq.label}
                </span>
              </button>
            ))}
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-sm'
                  : 'bg-gray-100 text-gray-800 rounded-bl-sm'
              }`}
            >
              {msg.isLoading ? (
                <div className="flex items-center gap-2 py-1">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
                  <span className="text-xs text-gray-500">Analyzing...</span>
                </div>
              ) : (
                <div
                  className="text-[13px] leading-relaxed [&_strong]:font-semibold"
                  dangerouslySetInnerHTML={{ __html: formatMessage(msg.content) }}
                />
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Speaking indicator */}
      {isSpeaking && (
        <div className="px-4 py-2 bg-blue-50 border-t border-blue-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5">
              <div className="w-1 h-3 bg-blue-400 rounded-full animate-pulse" />
              <div className="w-1 h-4 bg-blue-500 rounded-full animate-pulse delay-75" />
              <div className="w-1 h-2 bg-blue-400 rounded-full animate-pulse delay-150" />
              <div className="w-1 h-5 bg-blue-600 rounded-full animate-pulse delay-200" />
              <div className="w-1 h-3 bg-blue-400 rounded-full animate-pulse delay-300" />
            </div>
            <span className="text-xs text-blue-700 font-medium">Speaking...</span>
          </div>
          <button
            onClick={stopSpeaking}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            Stop
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="px-3 py-3 border-t border-gray-100 shrink-0 bg-white">
        <div className="flex items-end gap-2">
          <button
            onClick={isListening ? stopListening : startListening}
            disabled={isLoading}
            className={`shrink-0 p-2.5 rounded-xl transition-all duration-200 ${
              isListening
                ? 'bg-red-100 text-red-600 animate-pulse ring-2 ring-red-200'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700'
            } disabled:opacity-40`}
            title={isListening ? 'Stop listening' : 'Voice input'}
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isListening ? 'Listening...' : `Ask about ${customerName.split(' ')[0]}...`}
              rows={1}
              className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400 max-h-[80px] overflow-y-auto"
              style={{ minHeight: '40px' }}
            />
          </div>

          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isLoading}
            className="shrink-0 p-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>

        {isListening && (
          <div className="mt-2 text-center">
            <span className="text-xs text-red-600 font-medium animate-pulse">
              Listening... speak your question
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
