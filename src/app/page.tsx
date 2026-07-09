"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import type { ReactNode } from "react";
import {
  AlertCircle,
  ArrowDown,
  Bot,
  Brain,
  Clock3,
  GitFork,
  Loader2,
  Menu,
  MessageSquare,
  Plus,
  Search,
  Send,
  Sparkles,
  Trash2,
  User,
  X,
} from "lucide-react";
import { GenerativeUIRouter } from "@/src/components/generative-ui";
import { SuggestedFollowUps } from "@/src/components/generative-ui/SuggestedFollowUps";
import { MarkdownRenderer } from "@/src/components/shared/MarkdownRenderer";
import type { GenerativeComponent, StandardChatData, CodeInspectorData, KnowledgeCheckData } from "@/src/components/generative-ui/types";
const DEFAULT_DEMO_USER_ID = "54ad7274-ddff-4727-9ca0-84097b044c11";
const USER_ID =
  process.env.NEXT_PUBLIC_DEMO_USER_ID ?? DEFAULT_DEMO_USER_ID;
const CURRENT_SESSION_KEY = "learning-brain-current-session";
const MAX_COMPOSER_HEIGHT = 164;
const RECENT_INITIAL_COUNT = 3;
const RECENT_BATCH_COUNT = 4;

type KnowledgeStatus = "known" | "partial" | "unknown";

interface ResponseMetadata {
  type?: string;
  saved?: boolean;
  indexed?: boolean;
  knowledgeStatus?: KnowledgeStatus;
  needsReview?: boolean;
  relationTypes?: string[];
  topic?: string;
  tags?: string[];
  spaceName?: string;
  confidenceScore?: number;
  confidenceStatus?: string;
  relatedCount?: number;
  memoryCount?: number;
  generativeUI?: GenerativeComponent;
  suggestedFollowUps?: string[];
}

interface Message {
  id: string;
  content: string;
  role: "user" | "assistant";
  timestamp: Date;
  metadata?: ResponseMetadata;
}

interface ChatSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface MemoryInsightTopic {
  label: string;
  count: number;
}

interface MemoryInsightMemory {
  id: string;
  title: string;
  topic?: string | null;
  body?: string;
  created_at?: string;
  confidence_score?: number;
  confidence_status?: string;
  needs_review?: boolean;
}

interface MemoryInsights {
  total: number;
  thisWeekCount?: number;
  topTopics: MemoryInsightTopic[];
  weakTopics: MemoryInsightTopic[];
  recentMemories: MemoryInsightMemory[];
}

interface GraphData {
  nodes: Array<{
    id: string;
    type: string;
    label: string;
    needsReview?: boolean;
    confidenceScore?: number;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    type: string;
    reason?: string | null;
  }>;
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

function getString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function getFriendlyErrorMessage(value: unknown, fallback = "Something went wrong") {
  const raw = typeof value === "string" ? value : fallback;
  let searchable = raw;

  if (raw.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as {
        error?: { code?: number; message?: string; status?: string };
      };
      const providerError = parsed.error;
      searchable = [
        providerError?.code,
        providerError?.message,
        providerError?.status,
      ]
        .filter((item) => item !== undefined && item !== null)
        .join(" ");
    } catch {
      searchable = raw;
    }
  }

  const lower = searchable.toLowerCase();
  if (
    lower.includes("currently experiencing high demand") ||
    lower.includes("unavailable") ||
    lower.includes("503")
  ) {
    return "The AI model is busy right now. Please try again in a moment.";
  }

  if (
    lower.includes("quota") ||
    lower.includes("rate limit") ||
    lower.includes("resource_exhausted") ||
    lower.includes("429")
  ) {
    return "The AI usage limit was reached for now. Please wait a bit and try again.";
  }

  return raw;
}

function getNumber(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

function getStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : undefined;
}

function getKnowledgeStatus(value: unknown): KnowledgeStatus | undefined {
  return value === "known" || value === "partial" || value === "unknown"
    ? value
    : undefined;
}

function parseGenerativeUI(data: Record<string, unknown>): GenerativeComponent | undefined {
  const component = data.component;
  const uiData = data.data;
  if (typeof component !== "string" || !uiData || typeof uiData !== "object") return undefined;

  if (component === "CODE_INSPECTOR") {
    const d = uiData as Record<string, unknown>;
    if (typeof d.summary === "string" && typeof d.updatedCode === "string") {
      return {
        component: "CODE_INSPECTOR",
        data: {
          summary: d.summary,
          originalCode: typeof d.originalCode === "string" ? d.originalCode : "",
          updatedCode: d.updatedCode,
          language: typeof d.language === "string" ? d.language : "javascript",
          improvements: Array.isArray(d.improvements) ? d.improvements.filter((i): i is string => typeof i === "string") : [],
        },
      };
    }
  }

  if (component === "KNOWLEDGE_CHECK") {
    const d = uiData as Record<string, unknown>;
    if (typeof d.topic === "string" && typeof d.confidenceScore === "number") {
      return {
        component: "KNOWLEDGE_CHECK",
        data: {
          topic: d.topic,
          confidenceScore: d.confidenceScore,
          status: typeof d.status === "string" ? d.status : "new",
          explanation: typeof d.explanation === "string" ? d.explanation : "",
          relatedMemoriesCount: typeof d.relatedMemoriesCount === "number" ? d.relatedMemoriesCount : 0,
        },
      };
    }
  }

  if (component === "STANDARD_CHAT") {
    const d = uiData as Record<string, unknown>;
    if (typeof d.text === "string") {
      return {
        component: "STANDARD_CHAT",
        data: {
          text: d.text,
          isMemorySaved: typeof d.isMemorySaved === "boolean" ? d.isMemorySaved : false,
          suggestedFollowUps: Array.isArray(d.suggestedFollowUps) ? d.suggestedFollowUps.filter((i): i is string => typeof i === "string") : [],
        },
      };
    }
  }

  return undefined;
}

