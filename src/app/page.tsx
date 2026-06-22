"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import type { CSSProperties } from "react";
import type { Components } from "react-markdown";
import {
  AlertCircle,
  ArrowDown,
  Bot,
  Brain,
  Check,
  Clock3,
  Copy,
  Loader2,
  Menu,
  MessageSquare,
  Plus,
  Send,
  Sparkles,
  Trash2,
  User,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import remarkGfm from "remark-gfm";

const syntaxHighlighterStyle = vscDarkPlus as Record<string, CSSProperties>;
const USER_ID = "54ad7274-ddff-4727-9ca0-84097b044c11";
const CURRENT_SESSION_KEY = "learning-brain-current-session";
const MAX_COMPOSER_HEIGHT = 164;

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

function toChatMessages(apiMessages: ApiChatMessage[]): Message[] {
  return apiMessages.map((message) => ({
    id: message.id,
    content: message.content,
    role: message.role,
    timestamp: new Date(message.created_at),
  }));
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hasLoadedStoredSession = useRef(false);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ block: "end", behavior });
  }, []);

  const updateBottomState = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    setIsAtBottom(distanceFromBottom < 120);
  }, []);

  useEffect(() => {
    if (messages.length === 0 && !isLoading) return;

    scrollToBottom(prefersReducedMotion() ? "auto" : "smooth");
  }, [messages.length, isLoading, scrollToBottom]);

  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(
      textarea.scrollHeight,
      MAX_COMPOSER_HEIGHT
    )}px`;
  }, [input]);

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
      setIsSidebarOpen(false);
      window.sessionStorage.setItem(CURRENT_SESSION_KEY, data.session.id);
      requestAnimationFrame(() => inputRef.current?.focus());
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

  const submitMessage = async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: trimmedInput,
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
      console.warn("Error sending message:", err);
    } finally {
      setIsLoading(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submitMessage();
  };

  const startNewChat = () => {
    setMessages([]);
    setCurrentSessionId(null);
    setError(null);
    setIsSidebarOpen(false);
    window.sessionStorage.removeItem(CURRENT_SESSION_KEY);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const applyPrompt = (prompt: string) => {
    setInput(prompt);
    requestAnimationFrame(() => inputRef.current?.focus());
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

  const canSend = input.trim().length > 0 && !isLoading;
  const activeSessionTitle =
    sessions.find((session) => session.id === currentSessionId)?.title ??
    "Fresh thread";

  return (
    <div className="app-stage h-[100dvh] overflow-hidden text-[#f7faff]">
      <div className="grid h-full min-w-0 grid-cols-1 overflow-hidden lg:grid-cols-[19rem_minmax(0,1fr)]">
        <aside className="sidebar-panel hidden min-h-0 min-w-0 flex-col border-r border-white/10 lg:flex">
          <SessionNavigation
            sessions={sessions}
            currentSessionId={currentSessionId}
            isLoadingSessions={isLoadingSessions}
            isLoadingSession={isLoadingSession}
            onNewChat={startNewChat}
            onLoadSession={loadSession}
            onDeleteSession={deleteSession}
            formatSessionTime={formatSessionTime}
          />
        </aside>

        {isSidebarOpen && (
          <div className="fixed inset-0 z-40 lg:hidden" role="presentation">
            <button
              type="button"
              aria-label="Close navigation"
              className="absolute inset-0 bg-black/[0.58]"
              onClick={() => setIsSidebarOpen(false)}
            />
            <aside className="sidebar-panel relative z-10 flex h-full w-[min(22rem,86vw)] flex-col border-r border-white/10 shadow-[28px_0_80px_rgba(0,0,0,0.42)]">
              <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-4">
                <span className="text-sm font-semibold text-white">Menu</span>
                <button
                  type="button"
                  onClick={() => setIsSidebarOpen(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
                  aria-label="Close menu"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <SessionNavigation
                sessions={sessions}
                currentSessionId={currentSessionId}
                isLoadingSessions={isLoadingSessions}
                isLoadingSession={isLoadingSession}
                onNewChat={startNewChat}
                onLoadSession={loadSession}
                onDeleteSession={deleteSession}
                formatSessionTime={formatSessionTime}
              />
            </aside>
          </div>
        )}

        <main className="flex min-h-0 min-w-0 flex-col overflow-hidden px-3 pb-3 pt-3 sm:px-5 sm:pb-5 lg:px-6 lg:py-6">
          <header className="nav-shell mb-3 flex h-14 shrink-0 items-center justify-between gap-3 rounded-2xl border border-white/10 px-3 shadow-[0_18px_60px_rgba(0,0,0,0.22)] sm:h-16 sm:px-4 lg:mb-4">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setIsSidebarOpen(true)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-300 transition hover:bg-white/[0.08] hover:text-white lg:hidden"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" aria-hidden="true" />
              </button>
              <div className="brand-mark hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 sm:flex lg:hidden">
                <Brain className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-sm font-semibold text-white sm:text-base">
                  {activeSessionTitle}
                </h1>
                <p className="mt-0.5 truncate text-xs text-slate-400 sm:text-sm">
                  {messages.length > 0
                    ? `${messages.length} message${messages.length !== 1 ? "s" : ""}`
                    : "Learning Brain"}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={startNewChat}
                className="nav-action inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium text-white shadow-[0_12px_38px_rgba(37,99,235,0.28)] transition active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">New chat</span>
              </button>
            </div>
          </header>

          <section className="chat-shell relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-3xl border border-white/10 shadow-[0_24px_90px_rgba(0,0,0,0.28)]">
            <div
              ref={messagesContainerRef}
              onScroll={updateBottomState}
              className="messages-container chat-scroll flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-6"
              aria-live="polite"
            >
              {messages.length === 0 ? (
                <EmptyState onSelectPrompt={applyPrompt} />
              ) : (
                <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
                  {messages.map((message) => (
                    <ChatMessage
                      key={message.id}
                      message={message}
                      formatTime={formatTime}
                    />
                  ))}
                </div>
              )}

              {isLoading && (
                <div className="mx-auto mt-5 w-full max-w-4xl">
                  <TypingIndicator />
                </div>
              )}

              {error && (
                <div className="mx-auto mt-5 w-full max-w-4xl">
                  <ErrorMessage message={error} />
                </div>
              )}

              <div ref={messagesEndRef} className="h-1" />
            </div>

            {!isAtBottom && messages.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  scrollToBottom(prefersReducedMotion() ? "auto" : "smooth")
                }
                className="absolute bottom-28 left-1/2 z-10 flex h-9 -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-[#121a2b]/95 px-3 text-sm font-medium text-blue-100 shadow-[0_16px_48px_rgba(0,0,0,0.32)] transition hover:border-blue-400/40 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300 sm:bottom-32"
              >
                <ArrowDown className="h-4 w-4" aria-hidden="true" />
                Bottom
              </button>
            )}

            <div className="composer-zone shrink-0 border-t border-white/10 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 sm:px-6 sm:pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:pt-4">
              <form
                onSubmit={handleSubmit}
                className="composer-shell mx-auto flex w-full max-w-4xl items-end gap-2 rounded-2xl border border-white/10 p-1.5 shadow-[0_18px_60px_rgba(0,0,0,0.24)] sm:gap-2"
              >
                <div className="relative min-w-0 flex-1">
                  <label htmlFor="chat-input" className="sr-only">
                    Message
                  </label>
                  <textarea
                    id="chat-input"
                    ref={inputRef}
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    placeholder="Share a thought, question, or code snippet..."
                    rows={1}
                    disabled={isLoading}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void submitMessage();
                      }
                    }}
                    className="max-h-[164px] min-h-[46px] w-full resize-none overflow-y-auto rounded-xl border border-transparent bg-transparent px-3 py-2.5 pr-4 text-[16px] leading-6 text-white outline-none transition placeholder:text-slate-500 disabled:cursor-wait disabled:text-slate-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!canSend}
                  aria-label={isLoading ? "Sending message" : "Send message"}
                  className="send-button flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300"
                >
                  {isLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Send className="h-5 w-5" aria-hidden="true" />
                  )}
                </button>
              </form>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function SessionNavigation({
  sessions,
  currentSessionId,
  isLoadingSessions,
  isLoadingSession,
  onNewChat,
  onLoadSession,
  onDeleteSession,
  formatSessionTime,
}: {
  sessions: ChatSession[];
  currentSessionId: string | null;
  isLoadingSessions: boolean;
  isLoadingSession: boolean;
  onNewChat: () => void;
  onLoadSession: (sessionId: string) => Promise<void>;
  onDeleteSession: (sessionId: string) => Promise<void>;
  formatSessionTime: (value: string) => string;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-white/10 p-4">
        <div className="flex items-center gap-3">
          <div className="brand-mark flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 shadow-[0_14px_44px_rgba(37,99,235,0.18)]">
            <Brain className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-white">
              Learning Brain
            </p>
            <p className="mt-0.5 truncate text-xs text-slate-400">
              Personal memory assistant
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onNewChat}
          className="nav-action mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold text-white shadow-[0_14px_42px_rgba(37,99,235,0.24)] transition active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          New chat
        </button>
      </div>

      <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-4">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
          <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
          Recent
        </h2>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-xs text-slate-400">
          {sessions.length}
        </span>
      </div>

      <div className="messages-container flex-1 space-y-1 overflow-y-auto px-2 pb-3">
        {isLoadingSessions ? (
          <SessionLoading />
        ) : sessions.length === 0 ? (
          <div className="mx-2 rounded-2xl border border-dashed border-white/[0.12] bg-white/[0.03] px-3 py-4 text-sm leading-6 text-slate-400">
            No saved sessions yet. Start a chat and it will appear here.
          </div>
        ) : (
          sessions.map((session) => {
            const isActive = session.id === currentSessionId;

            return (
              <div
                key={session.id}
                className={`group flex min-w-0 items-stretch rounded-2xl border transition ${
                  isActive
                    ? "border-blue-400/[0.35] bg-blue-500/[0.12]"
                    : "border-transparent hover:border-white/10 hover:bg-white/[0.04]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => void onLoadSession(session.id)}
                  disabled={isLoadingSession}
                  className="min-w-0 flex-1 px-3 py-3 text-left disabled:cursor-wait disabled:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-300"
                >
                  <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-slate-100">
                    <MessageSquare
                      className={`h-4 w-4 shrink-0 ${
                        isActive ? "text-blue-300" : "text-slate-500"
                      }`}
                      aria-hidden="true"
                    />
                    <span className="truncate">{session.title}</span>
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">
                    {formatSessionTime(session.updated_at)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void onDeleteSession(session.id)}
                  title="Delete session"
                  className="flex w-10 shrink-0 items-center justify-center text-slate-600 opacity-100 transition hover:text-red-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-red-300 sm:opacity-0 sm:group-hover:opacity-100"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-white/10 p-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
            <Sparkles className="h-4 w-4 text-blue-300" aria-hidden="true" />
            Memory ready
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Ask, save, or review code from one focused workspace.
          </p>
        </div>
      </div>
    </div>
  );
}

