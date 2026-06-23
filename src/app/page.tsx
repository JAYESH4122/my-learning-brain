"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import type { Components } from "react-markdown";
import {
  AlertCircle,
  Archive,
  ArrowDown,
  Bot,
  Brain,
  Check,
  Clock3,
  Copy,
  GitFork,
  Layers,
  Loader2,
  Menu,
  MessageSquare,
  Plus,
  Send,
  ShieldAlert,
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
const CURRENT_SPACE_KEY = "learning-brain-current-space";
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

interface Space {
  id: string;
  name: string;
  description?: string | null;
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
  needsReviewCount: number;
  dueReviewCount: number;
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

interface ReviewRelation {
  id: string;
  relation_type: string;
  reason?: string | null;
  relatedMemory?: MemoryInsightMemory | null;
}

interface ReviewItem {
  memory: MemoryInsightMemory;
  relations: ReviewRelation[];
  primaryReason: string;
}

type ReviewAction =
  | "remembered"
  | "needs_practice"
  | "resolved"
  | "mastered"
  | "archive";

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

function createResponseMetadata(data: Record<string, unknown>): ResponseMetadata {
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
  };
}

function isSetupSpaceId(spaceId: string | null | undefined) {
  return Boolean(spaceId?.startsWith("setup-"));
}

function findSelectableSpace(
  spaces: Space[],
  spaceId: string | null | undefined,
  allowSetupSpace: boolean
) {
  if (!spaceId || (!allowSetupSpace && isSetupSpaceId(spaceId))) return null;
  return spaces.find((space) => space.id === spaceId) ?? null;
}

function findDefaultSpace(spaces: Space[], allowSetupSpace: boolean) {
  const usableSpaces = allowSetupSpace
    ? spaces
    : spaces.filter((space) => !isSetupSpaceId(space.id));

  return (
    usableSpaces.find((space) => space.name.toLowerCase() === "general") ??
    usableSpaces[0] ??
    null
  );
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
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [currentSpaceId, setCurrentSpaceId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [isLoadingSpaces, setIsLoadingSpaces] = useState(false);
  const [memoryInsights, setMemoryInsights] = useState<MemoryInsights | null>(
    null
  );
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
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

  const loadSpaces = useCallback(async () => {
    setIsLoadingSpaces(true);

    try {
      const response = await fetch(
        `/api/spaces?userId=${encodeURIComponent(USER_ID)}`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load spaces");
      }

      const loadedSpaces = (data.spaces ?? []) as Space[];
      const allowSetupSpace = Boolean(data.setupRequired);
      setSpaces(loadedSpaces);
      if (data.setupRequired && typeof data.setupMessage === "string") {
        setSetupMessage(data.setupMessage);
      } else {
        setSetupMessage(null);
      }
      setCurrentSpaceId((existingSpaceId) => {
        const existingSpace = findSelectableSpace(
          loadedSpaces,
          existingSpaceId,
          allowSetupSpace
        );
        const storedSpaceId = window.localStorage.getItem(CURRENT_SPACE_KEY);
        const storedSpace = findSelectableSpace(
          loadedSpaces,
          storedSpaceId,
          allowSetupSpace
        );
        const nextSpace =
          existingSpace ??
          storedSpace ??
          findDefaultSpace(loadedSpaces, allowSetupSpace);

        if (nextSpace && !isSetupSpaceId(nextSpace.id)) {
          window.localStorage.setItem(CURRENT_SPACE_KEY, nextSpace.id);
        } else {
          window.localStorage.removeItem(CURRENT_SPACE_KEY);
        }

        return nextSpace?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load spaces");
    } finally {
      setIsLoadingSpaces(false);
    }
  }, []);

  const loadMemoryIntelligence = useCallback(async () => {
    const query = new URLSearchParams({
      userId: USER_ID,
      limit: "80",
    });

    if (currentSpaceId && !isSetupSpaceId(currentSpaceId)) {
      query.set("spaceId", currentSpaceId);
    }

    try {
      const [memoriesResponse, graphResponse, reviewResponse] = await Promise.all([
        fetch(`/api/memories?${query.toString()}`),
        fetch(`/api/graph?${query.toString()}`),
        fetch(`/api/review?${query.toString()}`),
      ]);
      const [memoriesData, graphResponseData, reviewData] = await Promise.all([
        memoriesResponse.json(),
        graphResponse.json(),
        reviewResponse.json(),
      ]);

      if (!memoriesResponse.ok) {
        throw new Error(memoriesData.error || "Failed to load memory insights");
      }

      if (!graphResponse.ok) {
        throw new Error(graphResponseData.error || "Failed to load graph");
      }

      if (!reviewResponse.ok) {
        throw new Error(reviewData.error || "Failed to load review queue");
      }

      setMemoryInsights(memoriesData.insights ?? null);
      setGraphData(graphResponseData ?? null);
      setReviewItems((reviewData.reviewItems ?? []) as ReviewItem[]);
      const nextSetupMessage =
        (typeof memoriesData.setupMessage === "string" &&
          memoriesData.setupMessage) ||
        (typeof graphResponseData.setupMessage === "string" &&
          graphResponseData.setupMessage) ||
        (typeof reviewData.setupMessage === "string" && reviewData.setupMessage) ||
        null;
      if (nextSetupMessage) setSetupMessage(nextSetupMessage);
    } catch (err) {
      console.warn("Failed to load memory intelligence:", err);
    }
  }, [currentSpaceId]);

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
    void loadSpaces();
  }, [loadSpaces]);

  useEffect(() => {
    if (spaces.length === 0 && !currentSpaceId) return;
    void loadMemoryIntelligence();
  }, [currentSpaceId, loadMemoryIntelligence, spaces.length]);

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
          spaceId: isSetupSpaceId(currentSpaceId) ? null : currentSpaceId,
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
      else
        responseText = "I received your message. How can I help you further?";

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
          `Answer returned, but the chat session was not saved: ${String(
            data.sessionError
          )}`
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

  const changeSpace = (spaceId: string) => {
    setCurrentSpaceId(spaceId || null);
    if (spaceId && !isSetupSpaceId(spaceId)) {
      window.localStorage.setItem(CURRENT_SPACE_KEY, spaceId);
    } else {
      window.localStorage.removeItem(CURRENT_SPACE_KEY);
    }
  };

  const handleReviewAction = async (
    memoryId: string,
    action: ReviewAction,
    relationId?: string
  ) => {
    try {
      const response = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: USER_ID,
          memoryId,
          action,
          relationId,
          resolution:
            action === "resolved"
              ? "Resolved from the review queue."
              : undefined,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update review item");
      }

      void loadMemoryIntelligence();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update review item"
      );
    }
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
  const activeSpace = spaces.find((space) => space.id === currentSpaceId);
  const activeSpaceName = activeSpace?.name ?? "General";

  return (
    <div className="app-stage h-[100dvh] overflow-hidden text-[#f7faff]">
      <div className="grid h-full min-w-0 grid-cols-1 overflow-hidden lg:grid-cols-[19rem_minmax(0,1fr)]">
        <aside className="sidebar-panel hidden min-h-0 min-w-0 flex-col border-r border-white/10 lg:flex">
          <SessionNavigation
            sessions={sessions}
            currentSessionId={currentSessionId}
            activeSpaceName={activeSpaceName}
            memoryInsights={memoryInsights}
            graphData={graphData}
            reviewItems={reviewItems}
            setupMessage={setupMessage}
            isLoadingSessions={isLoadingSessions}
            isLoadingSession={isLoadingSession}
            isLoadingSpaces={isLoadingSpaces}
            onNewChat={startNewChat}
            onLoadSession={loadSession}
            onDeleteSession={deleteSession}
            onApplyPrompt={applyPrompt}
            onReviewAction={handleReviewAction}
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
                activeSpaceName={activeSpaceName}
                memoryInsights={memoryInsights}
                graphData={graphData}
                reviewItems={reviewItems}
                setupMessage={setupMessage}
                isLoadingSessions={isLoadingSessions}
                isLoadingSession={isLoadingSession}
                isLoadingSpaces={isLoadingSpaces}
                onNewChat={startNewChat}
                onLoadSession={loadSession}
                onDeleteSession={deleteSession}
                onApplyPrompt={applyPrompt}
                onReviewAction={handleReviewAction}
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
              <div className="brand-mark hidden h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-white/10 sm:flex lg:hidden">
                <Image
                  src="/icons/icon-192.png"
                  alt=""
                  width={40}
                  height={40}
                  className="h-full w-full object-cover"
                />
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
              <label htmlFor="space-select" className="sr-only">
                Active space
              </label>
              <div className="flex h-10 max-w-[8.5rem] min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 text-slate-300 sm:max-w-[11rem] md:max-w-[14rem]">
                <Layers className="h-4 w-4 shrink-0 text-blue-300" aria-hidden="true" />
                <select
                  id="space-select"
                  value={currentSpaceId ?? ""}
                  onChange={(event) => changeSpace(event.target.value)}
                  disabled={isLoadingSpaces || spaces.length === 0}
                  className="min-w-0 max-w-[5.5rem] bg-transparent text-sm font-medium text-slate-100 outline-none disabled:cursor-wait disabled:text-slate-500 sm:max-w-[8rem] md:max-w-[11rem]"
                >
                  {spaces.length === 0 && <option value="">General</option>}
                  {spaces.map((space) => (
                    <option key={space.id} value={space.id} className="bg-[#111827]">
                      {space.name}
                    </option>
                  ))}
                </select>
              </div>
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
              className="messages-container chat-scroll flex-1 overflow-y-auto px-2.5 py-3 sm:px-6 sm:py-6"
              aria-live="polite"
            >
              {messages.length === 0 ? (
                <EmptyState onSelectPrompt={applyPrompt} />
              ) : (
                <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 sm:gap-5">
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
                <div className="mx-auto mt-4 w-full max-w-4xl sm:mt-5">
                  <TypingIndicator />
                </div>
              )}

              {error && (
                <div className="mx-auto mt-4 w-full max-w-4xl sm:mt-5">
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

            <div className="composer-zone shrink-0 border-t border-white/10 px-2 pb-[calc(env(safe-area-inset-bottom)+0.55rem)] pt-2 sm:px-6 sm:pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:pt-4">
              <form
                onSubmit={handleSubmit}
                className="composer-shell mx-auto flex w-full max-w-4xl items-end gap-1.5 rounded-2xl border border-white/10 p-1.5 shadow-[0_18px_60px_rgba(0,0,0,0.24)] sm:gap-2 sm:rounded-2xl"
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
                    placeholder="Ask or save a note..."
                    rows={1}
                    disabled={isLoading}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void submitMessage();
                      }
                    }}
                    className="max-h-[164px] min-h-[42px] w-full resize-none overflow-y-auto rounded-xl border border-transparent bg-transparent px-3 py-2 pr-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-500 disabled:cursor-wait disabled:text-slate-500 sm:min-h-[46px] sm:rounded-[1rem] sm:py-2.5 sm:pr-4 sm:text-base"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!canSend}
                  aria-label={isLoading ? "Sending message" : "Send message"}
                  className="send-button flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300 sm:h-[46px] sm:w-[46px]"
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
  activeSpaceName,
  memoryInsights,
  graphData,
  reviewItems,
  setupMessage,
  isLoadingSessions,
  isLoadingSession,
  isLoadingSpaces,
  onNewChat,
  onLoadSession,
  onDeleteSession,
  onApplyPrompt,
  onReviewAction,
  formatSessionTime,
}: {
  sessions: ChatSession[];
  currentSessionId: string | null;
  activeSpaceName: string;
  memoryInsights: MemoryInsights | null;
  graphData: GraphData | null;
  reviewItems: ReviewItem[];
  setupMessage: string | null;
  isLoadingSessions: boolean;
  isLoadingSession: boolean;
  isLoadingSpaces: boolean;
  onNewChat: () => void;
  onLoadSession: (sessionId: string) => Promise<void>;
  onDeleteSession: (sessionId: string) => Promise<void>;
  onApplyPrompt: (prompt: string) => void;
  onReviewAction: (
    memoryId: string,
    action: ReviewAction,
    relationId?: string
  ) => Promise<void>;
  formatSessionTime: (value: string) => string;
}) {
  const sessionListKey = sessions.map((session) => session.id).join("|");
  const [recentDisplay, setRecentDisplay] = useState({
    count: RECENT_INITIAL_COUNT,
    key: sessionListKey,
  });
  const visibleSessionCount =
    recentDisplay.key === sessionListKey
      ? recentDisplay.count
      : RECENT_INITIAL_COUNT;
  const visibleSessions = sessions.slice(0, visibleSessionCount);
  const hiddenSessionCount = Math.max(sessions.length - visibleSessions.length, 0);
  const canShowFewerSessions = visibleSessionCount > RECENT_INITIAL_COUNT;
  const nextSessionBatchCount = Math.min(
    RECENT_BATCH_COUNT,
    hiddenSessionCount
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-white/10 p-4">
        <div className="flex items-center gap-3">
          <div className="brand-mark flex h-11 w-11 shrink-0 overflow-hidden rounded-2xl border border-white/10 shadow-[0_14px_44px_rgba(37,99,235,0.18)]">
            <Image
              src="/icons/icon-192.png"
              alt=""
              width={44}
              height={44}
              className="h-full w-full object-cover"
            />
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

      <div className="messages-container min-h-0 flex-1 overflow-y-auto pb-3">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/5 bg-[#090d18]/95 px-4 pb-2 pt-4 backdrop-blur">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
            <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
            Recent
          </h2>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-xs text-slate-400">
            {sessions.length > RECENT_INITIAL_COUNT
              ? `${visibleSessions.length}/${sessions.length}`
              : sessions.length}
          </span>
        </div>

        <div className="space-y-1 px-2 py-3">
          {isLoadingSessions ? (
            <SessionLoading />
          ) : sessions.length === 0 ? (
            <div className="mx-2 rounded-2xl border border-dashed border-white/[0.12] bg-white/[0.03] px-3 py-4 text-sm leading-6 text-slate-400">
              No saved sessions yet. Start a chat and it will appear here.
            </div>
          ) : (
            <>
              {visibleSessions.map((session) => {
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
              })}

              {(hiddenSessionCount > 0 || canShowFewerSessions) && (
                <div className="mt-2 space-y-2">
                  {hiddenSessionCount > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setRecentDisplay({
                          count: Math.min(
                            visibleSessionCount + RECENT_BATCH_COUNT,
                            sessions.length
                          ),
                          key: sessionListKey,
                        })
                      }
                      className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-blue-300/30 hover:bg-blue-500/[0.08] hover:text-blue-100 active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300"
                    >
                      <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Show {nextSessionBatchCount} more</span>
                      <span className="font-normal text-slate-500">
                        {hiddenSessionCount} left
                      </span>
                    </button>
                  )}

                  {canShowFewerSessions && (
                    <button
                      type="button"
                      onClick={() =>
                        setRecentDisplay({
                          count: RECENT_INITIAL_COUNT,
                          key: sessionListKey,
                        })
                      }
                      className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-transparent px-3 py-2 text-xs font-semibold text-slate-400 transition hover:border-white/15 hover:bg-white/[0.04] hover:text-slate-100 active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300"
                    >
                      <ArrowDown
                        className="h-3.5 w-3.5 rotate-180"
                        aria-hidden="true"
                      />
                      <span>Show less</span>
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <MemoryIntelligencePanel
          activeSpaceName={activeSpaceName}
          insights={memoryInsights}
          graphData={graphData}
          reviewItems={reviewItems}
          setupMessage={setupMessage}
          isLoading={isLoadingSpaces}
          onApplyPrompt={onApplyPrompt}
          onReviewAction={onReviewAction}
        />
      </div>
    </div>
  );
}

function MemoryIntelligencePanel({
  activeSpaceName,
  insights,
  graphData,
  reviewItems,
  setupMessage,
  isLoading,
  onApplyPrompt,
  onReviewAction,
}: {
  activeSpaceName: string;
  insights: MemoryInsights | null;
  graphData: GraphData | null;
  reviewItems: ReviewItem[];
  setupMessage: string | null;
  isLoading: boolean;
  onApplyPrompt: (prompt: string) => void;
  onReviewAction: (
    memoryId: string,
    action: ReviewAction,
    relationId?: string
  ) => Promise<void>;
}) {
  return (
    <div className="border-t border-white/10 px-3 py-4">
      <div className="space-y-4">
        {setupMessage && <SetupNotice message={setupMessage} />}

        <LearningSnapshot
          activeSpaceName={activeSpaceName}
          insights={insights}
          isLoading={isLoading}
          onWeeklySummary={() => onApplyPrompt("weekly summary")}
        />

        <RecentMemoriesList memories={insights?.recentMemories ?? []} />

        <ReviewQueue
          reviewItems={reviewItems}
          onReviewAction={onReviewAction}
        />

        <SuggestedNextAction
          insights={insights}
          reviewItems={reviewItems}
          onApplyPrompt={onApplyPrompt}
        />

        <ConnectionsSummary graphData={graphData} />
      </div>
    </div>
  );
}

function LearningSnapshot({
  activeSpaceName,
  insights,
  isLoading,
  onWeeklySummary,
}: {
  activeSpaceName: string;
  insights: MemoryInsights | null;
  isLoading: boolean;
  onWeeklySummary: () => void;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
            Learning space
          </p>
          <div className="mt-1 flex min-w-0 items-center gap-2">
            <Layers className="h-4 w-4 shrink-0 text-blue-300" aria-hidden="true" />
            <span className="truncate text-sm font-semibold text-slate-100">
              {activeSpaceName}
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {isLoading ? "Updating your memory view" : "Only this space is shown here"}
          </p>
        </div>
        <button
          type="button"
          onClick={onWeeklySummary}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-blue-300/20 bg-blue-500/[0.10] text-blue-100 transition hover:bg-blue-500/[0.16] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300"
          title="Generate weekly summary"
          aria-label="Generate weekly summary"
        >
          <Sparkles className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <MiniMetric label="Saved" value={insights?.total ?? 0} icon={Brain} />
        <MiniMetric
          label="This week"
          value={insights?.thisWeekCount ?? 0}
          icon={Sparkles}
        />
        <MiniMetric
          label="To review"
          value={insights?.needsReviewCount ?? 0}
          icon={ShieldAlert}
          warn={(insights?.needsReviewCount ?? 0) > 0}
        />
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
    <div className="min-w-0 rounded-xl border border-white/10 bg-black/[0.12] px-2 py-2 text-center">
      <Icon
        className={`mx-auto h-3.5 w-3.5 ${
          warn ? "text-amber-300" : "text-blue-300"
        }`}
        aria-hidden="true"
      />
      <div className="mt-1 text-sm font-semibold leading-none text-slate-100">
        {value}
      </div>
      <div className="mt-1 truncate text-[10px] text-slate-500">{label}</div>
    </div>
  );
}

function SetupNotice({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 p-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-amber-100">
        <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
        Database setup needed
      </div>
      <p className="mt-1 text-xs leading-5 text-amber-100/80">{message}</p>
    </div>
  );
}

function SidebarSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
        {title}
      </h3>
      {children}
    </section>
  );
}

function RecentMemoriesList({ memories }: { memories: MemoryInsightMemory[] }) {
  return (
    <SidebarSection title="Recent memories">
      {memories.length > 0 ? (
        <div className="space-y-2">
          {memories.slice(0, 3).map((memory) => (
            <div
              key={memory.id}
              className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5"
            >
              <div className="flex min-w-0 items-start justify-between gap-2">
                <p className="line-clamp-2 min-w-0 text-sm font-medium leading-5 text-slate-100">
                  {memory.title}
                </p>
                {memory.needs_review && (
                  <span className="shrink-0 rounded-full border border-amber-300/20 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-100">
                    Review
                  </span>
                )}
              </div>
              <p className="mt-1 truncate text-xs text-slate-500">
                {formatMemoryMeta(memory)}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <EmptySidebarNote text="No memories saved in this space yet." />
      )}
    </SidebarSection>
  );
}

function formatMemoryMeta(memory: MemoryInsightMemory) {
  const topic = memory.topic || "Untitled topic";
  const status = memory.needs_review
    ? "needs review"
    : memory.confidence_status?.replace(/_/g, " ") || "new";

  return `${topic} - ${status}`;
}

function ConnectionsSummary({ graphData }: { graphData: GraphData | null }) {
  const issueEdges = (graphData?.edges ?? []).filter((edge) =>
    ["contradicts", "duplicate_of", "near_duplicate"].includes(edge.type)
  );
  const linkCount = graphData?.edges.length ?? 0;

  if (linkCount === 0) return null;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2.5">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-slate-400">
          <GitFork className="h-3.5 w-3.5 shrink-0 text-blue-300" aria-hidden="true" />
          <span className="truncate">Memory links</span>
        </span>
        <span className="shrink-0 text-xs text-slate-500">{linkCount}</span>
      </div>
      <p
        className={`mt-1 text-xs leading-5 ${
          issueEdges.length > 0 ? "text-amber-100/80" : "text-slate-500"
        }`}
      >
        {issueEdges.length > 0
          ? `${issueEdges.length} link${issueEdges.length === 1 ? "" : "s"} need cleanup.`
          : "Connections are being tracked quietly in the background."}
      </p>
    </div>
  );
}

function EmptySidebarNote({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-dashed border-white/[0.12] bg-white/[0.02] px-3 py-3 text-xs leading-5 text-slate-500">
      {text}
    </p>
  );
}

function SuggestedNextAction({
  insights,
  reviewItems,
  onApplyPrompt,
}: {
  insights: MemoryInsights | null;
  reviewItems: ReviewItem[];
  onApplyPrompt: (prompt: string) => void;
}) {
  const recentTopic = insights?.recentMemories.find((memory) => memory.topic)
    ?.topic;
  const hasReviews = reviewItems.length > 0 || (insights?.needsReviewCount ?? 0) > 0;
  const action = hasReviews
    ? {
        title: "Review one saved idea",
        detail: "Ask the assistant to pick what needs attention first.",
        prompt: "What should I review today from my saved memories?",
        icon: ShieldAlert,
      }
    : (insights?.thisWeekCount ?? 0) > 0
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
      className="group w-full rounded-2xl border border-blue-300/15 bg-blue-500/[0.07] p-3 text-left transition hover:bg-blue-500/[0.11] active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-400/[0.12] text-blue-100">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold leading-5 text-slate-100">
            {action.title}
          </span>
          <span className="mt-1 block text-xs leading-5 text-slate-400">
            {action.detail}
          </span>
        </span>
      </div>
    </button>
  );
}

function ReviewQueue({
  reviewItems,
  onReviewAction,
}: {
  reviewItems: ReviewItem[];
  onReviewAction: (
    memoryId: string,
    action: ReviewAction,
    relationId?: string
  ) => Promise<void>;
}) {
  const [pendingReviewKey, setPendingReviewKey] = useState<string | null>(null);

  const runReviewAction = async (
    memoryId: string,
    action: ReviewAction,
    relationId?: string
  ) => {
    if (pendingReviewKey) return;

    const nextPendingKey = `${memoryId}:${action}:${relationId ?? "none"}`;
    setPendingReviewKey(nextPendingKey);
    try {
      await onReviewAction(memoryId, action, relationId);
    } finally {
      setPendingReviewKey(null);
    }
  };

  return (
    <SidebarSection title="Needs review">
      {reviewItems.length > 0 ? (
        <div className="space-y-2.5">
          {reviewItems.slice(0, 2).map((item) => {
            const firstRelation = item.relations[0];
            const confidence = item.memory.confidence_score ?? 50;

            return (
              <div
                key={item.memory.id}
                className="min-w-0 rounded-xl border border-amber-300/15 bg-amber-400/[0.055] p-3"
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-sm font-semibold leading-5 text-slate-100">
                      {item.memory.title}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-amber-100/70">
                      {item.primaryReason}
                    </p>
                  </div>
                  <span
                    title="Confidence score"
                    className="shrink-0 rounded-full border border-white/10 bg-black/[0.14] px-2 py-1 text-[11px] font-semibold text-slate-300"
                  >
                    {confidence}
                  </span>
                </div>

                {firstRelation?.relatedMemory?.title && (
                  <div className="mt-2 flex min-w-0 items-center gap-2 rounded-lg border border-amber-300/15 bg-black/[0.12] px-2.5 py-1.5 text-[11px] leading-4 text-amber-100/85">
                    <GitFork className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 truncate">
                      Linked: {firstRelation.relatedMemory.title}
                    </span>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  <ReviewActionButton
                    label="Got it"
                    title="Mark remembered"
                    icon={Check}
                    variant="primary"
                    loading={
                      pendingReviewKey === `${item.memory.id}:remembered:none`
                    }
                    disabled={Boolean(pendingReviewKey)}
                    onClick={() =>
                      void runReviewAction(item.memory.id, "remembered")
                    }
                  />
                  <ReviewActionButton
                    label="Practice"
                    title="Needs practice"
                    icon={Clock3}
                    variant="neutral"
                    loading={
                      pendingReviewKey ===
                      `${item.memory.id}:needs_practice:none`
                    }
                    disabled={Boolean(pendingReviewKey)}
                    onClick={() =>
                      void runReviewAction(item.memory.id, "needs_practice")
                    }
                  />
                  {firstRelation?.id && (
                    <ReviewActionButton
                      label="Resolve"
                      title="Resolve duplicate or contradiction link"
                      icon={Sparkles}
                      variant="warning"
                      loading={
                        pendingReviewKey ===
                        `${item.memory.id}:resolved:${firstRelation.id}`
                      }
                      disabled={Boolean(pendingReviewKey)}
                      onClick={() =>
                        void runReviewAction(
                          item.memory.id,
                          "resolved",
                          firstRelation.id
                        )
                      }
                    />
                  )}
                  <ReviewActionButton
                    label="Archive"
                    title="Archive memory"
                    icon={Archive}
                    variant="danger"
                    loading={
                      pendingReviewKey === `${item.memory.id}:archive:none`
                    }
                    disabled={Boolean(pendingReviewKey)}
                    onClick={() => void runReviewAction(item.memory.id, "archive")}
                  />
                </div>
              </div>
            );
          })}
          {reviewItems.length > 2 && (
            <p className="px-1 text-xs leading-5 text-slate-500">
              {reviewItems.length - 2} more item
              {reviewItems.length - 2 === 1 ? "" : "s"} waiting.
            </p>
          )}
        </div>
      ) : (
        <EmptySidebarNote text="Nothing needs review right now." />
      )}
    </SidebarSection>
  );
}

function ReviewActionButton({
  label,
  title,
  icon: Icon,
  onClick,
  variant = "neutral",
  loading = false,
  disabled = false,
  className = "",
}: {
  label: string;
  title: string;
  icon: typeof Brain;
  onClick: () => void;
  variant?: "primary" | "neutral" | "warning" | "danger";
  loading?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const variantClassName =
    variant === "primary"
      ? "border-blue-300/20 bg-blue-500/[0.10] text-blue-100 hover:bg-blue-500/[0.16] focus-visible:outline-blue-300"
      : variant === "warning"
        ? "border-amber-300/20 bg-amber-400/[0.08] text-amber-100 hover:bg-amber-400/[0.13] focus-visible:outline-amber-300"
        : variant === "danger"
          ? "border-red-300/15 bg-red-400/[0.06] text-red-100 hover:bg-red-400/[0.11] focus-visible:outline-red-300"
          : "border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08] focus-visible:outline-blue-300";
  const ButtonIcon = loading ? Loader2 : Icon;

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`flex min-h-8 min-w-0 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition active:scale-[0.98] disabled:cursor-wait disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${variantClassName} ${className}`}
    >
      <ButtonIcon
        className={`h-3.5 w-3.5 shrink-0 ${loading ? "animate-spin" : ""}`}
        aria-hidden="true"
      />
      <span className="truncate">{label}</span>
    </button>
  );
}

function EmptyState({
  onSelectPrompt,
}: {
  onSelectPrompt: (prompt: string) => void;
}) {
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
  const roleLabel = isUser ? "You" : "Learning Brain";
  const metaLabel = isUser ? "Sent" : "Assistant";

  return (
    <article
      className={`message-enter flex min-w-0 items-end gap-2.5 sm:gap-3 ${
        isUser ? "justify-end" : "justify-start"
      }`}
    >
      {!isUser && (
        <div
          className="assistant-avatar hidden h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-blue-300/20 text-blue-100 shadow-[0_12px_34px_rgba(37,99,235,0.16)] sm:flex"
          aria-hidden="true"
        >
          <Bot className="h-5 w-5" />
        </div>
      )}

      <div
        className={`min-w-0 ${
          isUser
            ? "max-w-[84%] rounded-[1.35rem] rounded-br-md border border-blue-300/20 bg-blue-600/95 px-3.5 py-3 text-white shadow-[0_14px_42px_rgba(37,99,235,0.22)] sm:max-w-[min(44rem,78%)] sm:px-4 sm:py-4"
            : "max-w-full px-1 py-2 text-slate-100 sm:max-w-[min(44rem,78%)] sm:rounded-[1.35rem] sm:rounded-bl-md sm:border sm:border-white/[0.12] sm:bg-[#111827]/90 sm:px-4 sm:py-4 sm:shadow-[0_18px_52px_rgba(0,0,0,0.2)]"
        }`}
      >
        <div
          className={`mb-2 hidden min-w-0 items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] sm:flex ${
            isUser ? "text-blue-100/80" : "text-blue-200/80"
          }`}
        >
          <span className="truncate">{roleLabel}</span>
          <span
            className={`h-1 w-1 shrink-0 rounded-full ${
              isUser ? "bg-blue-100/50" : "bg-blue-300/60"
            }`}
            aria-hidden="true"
          />
          <span className="shrink-0">{metaLabel}</span>
          <span
            className={`h-1 w-1 shrink-0 rounded-full ${
              isUser ? "bg-blue-100/50" : "bg-blue-300/60"
            }`}
            aria-hidden="true"
          />
          <time className="shrink-0" dateTime={message.timestamp.toISOString()}>
            {formatTime(message.timestamp)}
          </time>
        </div>

        {!isUser && message.metadata && (
          <MessageBadges metadata={message.metadata} />
        )}

        <div
          className={`message-copy min-w-0 text-base leading-7 ${
            isUser ? "text-white/95" : "text-slate-100"
          }`}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={createMarkdownComponents(isUser)}
          >
            {message.content}
          </ReactMarkdown>
        </div>
      </div>

      {isUser && (
        <div
          className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-[0_12px_34px_rgba(37,99,235,0.26)] sm:flex"
          aria-hidden="true"
        >
          <User className="h-5 w-5" />
        </div>
      )}
    </article>
  );
}

function MessageBadges({ metadata }: { metadata: ResponseMetadata }) {
  const badges: Array<{ label: string; tone: "blue" | "green" | "amber" | "red" | "slate" }> = [];
  const relationTypes = metadata.relationTypes ?? [];

  if (metadata.type === "teach_mode") badges.push({ label: "Teach mode", tone: "blue" });
  if (metadata.type === "weekly_summary") {
    badges.push({ label: "Weekly summary", tone: "blue" });
  }

  if (metadata.knowledgeStatus) {
    const tone =
      metadata.knowledgeStatus === "known"
        ? "green"
        : metadata.knowledgeStatus === "partial"
          ? "amber"
          : "slate";
    badges.push({
      label:
        metadata.knowledgeStatus.charAt(0).toUpperCase() +
        metadata.knowledgeStatus.slice(1),
      tone,
    });
  }

  if (metadata.saved) badges.push({ label: "Saved", tone: "green" });
  if (metadata.indexed === false) badges.push({ label: "Index pending", tone: "amber" });
  if (metadata.needsReview) badges.push({ label: "Needs review", tone: "amber" });
  if (relationTypes.includes("contradicts")) {
    badges.push({ label: "Contradiction", tone: "red" });
  }
  if (
    relationTypes.includes("duplicate_of") ||
    relationTypes.includes("near_duplicate")
  ) {
    badges.push({ label: "Duplicate link", tone: "amber" });
  }
  if (metadata.spaceName) {
    badges.push({ label: metadata.spaceName, tone: "slate" });
  }
  if (metadata.topic) {
    badges.push({ label: metadata.topic, tone: "blue" });
  }
  if (metadata.memoryCount !== undefined) {
    badges.push({ label: `${metadata.memoryCount} memories`, tone: "slate" });
  }

  if (badges.length === 0) return null;

  return (
    <div className="mb-3 flex flex-wrap gap-1.5">
      {badges.slice(0, 7).map((badge) => (
        <span
          key={`${badge.label}-${badge.tone}`}
          className={`inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-5 ${badgeToneClasses[badge.tone]}`}
        >
          <span className="truncate">{badge.label}</span>
        </span>
      ))}
    </div>
  );
}

const badgeToneClasses = {
  blue: "border-blue-300/25 bg-blue-400/10 text-blue-100",
  green: "border-emerald-300/25 bg-emerald-400/10 text-emerald-100",
  amber: "border-amber-300/25 bg-amber-400/10 text-amber-100",
  red: "border-red-300/25 bg-red-400/10 text-red-100",
  slate: "border-white/10 bg-white/[0.05] text-slate-200",
};

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
          className={`rounded-md px-1.5 py-0.5 font-mono text-[0.92em] ${
            isUser
              ? "bg-white/[0.14] text-white"
              : "bg-blue-400/[0.12] text-blue-100"
          }`}
        >
          {children}
        </code>
      );
    },
    p: ({ children }) => (
      <p className="chat-markdown mb-3 leading-7 last:mb-0">{children}</p>
    ),
    h1: ({ children }) => (
      <h1 className="chat-markdown mb-3 mt-1 text-xl font-bold leading-8 text-white first:mt-0">
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 className="chat-markdown mb-2.5 mt-4 text-lg font-bold leading-7 text-white first:mt-0">
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="chat-markdown mb-2 mt-3 text-base font-bold leading-7 text-slate-100 first:mt-0">
        {children}
      </h3>
    ),
    strong: ({ children }) => (
      <strong
        className={isUser ? "font-bold text-white" : "font-bold text-blue-100"}
      >
        {children}
      </strong>
    ),
    ul: ({ children }) => (
      <ul className="chat-markdown mb-3 ml-5 list-disc space-y-2 leading-7 marker:text-blue-300/80 last:mb-0">
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="chat-markdown mb-3 ml-5 list-decimal space-y-2 leading-7 marker:text-blue-300/80 last:mb-0">
        {children}
      </ol>
    ),
    li: ({ children }) => <li className="pl-1">{children}</li>,
    blockquote: ({ children }) => (
      <blockquote
        className={`chat-markdown my-3 rounded-r-2xl border-l-2 py-1 pl-3 leading-7 ${
          isUser
            ? "border-white/[0.4] bg-white/[0.08] text-white/[0.9]"
            : "border-blue-300/[0.45] bg-white/[0.04] text-slate-300"
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
        className={`underline decoration-2 underline-offset-4 transition ${
          isUser
            ? "text-white decoration-white/[0.35] hover:decoration-white"
            : "text-blue-300 decoration-blue-300/30 hover:decoration-blue-200"
        }`}
      >
        {children}
      </a>
    ),
    table: ({ children }) => (
      <div className="my-3 max-w-full overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full min-w-[34rem] table-auto border-collapse bg-[#111827] text-left text-sm text-slate-300">
          {children}
        </table>
      </div>
    ),
    th: ({ children }) => (
      <th className="break-words border-b border-white/10 bg-white/[0.04] px-3 py-2.5 font-bold text-slate-100">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="break-words border-b border-white/10 px-3 py-2.5 align-top">
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
    <div className="message-enter flex min-w-0 items-end gap-3">
      <div className="assistant-avatar hidden h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-blue-300/20 text-blue-100 sm:flex">
        <Bot className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="px-1 py-2 sm:rounded-[1.35rem] sm:rounded-bl-md sm:border sm:border-white/10 sm:bg-[#111827]/90 sm:px-4 sm:py-3">
        <div className="flex items-center gap-3 text-base text-slate-400 sm:text-sm">
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
    <div className="message-enter flex min-w-0 items-end gap-3" role="alert">
      <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-red-500/[0.12] text-red-200 sm:flex">
        <AlertCircle className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="min-w-0 max-w-full rounded-[1.35rem] border border-red-300/20 bg-red-500/10 px-3.5 py-3 text-red-100 sm:max-w-[min(42rem,78%)] sm:rounded-bl-md sm:px-5">
        <p className="text-base font-bold sm:text-sm">Something went wrong</p>
        <p className="mt-1 text-base leading-7 text-red-200/80 [overflow-wrap:anywhere] sm:text-sm sm:leading-6">
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
