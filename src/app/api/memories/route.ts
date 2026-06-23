import { NextResponse } from "next/server";
import { supabase } from "@/src/lib/supabaseClient";
import { toDisplayTopicName } from "@/src/lib/memoryUtils";
import { getErrorMessage, isSchemaMissingError } from "@/src/lib/apiErrors";

const MEMORY_SELECT =
  "id, user_id, title, body, memory_type, tags, source, space_id, topic, confidence_score, confidence_status, review_count, last_reviewed_at, review_due_at, needs_review, archived_at, created_at, updated_at";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" ? value : fallback;
}

function isDue(value: unknown) {
  return typeof value === "string" && new Date(value).getTime() <= Date.now();
}

function isThisWeek(value: unknown) {
  if (typeof value !== "string") return false;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const day = start.getUTCDay();
  start.setUTCDate(start.getUTCDate() + (day === 0 ? -6 : 1 - day));

  return date >= start;
}

function countTopics(memories: Record<string, unknown>[]) {
  const counts = new Map<string, number>();

  for (const memory of memories) {
    const topic = toDisplayTopicName(asString(memory.topic, "General"));
    counts.set(topic, (counts.get(topic) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 6);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const spaceId = searchParams.get("spaceId");
    const topic = searchParams.get("topic");
    const status = searchParams.get("status");
    const needsReview = searchParams.get("needsReview");
    const includeArchived = searchParams.get("includeArchived") === "true";
    const limit = Math.min(Number(searchParams.get("limit") ?? 80), 120);

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    let query = supabase
      .from("memories")
      .select(MEMORY_SELECT)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(Number.isFinite(limit) ? limit : 80);

    if (!includeArchived) query = query.is("archived_at", null);
    if (spaceId) query = query.eq("space_id", spaceId);
    if (topic) query = query.ilike("topic", `%${topic}%`);
    if (status) query = query.eq("confidence_status", status);
    if (needsReview === "true") query = query.eq("needs_review", true);
    if (needsReview === "false") query = query.eq("needs_review", false);

    const { data, error } = await query;
    if (error) throw error;

    const memories = (data ?? []).map(asRecord);
    const needsReviewMemories = memories.filter(
      (memory) => memory.needs_review === true
    );
    const dueReviews = memories.filter((memory) => isDue(memory.review_due_at));
    const thisWeekMemories = memories.filter((memory) =>
      isThisWeek(memory.created_at)
    );
    const weakMemories = memories.filter(
      (memory) =>
        memory.needs_review === true ||
        asNumber(memory.confidence_score, 50) < 50 ||
        asString(memory.confidence_status) === "needs_review"
    );

    return NextResponse.json({
      memories,
      insights: {
        total: memories.length,
        needsReviewCount: needsReviewMemories.length,
        dueReviewCount: dueReviews.length,
        thisWeekCount: thisWeekMemories.length,
        recentMemories: memories.slice(0, 5),
        topTopics: countTopics(memories),
        weakTopics: countTopics(weakMemories),
      },
    });
  } catch (err) {
    if (isSchemaMissingError(err)) {
      return NextResponse.json({
        memories: [],
        insights: {
          total: 0,
          needsReviewCount: 0,
          dueReviewCount: 0,
          recentMemories: [],
          topTopics: [],
          weakTopics: [],
        },
        setupRequired: true,
        setupMessage:
          "Apply supabase/migrations/20260623000000_memory_intelligence_layer.sql to enable memory intelligence features.",
      });
    }

    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