function EmptyState({
  onSelectPrompt,
}: {
  onSelectPrompt: (prompt: string) => void;
}) {
  const prompts = [
    {
      label: "Remember a learning pattern",
      eyebrow: "Memory",
      prompt: "Remember: spaced repetition helps me retain new concepts.",
      icon: Brain,
    },
    {
      label: "Ask about energy conversion",
      eyebrow: "Question",
      prompt: "What do you know about energy conversion?",
      icon: MessageSquare,
    },
    {
      label: "Review a short code snippet",
      eyebrow: "Code",
      prompt: "Review this code: function add(a, b) { return a + b; }",
      icon: Sparkles,
    },
  ];

  return (
    <div className="mx-auto grid min-h-full w-full max-w-5xl items-center gap-7 px-1 py-3 sm:px-3 sm:py-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-10">
      <div className="message-enter order-2 max-w-2xl lg:order-1">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-200">
          <Sparkles className="h-3.5 w-3.5 text-blue-300" aria-hidden="true" />
          Your learning space is ready
        </div>
        <h2 className="text-3xl font-semibold leading-tight tracking-normal text-white sm:text-5xl">
          Learn, remember, and ask with less friction.
        </h2>
        <p className="mt-4 max-w-xl text-sm leading-6 text-slate-400 sm:text-base">
          Capture notes, ask from memory, or drop in code for a focused review.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {prompts.map((item) => (
            <PromptCard key={item.label} item={item} onSelect={onSelectPrompt} />
          ))}
        </div>
      </div>

      <div className="message-enter order-1 mx-auto w-full max-w-[18rem] lg:order-2 lg:max-w-none">
        <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#090d18] shadow-[0_28px_90px_rgba(37,99,235,0.18)]">
          <Image
            src="/generated/ai-companion.png"
            alt=""
            width={680}
            height={680}
            priority
            className="aspect-square h-auto w-full"
          />
        </div>
      </div>
    </div>
  );
}

