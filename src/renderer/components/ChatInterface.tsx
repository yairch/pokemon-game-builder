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

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-4 select-text">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 mt-10">
            <Bot size={48} className="mx-auto mb-2 opacity-20" />
            <p>How can I help you build your Pokemon world today?</p>
            {hasApiKey === false && (
              <p className="text-xs text-yellow-600 mt-2 italic">Note: AI API key not detected in config.</p>
            )}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[95%] p-3 rounded-lg ${
                m.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : m.content.startsWith('Error:') 
                    ? 'bg-red-50 text-red-800 border border-red-100'
                    : 'bg-gray-100 text-gray-800'
              }`}
            >
              <div className="flex items-center mb-1 text-xs opacity-70">
                {m.role === 'user' ? <User size={12} className="mr-1" /> : <Bot size={12} className="mr-1" />}
                {m.role === 'user' ? 'You' : 'Assistant'}
              </div>
              <div className="whitespace-pre-wrap text-sm leading-relaxed overflow-y-auto max-h-96 select-text cursor-text">
                {m.content}
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 p-3 rounded-lg flex items-center space-x-2">
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100"></div>
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={handleSubmit} className="p-4 border-t border-gray-200">
        <div className="flex space-x-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. Create a forest map with a small pond..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white relative z-10 cursor-text"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            disabled={!input.trim()}
          >
            <Send size={18} className={isLoading ? "animate-pulse" : ""} />
          </button>
          <button
            type="button"
            onClick={onGenerateMap}
            className="px-3 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
            disabled={isLoading}
          >
            Generate Map (POC)
          </button>
        </div>
      </form>
    </div>
  );
};

export default ChatInterface;
