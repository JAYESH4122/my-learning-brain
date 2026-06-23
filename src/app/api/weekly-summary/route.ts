import { NextResponse } from "next/server";
import { generateWeeklyLearningSummary } from "@/src/lib/memoryIntelligence";

function getErrorMessage(err: unknown) {
  if (err instanceof Error) return err.message;
  if (
    err &&
    typeof err === "object" &&
    "message" in err &&
    typeof err.message === "string"
  ) {
    return err.message;
  }

  try {
    return JSON.stringify(err);
  } catch {
    return "Unknown error";
  }
}

export async function POST(req: Request) {
  try {
    const { userId, spaceId, weekStart } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const summary = await generateWeeklyLearningSummary({
      userId,
      spaceId: typeof spaceId === "string" ? spaceId : null,
      weekStart: typeof weekStart === "string" ? weekStart : null,
    });

    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
