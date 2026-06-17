import { NextResponse } from "next/server";
import { createSessionTitle } from "@/src/lib/chatSessions";
import { supabase } from "@/src/lib/supabaseClient";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const { data: sessions, error } = await supabase
    .from("chat_sessions")
    .select("id, user_id, title, created_at, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ sessions: sessions ?? [] });
}

export async function POST(req: Request) {
  try {
    const { userId, title } = await req.json();

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    const { data: session, error } = await supabase
      .from("chat_sessions")
      .insert([
        {
          user_id: userId,
          title: createSessionTitle(title || "New chat"),
        },
      ])
      .select("id, user_id, title, created_at, updated_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ session }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
