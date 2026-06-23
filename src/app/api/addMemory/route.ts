import { NextResponse } from "next/server";
import { saveMemoryWithIntelligence } from "@/src/lib/memoryIntelligence";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      user_id,
      userId,
      title,
      body: memoryBody,
      memory_type,
      source,
      spaceId,
    } = body;
    const resolvedUserId = user_id ?? userId;

    if (!resolvedUserId || !memoryBody) {
      return NextResponse.json(
        { error: "user_id/userId and body are required" },
        { status: 400 }
      );
    }

    const result = await saveMemoryWithIntelligence({
      userId: resolvedUserId,
      title,
      body: memoryBody,
      memoryType: memory_type ?? "note",
      source: source === "gemini" ? "gemini" : "user",
      spaceId: typeof spaceId === "string" ? spaceId : null,
    });

    return NextResponse.json({ result }, { status: result.memorySaved ? 200 : 500 });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({ message: "Use POST to add a memory" }, { status: 405 });
}
