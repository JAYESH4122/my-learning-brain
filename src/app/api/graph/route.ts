import { NextResponse } from "next/server";
import { supabase } from "@/src/lib/supabaseClient";
import { normalizeTopicName, toDisplayTopicName } from "@/src/lib/memoryUtils";
import { getErrorMessage, isSchemaMissingError } from "@/src/lib/apiErrors";

const MEMORY_SELECT =
  "id, title, body, space_id, topic, tags, confidence_score, confidence_status, needs_review, archived_at, created_at";

interface GraphNode {
  id: string;
  type: "space" | "topic" | "memory";
  label: string;
  needsReview?: boolean;
  confidenceScore?: number;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  strength: number;
  reason?: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asOptionalString(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function asNumber(value: unknown, fallback = 0.5) {
  return typeof value === "number" ? value : fallback;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const spaceId = searchParams.get("spaceId");
    const topicFilter = searchParams.get("topic");

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    let memoryQuery = supabase
      .from("memories")
      .select(MEMORY_SELECT)
      .eq("user_id", userId)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(80);

    if (spaceId) memoryQuery = memoryQuery.eq("space_id", spaceId);
    if (topicFilter) memoryQuery = memoryQuery.ilike("topic", `%${topicFilter}%`);

    const { data: memoryData, error: memoryError } = await memoryQuery;
    if (memoryError) throw memoryError;

    const memories = (memoryData ?? []).filter(isRecord);
    const memoryIds = memories.map((memory) => asString(memory.id)).filter(Boolean);
    const nodes = new Map<string, GraphNode>();
    const edges = new Map<string, GraphEdge>();

    if (spaceId) {
      nodes.set(`space:${spaceId}`, {
        id: `space:${spaceId}`,
        type: "space",
        label: "Current Space",
      });
    }

    for (const memory of memories) {
      const memoryId = asString(memory.id);
      const topic = toDisplayTopicName(asString(memory.topic, "General"));
      const topicId = `topic:${normalizeTopicName(topic)}`;
      const memoryNodeId = `memory:${memoryId}`;

      nodes.set(topicId, { id: topicId, type: "topic", label: topic });
      nodes.set(memoryNodeId, {
        id: memoryNodeId,
        type: "memory",
        label: asString(memory.title, "Untitled memory"),
        needsReview: memory.needs_review === true,
        confidenceScore: asNumber(memory.confidence_score, 50),
      });

      edges.set(`${topicId}:${memoryNodeId}`, {
        id: `${topicId}:${memoryNodeId}`,
        source: topicId,
        target: memoryNodeId,
        type: "part_of",
        strength: 0.8,
      });

      if (spaceId) {
        edges.set(`space:${spaceId}:${topicId}`, {
          id: `space:${spaceId}:${topicId}`,
          source: `space:${spaceId}`,
          target: topicId,
          type: "contains",
          strength: 0.7,
        });
      }
    }

    if (memoryIds.length > 0) {
      const { data: relationData, error: relationError } = await supabase
        .from("memory_relations")
        .select("id, source_memory_id, target_memory_id, relation_type, strength, reason")
        .eq("user_id", userId)
        .or(
          `source_memory_id.in.(${memoryIds.join(",")}),target_memory_id.in.(${memoryIds.join(",")})`
        )
        .limit(120);

      if (relationError) throw relationError;

      for (const relation of (relationData ?? []).filter(isRecord)) {
        const sourceMemoryId = asOptionalString(relation.source_memory_id);
        const targetMemoryId = asOptionalString(relation.target_memory_id);
        if (!sourceMemoryId || !targetMemoryId) continue;

        const source = `memory:${sourceMemoryId}`;
        const target = `memory:${targetMemoryId}`;
        if (!nodes.has(source) || !nodes.has(target)) continue;

        const id = asString(
          relation.id,
          `${source}:${target}:${asString(relation.relation_type, "related_to")}`
        );
        edges.set(id, {
          id,
          source,
          target,
          type: asString(relation.relation_type, "related_to"),
          strength: asNumber(relation.strength, 0.5),
          reason: asOptionalString(relation.reason),
        });
      }
    }

    return NextResponse.json({
      nodes: Array.from(nodes.values()),
      edges: Array.from(edges.values()),
    });
  } catch (err) {
    if (isSchemaMissingError(err)) {
      return NextResponse.json({
        nodes: [],
        edges: [],
        setupRequired: true,
        setupMessage:
          "Apply supabase/migrations/20260623000000_memory_intelligence_layer.sql to enable the concept map.",
      });
    }

    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
