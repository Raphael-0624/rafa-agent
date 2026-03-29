import React, { useState, useRef, useEffect } from 'react';
import { MarkdownRenderer } from './MarkdownRenderer';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  timestamp: Date;
}

export const Chat: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const generateId = () => Math.random().toString(36).substring(2, 9);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    const assistantMessage: Message = {
      id: generateId(),
      role: 'assistant',
      content: '',
      isStreaming: true,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage, assistantMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);

    // 准备请求
    const history = messages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [...history, { role: 'user', content: userMessage.content }],
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);

            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);

              if (parsed.error) {
                setError(parsed.error);
                continue;
              }

              if (parsed.content) {
                fullContent += parsed.content;
                setMessages(prev =>
                  prev.map(m =>
                    m.id === assistantMessage.id
                      ? { ...m, content: fullContent }
                      : m
                  )
                );
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }

      // 完成流式输出
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantMessage.id
            ? { ...m, isStreaming: false }
            : m
        )
      );

    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Request aborted');
      } else {
        setError(err.message || '请求失败');
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantMessage.id
              ? { ...m, content: '抱歉，请求出错了。请稍后重试。', isStreaming: false }
              : m
          )
        );
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setMessages(prev =>
        prev.map(m =>
          m.isStreaming ? { ...m, isStreaming: false } : m
        )
      );
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setError(null);
  };

  return (
    <div className="flex flex-col h-screen bg-slate-900">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-lg">
            A
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">Agent Assistant</h1>
            <p className="text-sm text-slate-400">AI 智能助手</p>
          </div>
        </div>
        <button
          onClick={clearChat}
          className="px-4 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
        >
          清空对话
        </button>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-4">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <p className="text-lg">开始一个新对话</p>
            <p className="text-sm mt-2">输入你的问题，AI 助手会为你解答</p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${
              message.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            <div
              className={`max-w-3xl px-4 py-3 rounded-2xl ${
                message.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-100'
              }`}
            >
              {message.role === 'assistant' ? (
                <div className="text-left">
                  <MarkdownRenderer content={message.content} />
                  {message.isStreaming && <span className="streaming-cursor" />}
                </div>
              ) : (
                <p className="text-left">{message.content}</p>
              )}
            </div>
          </div>
        ))}

        {isLoading && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
          <div className="flex justify-start">
            <div className="bg-slate-800 px-4 py-3 rounded-2xl">
              <div className="loading-dots">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="flex justify-center">
            <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-2 rounded-lg text-sm">
              错误: {error}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-slate-700 bg-slate-800 px-4 py-4">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
          <div className="relative flex items-center gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder="输入你的问题... (Shift+Enter 换行)"
              rows={1}
              className="flex-1 bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none overflow-hidden"
              style={{ minHeight: '52px', maxHeight: '200px' }}
              disabled={isLoading}
            />

            {isLoading ? (
              <button
                type="button"
                onClick={handleStop}
                className="p-3 bg-red-600 hover:bg-red-700 text-white rounded-xl transition-colors"
                title="停止生成"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <rect x="6" y="6" width="8" height="8" />
                </svg>
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="p-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-xl transition-colors"
                title="发送"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
              </button>
            )}
          </div>
        </form>
        <p className="text-center text-xs text-slate-500 mt-2">
          使用 Markdown 格式 • 支持代码高亮 • 流式输出
        </p>
      </div>
    </div>
  );
};
