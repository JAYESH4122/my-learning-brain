import { NextResponse } from "next/server";
import { supabase } from "@/src/lib/supabaseClient";

interface RouteContext {
  params: Promise<{
    sessionId: string;
  }>;
}

function getUserId(req: Request) {
  const { searchParams } = new URL(req.url);
  return searchParams.get("userId");
}

export async function GET(req: Request, context: RouteContext) {
  const userId = getUserId(req);
  const { sessionId } = await context.params;

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const { data: session, error: sessionError } = await supabase
    .from("chat_sessions")
    .select("id, user_id, title, created_at, updated_at")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (sessionError) {
    return NextResponse.json({ error: sessionError.message }, { status: 500 });
  }

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const { data: messages, error: messagesError } = await supabase
    .from("chat_messages")
    .select("id, role, content, created_at")
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .order("message_order", { ascending: true });

  if (messagesError) {
    return NextResponse.json({ error: messagesError.message }, { status: 500 });
  }

  return NextResponse.json({
    session,
    messages: messages ?? [],
  });
}

export async function DELETE(req: Request, context: RouteContext) {
  const userId = getUserId(req);
  const { sessionId } = await context.params;

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("chat_sessions")
    .delete()
    .eq("id", sessionId)
    .eq("user_id", userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
