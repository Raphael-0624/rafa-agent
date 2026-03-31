import React, { useState, useRef, useEffect } from 'react';
import { MarkdownRenderer } from './MarkdownRenderer';

// Debug log helper
const debugLogs: Array<{ timestamp: string; type: string; data: any }> = [];

function addDebugLog(type: string, data: any) {
  const entry = {
    timestamp: new Date().toISOString(),
    type,
    data
  };
  debugLogs.push(entry);
  console.log(`[${type}]`, data);

  // Keep only last 100 entries
  if (debugLogs.length > 100) {
    debugLogs.shift();
  }
}

// Export for debugging
(window as any).getDebugLogs = () => debugLogs;
(window as any).downloadDebugLogs = () => {
  const blob = new Blob([JSON.stringify(debugLogs, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `chat-debug-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

// New types for agent protocol
interface StatusEvent {
  type: string;
  message: string;
  current?: number;
  total?: number;
}

interface ClarifyOption {
  id: string;
  label: string;
  value: string;
}

interface ClarifyEvent {
  question: string;
  options: ClarifyOption[];
  allowCustomInput: boolean;
}

type MessageRole = 'user' | 'assistant' | 'status' | 'clarify';

interface Message {
  id: string;
  role: MessageRole;
  content?: string;
  status?: StatusEvent;
  clarify?: ClarifyEvent;
  isStreaming?: boolean;
  timestamp: Date;
}

export const Chat: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStatus, setCurrentStatus] = useState<StatusEvent | null>(null);
  const [streamingContent, setStreamingContent] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const assistantMessageIdRef = useRef<string | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const generateId = () => Math.random().toString(36).substring(2, 9);

  // Parse SSE events from stream chunk
  const parseEvents = (chunk: string): Array<{ event: string; data: any }> => {
    addDebugLog('parseEvents.input', { chunkLength: chunk.length, chunk: chunk.substring(0, 500) });

    const events: Array<{ event: string; data: any }> = [];
    const lines = chunk.split('\n');
    let currentEvent: string | null = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        // Empty line indicates end of event, reset
        currentEvent = null;
        continue;
      }

      if (trimmed.startsWith('event:')) {
        currentEvent = trimmed.substring(6).trim();
      } else if (trimmed.startsWith('data:')) {
        const dataStr = trimmed.substring(5).trim();
        if (currentEvent) {
          try {
            const data = dataStr ? JSON.parse(dataStr) : {};
            events.push({ event: currentEvent, data });
            addDebugLog('parseEvents.parsed', { event: currentEvent, data });
          } catch (e) {
            events.push({ event: currentEvent, data: dataStr });
            addDebugLog('parseEvents.parseError', { event: currentEvent, dataStr, error: (e as Error).message });
          }
          currentEvent = null;
        }
      }
    }

    addDebugLog('parseEvents.output', { eventCount: events.length, events: events.map(e => e.event) });
    return events;
  };

  const handleSubmit = async (e: React.FormEvent, clarifyValue?: string) => {
    e.preventDefault();
    const messageContent = clarifyValue || input.trim();
    if (!messageContent || isLoading) return;

    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content: messageContent,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    if (!clarifyValue) {
      setInput('');
    }
    setIsLoading(true);
    setError(null);
    setCurrentStatus(null);

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: messageContent,
          sessionId: 'default'
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      assistantMessageIdRef.current = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const events = parseEvents(chunk);

        for (const { event, data } of events) {
          addDebugLog('event.received', { event, data, streamingContentBefore: streamingContent });

          switch (event) {
            case 'status':
              addDebugLog('event.status', data);
              setCurrentStatus(data);
              break;

            case 'content':
              addDebugLog('event.content.raw', { data, type: typeof data, hasContent: 'content' in data });
              const contentText = data?.content || '';
              addDebugLog('event.content.extracted', { contentText, length: contentText.length });
              setStreamingContent(prev => {
                const newContent = prev + contentText;
                addDebugLog('streamingContent.updated', { prev: prev, added: contentText, new: newContent });
                return newContent;
              });
              break;
              // Also update messages array
              if (!assistantMessageIdRef.current) {
                assistantMessageIdRef.current = generateId();
                setMessages(prev => [...prev, {
                  id: assistantMessageIdRef.current!,
                  role: 'assistant',
                  content: contentText,
                  isStreaming: true,
                  timestamp: new Date(),
                }]);
              } else {
                setMessages(prev =>
                  prev.map(m =>
                    m.id === assistantMessageIdRef.current
                      ? { ...m, content: m.content + contentText }
                      : m
                  )
                );
              }
              break;

            case 'clarify':
              addDebugLog('event.clarify', data);
              setMessages(prev => [...prev, {
                id: generateId(),
                role: 'clarify',
                clarify: data,
                timestamp: new Date(),
              }]);
              setIsLoading(false);
              setCurrentStatus(null);
              break;

            case 'error':
              addDebugLog('event.error', data);
              setError(data.error || '请求失败');
              break;

            case 'done':
              addDebugLog('event.done', data);
              if (assistantMessageIdRef.current) {
                setMessages(prev =>
                  prev.map(m =>
                    m.id === assistantMessageIdRef.current
                      ? { ...m, isStreaming: false }
                      : m
                  )
                );
                assistantMessageIdRef.current = null;
              }
              setStreamingContent('');
              setIsLoading(false);
              setCurrentStatus(null);
              break;

            default:
              addDebugLog('event.unknown', { event, data });
          }
        }
      }

    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Request aborted');
      } else {
        setError(err.message || '请求失败');
      }
      setIsLoading(false);
      setCurrentStatus(null);
    } finally {
      abortControllerRef.current = null;
    }
  };

  const handleClarifySelect = (option: ClarifyOption) => {
    handleSubmit({ preventDefault: () => {} } as React.FormEvent, option.value);
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
      setCurrentStatus(null);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setError(null);
    setCurrentStatus(null);
  };

  return (
    <div className="flex flex-col h-screen bg-slate-900">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-lg">
            R
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">Rafa Agent</h1>
            <p className="text-sm text-slate-400">AI 智能助手</p>
          </div>
        </div>
        <button
          onClick={clearChat}
          className="px-4 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
        >
          清空对话
        </button>
        <button
          onClick={() => (window as any).downloadDebugLogs?.()}
          className="px-4 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors ml-2"
          title="下载调试日志"
        >
          📋 日志
        </button>
      </header>

      {/* Status Bar */}
      {currentStatus && (
        <div className="bg-blue-900/30 border-b border-blue-800 px-4 py-2">
          <div className="flex items-center gap-2 text-blue-300 text-sm">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            <span>{currentStatus.message}</span>
            {currentStatus.total && (
              <span className="text-blue-400">
                ({currentStatus.current}/{currentStatus.total})
              </span>
            )}
          </div>
        </div>
      )}

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
            <p className="text-sm mt-2">输入你的问题，Rafa 会为你解答</p>
            <p className="text-xs mt-1 text-slate-500">支持 /search 命令进行搜索</p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${
              message.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            {message.role === 'clarify' && message.clarify ? (
              <div className="max-w-3xl px-4 py-3 rounded-2xl bg-slate-800 border border-blue-700">
                <p className="text-slate-200 mb-3">{message.clarify.question}</p>
                <div className="flex flex-wrap gap-2">
                  {message.clarify.options.map((option) => (
                    <button
                      key={option.id}
                      onClick={() => handleClarifySelect(option)}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div
                className={`max-w-3xl px-4 py-3 rounded-2xl ${
                  message.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-100'
                }`}
              >
                {message.role === 'assistant' ? (
                  <div className="text-left">
                    <MarkdownRenderer content={message.content || ''} />
                    {message.isStreaming && <span className="streaming-cursor" />}
                  </div>
                ) : (
                  <p className="text-left">{message.content}</p>
                )}
              </div>
            )}
          </div>
        ))}

        {error && (
          <div className="flex justify-center">
            <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-2 rounded-lg text-sm">
              错误: {error}
            </div>
          </div>
        )}

        {/* Debug: Direct streaming display */}
        {streamingContent && (
          <div className="flex justify-start">
            <div className="max-w-3xl px-4 py-3 rounded-2xl bg-slate-800 text-slate-100 border border-green-500">
              <div className="text-xs text-green-400 mb-2">DEBUG: streamingContent</div>
              <div className="text-left whitespace-pre-wrap">{streamingContent}</div>
              {isLoading && <span className="streaming-cursor" />}
            </div>
          </div>
        )}

        {/* Debug: Show current streamingContent value */}
        <div className="flex justify-center">
          <div className="text-xs text-slate-500">
            streamingContent length: {streamingContent.length}
          </div>
        </div>

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