function PromptCard({
  item,
  onSelect,
}: {
  item: {
    label: string;
    eyebrow: string;
    prompt: string;
    icon: typeof Brain;
  };
  onSelect: (prompt: string) => void;
}) {
  const Icon = item.icon;

  return (
    <button
      type="button"
      onClick={() => onSelect(item.prompt)}
      className="prompt-card message-enter group min-w-0 rounded-2xl border border-white/10 p-3.5 text-left transition hover:border-blue-400/[0.35] hover:bg-white/[0.06] active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300"
    >
      <span className="mb-4 flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/[0.12] text-blue-200 transition group-hover:bg-blue-500/[0.18]">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="block text-xs font-medium text-blue-300">
        {item.eyebrow}
      </span>
      <span className="mt-1.5 block text-sm font-semibold leading-5 text-slate-100">
        {item.label}
      </span>
    </button>
  );
}

function SessionLoading() {
  return (
    <div className="space-y-2 px-2 py-1" aria-label="Loading sessions">
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="h-[64px] animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]"
        />
      ))}
    </div>
  );
}

function ChatMessage({
  message,
  formatTime,
}: {
  message: Message;
  formatTime: (date: Date) => string;
}) {
  const isUser = message.role === "user";

  return (
    <article
      className={`message-enter flex min-w-0 gap-3 ${
        isUser ? "flex-row-reverse" : "flex-row"
      }`}
    >
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl sm:h-10 sm:w-10 ${
          isUser
            ? "bg-blue-600 text-white shadow-[0_14px_40px_rgba(37,99,235,0.28)]"
            : "assistant-avatar border border-blue-300/20 text-blue-100"
        }`}
        aria-hidden="true"
      >
        {isUser ? (
          <User className="h-4 w-4 sm:h-5 sm:w-5" />
        ) : (
          <Bot className="h-4 w-4 sm:h-5 sm:w-5" />
        )}
      </div>

      <div
        className={`min-w-0 max-w-[min(43rem,calc(100%-3.25rem))] rounded-3xl px-4 py-3 sm:px-5 ${
          isUser
            ? "rounded-tr-md bg-blue-600 text-white shadow-[0_18px_52px_rgba(37,99,235,0.18)]"
            : "rounded-tl-md border border-white/10 bg-white/[0.05] text-slate-100"
        }`}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={createMarkdownComponents(isUser)}
        >
          {message.content}
        </ReactMarkdown>

        <div
          className={`mt-3 flex items-center gap-2 text-xs font-medium ${
            isUser ? "text-white/70" : "text-slate-500"
          }`}
        >
          <span>{formatTime(message.timestamp)}</span>
          {!isUser && (
            <span className="flex items-center gap-1">
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              AI
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

function createMarkdownComponents(isUser: boolean): Components {
  return {
    pre: ({ children }) => <>{children}</>,
    code: ({ className, children }) => {
      const match = /language-(\w+)/.exec(className || "");
      const codeString = String(children).replace(/\n$/, "");
      const language = match?.[1] ?? "text";
      const isBlock = Boolean(match) || codeString.includes("\n");

      if (isBlock) {
        return <CodeBlock code={codeString} language={language} />;
      }

      return (
        <code
          className={`rounded-md px-1.5 py-0.5 font-mono text-[0.9em] ${
            isUser
              ? "bg-white/[0.15] text-white"
              : "bg-white/[0.08] text-blue-100"
          }`}
        >
          {children}
        </code>
      );
    },
    p: ({ children }) => (
      <p className="chat-markdown mb-2 text-[15px] leading-7 last:mb-0">
        {children}
      </p>
    ),
    ul: ({ children }) => (
      <ul className="chat-markdown mb-2 ml-5 list-disc space-y-1 text-[15px] leading-7">
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="chat-markdown mb-2 ml-5 list-decimal space-y-1 text-[15px] leading-7">
        {children}
      </ol>
    ),
    li: ({ children }) => <li className="pl-1">{children}</li>,
    blockquote: ({ children }) => (
      <blockquote
        className={`chat-markdown my-3 border-l-2 pl-3 text-[15px] leading-7 ${
          isUser
            ? "border-white/[0.35] text-white/[0.85]"
            : "border-blue-300/[0.35] text-slate-300"
        }`}
      >
        {children}
      </blockquote>
    ),
    a: ({ href, children }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`underline decoration-2 underline-offset-2 transition ${
          isUser
            ? "text-white decoration-white/[0.35] hover:decoration-white"
            : "text-blue-300 decoration-blue-300/25 hover:decoration-blue-300"
        }`}
      >
        {children}
      </a>
    ),
    table: ({ children }) => (
      <div className="my-3 max-w-full overflow-hidden rounded-2xl border border-white/10">
        <table className="w-full table-auto border-collapse bg-[#111827] text-left text-sm text-slate-300">
          {children}
        </table>
      </div>
    ),
    th: ({ children }) => (
      <th className="break-words border-b border-white/10 bg-white/[0.04] px-3 py-2 font-semibold text-slate-100">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="break-words border-b border-white/10 px-3 py-2 align-top">
        {children}
      </td>
    ),
  };
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  return (
    <div className="code-block my-4 max-w-full overflow-hidden rounded-lg border border-[#21352f] bg-[#08110f]">
      <div className="flex min-w-0 items-center justify-between gap-2 border-b border-white/10 bg-[#101b18] px-3 py-2">
        <span className="min-w-0 truncate font-mono text-xs text-stone-300">
          {language}
        </span>
        <CopyButton code={code} />
      </div>
      <SyntaxHighlighter
        style={syntaxHighlighterStyle}
        language={language}
        PreTag="div"
        customStyle={{
          margin: 0,
          background: "#08110f",
          padding: "1rem",
          maxWidth: "100%",
        }}
        wrapLines
        wrapLongLines
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="message-enter flex min-w-0 gap-3">
      <div className="assistant-avatar flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-blue-300/20 text-blue-100 sm:h-10 sm:w-10">
        <Bot className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
      </div>
      <div className="rounded-3xl rounded-tl-md border border-white/10 bg-white/[0.05] px-4 py-3">
        <div className="flex items-center gap-3 text-sm text-slate-400">
          <span className="flex gap-1.5" aria-hidden="true">
            <span className="typing-dot" />
            <span className="typing-dot [animation-delay:120ms]" />
            <span className="typing-dot [animation-delay:240ms]" />
          </span>
          Thinking
        </div>
      </div>
    </div>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="message-enter flex min-w-0 gap-3" role="alert">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-red-500/[0.12] text-red-200 sm:h-10 sm:w-10">
        <AlertCircle className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="min-w-0 max-w-[min(42rem,calc(100%-3.25rem))] rounded-3xl rounded-tl-md border border-red-300/20 bg-red-500/10 px-4 py-3 text-red-100 sm:px-5">
        <p className="text-sm font-semibold">Something went wrong</p>
        <p className="mt-1 text-sm leading-6 text-red-200/80 [overflow-wrap:anywhere]">
          {message}
        </p>
      </div>
    </div>
  );
}

function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy code", err);
    }
  };

  return (
    <button
      type="button"
      onClick={copyToClipboard}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-stone-300 transition hover:bg-white/10 hover:text-white active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
      title="Copy code"
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
          <span className="hidden sm:inline">Copied</span>
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Copy</span>
        </>
      )}
    </button>
  );
}
