import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { user_id, title, body: memoryBody, user_phrasing, memory_type, tags, source } = body;

    const { data, error } = await supabase
      .from("memories")
      .insert([{ user_id, title, body: memoryBody, user_phrasing, memory_type, tags, source }])
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ memory: data }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({ message: "Use POST to add a memory" }, { status: 405 });
}
