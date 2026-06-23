import { embedText } from "@/src/lib/embeddings";
import { generateSummary, generateWithWebSearch } from "@/src/lib/gemini";
import { supabase } from "@/src/lib/supabaseClient";
import {
  DEFAULT_SPACE_NAMES,
  KnowledgeStatus,
  clampConfidence,
  extractJsonObject,
  getInitialConfidenceStatus,
  getWeekStartDate,
  inferSpaceName,
  inferTopicFromText,
  normalizeTags,
  normalizeTopicName,
  toDisplayTopicName,
  truncateTitle,
} from "@/src/lib/memoryUtils";

export interface SpaceRecord {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface MemoryMatch {
  id: string;
  user_id: string;
  title: string;
  body: string;
  memory_type: string;
  tags: string[];
  source: string;
  space_id: string | null;
  topic: string | null;
  confidence_score: number;
  confidence_status: string;
  needs_review: boolean;
  created_at: string;
  similarity?: number;
}

export interface MemoryAnalysis {
  title: string;
  summary: string;
  memoryType: string;
  primaryTopic: string;
  tags: string[];
  suggestedSpace: string;
  relatedTopics: string[];
  confidenceSeed: number;
}

export type MemoryRelationType =
  | "related_to"
  | "duplicate_of"
  | "near_duplicate"
  | "adds_detail"
  | "contradicts"
  | "depends_on"
  | "example_of"
  | "part_of";

export interface MemoryRelationSuggestion {
  targetMemoryId: string;
  relationType: MemoryRelationType;
  strength: number;
  reason: string;
}

export interface SaveMemoryWithIntelligenceOptions {
  userId: string;
  title?: string;
  body: string;
  memoryType?: string;
  source: "user" | "gemini";
  spaceId?: string | null;
  embedding?: number[] | null;
}

export interface SaveMemoryWithIntelligenceResult {
  saved: boolean;
  memorySaved: boolean;
  memoryId?: string;
  saveError?: string;
  spaceId?: string | null;
  spaceName?: string;
  topic?: string;
  tags?: string[];
  confidenceScore?: number;
  confidenceStatus?: string;
  needsReview?: boolean;
  relationTypes?: string[];
  relationsCreated?: number;
  relatedCount?: number;
}

export interface KnowledgeGapResult {
  status: KnowledgeStatus;
  knownPoints: string[];
  missingPoints: string[];
  relatedMemories: MemoryMatch[];
  suggestedNextSteps: string[];
}

export interface TeachModeResult {
  topic: string;
  response: string;
  knownFromYourBrain: string[];
  gaps: string[];
  lesson: string;
  examples: string[];
  quiz: Array<{ question: string; expectedAnswer: string }>;
  memoryToSave?: string | null;
  knowledgeStatus: KnowledgeStatus;
  relatedMemories: MemoryMatch[];
}

const MEMORY_SELECT =
  "id, user_id, title, body, memory_type, tags, source, space_id, topic, confidence_score, confidence_status, needs_review, archived_at, created_at";

const DEFAULT_SPACE_DESCRIPTIONS: Record<string, string> = {
  General: "Default catch-all space",
  AI: "AI, machine learning, and learning systems",
  Coding: "Programming, software design, and debugging",
  Career: "Career planning, interviews, and work notes",
  Personal: "Personal notes and life context",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function getString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function getOptionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function getNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function getStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function toMemoryMatch(row: unknown): MemoryMatch | null {
  if (!isRecord(row)) return null;
  const id = getString(row.id);
  const userId = getString(row.user_id);
  const body = getString(row.body);
  if (!id || !userId || !body) return null;

  return {
    id,
    user_id: userId,
    title: getString(row.title, truncateTitle(body)),
    body,
    memory_type: getString(row.memory_type, "note"),
    tags: getStringArray(row.tags),
    source: getString(row.source, "user"),
    space_id: getOptionalString(row.space_id),
    topic: getOptionalString(row.topic),
    confidence_score: getNumber(row.confidence_score, 50),
    confidence_status: getString(row.confidence_status, "new"),
    needs_review: getBoolean(row.needs_review, false),
    created_at: getString(row.created_at, new Date().toISOString()),
    similarity:
      typeof row.similarity === "number" && Number.isFinite(row.similarity)
        ? row.similarity
        : undefined,
  };
}

function uniqueMemories(memories: MemoryMatch[]) {
  const seen = new Map<string, MemoryMatch>();
  for (const memory of memories) {
    if (!seen.has(memory.id)) seen.set(memory.id, memory);
  }
  return Array.from(seen.values());
}

function toMemoryMatches(rows: unknown) {
  if (!Array.isArray(rows)) return [];
  return rows.map(toMemoryMatch).filter(Boolean) as MemoryMatch[];
}

function formatMemoryContext(memories: MemoryMatch[], limit = 8) {
  return memories
    .slice(0, limit)
    .map((memory, index) => {
      const topic = memory.topic ? `Topic: ${memory.topic}` : "Topic: unknown";
      const tags = memory.tags.length > 0 ? `Tags: ${memory.tags.join(", ")}` : "";
      return [
        `Memory ${index + 1}`,
        `ID: ${memory.id}`,
        `Title: ${memory.title}`,
        topic,
        tags,
        `Confidence: ${memory.confidence_score}/${memory.confidence_status}`,
        `Body: ${memory.body}`,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

function safeJsonArray<T>(value: unknown) {
  return Array.isArray(value) ? (value as T[]) : [];
}

function sanitizeMemoryAnalysis(
  parsed: Partial<MemoryAnalysis> | null,
  body: string,
  source: "user" | "gemini",
  selectedSpaceName?: string | null
): MemoryAnalysis {
  const fallbackTopic = inferTopicFromText(body);
  const rawTopic = getString(parsed?.primaryTopic, fallbackTopic);
  const primaryTopic = toDisplayTopicName(
    inferCanonicalTopic(body, rawTopic)
  );
  const rawTags = getStringArray(parsed?.tags);
  const tags = normalizeTags(
    rawTags.length > 0 ? rawTags : [primaryTopic, ...body.split(/\s+/).slice(0, 4)]
  );
  const confidenceSeed = clampConfidence(
    getNumber(parsed?.confidenceSeed, source === "gemini" ? 35 : 50)
  );
  const suggestedSpace = selectedSpaceName || getString(parsed?.suggestedSpace);

  return {
    title: truncateTitle(getString(parsed?.title, body)),
    summary: getString(parsed?.summary, truncateTitle(body, 140)),
    memoryType: getString(parsed?.memoryType, source === "gemini" ? "question" : "note"),
    primaryTopic,
    tags,
    suggestedSpace: suggestedSpace || inferSpaceName(`${primaryTopic} ${body}`),
    relatedTopics: getStringArray(parsed?.relatedTopics)
      .map(toDisplayTopicName)
      .filter((topic) => normalizeTopicName(topic) !== normalizeTopicName(primaryTopic))
      .slice(0, 5),
    confidenceSeed,
  };
}

function inferCanonicalTopic(body: string, proposedTopic: string) {
  const bodyLower = body.toLowerCase();
  const proposedLower = proposedTopic.toLowerCase();

  if (
    /\brag\b/.test(bodyLower) &&
    !/\brag\b|retrieval augmented generation/.test(proposedLower)
  ) {
    return "Retrieval Augmented Generation";
  }

  if (
    /\bembeddings?\b/.test(bodyLower) &&
    !/\bembeddings?\b/.test(proposedLower)
  ) {
    return "Embeddings";
  }

  if (
    /\bvector (database|search|store|stores|db)\b/.test(bodyLower) &&
    !/\bvector\b/.test(proposedLower)
  ) {
    return "Vector Search";
  }

  return proposedTopic;
}

export async function ensureDefaultSpaces(userId: string) {
  const rows = DEFAULT_SPACE_NAMES.map((name) => ({
    user_id: userId,
    name,
    description: DEFAULT_SPACE_DESCRIPTIONS[name],
  }));

  const { error } = await supabase
    .from("spaces")
    .upsert(rows, { onConflict: "user_id,name", ignoreDuplicates: true });

  if (error) throw error;
}

export async function getSpaces(userId: string) {
  await ensureDefaultSpaces(userId);

  const { data, error } = await supabase
    .from("spaces")
    .select("id, user_id, name, description, created_at, updated_at")
    .eq("user_id", userId)
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []) as SpaceRecord[];
}

export async function ensureSpace(
  userId: string,
  name: string,
  description?: string | null
) {
  const cleanName = toDisplayTopicName(name || "General");
  const spaces = await getSpaces(userId);
  const existing = spaces.find(
    (space) => normalizeTopicName(space.name) === normalizeTopicName(cleanName)
  );

  if (existing) return existing;

  const { data, error } = await supabase
    .from("spaces")
    .insert([
      {
        user_id: userId,
        name: cleanName,
        description: description ?? null,
      },
    ])
    .select("id, user_id, name, description, created_at, updated_at")
    .single();

  if (error) throw error;
  return data as SpaceRecord;
}

export async function resolveSpace({
  userId,
  selectedSpaceId,
  suggestedSpace,
}: {
  userId: string;
  selectedSpaceId?: string | null;
  suggestedSpace?: string | null;
}) {
  const spaces = await getSpaces(userId);

  if (selectedSpaceId) {
    const selected = spaces.find((space) => space.id === selectedSpaceId);
    if (selected) return selected;
  }

  return ensureSpace(userId, suggestedSpace || "General");
}

export async function fetchRecentMemories({
  userId,
  spaceId,
  limit = 30,
}: {
  userId: string;
  spaceId?: string | null;
  limit?: number;
}) {
  let query = supabase
    .from("memories")
    .select(MEMORY_SELECT)
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (spaceId) {
    query = query.eq("space_id", spaceId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map(toMemoryMatch).filter(Boolean) as MemoryMatch[];
}

function scoreTextOverlap(inputText: string, memory: MemoryMatch) {
  const words = new Set(
    inputText
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 3)
  );

  if (words.size === 0) return 0;

  const memoryText = `${memory.title} ${memory.topic ?? ""} ${memory.tags.join(
    " "
  )} ${memory.body}`.toLowerCase();
  let matches = 0;
  for (const word of words) {
    if (memoryText.includes(word)) matches += 1;
  }
  return matches / words.size;
}

export async function searchRelatedMemories({
  inputText,
  userId,
  spaceId,
  embedding,
  threshold = 0.45,
  count = 10,
}: {
  inputText: string;
  userId: string;
  spaceId?: string | null;
  embedding?: number[] | null;
  threshold?: number;
  count?: number;
}) {
  const related: MemoryMatch[] = [];
  let queryEmbedding = embedding ?? null;

  try {
    queryEmbedding = queryEmbedding ?? (await embedText(inputText));
  } catch (error) {
    console.error("Embedding search skipped:", error);
  }

  if (queryEmbedding) {
    const { data, error } = await supabase.rpc("match_memories_v2", {
      query_embedding: queryEmbedding,
      match_threshold: threshold,
      match_count: count,
      filter_user_id: userId,
      filter_space_id: spaceId ?? null,
    });

    if (error) {
      console.error("match_memories_v2 failed, trying legacy RPC:", error);
      const { data: legacyData, error: legacyError } = await supabase.rpc(
        "match_memories",
        {
          query_embedding: queryEmbedding,
          match_threshold: threshold,
          match_count: count,
        }
      );

      if (legacyError) {
        console.error("Legacy match_memories failed:", legacyError);
      } else {
        related.push(
          ...toMemoryMatches(legacyData)
            .filter(
              (memory): memory is MemoryMatch =>
                memory.user_id === userId &&
                (!spaceId || memory.space_id === spaceId)
            )
        );
      }
    } else {
      related.push(...toMemoryMatches(data));
    }

    if (spaceId && related.length < Math.min(4, count)) {
      const { data: globalData, error: globalError } = await supabase.rpc(
        "match_memories_v2",
        {
          query_embedding: queryEmbedding,
          match_threshold: threshold,
          match_count: count,
          filter_user_id: userId,
          filter_space_id: null,
        }
      );

      if (!globalError) {
        related.push(...toMemoryMatches(globalData));
      }
    }
  }

  if (related.length === 0) {
    const recent = await fetchRecentMemories({ userId, spaceId, limit: 40 });
    related.push(
      ...recent
        .map((memory) => ({
          ...memory,
          similarity: scoreTextOverlap(inputText, memory),
        }))
        .filter((memory) => (memory.similarity ?? 0) > 0)
        .sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))
        .slice(0, count)
    );
  }

  return uniqueMemories(related).slice(0, count);
}

export async function analyzeMemory({
  body,
  relatedMemories,
  selectedSpaceName,
  source,
}: {
  body: string;
  relatedMemories: MemoryMatch[];
  selectedSpaceName?: string | null;
  source: "user" | "gemini";
}) {
  const prompt = `Analyze this new memory for a personal learning system.

New memory:
${body}

Selected space: ${selectedSpaceName ?? "none"}

Related saved memories:
${formatMemoryContext(relatedMemories, 5) || "None"}

Return strict JSON only with this shape:
{
  "title": "short title",
  "summary": "one sentence",
  "memoryType": "concept|fact|note|question|example|procedure",
  "primaryTopic": "primary topic",
  "tags": ["tag-one", "tag-two"],
  "suggestedSpace": "General|AI|Coding|Career|Personal|other concise space",
  "relatedTopics": ["topic"],
  "confidenceSeed": 50
}`;

  try {
    const raw = await generateSummary(prompt);
    const parsed = extractJsonObject<Partial<MemoryAnalysis>>(raw);
    return sanitizeMemoryAnalysis(parsed, body, source, selectedSpaceName);
  } catch (error) {
    console.error("Memory analysis failed, using safe defaults:", error);
    return sanitizeMemoryAnalysis(null, body, source, selectedSpaceName);
  }
}

function sanitizeRelationType(value: string): MemoryRelationType | null {
  const normalized = value.trim().toLowerCase().replace(/-/g, "_");
  if (normalized === "exact_duplicate") return "duplicate_of";
  const allowed: MemoryRelationType[] = [
    "related_to",
    "duplicate_of",
    "near_duplicate",
    "adds_detail",
    "contradicts",
    "depends_on",
    "example_of",
    "part_of",
  ];
  return allowed.includes(normalized as MemoryRelationType)
    ? (normalized as MemoryRelationType)
    : null;
}

function deterministicRelations(
  body: string,
  relatedMemories: MemoryMatch[]
): MemoryRelationSuggestion[] {
  const normalizedBody = body.toLowerCase().replace(/\s+/g, " ").trim();

  const exactDuplicateRelations = relatedMemories
    .filter(
      (memory) =>
        memory.body.toLowerCase().replace(/\s+/g, " ").trim() === normalizedBody
    )
    .slice(0, 3)
    .map((memory) => ({
      targetMemoryId: memory.id,
      relationType: "duplicate_of" as const,
      strength: 1,
      reason: "The new memory has the same wording as this saved memory.",
    }));

  const contradictionRelations = relatedMemories
    .filter(
      (memory) =>
        memory.body.toLowerCase().replace(/\s+/g, " ").trim() !==
          normalizedBody && looksLikeNegationConflict(body, memory.body)
    )
    .slice(0, 3)
    .map((memory) => ({
      targetMemoryId: memory.id,
      relationType: "contradicts" as const,
      strength: 0.84,
      reason:
        "One memory negates a claim that the related memory states positively.",
    }));

  return [...exactDuplicateRelations, ...contradictionRelations];
}

function looksLikeNegationConflict(left: string, right: string) {
  const leftLower = left.toLowerCase();
  const rightLower = right.toLowerCase();
  const leftNegated = hasNegation(leftLower);
  const rightNegated = hasNegation(rightLower);

  if (leftNegated === rightNegated) return false;

  const leftTerms = importantTerms(leftLower);
  const rightTerms = importantTerms(rightLower);
  const overlap = leftTerms.filter((term) => rightTerms.includes(term));

  return overlap.length >= 3 || (leftTerms.includes("rag") && rightTerms.includes("rag"));
}

function hasNegation(text: string) {
  return /\b(no|not|never|doesn't|does not|do not|isn't|is not|cannot|can't)\b/.test(
    text
  );
}

function importantTerms(text: string) {
  const stopWords = new Set([
    "remember",
    "that",
    "this",
    "with",
    "from",
    "before",
    "after",
    "does",
    "not",
    "use",
    "uses",
    "using",
    "the",
    "and",
    "for",
    "generation",
  ]);

  return Array.from(
    new Set(
      text
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((term) => term.length >= 3 && !stopWords.has(term))
    )
  );
}

export async function detectMemoryRelations({
  body,
  relatedMemories,
}: {
  body: string;
  relatedMemories: MemoryMatch[];
}) {
  const exactRelations = deterministicRelations(body, relatedMemories);

  if (relatedMemories.length === 0) {
    return { relations: exactRelations, needsReview: exactRelations.length > 0 };
  }

  const prompt = `Compare the new memory with the related saved memories.

New memory:
${body}

Related saved memories:
${formatMemoryContext(relatedMemories, 8)}

Return strict JSON only:
{
  "relations": [
    {
      "targetMemoryId": "uuid from related memories",
      "relationType": "related_to|duplicate_of|near_duplicate|adds_detail|contradicts|depends_on|example_of|part_of",
      "strength": 0.82,
      "reason": "brief reason"
    }
  ],
  "needsReview": true
}

Only include meaningful relations. Mark needsReview true for duplicate_of, near_duplicate, or contradicts.`;

  try {
    const raw = await generateSummary(prompt);
    const parsed = extractJsonObject<{
      relations?: unknown[];
      needsReview?: unknown;
    }>(raw);
    const relatedIds = new Set(relatedMemories.map((memory) => memory.id));
    const aiRelations = safeJsonArray<Record<string, unknown>>(parsed?.relations)
      .map((relation) => {
        const targetMemoryId = getString(relation.targetMemoryId);
        const relationType = sanitizeRelationType(getString(relation.relationType));
        if (!targetMemoryId || !relatedIds.has(targetMemoryId) || !relationType) {
          return null;
        }

        return {
          targetMemoryId,
          relationType,
          strength: Math.max(0, Math.min(1, getNumber(relation.strength, 0.5))),
          reason: getString(relation.reason, "Related memory detected."),
        };
      })
      .filter(Boolean) as MemoryRelationSuggestion[];

    const relations = uniqueRelationSuggestions([...exactRelations, ...aiRelations]);
    const needsReview =
      getBoolean(parsed?.needsReview, false) ||
      relations.some((relation) =>
        ["duplicate_of", "near_duplicate", "contradicts"].includes(
          relation.relationType
        )
      );

    return { relations, needsReview };
  } catch (error) {
    console.error("Relation detection failed, using deterministic relations:", error);
    return { relations: exactRelations, needsReview: exactRelations.length > 0 };
  }
}

function uniqueRelationSuggestions(relations: MemoryRelationSuggestion[]) {
  const seen = new Map<string, MemoryRelationSuggestion>();
  for (const relation of relations) {
    const key = `${relation.targetMemoryId}:${relation.relationType}`;
    if (!seen.has(key)) seen.set(key, relation);
  }
  return Array.from(seen.values()).slice(0, 8);
}

async function ensureTopic({
  userId,
  spaceId,
  name,
}: {
  userId: string;
  spaceId?: string | null;
  name: string;
}) {
  const displayName = toDisplayTopicName(name);
  const normalizedName = normalizeTopicName(displayName);

  const { data: existing, error: existingError } = await supabase
    .from("memory_topics")
    .select("id, user_id, space_id, name, normalized_name")
    .eq("user_id", userId)
    .eq("normalized_name", normalizedName)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing as { id: string; name: string };

  const { data, error } = await supabase
    .from("memory_topics")
    .insert([
      {
        user_id: userId,
        space_id: spaceId ?? null,
        name: displayName,
        normalized_name: normalizedName,
      },
    ])
    .select("id, name")
    .single();

  if (error) throw error;
  return data as { id: string; name: string };
}

async function saveTopicLinks({
  userId,
  memoryId,
  spaceId,
  analysis,
}: {
  userId: string;
  memoryId: string;
  spaceId?: string | null;
  analysis: MemoryAnalysis;
}) {
  const topics = [
    { name: analysis.primaryTopic, relation: "primary" },
    ...analysis.relatedTopics.map((name) => ({ name, relation: "related" })),
  ];

  for (const topic of topics) {
    try {
      const topicRecord = await ensureTopic({ userId, spaceId, name: topic.name });
      await supabase.from("memory_topic_links").upsert(
        [
          {
            memory_id: memoryId,
            topic_id: topicRecord.id,
            relation: topic.relation,
          },
        ],
        { onConflict: "memory_id,topic_id" }
      );
    } catch (error) {
      console.error("Topic link save failed:", error);
    }
  }
}

async function saveMemoryEvent({
  userId,
  memoryId,
  eventType,
  metadata,
}: {
  userId: string;
  memoryId?: string | null;
  eventType: string;
  metadata: Record<string, unknown>;
}) {
  const { error } = await supabase.from("memory_events").insert([
    {
      user_id: userId,
      memory_id: memoryId ?? null,
      event_type: eventType,
      metadata,
    },
  ]);

  if (error) {
    console.error("Memory event save failed:", error);
  }
}

async function saveRelationRows({
  userId,
  sourceMemoryId,
  relations,
}: {
  userId: string;
  sourceMemoryId: string;
  relations: MemoryRelationSuggestion[];
}) {
  if (relations.length === 0) return 0;

  const { data, error } = await supabase
    .from("memory_relations")
    .insert(
      relations.map((relation) => ({
        user_id: userId,
        source_memory_id: sourceMemoryId,
        target_memory_id: relation.targetMemoryId,
        relation_type: relation.relationType,
        strength: relation.strength,
        reason: relation.reason,
      }))
    )
    .select("id");

  if (error) {
    console.error("Relation rows save failed:", error);
    return 0;
  }

  return data?.length ?? 0;
}

export async function saveMemoryWithIntelligence({
  userId,
  title,
  body,
  memoryType,
  source,
  spaceId,
  embedding,
}: SaveMemoryWithIntelligenceOptions): Promise<SaveMemoryWithIntelligenceResult> {
  const memoryEmbedding = embedding ?? (await embedText(body).catch(() => null));
  const relatedMemories = await searchRelatedMemories({
    inputText: body,
    userId,
    spaceId,
    embedding: memoryEmbedding,
    count: 10,
  }).catch((error) => {
    console.error("Related memory search failed:", error);
    return [] as MemoryMatch[];
  });

  const selectedSpace = spaceId
    ? (await getSpaces(userId)).find((space) => space.id === spaceId)
    : null;
  const analysis = await analyzeMemory({
    body,
    relatedMemories,
    selectedSpaceName: selectedSpace?.name ?? null,
    source,
  });
  const resolvedSpace = await resolveSpace({
    userId,
    selectedSpaceId: spaceId,
    suggestedSpace: analysis.suggestedSpace,
  });
  const relationAnalysis = await detectMemoryRelations({ body, relatedMemories });
  const needsReview = relationAnalysis.needsReview;
  const confidenceScore = clampConfidence(
    needsReview ? Math.min(analysis.confidenceSeed, 40) : analysis.confidenceSeed
  );
  const confidenceStatus = getInitialConfidenceStatus({
    confidenceScore,
    needsReview,
  });
  const reviewDueAt = new Date();
  reviewDueAt.setUTCDate(reviewDueAt.getUTCDate() + (needsReview ? 1 : 7));

  const { data: memory, error: memoryError } = await supabase
    .from("memories")
    .insert([
      {
        user_id: userId,
        title: truncateTitle(title || analysis.title),
        body,
        user_phrasing: source === "user" ? body : null,
        memory_type: memoryType || analysis.memoryType,
        tags: analysis.tags,
        source,
        space_id: resolvedSpace.id,
        topic: analysis.primaryTopic,
        confidence_score: confidenceScore,
        confidence_status: confidenceStatus,
        review_due_at: reviewDueAt.toISOString(),
        needs_review: needsReview,
      },
    ])
    .select("id")
    .single();

  if (memoryError) {
    return {
      saved: false,
      memorySaved: false,
      saveError: memoryError.message,
    };
  }

  const memoryId = String(memory.id);
  let saved = true;
  let saveError: string | undefined;

  if (memoryEmbedding) {
    const { error: vectorError } = await supabase
      .from("memory_vectors")
      .insert([{ memory_id: memoryId, embedding: memoryEmbedding }]);

    if (vectorError) {
      saved = false;
      saveError = `Memory saved, but vector indexing failed: ${vectorError.message}`;
    }
  } else {
    saved = false;
    saveError = "Memory saved, but embedding generation failed.";
  }

  await saveTopicLinks({
    userId,
    memoryId,
    spaceId: resolvedSpace.id,
    analysis,
  });
  const relationsCreated = await saveRelationRows({
    userId,
    sourceMemoryId: memoryId,
    relations: relationAnalysis.relations,
  });
  await saveMemoryEvent({
    userId,
    memoryId,
    eventType: source === "gemini" ? "generated_memory_saved" : "memory_saved",
    metadata: {
      topic: analysis.primaryTopic,
      tags: analysis.tags,
      spaceId: resolvedSpace.id,
      needsReview,
      relationsCreated,
      source,
    },
  });

  return {
    saved,
    memorySaved: true,
    memoryId,
    saveError,
    spaceId: resolvedSpace.id,
    spaceName: resolvedSpace.name,
    topic: analysis.primaryTopic,
    tags: analysis.tags,
    confidenceScore,
    confidenceStatus,
    needsReview,
    relationTypes: relationAnalysis.relations.map((relation) => relation.relationType),
    relationsCreated,
    relatedCount: relatedMemories.length,
  };
}

export async function fetchMemoriesForTopic({
  userId,
  topic,
  spaceId,
  limit = 40,
}: {
  userId: string;
  topic: string;
  spaceId?: string | null;
  limit?: number;
}) {
  const topicKey = normalizeTopicName(topic);
  const topicWords = topicKey.split("-").filter((word) => word.length > 2);
  const recent = await fetchRecentMemories({ userId, spaceId, limit: 120 });

  return recent
    .filter((memory) => {
      const haystack = normalizeTopicName(
        `${memory.title} ${memory.topic ?? ""} ${memory.tags.join(" ")} ${memory.body}`
      );
      return (
        haystack.includes(topicKey) ||
        topicWords.some((word) => haystack.includes(word))
      );
    })
    .slice(0, limit);
}

function fallbackKnowledgeGap(
  topic: string,
  relatedMemories: MemoryMatch[]
): KnowledgeGapResult {
  if (relatedMemories.length === 0) {
    return {
      status: "unknown",
      knownPoints: [],
      missingPoints: [
        `Basic definition of ${topic}`,
        "Core ideas",
        "Practical examples",
      ],
      relatedMemories,
      suggestedNextSteps: [`Save one simple note about ${topic}`],
    };
  }

  const averageConfidence =
    relatedMemories.reduce((sum, memory) => sum + memory.confidence_score, 0) /
    relatedMemories.length;
  const status: KnowledgeStatus =
    relatedMemories.length >= 3 && averageConfidence >= 60 ? "known" : "partial";

  return {
    status,
    knownPoints: relatedMemories
      .slice(0, 5)
      .map((memory) => memory.title || truncateTitle(memory.body, 80)),
    missingPoints:
      status === "known"
        ? []
        : ["Deeper examples", "Edge cases", "Ways to explain it from memory"],
    relatedMemories,
    suggestedNextSteps:
      status === "known"
        ? [`Review your strongest ${topic} memories once this week`]
        : [`Add a concrete example for ${topic}`, "Try a quick self-quiz"],
  };
}

export async function detectKnowledgeGap({
  userId,
  topic,
  spaceId,
}: {
  userId: string;
  topic: string;
  spaceId?: string | null;
}): Promise<KnowledgeGapResult> {
  const [topicMatches, vectorMatches] = await Promise.all([
    fetchMemoriesForTopic({ userId, topic, spaceId }).catch(() => []),
    searchRelatedMemories({
      inputText: topic,
      userId,
      spaceId,
      threshold: 0.4,
      count: 12,
    }).catch(() => []),
  ]);
  const topicMatchIds = new Set(topicMatches.map((memory) => memory.id));
  const filteredVectorMatches = vectorMatches.filter(
    (memory) =>
      topicMatchIds.has(memory.id) ||
      memoryMatchesTopic(memory, topic) ||
      (memory.similarity ?? 0) >= 0.75
  );
  const relatedMemories = uniqueMemories([
    ...topicMatches,
    ...filteredVectorMatches,
  ]);

  if (relatedMemories.length === 0) {
    return fallbackKnowledgeGap(topic, []);
  }

  const prompt = `You are checking what the user knows from their saved memory base.

Topic: ${topic}

Saved memories:
${formatMemoryContext(relatedMemories, 10)}

Return strict JSON only:
{
  "status": "known|partial|unknown",
  "knownPoints": ["point from saved memories"],
  "missingPoints": ["important gap"],
  "suggestedNextSteps": ["next step"]
}

Use "known" only when the saved memories cover the topic well. Use "partial" when there is related knowledge but clear gaps. Use "unknown" when the saved memories do not really cover the topic.`;

  try {
    const raw = await generateSummary(prompt);
    const parsed = extractJsonObject<{
      status?: unknown;
      knownPoints?: unknown;
      missingPoints?: unknown;
      suggestedNextSteps?: unknown;
    }>(raw);
    const status = getString(parsed?.status).toLowerCase();

    if (!["known", "partial", "unknown"].includes(status)) {
      return fallbackKnowledgeGap(topic, relatedMemories);
    }

    return {
      status: status as KnowledgeStatus,
      knownPoints: getStringArray(parsed?.knownPoints).slice(0, 8),
      missingPoints: getStringArray(parsed?.missingPoints).slice(0, 8),
      suggestedNextSteps: getStringArray(parsed?.suggestedNextSteps).slice(0, 6),
      relatedMemories,
    };
  } catch (error) {
    console.error("Knowledge gap prompt failed:", error);
    return fallbackKnowledgeGap(topic, relatedMemories);
  }
}

function memoryMatchesTopic(memory: MemoryMatch, topic: string) {
  const topicKey = normalizeTopicName(topic);
  const topicWords = topicKey.split("-").filter((word) => word.length > 2);
  const haystack = normalizeTopicName(
    `${memory.title} ${memory.topic ?? ""} ${memory.tags.join(" ")} ${memory.body}`
  );

  return (
    haystack.includes(topicKey) ||
    topicWords.some((word) => haystack.includes(word))
  );
}

export function formatKnowledgeGapResponse({
  topic,
  gap,
  newLesson,
}: {
  topic: string;
  gap: KnowledgeGapResult;
  newLesson?: string | null;
}) {
  const statusText =
    gap.status === "known"
      ? `You know ${topic}.`
      : gap.status === "partial"
        ? `You partially know ${topic}.`
        : `You do not know ${topic} yet.`;
  const sections = [statusText];

  if (gap.knownPoints.length > 0) {
    sections.push(
      `What your brain already has:\n${gap.knownPoints.map((point) => `- ${point}`).join("\n")}`
    );
  }

  if (gap.missingPoints.length > 0) {
    sections.push(
      `Gaps to fill:\n${gap.missingPoints.map((point) => `- ${point}`).join("\n")}`
    );
  }

  if (newLesson) {
    sections.push(`Fresh learning to add:\n${newLesson}`);
  }

  if (gap.suggestedNextSteps.length > 0) {
    sections.push(
      `Next steps:\n${gap.suggestedNextSteps.map((step) => `- ${step}`).join("\n")}`
    );
  }

  return sections.join("\n\n");
}

export async function buildTeachModeResponse({
  userId,
  topic,
  spaceId,
}: {
  userId: string;
  topic: string;
  spaceId?: string | null;
}): Promise<TeachModeResult> {
  const gap = await detectKnowledgeGap({ userId, topic, spaceId });
  const prompt = `Teach the user about this topic using their saved memories first.

Topic: ${topic}
Knowledge status: ${gap.status}

Saved memories:
${formatMemoryContext(gap.relatedMemories, 10) || "None"}

Known points:
${gap.knownPoints.map((point) => `- ${point}`).join("\n") || "None"}

Missing points:
${gap.missingPoints.map((point) => `- ${point}`).join("\n") || "None"}

Return strict JSON only:
{
  "knownFromYourBrain": ["saved-memory point"],
  "gaps": ["gap"],
  "lesson": "short lesson that clearly separates saved knowledge from new explanation",
  "examples": ["example"],
  "quiz": [
    { "question": "quiz question", "expectedAnswer": "expected answer" }
  ],
  "memoryToSave": "optional concise generated learning memory"
}`;

  try {
    const raw = await generateSummary(prompt);
    const parsed = extractJsonObject<{
      knownFromYourBrain?: unknown;
      gaps?: unknown;
      lesson?: unknown;
      examples?: unknown;
      quiz?: unknown;
      memoryToSave?: unknown;
    }>(raw);
    const quiz = safeJsonArray<Record<string, unknown>>(parsed?.quiz)
      .map((item) => ({
        question: getString(item.question),
        expectedAnswer: getString(item.expectedAnswer),
      }))
      .filter((item) => item.question && item.expectedAnswer)
      .slice(0, 3);
    const result = {
      topic,
      knownFromYourBrain:
        getStringArray(parsed?.knownFromYourBrain).slice(0, 8) || gap.knownPoints,
      gaps: getStringArray(parsed?.gaps).slice(0, 8) || gap.missingPoints,
      lesson: getString(parsed?.lesson),
      examples: getStringArray(parsed?.examples).slice(0, 5),
      quiz:
        quiz.length > 0
          ? quiz
          : [
              {
                question: `What is one key idea about ${topic}?`,
                expectedAnswer: "Answer using the lesson above.",
              },
            ],
      memoryToSave: getOptionalString(parsed?.memoryToSave),
      knowledgeStatus: gap.status,
      relatedMemories: gap.relatedMemories,
    };

    const response = formatTeachResponse(result);
    return { ...result, response };
  } catch (error) {
    console.error("Teach mode prompt failed, falling back:", error);
    const lesson = await generateWithWebSearch(
      `Teach ${topic} simply with examples and a short quiz.`
    );
    const result = {
      topic,
      knownFromYourBrain: gap.knownPoints,
      gaps: gap.missingPoints,
      lesson,
      examples: [],
      quiz: [
        {
          question: `How would you explain ${topic} in one sentence?`,
          expectedAnswer: "Use the main lesson in your own words.",
        },
      ],
      memoryToSave: gap.status === "known" ? null : lesson,
      knowledgeStatus: gap.status,
      relatedMemories: gap.relatedMemories,
    };
    return { ...result, response: formatTeachResponse(result) };
  }
}

function formatTeachResponse(result: Omit<TeachModeResult, "response">) {
  const known =
    result.knownFromYourBrain.length > 0
      ? result.knownFromYourBrain.map((point) => `- ${point}`).join("\n")
      : "- I do not have saved memories for this topic yet.";
  const gaps =
    result.gaps.length > 0
      ? result.gaps.map((gap) => `- ${gap}`).join("\n")
      : "- No major gaps detected from the saved memories.";
  const examples =
    result.examples.length > 0
      ? result.examples.map((example) => `- ${example}`).join("\n")
      : "- Try making one example from your own work or notes.";
  const quiz = result.quiz
    .map(
      (item, index) =>
        `${index + 1}. ${item.question}\n   Expected answer: ${item.expectedAnswer}`
    )
    .join("\n");

  return [
    `Teach mode: ${result.topic}`,
    `What your brain already knows:\n${known}`,
    `Missing pieces:\n${gaps}`,
    `Simple lesson:\n${result.lesson}`,
    `Examples:\n${examples}`,
    `Quick quiz:\n${quiz}`,
    result.memoryToSave
      ? `Suggested memory update:\n${result.memoryToSave}`
      : "Suggested memory update:\nNo new memory needed right now.",
  ].join("\n\n");
}

export async function generateWeeklyLearningSummary({
  userId,
  spaceId,
  weekStart,
}: {
  userId: string;
  spaceId?: string | null;
  weekStart?: string | null;
}) {
  const resolvedWeekStart = weekStart || getWeekStartDate();
  const start = new Date(`${resolvedWeekStart}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);

  let memoryQuery = supabase
    .from("memories")
    .select(MEMORY_SELECT)
    .eq("user_id", userId)
    .is("archived_at", null)
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString())
    .order("created_at", { ascending: false })
    .limit(80);

  if (spaceId) memoryQuery = memoryQuery.eq("space_id", spaceId);

  const [{ data: memoryData, error: memoryError }, { data: relationData }] =
    await Promise.all([
      memoryQuery,
      supabase
        .from("memory_relations")
        .select("relation_type, reason, created_at")
        .eq("user_id", userId)
        .gte("created_at", start.toISOString())
        .lt("created_at", end.toISOString())
        .limit(40),
    ]);

  if (memoryError) throw memoryError;

  const memories = (memoryData ?? [])
    .map(toMemoryMatch)
    .filter(Boolean) as MemoryMatch[];
  const topTopics = countTopValues(memories.map((memory) => memory.topic ?? "General"));
  const weakTopics = countTopValues(
    memories
      .filter((memory) => memory.needs_review || memory.confidence_score < 50)
      .map((memory) => memory.topic ?? "General")
  );
  const relationRows = (relationData ?? []).filter(isRecord);
  const relationIssues = relationRows
    .filter((row) =>
      ["duplicate_of", "near_duplicate", "contradicts"].includes(
        getString(row.relation_type)
      )
    )
    .slice(0, 10);

  const fallbackSummary = buildComputedWeeklySummary({
    memories,
    topTopics,
    weakTopics,
    relationIssueCount: relationIssues.length,
    weekStart: resolvedWeekStart,
  });
  let summary = fallbackSummary;

  if (memories.length > 0) {
    const prompt = `Create a concise weekly learning summary for the user's memory system.

Week start: ${resolvedWeekStart}
Memories saved this week:
${formatMemoryContext(memories, 20)}

Top topics:
${topTopics.map((item) => `- ${item.label}: ${item.count}`).join("\n") || "None"}

Weak or review topics:
${weakTopics.map((item) => `- ${item.label}: ${item.count}`).join("\n") || "None"}

Duplicate or contradiction issues found: ${relationIssues.length}

Write markdown with these sections:
- What you learned
- Topics growing
- Needs review
- Suggested next steps`;

    summary = await generateSummary(prompt).catch((error) => {
      console.error("Weekly summary prompt failed:", error);
      return fallbackSummary;
    });
  }

  await saveWeeklySummary({
    userId,
    spaceId,
    weekStart: resolvedWeekStart,
    summary,
    metadata: {
      memoryCount: memories.length,
      topTopics,
      weakTopics,
      relationIssueCount: relationIssues.length,
    },
  });

  return {
    weekStart: resolvedWeekStart,
    summary,
    memoryCount: memories.length,
    topTopics,
    weakTopics,
    relationIssueCount: relationIssues.length,
  };
}

function countTopValues(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) {
    const label = toDisplayTopicName(value || "General");
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 6);
}

function buildComputedWeeklySummary({
  memories,
  topTopics,
  weakTopics,
  relationIssueCount,
  weekStart,
}: {
  memories: MemoryMatch[];
  topTopics: Array<{ label: string; count: number }>;
  weakTopics: Array<{ label: string; count: number }>;
  relationIssueCount: number;
  weekStart: string;
}) {
  if (memories.length === 0) {
    return `Weekly summary for ${weekStart}\n\nNo new memories were saved this week yet.\n\nSuggested next steps:\n- Save one thing you learned today.\n- Ask "Teach me from my brain" for a topic you want to review.`;
  }

  return [
    `Weekly summary for ${weekStart}`,
    `New memories:\n${memories
      .slice(0, 8)
      .map((memory) => `- ${memory.title}`)
      .join("\n")}`,
    `Topics growing:\n${
      topTopics.map((topic) => `- ${topic.label}: ${topic.count}`).join("\n") ||
      "- General"
    }`,
    `Needs review:\n${
      weakTopics.map((topic) => `- ${topic.label}: ${topic.count}`).join("\n") ||
      "- Nothing urgent"
    }`,
    `Duplicate or contradiction flags: ${relationIssueCount}`,
    "Suggested next steps:\n- Review weak topics.\n- Add examples to your newest concepts.",
  ].join("\n\n");
}

async function saveWeeklySummary({
  userId,
  spaceId,
  weekStart,
  summary,
  metadata,
}: {
  userId: string;
  spaceId?: string | null;
  weekStart: string;
  summary: string;
  metadata: Record<string, unknown>;
}) {
  let existingQuery = supabase
    .from("weekly_summaries")
    .select("id")
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .limit(1);

  existingQuery = spaceId ? existingQuery.eq("space_id", spaceId) : existingQuery.is("space_id", null);

  const { data: existing } = await existingQuery.maybeSingle();

  if (existing?.id) {
    await supabase
      .from("weekly_summaries")
      .update({ summary, metadata })
      .eq("id", existing.id);
    return;
  }

  await supabase.from("weekly_summaries").insert([
    {
      user_id: userId,
      space_id: spaceId ?? null,
      week_start: weekStart,
      summary,
      metadata,
    },
  ]);
}

export async function createGeneratedLearningMemory({
  userId,
  topic,
  body,
  spaceId,
}: {
  userId: string;
  topic: string;
  body: string;
  spaceId?: string | null;
}) {
  return saveMemoryWithIntelligence({
    userId,
    title: `Learning: ${topic}`,
    body,
    memoryType: "question",
    source: "gemini",
    spaceId,
  });
}
