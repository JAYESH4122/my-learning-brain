import { NextResponse } from "next/server";
import { supabase } from "@/src/lib/supabaseClient";
import {
  computeReviewedConfidence,
  type ReviewOutcome,
} from "@/src/lib/memoryUtils";
import { getErrorMessage, isSchemaMissingError } from "@/src/lib/apiErrors";

const MEMORY_SELECT =
  "id, user_id, title, body, memory_type, tags, source, space_id, topic, confidence_score, confidence_status, review_count, last_reviewed_at, review_due_at, needs_review, archived_at, created_at, updated_at";

const ISSUE_RELATION_TYPES = ["duplicate_of", "near_duplicate", "contradicts"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function isDue(value: unknown) {
  return typeof value === "string" && new Date(value).getTime() <= Date.now();
}

function addDays(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function isReviewMemory(memory: Record<string, unknown>) {
  return (
    memory.needs_review === true ||
    asString(memory.confidence_status) === "needs_review" ||
    asNumber(memory.confidence_score, 50) < 50 ||
    isDue(memory.review_due_at)
  );
}

function normalizeReviewAction(action: unknown) {
  if (typeof action !== "string") return null;
  const normalized = action.trim().toLowerCase();
  const allowed = [
    "remembered",
    "needs_practice",
    "resolved",
    "mastered",
    "resolve_relation",
    "archive",
  ];
  return allowed.includes(normalized) ? normalized : null;
}

async function saveReviewEvent({
  userId,
  memoryId,
  eventType,
  metadata,
}: {
  userId: string;
  memoryId: string;
  eventType: string;
  metadata: Record<string, unknown>;
}) {
  await supabase.from("memory_events").insert([
    {
      user_id: userId,
      memory_id: memoryId,
      event_type: eventType,
      metadata,
    },
  ]);
}

async function getUnresolvedIssueCount(userId: string, memoryId: string) {
  const { count, error } = await supabase
    .from("memory_relations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("resolved_at", null)
    .in("relation_type", ISSUE_RELATION_TYPES)
    .or(`source_memory_id.eq.${memoryId},target_memory_id.eq.${memoryId}`);

  if (error) throw error;
  return count ?? 0;
}

async function resolveAllMemoryIssueRelations({
  userId,
  memoryId,
  resolution,
}: {
  userId: string;
  memoryId: string;
  resolution: string;
}) {
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("memory_relations")
    .update({ resolved_at: now, resolution })
    .eq("user_id", userId)
    .is("resolved_at", null)
    .in("relation_type", ISSUE_RELATION_TYPES)
    .or(`source_memory_id.eq.${memoryId},target_memory_id.eq.${memoryId}`);

  if (error) throw error;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const spaceId = searchParams.get("spaceId");
    const limit = Math.min(Number(searchParams.get("limit") ?? 40), 80);

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    let query = supabase
      .from("memories")
      .select(MEMORY_SELECT)
      .eq("user_id", userId)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(Number.isFinite(limit) ? limit : 40);

    if (spaceId) query = query.eq("space_id", spaceId);

    const { data, error } = await query;
    if (error) throw error;

    const reviewMemories = (data ?? []).filter(isRecord).filter(isReviewMemory);
    const memoryIds = reviewMemories
      .map((memory) => asString(memory.id))
      .filter(Boolean);

    let relations: Record<string, unknown>[] = [];
    let relatedMemories: Record<string, Record<string, unknown>> = {};

    if (memoryIds.length > 0) {
      const { data: relationData, error: relationError } = await supabase
        .from("memory_relations")
        .select(
          "id, source_memory_id, target_memory_id, relation_type, strength, reason, resolved_at, resolution, created_at"
        )
        .eq("user_id", userId)
        .is("resolved_at", null)
        .or(
          `source_memory_id.in.(${memoryIds.join(",")}),target_memory_id.in.(${memoryIds.join(",")})`
        )
        .order("created_at", { ascending: false })
        .limit(120);

      if (relationError) throw relationError;
      relations = (relationData ?? []).filter(isRecord);

      const linkedMemoryIds = Array.from(
        new Set(
          relations
            .flatMap((relation) => [
              asString(relation.source_memory_id),
              asString(relation.target_memory_id),
            ])
            .filter((id) => id && !memoryIds.includes(id))
        )
      );

      if (linkedMemoryIds.length > 0) {
        const { data: linkedData, error: linkedError } = await supabase
          .from("memories")
          .select("id, title, body, topic, confidence_score, confidence_status")
          .in("id", linkedMemoryIds);

        if (linkedError) throw linkedError;
        relatedMemories = Object.fromEntries(
          (linkedData ?? [])
            .filter(isRecord)
            .map((memory) => [asString(memory.id), memory])
        );
      }
    }

    const reviewItems = reviewMemories.map((memory) => {
      const memoryId = asString(memory.id);
      const itemRelations: Record<string, unknown>[] = relations
        .filter(
          (relation) =>
            asString(relation.source_memory_id) === memoryId ||
            asString(relation.target_memory_id) === memoryId
        )
        .map((relation) => {
          const linkedId =
            asString(relation.source_memory_id) === memoryId
              ? asString(relation.target_memory_id)
              : asString(relation.source_memory_id);

          return {
            ...relation,
            relatedMemory: relatedMemories[linkedId] ?? null,
          };
        });

      return {
        memory,
        relations: itemRelations,
        primaryReason:
          asString(itemRelations[0]?.reason) ||
          (memory.needs_review === true
            ? "This memory was marked for review."
            : "This memory is due for review."),
      };
    });

    return NextResponse.json({
      reviewItems,
      count: reviewItems.length,
    });
  } catch (err) {
    if (isSchemaMissingError(err)) {
      return NextResponse.json({
        reviewItems: [],
        count: 0,
        setupRequired: true,
        setupMessage:
          "Apply supabase/migrations/20260623000000_memory_intelligence_layer.sql to enable the review queue.",
      });
    }

    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { userId, memoryId, action, relationId, resolution } = await req.json();
    const normalizedAction = normalizeReviewAction(action);

    if (!userId || !memoryId || !normalizedAction) {
      return NextResponse.json(
        { error: "userId, memoryId, and a valid action are required" },
        { status: 400 }
      );
    }

    const { data: memory, error: memoryError } = await supabase
      .from("memories")
      .select(MEMORY_SELECT)
      .eq("id", memoryId)
      .eq("user_id", userId)
      .single();

    if (memoryError) throw memoryError;
    if (!memory) {
      return NextResponse.json({ error: "Memory not found" }, { status: 404 });
    }

    if (normalizedAction === "archive") {
      const now = new Date().toISOString();
      const { data: updatedMemory, error: updateError } = await supabase
        .from("memories")
        .update({
          archived_at: now,
          needs_review: false,
          confidence_status: "needs_review",
          review_due_at: null,
        })
        .eq("id", memoryId)
        .eq("user_id", userId)
        .select(MEMORY_SELECT)
        .single();

      if (updateError) throw updateError;
      await saveReviewEvent({
        userId,
        memoryId,
        eventType: "memory_archived",
        metadata: { action: normalizedAction },
      });
      return NextResponse.json({ memory: updatedMemory, action: normalizedAction });
    }

    if (normalizedAction === "resolve_relation") {
      if (!relationId) {
        return NextResponse.json(
          { error: "relationId is required for resolve_relation" },
          { status: 400 }
        );
      }

      const now = new Date().toISOString();
      const { error: relationError } = await supabase
        .from("memory_relations")
        .update({
          resolved_at: now,
          resolution: resolution || "Resolved during review.",
        })
        .eq("id", relationId)
        .eq("user_id", userId);

      if (relationError) throw relationError;

      const unresolvedCount = await getUnresolvedIssueCount(userId, memoryId);
      if (unresolvedCount === 0) {
        const next = computeReviewedConfidence({
          currentScore: asNumber(memory.confidence_score, 50),
          outcome: "resolved",
        });

        await supabase
          .from("memories")
          .update({
            confidence_score: next.confidenceScore,
            confidence_status: next.confidenceStatus,
            needs_review: next.needsReview,
            review_due_at: addDays(next.reviewDueDays),
            last_reviewed_at: now,
            review_count: asNumber(memory.review_count, 0) + 1,
          })
          .eq("id", memoryId)
          .eq("user_id", userId);
      }

      await saveReviewEvent({
        userId,
        memoryId,
        eventType: "relation_resolved",
        metadata: { relationId, resolution },
      });

      return NextResponse.json({
        action: normalizedAction,
        unresolvedIssueCount: unresolvedCount,
      });
    }

    if (normalizedAction === "resolved") {
      await resolveAllMemoryIssueRelations({
        userId,
        memoryId,
        resolution: resolution || "Resolved during review.",
      });
    }

    const outcome = normalizedAction as ReviewOutcome;
    const next = computeReviewedConfidence({
      currentScore: asNumber(memory.confidence_score, 50),
      outcome,
    });
    const now = new Date().toISOString();

    const { data: updatedMemory, error: updateError } = await supabase
      .from("memories")
      .update({
        confidence_score: next.confidenceScore,
        confidence_status: next.confidenceStatus,
        needs_review: next.needsReview,
        last_reviewed_at: now,
        review_due_at: addDays(next.reviewDueDays),
        review_count: asNumber(memory.review_count, 0) + 1,
      })
      .eq("id", memoryId)
      .eq("user_id", userId)
      .select(MEMORY_SELECT)
      .single();

    if (updateError) throw updateError;

    await saveReviewEvent({
      userId,
      memoryId,
      eventType: "memory_reviewed",
      metadata: {
        action: normalizedAction,
        previousScore: memory.confidence_score,
        confidenceScore: next.confidenceScore,
        confidenceStatus: next.confidenceStatus,
      },
    });

    return NextResponse.json({ memory: updatedMemory, action: normalizedAction });
  } catch (err) {
    if (isSchemaMissingError(err)) {
      return NextResponse.json(
        {
          error:
            "Database migration is required before reviewing memories. Apply supabase/migrations/20260623000000_memory_intelligence_layer.sql.",
          setupRequired: true,
        },
        { status: 503 }
      );
    }

    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
