import { supabase } from "@/src/lib/supabaseClient";

export type ChatMessageRole = "user" | "assistant";

export interface StoredChatMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  message_order: number;
  created_at: string;
}

export interface ChatSession {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface EnsureChatSessionOptions {
  userId: string;
  sessionId?: string | null;
  titleSource: string;
}

interface SaveChatTurnOptions {
  userId: string;
  sessionId?: string | null;
  userContent: string;
  assistantContent: string;
}

const DEFAULT_SESSION_TITLE = "New chat";

export function createSessionTitle(content: string) {
  const compactTitle = content
    .replace(/```[\s\S]*?```/g, "code review")
    .replace(/[#*_`>[\]()]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!compactTitle) return DEFAULT_SESSION_TITLE;
  return compactTitle.length > 48
    ? `${compactTitle.slice(0, 45)}...`
    : compactTitle;
}

export async function ensureChatSession({
  userId,
  sessionId,
  titleSource,
}: EnsureChatSessionOptions) {
  const title = createSessionTitle(titleSource);

  if (sessionId) {
    const { data: existingSession, error: existingError } = await supabase
      .from("chat_sessions")
      .select("id, title")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .maybeSingle();

    if (existingError) throw existingError;

    if (existingSession?.id) {
      if (existingSession.title === DEFAULT_SESSION_TITLE && title) {
        const { error: updateError } = await supabase
          .from("chat_sessions")
          .update({ title })
          .eq("id", existingSession.id)
          .eq("user_id", userId);

        if (updateError) throw updateError;
      }

      return existingSession.id as string;
    }
  }

  const { data: newSession, error: newSessionError } = await supabase
    .from("chat_sessions")
    .insert([{ user_id: userId, title }])
    .select("id")
    .single();

  if (newSessionError) throw newSessionError;
  return newSession.id as string;
}

export async function saveChatTurn({
  userId,
  sessionId,
  userContent,
  assistantContent,
}: SaveChatTurnOptions) {
  const resolvedSessionId = await ensureChatSession({
    userId,
    sessionId,
    titleSource: userContent,
  });

  const { data: messages, error: messageError } = await supabase
    .from("chat_messages")
    .insert([
      {
        session_id: resolvedSessionId,
        user_id: userId,
        role: "user",
        content: userContent,
      },
      {
        session_id: resolvedSessionId,
        user_id: userId,
        role: "assistant",
        content: assistantContent,
      },
    ])
    .select("id, role, content, message_order, created_at")
    .order("message_order", { ascending: true });

  if (messageError) throw messageError;

  return {
    sessionId: resolvedSessionId,
    messages: (messages ?? []) as StoredChatMessage[],
  };
}
