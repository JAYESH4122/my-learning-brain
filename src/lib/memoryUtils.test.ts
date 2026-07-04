import { describe, expect, it } from "vitest";
import {
  detectHeuristicIntent,
  extractJsonObject,
  computeReviewedConfidence,
  getWeekStartDate,
  isWeeklySummaryCommand,
  normalizeTags,
  normalizeTopicName,
  parseKnowledgeTopic,
  parseTeachTopic,
  toDisplayTopicName,
} from "./memoryUtils";

describe("memoryUtils", () => {
  it("normalizes topic names into stable keys", () => {
    expect(normalizeTopicName("Vector Search & Embeddings")).toBe(
      "vector-search-and-embeddings"
    );
    expect(toDisplayTopicName("rag evaluation")).toBe("RAG Evaluation");
  });

  it("normalizes tags and removes duplicates", () => {
    expect(
      normalizeTags(["Vector Search", "vector-search", "RAG!", "a", "API"])
    ).toEqual(["vector-search", "rag", "api"]);
  });

  it("extracts strict or fenced JSON", () => {
    expect(extractJsonObject<{ status: string }>('{"status":"known"}')).toEqual({
      status: "known",
    });
    expect(
      extractJsonObject<{ status: string }>(
        '```json\n{"status":"partial"}\n```'
      )
    ).toEqual({ status: "partial" });
  });

  it("parses knowledge and teach commands", () => {
    expect(parseKnowledgeTopic("Do I know about RAG?")).toBe("RAG");
    expect(parseKnowledgeTopic("What are my gaps in embeddings?")).toBe(
      "embeddings"
    );
    expect(parseTeachTopic("Teach me from my brain: Supabase")).toBe("Supabase");
  });

  it("detects coaching and save-oriented intents", () => {
    expect(detectHeuristicIntent("ok bro what should i learn now")).toBe(
      "coaching"
    );
    expect(detectHeuristicIntent("what should i focus on next")).toBe(
      "coaching"
    );
    expect(detectHeuristicIntent("Do I know about embeddings?")).toBe("recall");
    expect(detectHeuristicIntent("I learned that vector search improves recall")).toBe(
      "save"
    );
    expect(detectHeuristicIntent("thanks")).toBe("acknowledgement");
  });

  it("detects weekly summary commands", () => {
    expect(isWeeklySummaryCommand("weekly summary")).toBe(true);
    expect(isWeeklySummaryCommand("show my weekly learning summary")).toBe(true);
    expect(isWeeklySummaryCommand("what is RAG?")).toBe(false);
  });

  it("uses Monday as the weekly summary start", () => {
    expect(getWeekStartDate(new Date("2026-06-23T10:00:00Z"))).toBe(
      "2026-06-22"
    );
    expect(getWeekStartDate(new Date("2026-06-28T10:00:00Z"))).toBe(
      "2026-06-22"
    );
  });

  it("computes review confidence changes", () => {
    expect(
      computeReviewedConfidence({ currentScore: 50, outcome: "remembered" })
    ).toMatchObject({
      confidenceScore: 65,
      confidenceStatus: "learning",
      needsReview: false,
    });
    expect(
      computeReviewedConfidence({ currentScore: 50, outcome: "needs_practice" })
    ).toMatchObject({
      confidenceScore: 35,
      confidenceStatus: "needs_review",
      needsReview: true,
    });
    expect(
      computeReviewedConfidence({ currentScore: 70, outcome: "mastered" })
    ).toMatchObject({
      confidenceScore: 95,
      confidenceStatus: "mastered",
      needsReview: false,
    });
  });
});
