export const DEFAULT_SPACE_NAMES = [
  "General",
  "AI",
  "Coding",
  "Career",
  "Personal",
] as const;

export type ConfidenceStatus =
  | "new"
  | "learning"
  | "needs_review"
  | "strong"
  | "mastered";

export type KnowledgeStatus = "known" | "partial" | "unknown";

export type ReviewOutcome =
  | "remembered"
  | "needs_practice"
  | "resolved"
  | "mastered";

export function truncateTitle(title: string, maxLength = 60) {
  const cleaned = title.replace(/\s+/g, " ").trim();
  if (!cleaned) return "Untitled memory";
  return cleaned.length > maxLength
    ? `${cleaned.slice(0, maxLength - 3)}...`
    : cleaned;
}

export function normalizeTopicName(topic: string) {
  return topic
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "-");
}

export function toDisplayTopicName(topic: string) {
  const normalized = topic
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return "General";

  return normalized
    .split(" ")
    .map((part) => {
      const lower = part.toLowerCase();
      if (["ai", "rag", "api", "ui", "ux", "sql"].includes(lower)) {
        return lower.toUpperCase();
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

export function normalizeTags(tags: string[]) {
  const normalized = tags
    .map((tag) =>
      tag
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
    )
    .filter((tag) => tag.length >= 2 && tag.length <= 40);

  return Array.from(new Set(normalized)).slice(0, 10);
}

export function extractJsonObject<T>(rawText: string): T | null {
  const trimmed = rawText
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;

    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as T;
    } catch {
      return null;
    }
  }
}

export function clampConfidence(score: number) {
  if (!Number.isFinite(score)) return 50;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function getInitialConfidenceStatus({
  confidenceScore,
  needsReview,
}: {
  confidenceScore: number;
  needsReview: boolean;
}): ConfidenceStatus {
  if (needsReview) return "needs_review";
  if (confidenceScore >= 85) return "strong";
  if (confidenceScore >= 65) return "learning";
  return "new";
}

export function getConfidenceStatus(score: number, needsReview = false) {
  const confidenceScore = clampConfidence(score);
  if (needsReview) return "needs_review";
  if (confidenceScore >= 92) return "mastered";
  if (confidenceScore >= 80) return "strong";
  if (confidenceScore >= 55) return "learning";
  return "new";
}

export function computeReviewedConfidence({
  currentScore,
  outcome,
}: {
  currentScore: number;
  outcome: ReviewOutcome;
}) {
  if (outcome === "mastered") {
    return {
      confidenceScore: 95,
      confidenceStatus: "mastered" as ConfidenceStatus,
      needsReview: false,
      reviewDueDays: 60,
    };
  }

  if (outcome === "remembered") {
    const confidenceScore = clampConfidence(currentScore + 15);
    return {
      confidenceScore,
      confidenceStatus: getConfidenceStatus(confidenceScore),
      needsReview: false,
      reviewDueDays: confidenceScore >= 80 ? 30 : 14,
    };
  }

  if (outcome === "resolved") {
    const confidenceScore = clampConfidence(Math.max(currentScore, 60));
    return {
      confidenceScore,
      confidenceStatus: getConfidenceStatus(confidenceScore),
      needsReview: false,
      reviewDueDays: 14,
    };
  }

  const confidenceScore = clampConfidence(currentScore - 15);
  return {
    confidenceScore,
    confidenceStatus: "needs_review" as ConfidenceStatus,
    needsReview: true,
    reviewDueDays: 1,
  };
}

export function inferSpaceName(text: string) {
  const lower = text.toLowerCase();

  if (
    /\b(ai|rag|llm|embedding|embeddings|vector|machine learning|model|prompt)\b/.test(
      lower
    )
  ) {
    return "AI";
  }

  if (
    /\b(code|coding|typescript|javascript|react|next\.?js|supabase|sql|api|bug|debug)\b/.test(
      lower
    )
  ) {
    return "Coding";
  }

  if (/\b(career|interview|resume|job|manager|work)\b/.test(lower)) {
    return "Career";
  }

  if (/\b(personal|habit|health|family|home|goal)\b/.test(lower)) {
    return "Personal";
  }

  return "General";
}

export function inferTopicFromText(text: string) {
  const compact = text
    .replace(/^remember\s*:?/i, "")
    .replace(/^i learned that\s+/i, "")
    .trim();

  const aboutMatch = compact.match(/\b(?:about|on|for)\s+([a-z0-9][a-z0-9\s-]{1,40})/i);
  if (aboutMatch?.[1]) return toDisplayTopicName(aboutMatch[1]);

  const words = compact
    .replace(/[^a-z0-9\s-]/gi, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3)
    .slice(0, 3);

  return words.length > 0 ? toDisplayTopicName(words.join(" ")) : "General";
}

export function parseKnowledgeTopic(input: string) {
  const trimmed = input.trim();
  const patterns = [
    /^(?:do i know|do you know|do i understand|have i learned|have i learned about)\s+(?:about\s+)?(.+?)\??$/i,
    /^what are my gaps in\s+(.+?)\??$/i,
    /^what gaps do i have in\s+(.+?)\??$/i,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) return match[1].trim();
  }

  return null;
}

export function parseTeachTopic(input: string) {
  const trimmed = input.trim();
  const patterns = [
    /^teach me from my brain\s*:?\s*(.+)$/i,
    /^teach me what i know about\s+(.+)$/i,
    /^teach me from my saved notes about\s+(.+)$/i,
    /^teach me from my memories about\s+(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) return match[1].trim();
  }

  return null;
}

export function isWeeklySummaryCommand(input: string) {
  const lower = input.trim().toLowerCase();
  return (
    lower === "weekly summary" ||
    lower === "show my weekly learning summary" ||
    lower === "summarize what i learned this week" ||
    lower.includes("weekly learning summary")
  );
}

export function getWeekStartDate(date = new Date()) {
  const weekStart = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  const day = weekStart.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  weekStart.setUTCDate(weekStart.getUTCDate() + diff);
  return weekStart.toISOString().slice(0, 10);
}