function createResponseMetadata(data: Record<string, unknown>): ResponseMetadata {
  const generativeUI = parseGenerativeUI(data);
  const uiData = data.data as Record<string, unknown> | undefined;
  const suggestedFollowUps = uiData && Array.isArray((uiData as Record<string, unknown>).suggestedFollowUps)
    ? ((uiData as Record<string, unknown>).suggestedFollowUps as unknown[]).filter((i): i is string => typeof i === "string")
    : undefined;

  return {
    type: getString(data.type),
    saved: typeof data.saved === "boolean" ? data.saved : undefined,
    indexed: typeof data.indexed === "boolean" ? data.indexed : undefined,
    knowledgeStatus: getKnowledgeStatus(data.knowledgeStatus),
    needsReview:
      typeof data.needsReview === "boolean" ? data.needsReview : undefined,
    relationTypes: getStringArray(data.relationTypes),
    topic: getString(data.topic),
    tags: getStringArray(data.tags),
    spaceName: getString(data.spaceName),
    confidenceScore: getNumber(data.confidenceScore),
    confidenceStatus: getString(data.confidenceStatus),
    relatedCount: getNumber(data.relatedCount),
    memoryCount: getNumber(data.memoryCount),
    generativeUI,
    suggestedFollowUps,
  };
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
  const [memorySearch, setMemorySearch] = useState("");
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [memoryInsights, setMemoryInsights] = useState<MemoryInsights | null>(null);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [setupMessage, setSetupMessage] = useState<string | null>(null);
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
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_COMPOSER_HEIGHT)}px`;
  }, [input]);

  const loadSessions = useCallback(async () => {
    setIsLoadingSessions(true);
    try {
      const response = await fetch(
        `/api/chat-sessions?userId=${encodeURIComponent(USER_ID)}`
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load sessions");
      setSessions(data.sessions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sessions");
    } finally {
      setIsLoadingSessions(false);
    }
  }, []);

  const loadMemoryIntelligence = useCallback(async () => {
    const query = new URLSearchParams({ userId: USER_ID, limit: "80" });
    if (memorySearch.trim()) query.set("q", memorySearch.trim());

    try {
      const [memoriesResponse, graphResponse] = await Promise.all([
        fetch(`/api/memories?${query.toString()}`),
        fetch(`/api/graph?${query.toString()}`),
      ]);
      const [memoriesData, graphResponseData] = await Promise.all([
        memoriesResponse.json(),
        graphResponse.json(),
      ]);

      if (!memoriesResponse.ok)
        throw new Error(memoriesData.error || "Failed to load memory insights");
      if (!graphResponse.ok)
        throw new Error(graphResponseData.error || "Failed to load graph");

      setMemoryInsights(memoriesData.insights ?? null);
      setGraphData(graphResponseData ?? null);
      const nextSetupMessage =
        (typeof memoriesData.setupMessage === "string" && memoriesData.setupMessage) ||
        (typeof graphResponseData.setupMessage === "string" && graphResponseData.setupMessage) ||
        null;
      if (nextSetupMessage) setSetupMessage(nextSetupMessage);
    } catch (err) {
      console.warn("Failed to load memory intelligence:", err);
    }
  }, [memorySearch]);

  const loadSession = useCallback(async (sessionId: string) => {
    setIsLoadingSession(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/chat-sessions/${sessionId}?userId=${encodeURIComponent(USER_ID)}`
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load this session");

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
    void loadMemoryIntelligence();
  }, [loadMemoryIntelligence]);

  useEffect(() => {
    if (hasLoadedStoredSession.current) return;
    hasLoadedStoredSession.current = true;

    const storedSessionId = window.sessionStorage.getItem(CURRENT_SESSION_KEY);
    if (storedSessionId) void loadSession(storedSessionId);
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

      const data = (await response.json()) as Record<string, unknown>;

      if (!response.ok) {
        throw new Error(
          getFriendlyErrorMessage(data.error, `Error: ${response.status}`)
        );
      }

      let responseText = "";
      if (data.error) responseText = `Error: ${String(data.error)}`;
      else if (typeof data.response === "string") responseText = data.response;
      else if (typeof data.answer === "string") responseText = data.answer;
      else if (typeof data.message === "string") responseText = data.message;
      else responseText = "I received your message. How can I help you further?";

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: responseText,
        role: "assistant",
        timestamp: new Date(),
        metadata: createResponseMetadata(data),
      };

      if (typeof data.sessionId === "string") {
        setCurrentSessionId(data.sessionId);
        window.sessionStorage.setItem(CURRENT_SESSION_KEY, data.sessionId);
      }

      if (data.sessionSaved === false && data.sessionError) {
        setError(
          `Answer returned, but the chat session was not saved: ${String(data.sessionError)}`
        );
      }

      setMessages((prev) => [...prev, assistantMessage]);
      void loadSessions();
      void loadMemoryIntelligence();
    } catch (err) {
      setError(
        err instanceof Error
          ? getFriendlyErrorMessage(err.message)
          : "Failed to send message"
      );
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
      if (!response.ok) throw new Error(data.error || "Failed to delete session");

      setSessions((prev) => prev.filter((session) => session.id !== sessionId));
      if (currentSessionId === sessionId) startNewChat();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete session");
    }
  };

  const formatTime = (date: Date) =>
    date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  const formatSessionTime = (value: string) => {
    const date = new Date(value);
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    if (isToday)
      return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const canSend = input.trim().length > 0 && !isLoading;
  const activeSessionTitle =
    sessions.find((session) => session.id === currentSessionId)?.title ?? "Fresh thread";

  return (
    <div className="app-stage h-[100dvh] overflow-hidden text-[#0f0f0f]">
      <div className="grid h-full min-w-0 grid-cols-1 overflow-hidden lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="sidebar-panel hidden min-h-0 min-w-0 flex-col border-r border-black/[0.07] lg:flex">
          <SessionNavigation
            sessions={sessions}
            currentSessionId={currentSessionId}
            memoryInsights={memoryInsights}
            graphData={graphData}
            setupMessage={setupMessage}
            isLoadingSessions={isLoadingSessions}
            isLoadingSession={isLoadingSession}
            onNewChat={startNewChat}
            onLoadSession={loadSession}
            onDeleteSession={deleteSession}
            onApplyPrompt={applyPrompt}
            memorySearch={memorySearch}
            onMemorySearchChange={setMemorySearch}
            formatSessionTime={formatSessionTime}
          />
        </aside>

        {isSidebarOpen && (
          <div className="fixed inset-0 z-40 lg:hidden" role="presentation">
            <button
              type="button"
              aria-label="Close navigation"
              className="absolute inset-0 bg-black/[0.24]"
              onClick={() => setIsSidebarOpen(false)}
            />
            <aside className="sidebar-panel relative z-10 flex h-full w-[min(22rem,86vw)] flex-col border-r border-black/[0.07] shadow-[4px_0_40px_rgba(0,0,0,0.12)]">
              <div className="flex h-14 shrink-0 items-center justify-between border-b border-black/[0.07] px-4">
                <span className="text-sm font-semibold text-[#0f0f0f]">Menu</span>
                <button
                  type="button"
                  onClick={() => setIsSidebarOpen(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-black/[0.08] bg-white text-[#6b6b6b] transition hover:bg-[#f0eeea] hover:text-[#0f0f0f]"
                  aria-label="Close menu"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <SessionNavigation
                sessions={sessions}
                currentSessionId={currentSessionId}
                memoryInsights={memoryInsights}
                graphData={graphData}
                setupMessage={setupMessage}
                isLoadingSessions={isLoadingSessions}
                isLoadingSession={isLoadingSession}
                onNewChat={startNewChat}
                onLoadSession={loadSession}
                onDeleteSession={deleteSession}
                onApplyPrompt={applyPrompt}
                memorySearch={memorySearch}
                onMemorySearchChange={setMemorySearch}
                formatSessionTime={formatSessionTime}
              />
            </aside>
          </div>
        )}

        <main className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-[#f8f7f4] px-3 pb-3 pt-3 sm:px-5 sm:pb-5 lg:px-6 lg:py-5">
          <header className="nav-shell mb-3 flex h-13 shrink-0 items-center justify-between gap-3 rounded-2xl border border-black/[0.07] px-3 shadow-sm sm:h-14 sm:px-4 lg:mb-4">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setIsSidebarOpen(true)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/[0.08] bg-white text-[#6b6b6b] transition hover:bg-[#f0eeea] hover:text-[#0f0f0f] lg:hidden"
                aria-label="Open menu"
              >
                <Menu className="h-4 w-4" aria-hidden="true" />
              </button>
              <div className="brand-mark hidden h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-xl sm:flex lg:hidden">
                <Image src="/icons/icon-192.png" alt="" width={32} height={32} className="h-full w-full object-cover" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-sm font-semibold text-[#0f0f0f]">
                  {activeSessionTitle}
                </h1>
                <p className="mt-0 truncate text-xs text-[#6b6b6b]">
                  {messages.length > 0
                    ? `${messages.length} message${messages.length !== 1 ? "s" : ""}`
                    : "BrainBank"}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={startNewChat}
              className="nav-action inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium text-white transition active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">New chat</span>
            </button>
          </header>

          <section className="chat-shell relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-black/[0.07] shadow-sm">
            <div
              ref={messagesContainerRef}
              onScroll={updateBottomState}
              className="messages-container chat-scroll flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-6"
              aria-live="polite"
            >
              {messages.length === 0 ? (
                <EmptyState onSelectPrompt={applyPrompt} />
              ) : (
                <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 sm:gap-5">
                  {messages.map((message) => (
                    <ChatMessage key={message.id} message={message} formatTime={formatTime} onFollowUp={applyPrompt} />
                  ))}
                </div>
              )}

              {isLoading && (
                <div className="mx-auto mt-4 w-full max-w-3xl sm:mt-5">
                  <TypingIndicator />
                </div>
              )}

              {error && (
                <div className="mx-auto mt-4 w-full max-w-3xl sm:mt-5">
                  <ErrorMessage message={error} />
                </div>
              )}

              <div ref={messagesEndRef} className="h-1" />
            </div>

            {!isAtBottom && messages.length > 0 && (
              <button
                type="button"
                onClick={() => scrollToBottom(prefersReducedMotion() ? "auto" : "smooth")}
                className="absolute bottom-28 left-1/2 z-10 flex h-9 -translate-x-1/2 items-center gap-2 rounded-full border border-black/[0.09] bg-white px-3 text-sm font-medium text-[#0f0f0f] shadow-sm transition hover:bg-[#f0eeea] active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black sm:bottom-32"
              >
                <ArrowDown className="h-4 w-4" aria-hidden="true" />
                Bottom
              </button>
            )}

            <div className="composer-zone shrink-0 border-t border-black/[0.07] px-2 pb-[calc(env(safe-area-inset-bottom)+0.55rem)] pt-2 sm:px-5 sm:pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:pt-4">
              <form
                onSubmit={handleSubmit}
                className="composer-shell mx-auto flex w-full max-w-3xl items-end gap-1.5 rounded-2xl border border-black/[0.09] p-1.5 shadow-sm sm:gap-2"
              >
                <div className="relative min-w-0 flex-1">
                  <label htmlFor="chat-input" className="sr-only">Message</label>
                  <textarea
                    id="chat-input"
                    ref={inputRef}
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    placeholder="Ask or save a note..."
                    rows={1}
                    disabled={isLoading}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void submitMessage();
                      }
                    }}
                    className="max-h-[164px] min-h-[40px] w-full resize-none overflow-y-auto rounded-xl border border-transparent bg-transparent px-3 py-2 text-sm leading-6 text-[#0f0f0f] outline-none transition placeholder:text-[#b0b0b0] disabled:cursor-wait disabled:opacity-50 sm:min-h-[44px] sm:py-2.5 sm:text-base"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!canSend}
                  aria-label={isLoading ? "Sending message" : "Send message"}
                  className="send-button flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-xl text-white transition active:scale-[0.97] disabled:cursor-not-allowed disabled:bg-black/[0.08] disabled:text-[#b0b0b0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black sm:h-[44px] sm:w-[44px]"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Send className="h-4 w-4" aria-hidden="true" />
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
  memoryInsights,
  graphData,
  setupMessage,
  isLoadingSessions,
  isLoadingSession,
  onNewChat,
  onLoadSession,
  onDeleteSession,
  onApplyPrompt,
  memorySearch,
  onMemorySearchChange,
  formatSessionTime,
}: {
  sessions: ChatSession[];
  currentSessionId: string | null;
  memoryInsights: MemoryInsights | null;
  graphData: GraphData | null;
  setupMessage: string | null;
  isLoadingSessions: boolean;
  isLoadingSession: boolean;
  onNewChat: () => void;
  onLoadSession: (sessionId: string) => Promise<void>;
  onDeleteSession: (sessionId: string) => Promise<void>;
  onApplyPrompt: (prompt: string) => void;
  memorySearch: string;
  onMemorySearchChange: (value: string) => void;
  formatSessionTime: (value: string) => string;
}) {
  const sessionListKey = sessions.map((session) => session.id).join("|");
  const [recentDisplay, setRecentDisplay] = useState({
    count: RECENT_INITIAL_COUNT,
    key: sessionListKey,
  });
  const visibleSessionCount =
    recentDisplay.key === sessionListKey ? recentDisplay.count : RECENT_INITIAL_COUNT;
  const visibleSessions = sessions.slice(0, visibleSessionCount);
  const hiddenSessionCount = Math.max(sessions.length - visibleSessions.length, 0);
  const canShowFewerSessions = visibleSessionCount > RECENT_INITIAL_COUNT;
  const nextSessionBatchCount = Math.min(RECENT_BATCH_COUNT, hiddenSessionCount);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-black/[0.07] p-4">
        <div className="flex items-center gap-3">
          <div className="brand-mark flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl">
            <Image src="/icons/icon-192.png" alt="" width={36} height={36} className="h-full w-full object-cover" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[#0f0f0f]">BrainBank</p>
            <p className="mt-0 truncate text-xs text-[#6b6b6b]">Personal memory assistant</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onNewChat}
          className="nav-action mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-full px-4 text-sm font-medium text-white transition active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          New chat
        </button>
      </div>

      <div className="messages-container min-h-0 flex-1 overflow-y-auto pb-3">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-black/[0.05] bg-white/95 px-4 pb-2 pt-3 backdrop-blur">
          <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#9b9b9b]">
            <Clock3 className="h-3 w-3" aria-hidden="true" />
            Recent
          </h2>
          <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[11px] text-[#6b6b6b]">
            {sessions.length > RECENT_INITIAL_COUNT
              ? `${visibleSessions.length}/${sessions.length}`
              : sessions.length}
          </span>
        </div>

        <div className="space-y-0.5 px-2 py-2">
          {isLoadingSessions ? (
            <SessionLoading />
          ) : sessions.length === 0 ? (
            <div className="mx-2 rounded-xl border border-dashed border-black/[0.1] px-3 py-4 text-sm leading-6 text-[#9b9b9b]">
              No saved sessions yet. Start a chat and it will appear here.
            </div>
          ) : (
            <>
              {visibleSessions.map((session) => {
                const isActive = session.id === currentSessionId;
                return (
                  <div
                    key={session.id}
                    className={`group flex min-w-0 items-stretch rounded-xl transition ${
                      isActive
                        ? "bg-black/[0.06]"
                        : "hover:bg-black/[0.03]"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => void onLoadSession(session.id)}
                      disabled={isLoadingSession}
                      className="min-w-0 flex-1 px-3 py-2.5 text-left disabled:cursor-wait disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-black"
                    >
                      <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-[#0f0f0f]">
                        <MessageSquare
                          className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-[#0f0f0f]" : "text-[#c0c0c0]"}`}
                          aria-hidden="true"
                        />
                        <span className="truncate">{session.title}</span>
                      </span>
                      <span className="mt-0.5 block text-xs text-[#9b9b9b]">
                        {formatSessionTime(session.updated_at)}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDeleteSession(session.id)}
                      title="Delete session"
                      className="flex w-9 shrink-0 items-center justify-center text-[#c0c0c0] opacity-100 transition hover:text-red-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-red-400 sm:opacity-0 sm:group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                );
              })}

              {(hiddenSessionCount > 0 || canShowFewerSessions) && (
                <div className="mt-1.5 space-y-1">
                  {hiddenSessionCount > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setRecentDisplay({
                          count: Math.min(visibleSessionCount + RECENT_BATCH_COUNT, sessions.length),
                          key: sessionListKey,
                        })
                      }
                      className="flex min-h-9 w-full items-center justify-center gap-2 rounded-xl border border-black/[0.08] px-3 py-1.5 text-xs font-medium text-[#6b6b6b] transition hover:bg-black/[0.04] hover:text-[#0f0f0f] active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
                    >
                      <ArrowDown className="h-3 w-3" aria-hidden="true" />
                      <span>Show {nextSessionBatchCount} more</span>
                      <span className="text-[#c0c0c0]">{hiddenSessionCount} left</span>
                    </button>
                  )}
                  {canShowFewerSessions && (
                    <button
                      type="button"
                      onClick={() =>
                        setRecentDisplay({ count: RECENT_INITIAL_COUNT, key: sessionListKey })
                      }
                      className="flex min-h-9 w-full items-center justify-center gap-2 rounded-xl px-3 py-1.5 text-xs font-medium text-[#9b9b9b] transition hover:bg-black/[0.03] hover:text-[#0f0f0f] active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
                    >
                      <ArrowDown className="h-3 w-3 rotate-180" aria-hidden="true" />
                      Show less
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <MemoryIntelligencePanel
          insights={memoryInsights}
          graphData={graphData}
          setupMessage={setupMessage}
          onApplyPrompt={onApplyPrompt}
          memorySearch={memorySearch}
          onMemorySearchChange={onMemorySearchChange}
        />
      </div>
    </div>
  );
}

function MemoryIntelligencePanel({
  insights,
  graphData,
  setupMessage,
  onApplyPrompt,
  memorySearch,
  onMemorySearchChange,
}: {
  insights: MemoryInsights | null;
  graphData: GraphData | null;
  setupMessage: string | null;
  onApplyPrompt: (prompt: string) => void;
  memorySearch: string;
  onMemorySearchChange: (value: string) => void;
}) {
  return (
    <div className="border-t border-black/[0.06] px-3 py-3">
      <div className="space-y-3">
        {setupMessage && <SetupNotice message={setupMessage} />}
        <LearningSnapshot insights={insights} onWeeklySummary={() => onApplyPrompt("weekly summary")} />
        <MemorySearchBox value={memorySearch} onChange={onMemorySearchChange} />
        <RecentMemoriesList memories={insights?.recentMemories ?? []} searchQuery={memorySearch} />
        <SuggestedNextAction insights={insights} onApplyPrompt={onApplyPrompt} />
        <ConnectionsSummary graphData={graphData} />
      </div>
    </div>
  );
}

function LearningSnapshot({
  insights,
  onWeeklySummary,
}: {
  insights: MemoryInsights | null;
  onWeeklySummary: () => void;
}) {
  return (
    <section className="rounded-xl border border-black/[0.07] bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9b9b9b]">
            Memory overview
          </p>
          <div className="mt-0.5 text-sm font-semibold text-[#0f0f0f]">
            Auto-organized topics
          </div>
          <p className="mt-0.5 text-xs leading-5 text-[#9b9b9b]">
            Notes are categorized automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={onWeeklySummary}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-black/[0.09] bg-[#f0eeea] text-[#6b6b6b] transition hover:bg-black/[0.08] hover:text-[#0f0f0f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
          title="Generate weekly summary"
          aria-label="Generate weekly summary"
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1.5">
        <MiniMetric label="Saved" value={insights?.total ?? 0} icon={Brain} />
        <MiniMetric label="This week" value={insights?.thisWeekCount ?? 0} icon={Sparkles} />
        <MiniMetric label="Topics" value={insights?.topTopics.length ?? 0} icon={MessageSquare} />
      </div>
    </section>
  );
}

function MiniMetric({
  label,
  value,
  icon: Icon,
  warn = false,
}: {
  label: string;
  value: number;
  icon: typeof Brain;
  warn?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-black/[0.06] bg-[#f8f7f4] px-2 py-2 text-center">
      <Icon
        className={`mx-auto h-3 w-3 ${warn ? "text-amber-500" : "text-[#0f0f0f]"}`}
        aria-hidden="true"
      />
      <div className="mt-1 text-sm font-semibold leading-none text-[#0f0f0f]">{value}</div>
      <div className="mt-0.5 truncate text-[10px] text-[#9b9b9b]">{label}</div>
    </div>
  );
}

function SetupNotice({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-amber-700">
        <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
        Database setup needed
      </div>
      <p className="mt-1 text-xs leading-5 text-amber-600">{message}</p>
    </div>
  );
}

function SidebarSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9b9b9b]">
        {title}
      </h3>
      {children}
    </section>
  );
}

function MemorySearchBox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="relative">
      <label htmlFor="memory-search" className="sr-only">Search saved memories</label>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#b0b0b0]"
        aria-hidden="true"
      />
      <input
        id="memory-search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search memories..."
        className="h-9 w-full rounded-xl border border-black/[0.08] bg-white pl-9 pr-3 text-sm text-[#0f0f0f] outline-none transition placeholder:text-[#c0c0c0] focus:border-black/[0.24] focus:ring-0"
      />
    </div>
  );
}

function RecentMemoriesList({
  memories,
  searchQuery,
}: {
  memories: MemoryInsightMemory[];
  searchQuery: string;
}) {
  const isSearching = searchQuery.trim().length > 0;

  return (
    <SidebarSection title={isSearching ? "Memory matches" : "Recent memories"}>
      {memories.length > 0 ? (
        <div className="space-y-1.5">
          {memories.slice(0, 3).map((memory) => (
            <div
              key={memory.id}
              className="rounded-xl border border-black/[0.07] bg-white px-3 py-2"
            >
              <p className="line-clamp-2 min-w-0 text-xs font-medium leading-5 text-[#0f0f0f]">
                {memory.title}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-[#9b9b9b]">
                {formatMemoryMeta(memory)}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <EmptySidebarNote
          text={
            isSearching
              ? "No saved memories match that search."
              : "No memories saved in this space yet."
          }
        />
      )}
    </SidebarSection>
  );
}

function formatMemoryMeta(memory: MemoryInsightMemory) {
  const topic = memory.topic || "Untitled topic";
  const status = memory.confidence_status?.replace(/_/g, " ") || "new";
  return `${topic} · ${status}`;
}

function ConnectionsSummary({ graphData }: { graphData: GraphData | null }) {
  const issueEdges = (graphData?.edges ?? []).filter((edge) =>
    ["contradicts", "duplicate_of", "near_duplicate"].includes(edge.type)
  );
  const linkCount = graphData?.edges.length ?? 0;

  if (linkCount === 0) return null;

  return (
    <div className="rounded-xl border border-black/[0.07] bg-white px-3 py-2.5">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-[#6b6b6b]">
          <GitFork className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">Memory links</span>
        </span>
        <span className="shrink-0 text-[11px] text-[#9b9b9b]">{linkCount}</span>
      </div>
      <p className={`mt-1 text-xs leading-5 ${issueEdges.length > 0 ? "text-amber-600" : "text-[#9b9b9b]"}`}>
        {issueEdges.length > 0
          ? `${issueEdges.length} link${issueEdges.length === 1 ? "" : "s"} need cleanup.`
          : "Connections tracked quietly in the background."}
      </p>
    </div>
  );
}

function EmptySidebarNote({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-dashed border-black/[0.08] px-3 py-3 text-[11px] leading-5 text-[#9b9b9b]">
      {text}
    </p>
  );
}

function SuggestedNextAction({
  insights,
  onApplyPrompt,
}: {
  insights: MemoryInsights | null;
  onApplyPrompt: (prompt: string) => void;
}) {
  const recentTopic = insights?.recentMemories.find((memory) => memory.topic)?.topic;
  const action =
    (insights?.thisWeekCount ?? 0) > 0
      ? {
          title: "Summarize the week",
          detail: "Turn this week's saved memories into a recap.",
          prompt: "weekly summary",
          icon: Sparkles,
        }
      : insights?.total
        ? {
            title: "Check a gap",
            detail: "See whether your saved notes cover a topic.",
            prompt: `Do I know about ${recentTopic || "RAG"}?`,
            icon: MessageSquare,
          }
        : {
            title: "Save one useful note",
            detail: "Start with a small thing you learned today.",
            prompt: "Remember: ",
            icon: Brain,
          };
  const Icon = action.icon;

  return (
    <button
      type="button"
      onClick={() => onApplyPrompt(action.prompt)}
      className="group w-full rounded-xl border border-black/[0.07] bg-white p-3 text-left transition hover:bg-[#f8f7f4] active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
    >
      <div className="flex items-start gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black/[0.06] text-[#0f0f0f]">
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block text-xs font-semibold leading-5 text-[#0f0f0f]">{action.title}</span>
          <span className="mt-0.5 block text-[11px] leading-4 text-[#9b9b9b]">{action.detail}</span>
        </span>
      </div>
    </button>
  );
}

function EmptyState({ onSelectPrompt }: { onSelectPrompt: (prompt: string) => void }) {
  const prompts = [
    {
      label: "Save a learning note",
      eyebrow: "Memory",
      prompt: "Remember: spaced repetition helps me retain new concepts.",
      icon: Brain,
    },
    {
      label: "Check a knowledge gap",
      eyebrow: "Gap",
      prompt: "Do I know about RAG?",
      icon: MessageSquare,
    },
    {
      label: "Teach from my brain",
      eyebrow: "Teach",
      prompt: "Teach me from my brain: embeddings",
      icon: Sparkles,
    },
  ];

  return (
    <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col items-center justify-center gap-8 px-1 py-8 sm:px-3 sm:py-12">
      <div className="message-enter w-full text-center">
        <div className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full border border-black/[0.08] bg-white px-3 py-1.5 text-xs font-medium text-[#6b6b6b]">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          Your learning space is ready
        </div>
        <h2 className="text-3xl font-semibold leading-tight tracking-tight text-[#0f0f0f] sm:text-4xl">
          Learn, remember,<br />and ask with less friction.
        </h2>
        <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-[#6b6b6b] sm:text-base">
          Capture notes, ask from memory, and let the app organize topics for you.
        </p>

        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          {prompts.map((item) => (
            <PromptCard key={item.label} item={item} onSelect={onSelectPrompt} />
          ))}
        </div>
      </div>
    </div>
  );
}

function PromptCard({
  item,
  onSelect,
}: {
  item: { label: string; eyebrow: string; prompt: string; icon: typeof Brain };
  onSelect: (prompt: string) => void;
}) {
  const Icon = item.icon;

  return (
    <button
      type="button"
      onClick={() => onSelect(item.prompt)}
      className="prompt-card message-enter group min-w-0 rounded-2xl border border-black/[0.08] p-4 text-left transition hover:border-black/[0.16] hover:shadow-sm active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
    >
      <span className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/[0.06] text-[#0f0f0f] transition group-hover:bg-black/[0.09]">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9b9b9b]">
        {item.eyebrow}
      </span>
      <span className="mt-1 block text-sm font-semibold leading-5 text-[#0f0f0f]">
        {item.label}
      </span>
    </button>
  );
}

function SessionLoading() {
  return (
    <div className="space-y-1.5 px-1 py-1" aria-label="Loading sessions">
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="h-[56px] animate-pulse rounded-xl border border-black/[0.06] bg-black/[0.03]"
        />
      ))}
    </div>
  );
}

function ChatMessage({
  message,
  formatTime,
  onFollowUp,
}: {
  message: Message;
  formatTime: (date: Date) => string;
  onFollowUp?: (prompt: string) => void;
}) {
  const isUser = message.role === "user";
  const roleLabel = isUser ? "You" : "BrainBank";
  const metaLabel = isUser ? "Sent" : "Assistant";
  const genUI = message.metadata?.generativeUI;

  return (
    <article
      className={`message-enter flex min-w-0 items-end gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}
    >
      {!isUser && (
        <div
          className="assistant-avatar hidden h-8 w-8 shrink-0 items-center justify-center rounded-full border border-black/[0.08] text-[#0f0f0f] sm:flex"
          aria-hidden="true"
        >
          <Bot className="h-4 w-4" />
        </div>
      )}

      <div
        className={`min-w-0 ${
          isUser
            ? "max-w-[84%] rounded-[1.25rem] rounded-br-md bg-[#0f0f0f] px-3.5 py-3 text-white shadow-sm sm:max-w-[min(44rem,78%)] sm:px-4 sm:py-3.5"
            : "max-w-full px-1 py-1 text-[#0f0f0f] sm:max-w-[min(44rem,78%)] sm:rounded-[1.25rem] sm:rounded-bl-md sm:border sm:border-black/[0.07] sm:bg-white sm:px-4 sm:py-3.5 sm:shadow-sm"
        }`}
      >
        <div
          className={`mb-2 hidden min-w-0 items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] sm:flex ${
            isUser ? "text-white/60" : "text-[#9b9b9b]"
          }`}
        >
          <span className="truncate">{roleLabel}</span>
          <span className={`h-1 w-1 shrink-0 rounded-full ${isUser ? "bg-white/40" : "bg-black/20"}`} aria-hidden="true" />
          <span className="shrink-0">{metaLabel}</span>
          <span className={`h-1 w-1 shrink-0 rounded-full ${isUser ? "bg-white/40" : "bg-black/20"}`} aria-hidden="true" />
          <time className="shrink-0" dateTime={message.timestamp.toISOString()}>
            {formatTime(message.timestamp)}
          </time>
        </div>

        {!isUser && message.metadata && <MessageBadges metadata={message.metadata} />}

        {/* Generative UI rendering */}
        {!isUser && genUI ? (
          <GenerativeUIRouter genUI={genUI} fallbackContent={message.content} onFollowUp={onFollowUp} />
        ) : (
          <MarkdownRenderer content={message.content} isUser={isUser} />
        )}

        {/* Suggested follow-ups for non-STANDARD_CHAT components */}
        {!isUser && genUI && genUI.component !== "STANDARD_CHAT" && message.metadata?.suggestedFollowUps && message.metadata.suggestedFollowUps.length > 0 && onFollowUp && (
          <SuggestedFollowUps items={message.metadata.suggestedFollowUps} onSelect={onFollowUp} />
        )}
      </div>

      {isUser && (
        <div
          className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0f0f0f] text-white sm:flex"
          aria-hidden="true"
        >
          <User className="h-4 w-4" />
        </div>
      )}
    </article>
  );
}


function MessageBadges({ metadata }: { metadata: ResponseMetadata }) {
  const badges: Array<{ label: string; tone: "default" | "green" | "amber" | "red" }> = [];
  const relationTypes = metadata.relationTypes ?? [];
  const showLearningModeBadges =
    metadata.type === "teach_mode" ||
    metadata.type === "knowledge_gap" ||
    metadata.type === "weekly_summary";
  const showMemorySystemBadges = metadata.type === "note";

  if (metadata.type === "teach_mode") badges.push({ label: "Teach mode", tone: "default" });
  if (metadata.type === "coaching") badges.push({ label: "Next steps", tone: "default" });
  if (metadata.type === "weekly_summary") badges.push({ label: "Weekly summary", tone: "default" });

  if (showLearningModeBadges && metadata.knowledgeStatus) {
    const tone =
      metadata.knowledgeStatus === "known" ? "green" :
      metadata.knowledgeStatus === "partial" ? "amber" : "default";
    badges.push({
      label: metadata.knowledgeStatus.charAt(0).toUpperCase() + metadata.knowledgeStatus.slice(1),
      tone,
    });
  }

  if (showMemorySystemBadges && metadata.saved) badges.push({ label: "Saved", tone: "green" });
  if (showMemorySystemBadges && metadata.indexed === false) badges.push({ label: "Index pending", tone: "amber" });
  if (showMemorySystemBadges && relationTypes.includes("contradicts")) badges.push({ label: "Contradiction", tone: "red" });
  if (showMemorySystemBadges && (relationTypes.includes("duplicate_of") || relationTypes.includes("near_duplicate")))
    badges.push({ label: "Duplicate link", tone: "amber" });
  if (showMemorySystemBadges && metadata.spaceName) badges.push({ label: metadata.spaceName, tone: "default" });
  if (showMemorySystemBadges && metadata.topic) badges.push({ label: metadata.topic, tone: "default" });
  if (showLearningModeBadges && metadata.memoryCount !== undefined)
    badges.push({ label: `${metadata.memoryCount} memories`, tone: "default" });

  if (badges.length === 0) return null;

  return (
    <div className="mb-2.5 flex flex-wrap gap-1.5">
      {badges.slice(0, 7).map((badge) => (
        <span
          key={`${badge.label}-${badge.tone}`}
          className={`inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-[11px] font-medium leading-5 ${badgeToneClasses[badge.tone]}`}
        >
          <span className="truncate">{badge.label}</span>
        </span>
      ))}
    </div>
  );
}

const badgeToneClasses = {
  default: "border-black/[0.1] bg-black/[0.05] text-[#6b6b6b]",
  green: "border-emerald-200 bg-emerald-50 text-emerald-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  red: "border-red-200 bg-red-50 text-red-700",
};


function TypingIndicator() {
  return (
    <div className="message-enter flex min-w-0 items-end gap-2.5">
      <div className="assistant-avatar hidden h-8 w-8 shrink-0 items-center justify-center rounded-full border border-black/[0.08] text-[#0f0f0f] sm:flex">
        <Bot className="h-4 w-4" aria-hidden="true" />
      </div>
      <div className="px-1 py-1 sm:rounded-[1.25rem] sm:rounded-bl-md sm:border sm:border-black/[0.07] sm:bg-white sm:px-4 sm:py-3">
        <div className="flex items-center gap-2 text-sm text-[#9b9b9b]">
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
    <div className="message-enter flex min-w-0 items-end gap-2.5" role="alert">
      <div className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-500 sm:flex">
        <AlertCircle className="h-4 w-4" aria-hidden="true" />
      </div>
      <div className="min-w-0 max-w-full rounded-[1.25rem] border border-red-200 bg-red-50 px-3.5 py-3 text-red-700 sm:max-w-[min(42rem,78%)] sm:rounded-bl-md sm:px-4">
        <p className="text-sm font-semibold">Something went wrong</p>
        <p className="mt-1 text-sm leading-6 text-red-600 [overflow-wrap:anywhere]">{message}</p>
      </div>
    </div>
  );
}

