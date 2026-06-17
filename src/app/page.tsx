"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { ComponentProps, CSSProperties } from "react";
import {
  Send,
  Bot,
  User,
  Brain,
  Loader2,
  Trash2,
  Sparkles,
  Copy,
  Check,
  Plus,
  MessageSquare,
  Clock3,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import remarkGfm from "remark-gfm";

const syntaxHighlighterStyle = vscDarkPlus as Record<string, CSSProperties>;
const USER_ID = "54ad7274-ddff-4727-9ca0-84097b044c11";
const CURRENT_SESSION_KEY = "learning-brain-current-session";

interface Message {
  id: string;
  content: string;
  role: "user" | "assistant";
  timestamp: Date;
}

interface ChatSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface ApiChatMessage {
  id: string;
  content: string;
  role: "user" | "assistant";
  created_at: string;
}

type MarkdownCodeProps = ComponentProps<"code"> & {
  inline?: boolean;
  node?: unknown;
};

function toChatMessages(apiMessages: ApiChatMessage[]): Message[] {
  return apiMessages.map((message) => ({
    id: message.id,
    content: message.content,
    role: message.role,
    timestamp: new Date(message.created_at),
  }));
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasLoadedStoredSession = useRef(false);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadSessions = useCallback(async () => {
    setIsLoadingSessions(true);

    try {
      const response = await fetch(
        `/api/chat-sessions?userId=${encodeURIComponent(USER_ID)}`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load sessions");
      }

      setSessions(data.sessions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sessions");
    } finally {
      setIsLoadingSessions(false);
    }
  }, []);

  const loadSession = useCallback(async (sessionId: string) => {
    setIsLoadingSession(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/chat-sessions/${sessionId}?userId=${encodeURIComponent(USER_ID)}`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load this session");
      }

      setCurrentSessionId(data.session.id);
      setMessages(toChatMessages(data.messages ?? []));
      window.sessionStorage.setItem(CURRENT_SESSION_KEY, data.session.id);
      inputRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load session");
    } finally {
      setIsLoadingSession(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (hasLoadedStoredSession.current) return;
    hasLoadedStoredSession.current = true;

    const storedSessionId = window.sessionStorage.getItem(CURRENT_SESSION_KEY);
    if (storedSessionId) {
      void loadSession(storedSessionId);
    }
  }, [loadSession]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: input.trim(),
      role: "user",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/brain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputText: userMessage.content,
          userId: USER_ID,
          sessionId: currentSessionId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Error: ${response.status}`);
      }

      let responseText = "";
      if (data.error) responseText = `Error: ${data.error}`;
      else if (data.response) responseText = data.response;
      else if (data.answer) responseText = data.answer;
      else if (data.message) responseText = data.message;
      else
        responseText = "I received your message. How can I help you further?";

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: responseText,
        role: "assistant",
        timestamp: new Date(),
      };

      if (data.sessionId) {
        setCurrentSessionId(data.sessionId);
        window.sessionStorage.setItem(CURRENT_SESSION_KEY, data.sessionId);
      }

      if (data.sessionSaved === false && data.sessionError) {
        setError(
          `Answer returned, but the chat session was not saved: ${data.sessionError}`
        );
      }

      setMessages((prev) => [...prev, assistantMessage]);
      void loadSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
      console.error("Error sending message:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const startNewChat = () => {
    setMessages([]);
    setCurrentSessionId(null);
    setError(null);
    window.sessionStorage.removeItem(CURRENT_SESSION_KEY);
    inputRef.current?.focus();
  };

  const deleteSession = async (sessionId: string) => {
    const shouldDelete = window.confirm("Delete this chat session?");
    if (!shouldDelete) return;

    try {
      const response = await fetch(
        `/api/chat-sessions/${sessionId}?userId=${encodeURIComponent(USER_ID)}`,
        { method: "DELETE" }
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete session");
      }

      setSessions((prev) =>
        prev.filter((session) => session.id !== sessionId)
      );
      if (currentSessionId === sessionId) {
        startNewChat();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete session");
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatSessionTime = (value: string) => {
    const date = new Date(value);
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();

    if (isToday) {
      return date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="bg-slate-800/90 backdrop-blur-md border-b border-slate-700/50 shadow-xl sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3 sm:space-x-4">
              <div className="relative group">
                <div className="p-2.5 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg transform group-hover:scale-105 transition-transform duration-200">
                  <Brain className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                </div>
                <div className="absolute -inset-1 bg-blue-400/20 rounded-xl blur-sm group-hover:blur-md transition-all duration-300"></div>
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-blue-200 to-blue-400 bg-clip-text text-transparent">
                  Learning Brain
                </h1>
                <p className="text-xs sm:text-sm text-slate-300 hidden sm:flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  AI-powered knowledge assistant
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {messages.length > 0 && (
                <div className="hidden sm:block text-sm text-slate-400 bg-slate-700/50 px-3 py-1 rounded-lg">
                  {messages.length} message{messages.length !== 1 ? "s" : ""}
                </div>
              )}
              <button
                onClick={startNewChat}
                className="flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2.5 text-sm text-slate-300 hover:text-white hover:bg-slate-700/60 rounded-xl transition-all duration-200 border border-slate-600/50 hover:border-blue-500/30 backdrop-blur-sm group"
              >
                <Plus className="w-4 h-4 group-hover:scale-110 transition-transform" />
                <span className="hidden sm:inline">New Chat</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Chat Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 h-[calc(100vh-80px)] py-4">
        <div className="grid h-full grid-rows-[auto_minmax(0,1fr)] gap-4 lg:grid-cols-[300px_minmax(0,1fr)] lg:grid-rows-1">
          <aside className="bg-slate-800/40 backdrop-blur-xl rounded-2xl border border-slate-700/30 shadow-2xl flex flex-col overflow-hidden max-h-56 lg:max-h-none">
            <div className="border-b border-slate-700/30 p-3 sm:p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Clock3 className="w-4 h-4 text-blue-400" />
                  Sessions
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  {sessions.length} saved
                </p>
              </div>
              <button
                type="button"
                onClick={startNewChat}
                title="Start new chat"
                className="shrink-0 p-2 text-slate-300 hover:text-white hover:bg-slate-700/60 rounded-lg transition-all border border-slate-600/40"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <div className="messages-container flex-1 overflow-y-auto p-2 space-y-1">
              {isLoadingSessions ? (
                <div className="flex items-center gap-2 px-3 py-3 text-sm text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading sessions
                </div>
              ) : sessions.length === 0 ? (
                <div className="px-3 py-4 text-sm text-slate-400">
                  No saved sessions yet.
                </div>
              ) : (
                sessions.map((session) => {
                  const isActive = session.id === currentSessionId;

                  return (
                    <div
                      key={session.id}
                      className={`group flex items-stretch rounded-xl border transition-all ${
                        isActive
                          ? "bg-blue-500/15 border-blue-500/40"
                          : "bg-slate-900/20 border-transparent hover:bg-slate-700/30 hover:border-slate-600/30"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => void loadSession(session.id)}
                        disabled={isLoadingSession}
                        className="min-w-0 flex-1 px-3 py-2 text-left disabled:cursor-wait"
                      >
                        <span className="flex items-center gap-2 text-sm text-slate-100">
                          <MessageSquare className="w-4 h-4 shrink-0 text-blue-300" />
                          <span className="truncate">{session.title}</span>
                        </span>
                        <span className="mt-1 block text-xs text-slate-400">
                          {formatSessionTime(session.updated_at)}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteSession(session.id)}
                        title="Delete session"
                        className="shrink-0 px-2 text-slate-500 hover:text-red-300 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </aside>

          <div className="bg-slate-800/40 backdrop-blur-xl rounded-2xl border border-slate-700/30 shadow-2xl h-full flex flex-col overflow-hidden min-h-0">
            {/* Messages Container */}
            <div
              ref={messagesContainerRef}
              className="messages-container flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-gradient-to-b from-slate-800/20 to-slate-900/10"
            >
            {messages.length === 0 ? (
              <div className="text-center py-8 sm:py-16 h-full flex flex-col justify-center">
                <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 sm:mb-6 bg-gradient-to-br from-blue-500/20 to-blue-600/20 rounded-2xl flex items-center justify-center shadow-lg">
                  <Brain className="w-8 h-8 sm:w-10 sm:h-10 text-blue-400" />
                </div>
                <h2 className="text-xl sm:text-2xl font-semibold text-white mb-3">
                  Welcome to Learning Brain
                </h2>
                <p className="text-slate-300 max-w-md mx-auto mb-6 sm:mb-8 text-sm sm:text-base leading-relaxed">
                  Start a conversation by sharing knowledge or asking questions.
                </p>
                <div className="mt-6 space-y-3 max-w-sm mx-auto">
                  <div
                    className="text-left p-4 bg-slate-700/30 border border-slate-600/30 rounded-xl backdrop-blur-sm hover:border-blue-500/20 transition-all duration-300 group cursor-pointer"
                    onClick={() =>
                      setInput(
                        "Review this code: function add(a,b) { return a+b }"
                      )
                    }
                  >
                    <p className="text-sm text-slate-300 leading-relaxed group-hover:text-slate-200">
                      <strong className="text-blue-400">Code:</strong>{" "}
                      &quot;Review this code: function add...&quot;
                    </p>
                  </div>
                  <div
                    className="text-left p-4 bg-slate-700/30 border border-slate-600/30 rounded-xl backdrop-blur-sm hover:border-blue-500/20 transition-all duration-300 group cursor-pointer"
                    onClick={() =>
                      setInput("What do you know about energy conversion?")
                    }
                  >
                    <p className="text-sm text-slate-300 leading-relaxed group-hover:text-slate-200">
                      <strong className="text-blue-400">Ask:</strong>{" "}
                      &quot;What do you know about energy conversion?&quot;
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex gap-3 ${
                      message.role === "user" ? "flex-row-reverse" : "flex-row"
                    }`}
                  >
                    {/* Avatar */}
                    <div
                      className={`shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shadow-lg ${
                        message.role === "user"
                          ? "bg-gradient-to-br from-blue-500 to-blue-600"
                          : "bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-600/50"
                      }`}
                    >
                      {message.role === "user" ? (
                        <User className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                      ) : (
                        <Bot className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                      )}
                    </div>

                    {/* Message Bubble - WIDTH INCREASED FOR CODE */}
                    <div
                      className={`max-w-[90%] sm:max-w-[85%] rounded-2xl px-4 py-3 shadow-lg backdrop-blur-sm overflow-hidden ${
                        message.role === "user"
                          ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white"
                          : "bg-slate-700/60 text-slate-100 border border-slate-600/30"
                      }`}
                    >
                      {/* NEW: Markdown Renderer */}
                      <div className="text-sm sm:text-[15px] leading-relaxed">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            // Custom Code Block Renderer
                            code({
                              node,
                              inline,
                              className,
                              children,
                              ...props
                            }: MarkdownCodeProps) {
                              void node;
                              const match = /language-(\w+)/.exec(
                                className || ""
                              );
                              const codeString = String(children).replace(
                                /\n$/,
                                ""
                              );

                              if (!inline && match) {
                                return (
                                  <div className="relative my-4 rounded-lg overflow-hidden border border-slate-600/50 bg-[#1e1e1e]">
                                    <div className="flex items-center justify-between px-3 py-2 bg-[#2d2d2d] border-b border-slate-600/50">
                                      <span className="text-xs text-slate-400 font-mono">
                                        {match[1]}
                                      </span>
                                      <CopyButton code={codeString} />
                                    </div>
                                    <SyntaxHighlighter
                                      style={syntaxHighlighterStyle}
                                      language={match[1]}
                                      PreTag="div"
                                      className="!my-0 !bg-[#1e1e1e] !p-4 scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent"
                                      showLineNumbers={true}
                                      wrapLines={true}
                                    >
                                      {codeString}
                                    </SyntaxHighlighter>
                                  </div>
                                );
                              }
                              // Inline Code (e.g. `variable`)
                              return (
                                <code
                                  className={`${
                                    message.role === "user"
                                      ? "bg-blue-700 text-white"
                                      : "bg-slate-800 text-blue-200"
                                  } px-1.5 py-0.5 rounded font-mono text-sm`}
                                  {...props}
                                >
                                  {children}
                                </code>
                              );
                            },
                            // Paragraph styling
                            p: ({ children }) => (
                              <p className="mb-2 last:mb-0">{children}</p>
                            ),
                            // List styling
                            ul: ({ children }) => (
                              <ul className="list-disc ml-4 mb-2 space-y-1">
                                {children}
                              </ul>
                            ),
                            ol: ({ children }) => (
                              <ol className="list-decimal ml-4 mb-2 space-y-1">
                                {children}
                              </ol>
                            ),
                            li: ({ children }) => (
                              <li className="mb-0.5">{children}</li>
                            ),
                            // Link styling
                            a: ({ href, children }) => (
                              <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-300 hover:underline"
                              >
                                {children}
                              </a>
                            ),
                          }}
                        >
                          {message.content}
                        </ReactMarkdown>
                      </div>

                      {/* Timestamp */}
                      <div
                        className={`text-xs mt-2 font-medium flex items-center gap-2 ${
                          message.role === "user"
                            ? "text-blue-200/80"
                            : "text-slate-400"
                        }`}
                      >
                        <span>{formatTime(message.timestamp)}</span>
                        {message.role === "assistant" && (
                          <span className="flex items-center gap-1">
                            <Sparkles className="w-3 h-3" />
                            AI
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Loading Indicator */}
            {isLoading && (
              <div className="flex gap-3">
                <div className="shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-600/50 flex items-center justify-center shadow-lg">
                  <Bot className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </div>
                <div className="bg-slate-700/60 text-slate-100 rounded-2xl px-4 py-3 border border-slate-600/30 shadow-lg backdrop-blur-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                      <div
                        className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"
                        style={{ animationDelay: "0.1s" }}
                      ></div>
                      <div
                        className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"
                        style={{ animationDelay: "0.2s" }}
                      ></div>
                    </div>
                    <span className="text-sm text-slate-300">Thinking...</span>
                  </div>
                </div>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="flex gap-3">
                <div className="shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-lg">
                  <Bot className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </div>
                <div className="bg-red-900/30 text-red-300 rounded-2xl px-4 py-3 border border-red-700/50 shadow-lg backdrop-blur-sm max-w-[85%] sm:max-w-[75%]">
                  <div className="flex items-start gap-2">
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        Something went wrong
                      </p>
                      <p className="text-xs mt-1 opacity-90">{error}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Form */}
          <div className="border-t border-slate-700/30 p-4 sm:p-6 bg-slate-800/40 backdrop-blur-md">
            <form onSubmit={handleSubmit} className="flex gap-3 sm:gap-4">
              <div className="flex-1 relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Share knowledge or ask a question..."
                  className="w-full px-4 py-3 sm:px-5 sm:py-4 bg-slate-700/50 border border-slate-600/30 text-white placeholder-slate-400 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/30 transition-all duration-300 backdrop-blur-sm shadow-lg text-sm sm:text-base"
                  disabled={isLoading}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit(e);
                    }
                  }}
                />
                {!input && (
                  <div className="absolute inset-y-0 right-3 flex items-center">
                    <span className="text-xs text-slate-500 bg-slate-600/30 px-2 py-1 rounded-lg hidden sm:block">
                      Press Enter to send
                    </span>
                  </div>
                )}
              </div>
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="px-4 py-3 sm:px-6 sm:py-4 bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 flex items-center gap-2 font-medium shadow-lg hover:shadow-blue-500/20 disabled:hover:shadow-none group min-w-[80px] sm:min-w-[100px] justify-center"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 sm:w-5 sm:h-5 group-hover:translate-x-0.5 transition-transform" />
                )}
                <span className="hidden sm:inline">Send</span>
              </button>
            </form>
            <p className="text-xs text-slate-500 mt-3 text-center flex items-center justify-center gap-2">
              <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse"></span>
              Your knowledge is stored securely and improves responses over time
            </p>
          </div>
        </div>
        </div>
      </main>
    </div>
  );
}

// Helper Component for the Copy Button
function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy!", err);
    }
  };

  return (
    <button
      onClick={copyToClipboard}
      className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-md transition-all flex items-center gap-1.5"
      title="Copy code"
    >
      {copied ? (
        <>
          <Check className="w-3.5 h-3.5 text-green-400" />
          <span className="text-xs text-green-400">Copied!</span>
        </>
      ) : (
        <>
          <Copy className="w-3.5 h-3.5" />
          <span className="text-xs">Copy</span>
        </>
      )}
    </button>
  );
}
