import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatInterfaceProps {
  onSendMessage: (message: string) => void;
  onGenerateMap: () => void;
  messages: Message[];
  isLoading: boolean;
  hasApiKey: boolean | null;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ onSendMessage, onGenerateMap, messages, isLoading, hasApiKey }) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSendMessage(input);
      setInput('');
    }
  };

  const submitIfReady = () => {
    if (input.trim() && !isLoading) {
      onSendMessage(input);
      setInput('');
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-zinc-200/90 bg-white shadow-sm ring-1 ring-black/[0.03]">
      <div className="custom-scrollbar flex-1 space-y-4 overflow-y-auto p-5 select-text">
        {messages.length === 0 && (
          <div className="mt-12 px-6 text-center text-zinc-400">
            <Bot size={40} strokeWidth={1.5} className="mx-auto mb-3 opacity-25" aria-hidden />
            <p className="text-[15px] font-medium text-zinc-600">How can I help you build your Pokémon world?</p>
            {hasApiKey === false && (
              <p className="mt-3 text-xs text-amber-700/90">
                Configure an AI API key from the top bar (AI menu) to enable chat.
              </p>
            )}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[95%] rounded-2xl px-4 py-3 shadow-sm ${
                m.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : m.content.startsWith('Error:')
                    ? 'border border-red-100 bg-red-50 text-red-900'
                    : 'border border-zinc-100 bg-zinc-50 text-zinc-800'
              }`}
            >
              <div
                className={`mb-1.5 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide ${
                  m.role === 'user' ? 'text-blue-100' : 'text-zinc-500'
                }`}
              >
                {m.role === 'user' ? <User size={12} className="mr-1" /> : <Bot size={12} className="mr-1" />}
                {m.role === 'user' ? 'You' : 'Assistant'}
              </div>
              <div className="max-h-96 overflow-y-auto whitespace-pre-wrap text-[13px] leading-relaxed select-text cursor-text">
                {m.content}
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-3 rounded-2xl border border-zinc-100 bg-white px-4 py-3 shadow-sm">
              <div className="h-2 w-2 animate-bounce rounded-full bg-zinc-400" />
              <div className="h-2 w-2 animate-bounce rounded-full bg-zinc-400 [animation-delay:90ms]" />
              <div className="h-2 w-2 animate-bounce rounded-full bg-zinc-400 [animation-delay:180ms]" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={handleSubmit} className="border-t border-zinc-200 bg-zinc-50/70 p-4">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitIfReady();
              }
            }}
            placeholder="e.g. Create a forest map with a small pond..."
            rows={3}
            className="relative z-10 min-h-[4.5rem] max-h-[min(40vh,220px)] flex-1 resize-none overflow-y-auto rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-[13px] leading-snug text-zinc-900 placeholder:text-zinc-400 shadow-inner focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
            aria-label="Chat message"
          />
          <button
            type="submit"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center self-end rounded-lg bg-blue-600 text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!input.trim()}
            aria-label="Send message"
          >
            <Send size={18} className={isLoading ? 'animate-pulse' : ''} />
          </button>
          <button
            type="button"
            onClick={onGenerateMap}
            className="h-11 shrink-0 self-end rounded-lg bg-emerald-600 px-4 text-[13px] font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={isLoading}
            title="Generate a proof-of-concept map from the stub spec"
          >
            Generate Map
          </button>
        </div>
        <p className="mt-2 text-[11px] text-zinc-400">Enter to send · Shift+Enter for a new line</p>
      </form>
    </div>
  );
};

export default ChatInterface;
