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
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isLoading?: boolean;
}

const SUGGESTED_QUESTIONS = [
  {
    label: 'High-risk customers',
    question: 'Who are the customers that haven\'t paid invoices in more than a year or owe more than $500,000?',
    icon: '🔴',
  },
  {
    label: 'Best collector',
    question: 'Which representative is performing the best based on closed tickets and collections?',
    icon: '🏆',
  },
  {
    label: 'Recent payments',
    question: 'How much in payments have we received in the past two months?',
    icon: '💰',
  },
  {
    label: 'Aging summary',
    question: 'Give me the accounts receivable aging summary with bucket totals.',
    icon: '📊',
  },
  {
    label: 'Top balances',
    question: 'Show me the top 10 customers by outstanding balance.',
    icon: '📋',
  },
  {
    label: 'Monthly trend',
    question: 'What is the monthly payment collection trend for this year?',
    icon: '📈',
  },
];

function formatMessage(content: string): string {
  return content
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>')
    .replace(/\$([0-9,]+\.?\d*)/g, '<span class="font-semibold text-emerald-400">$$1</span>');
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
        className={`fixed bottom-6 right-6 z-50 w-14 h-14 bg-gradient-to-br from-gray-900 to-gray-700 text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 transition-all duration-300 group ${
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
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-full shadow-2xl hover:bg-gray-800 transition-all"
        >
          <Sparkles size={16} className="text-emerald-400" />
          <span className="text-sm font-medium">AI Assistant</span>
          {messages.length > 0 && (
            <span className="bg-emerald-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
              {messages.filter(m => m.role === 'assistant' && !m.isLoading).length}
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[420px] h-[640px] flex flex-col bg-gray-950 rounded-2xl shadow-2xl border border-gray-800 overflow-hidden animate-in">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 bg-gradient-to-r from-gray-900 to-gray-800 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-9 h-9 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center">
              <Sparkles size={18} className="text-white" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-gray-900" />
          </div>
          <div>
            <h3 className="text-white font-semibold text-sm">AI Assistant</h3>
            <p className="text-gray-400 text-xs">Ask anything about your data</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setVoiceEnabled(!voiceEnabled)}
            className={`p-1.5 rounded-lg transition-colors ${
              voiceEnabled
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
            }`}
            title={voiceEnabled ? 'Disable voice responses' : 'Enable voice responses'}
          >
            {voiceEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
          <button
            onClick={clearChat}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
            title="Clear chat"
          >
            <RotateCcw size={16} />
          </button>
          <button
            onClick={() => setIsMinimized(true)}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
            title="Minimize"
          >
            <Minimize2 size={16} />
          </button>
          <button
            onClick={() => {
              setIsOpen(false);
              stopSpeaking();
            }}
            className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-gray-800 transition-colors"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scrollbar-thin">
        {messages.length === 0 && showSuggestions && (
          <div className="space-y-4">
            <div className="text-center pt-4 pb-2">
              <div className="w-14 h-14 bg-gradient-to-br from-emerald-500/20 to-teal-600/20 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-emerald-500/20">
                <Sparkles size={24} className="text-emerald-400" />
              </div>
              <h4 className="text-white font-semibold mb-1">How can I help you?</h4>
              <p className="text-gray-500 text-xs leading-relaxed max-w-xs mx-auto">
                Ask about customers, invoices, payments, aging reports, collector performance, or create tickets.
              </p>
            </div>

            <div className="space-y-2">
              {SUGGESTED_QUESTIONS.map((sq, idx) => (
                <button
                  key={idx}
                  onClick={() => sendMessage(sq.question)}
                  className="w-full text-left px-3.5 py-2.5 bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 rounded-xl transition-all group"
                >
                  <div className="flex items-start gap-2.5">
                    <span className="text-sm mt-0.5 flex-shrink-0">{sq.icon}</span>
                    <div>
                      <p className="text-white text-sm font-medium group-hover:text-emerald-400 transition-colors">
                        {sq.label}
                      </p>
                      <p className="text-gray-500 text-xs mt-0.5 line-clamp-1">{sq.question}</p>
                    </div>
                  </div>
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
                  ? 'bg-emerald-600 text-white rounded-br-md'
                  : 'bg-gray-900 text-gray-200 border border-gray-800 rounded-bl-md'
              }`}
            >
              {msg.isLoading ? (
                <div className="flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin text-emerald-400" />
                  <span className="text-gray-400 text-xs">Analyzing data...</span>
                </div>
              ) : (
                <div
                  className="whitespace-pre-wrap break-words chat-content"
                  dangerouslySetInnerHTML={{ __html: formatMessage(msg.content) }}
                />
              )}
            </div>
          </div>
        ))}

        {isSpeaking && (
          <div className="flex justify-center">
            <button
              onClick={stopSpeaking}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-900 border border-gray-700 rounded-full text-xs text-gray-400 hover:text-white transition-colors"
            >
              <div className="flex items-center gap-1">
                <span className="w-1 h-3 bg-emerald-400 rounded-full animate-pulse" />
                <span className="w-1 h-4 bg-emerald-400 rounded-full animate-pulse [animation-delay:150ms]" />
                <span className="w-1 h-2 bg-emerald-400 rounded-full animate-pulse [animation-delay:300ms]" />
              </div>
              Speaking... Click to stop
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Scroll indicator */}
      {messages.length > 3 && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-[72px] left-1/2 -translate-x-1/2 p-1.5 bg-gray-800 border border-gray-700 rounded-full text-gray-400 hover:text-white shadow-lg transition-colors"
        >
          <ChevronDown size={14} />
        </button>
      )}

      {/* Input */}
      <div className="px-4 py-3 border-t border-gray-800 bg-gray-900/50">
        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isListening ? 'Listening...' : 'Ask a question...'}
              className="w-full bg-gray-800 text-white text-sm rounded-xl px-4 py-2.5 pr-10 resize-none border border-gray-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 outline-none placeholder-gray-500 max-h-24"
              rows={1}
              disabled={isLoading}
            />
            <button
              onClick={isListening ? stopListening : startListening}
              className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg transition-colors ${
                isListening
                  ? 'text-red-400 bg-red-500/10 animate-pulse'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
              title={isListening ? 'Stop listening' : 'Voice input'}
            >
              {isListening ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
          </div>

          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isLoading}
            className="p-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
          >
            {isLoading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Send size={18} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
