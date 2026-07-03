import { NextResponse } from "next/server";
import { saveChatTurn } from "@/src/lib/chatSessions";
import {
  buildTeachModeResponse,
  createGeneratedLearningMemory,
  detectKnowledgeGap,
  formatKnowledgeGapResponse,
  generateWeeklyLearningSummary,
  getSpaces,
  saveMemoryWithIntelligence,
  searchRelatedMemories,
  type MemoryMatch,
  type SaveMemoryWithIntelligenceResult,
} from "@/src/lib/memoryIntelligence";
import { generateSummary, generateWithWebSearch } from "@/src/lib/gemini";
import {
  isWeeklySummaryCommand,
  parseKnowledgeTopic,
  parseTeachTopic,
  truncateTitle,
} from "@/src/lib/memoryUtils";
import { getPublicErrorMessage, isSchemaMissingError } from "@/src/lib/apiErrors";

type BrainResponsePayload = Record<string, unknown>;

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

  if (typeof err === "string") return err;

  try {
    return JSON.stringify(err);
  } catch {
    return "Unknown error";
  }
}

function getAssistantContent(payload: BrainResponsePayload) {
  const responseFields = [
    payload.response,
    payload.answer,
    payload.message,
    payload.error,
  ];

  const responseText = responseFields.find(
    (field): field is string => typeof field === "string" && field.length > 0
  );

  return responseText ?? "I received your message. How can I help you further?";
}

async function createBrainResponse({
  payload,
  userId,
  inputText,
  sessionId,
}: {
  payload: BrainResponsePayload;
  userId: string;
  inputText: string;
  sessionId?: string | null;
}) {
  try {
    const chatSession = await saveChatTurn({
      userId,
      sessionId,
      userContent: inputText,
      assistantContent: getAssistantContent(payload),
    });

    return NextResponse.json({
      ...payload,
      sessionId: chatSession.sessionId,
      chatMessages: chatSession.messages,
      sessionSaved: true,
    });
  } catch (err: unknown) {
    const sessionError = getErrorMessage(err);
    console.error("Chat response was returned, but session save failed:", {
      sessionError,
      err,
    });

    return NextResponse.json({
      ...payload,
      sessionId,
      sessionSaved: false,
      sessionError,
    });
  }
}

function isFallbackQuestion(inputText: string) {
  const trimmedInput = inputText.trim().toLowerCase();
  return (
    trimmedInput.endsWith("?") ||
    /^(what|who|when|where|why|how|which|can|could|would|should|is|are|do|does|did|will|tell me|explain|describe|show me)/i.test(
      trimmedInput
    )
  );
}

async function classifyInput(inputText: string) {
  const classificationPrompt = `Analyze the following user input and determine if it is:
1. A QUESTION - the user is asking something, seeking information, or wants to know about something
2. A STATEMENT - the user is providing information, stating facts, or sharing knowledge to be stored

Examples of QUESTIONS:
- "what is photosynthesis"
- "tell me about dogs"
- "do I know about RAG?"
- "teach me from my brain: embeddings"

Examples of STATEMENTS:
- "my name is John"
- "I learned that photosynthesis converts light to energy"
- "RAG retrieves context before generation"

User input: "${inputText}"

Respond with ONLY one word: "question" or "statement".`;

  try {
    const classification = (await generateSummary(classificationPrompt))
      .trim()
      .toLowerCase();
    return classification.includes("question");
  } catch (classificationError) {
    console.error("Error classifying input:", classificationError);
    return isFallbackQuestion(inputText);
  }
}

function isVeryShortAcknowledgement(inputText: string, isQuestion: boolean) {
  const trimmedInput = inputText.trim().toLowerCase();
  return (
    !isQuestion &&
    (trimmedInput.length < 3 || /^(no|yes|ok|okay|sure|nope|yep)$/.test(trimmedInput))
  );
}

function answerWasNotInStoredInfo(answer: string) {
  const answerLower = answer.toLowerCase().trim();
  return (
    answerLower.includes("not_in_stored_info") ||
    answerLower.includes("don't have that information") ||
    answerLower.includes("does not contain the answer") ||
    answerLower.includes("not in your stored")
  );
}

function extractQuestionTopic(inputText: string) {
  const whatIsMatch = inputText.match(/\bwhat (?:is|are) (.+?)\??$/i);
  if (whatIsMatch?.[1]) return whatIsMatch[1].trim();

  const tellMeMatch = inputText.match(/\b(?:tell me about|explain|describe)\s+(.+?)\??$/i);
  if (tellMeMatch?.[1]) return tellMeMatch[1].trim();

  return truncateTitle(inputText, 48);
}

function createGeneratedMemoryBody(inputText: string, answer: string) {
  const topic = extractQuestionTopic(inputText);
  if (topic && topic.length < 80) {
    return {
      topic,
      body: `AI-generated learning about ${topic}:\n\n${answer}`,
    };
  }

  return {
    topic: truncateTitle(inputText, 48),
    body: `Q: ${inputText}\nA: ${answer}`,
  };
}

async function answerFromStoredMemories(inputText: string, matches: MemoryMatch[]) {
  const context = matches
    .map(
      (memory, index) =>
        `Memory ${index + 1}\nTitle: ${memory.title}\nTopic: ${
          memory.topic ?? "unknown"
        }\nTags: ${memory.tags.join(", ") || "none"}\nBody: ${memory.body}`
    )
    .join("\n\n");

  const answerPrompt = `You are a helpful assistant with access to the user's personal knowledge base. Answer the question naturally based only on their stored memories.

The user's stored knowledge:
${context}

Question: ${inputText}

Instructions:
- Answer based ONLY on the user's stored memories above.
- If the memories do not contain the answer, respond with exactly: NOT_IN_STORED_INFO.
- Distinguish saved user knowledge from your own general knowledge.
- Be concise but useful.

Answer:`;

  return generateSummary(answerPrompt);
}

function buildSaveResponse(saveResult: SaveMemoryWithIntelligenceResult) {
  if (!saveResult.memorySaved) {
    return "I understood that, but I couldn't save it as a memory right now. Please try again in a moment.";
  }

  const issues = saveResult.relationTypes ?? [];

  if (issues.includes("contradicts")) {
    return "Saved. I also found a possible contradiction with an older memory and linked the two notes together.";
  }

  if (issues.includes("duplicate_of") || issues.includes("near_duplicate")) {
    return "Saved. This looks close to something already in your brain, so I linked the related notes together.";
  }

  if (!saveResult.saved && saveResult.saveError) {
    return "Saved the memory, but search indexing hit a problem. It may not show up in semantic recall until indexing succeeds.";
  }

  return "Saved. I tagged it, placed it in a space, and linked it to nearby ideas.";
}

function saveMetadata(saveResult: SaveMemoryWithIntelligenceResult) {
  return {
    saved: saveResult.memorySaved,
    indexed: saveResult.saved,
    memoryId: saveResult.memoryId,
    spaceId: saveResult.spaceId,
    spaceName: saveResult.spaceName,
    topic: saveResult.topic,
    tags: saveResult.tags,
    confidenceScore: saveResult.confidenceScore,
    confidenceStatus: saveResult.confidenceStatus,
    needsReview: saveResult.needsReview,
    relationTypes: saveResult.relationTypes,
    relationsCreated: saveResult.relationsCreated,
    relatedCount: saveResult.relatedCount,
    saveError: saveResult.saveError,
  };
}

export async function POST(req: Request) {
  try {
    const { inputText, userId, sessionId, spaceId } = await req.json();

    if (!inputText || !userId) {
      return NextResponse.json(
        { error: "inputText and userId are required" },
        { status: 400 }
      );
    }

    const selectedSpaceId = typeof spaceId === "string" ? spaceId : null;
    const respond = (payload: BrainResponsePayload) =>
      createBrainResponse({
        payload,
        userId,
        inputText,
        sessionId: typeof sessionId === "string" ? sessionId : null,
      });

    try {
      await getSpaces(userId);
    } catch (setupError) {
      if (isSchemaMissingError(setupError)) {
        return respond({
          type: "setup_required",
          response:
            "The app is running, but the new memory intelligence database migration has not been applied yet. Apply `supabase/migrations/20260623000000_memory_intelligence_layer.sql`, then refresh this page to use automatic topic tagging, graph connections, teach mode, and weekly summaries.",
          saved: false,
          setupRequired: true,
        });
      }

      throw setupError;
    }

    if (isWeeklySummaryCommand(inputText)) {
      const weekly = await generateWeeklyLearningSummary({
        userId,
        spaceId: selectedSpaceId,
      });

      return respond({
        type: "weekly_summary",
        response: weekly.summary,
        saved: true,
        weekStart: weekly.weekStart,
        memoryCount: weekly.memoryCount,
        topTopics: weekly.topTopics,
        weakTopics: weekly.weakTopics,
        relationIssueCount: weekly.relationIssueCount,
      });
    }

    const teachTopic = parseTeachTopic(inputText);
    if (teachTopic) {
      const teach = await buildTeachModeResponse({
        userId,
        topic: teachTopic,
        spaceId: selectedSpaceId,
      });
      const generatedSave =
        teach.memoryToSave && teach.knowledgeStatus !== "known"
          ? await createGeneratedLearningMemory({
              userId,
              topic: teachTopic,
              body: teach.memoryToSave,
              spaceId: selectedSpaceId,
            })
          : null;

      return respond({
        type: "teach_mode",
        response: teach.response,
        knowledgeStatus: teach.knowledgeStatus,
        knownPoints: teach.knownFromYourBrain,
        missingPoints: teach.gaps,
        saved: generatedSave?.memorySaved ?? false,
        generatedMemoryId: generatedSave?.memoryId,
        needsReview: generatedSave?.needsReview ?? false,
        topic: teachTopic,
        relatedCount: teach.relatedMemories.length,
      });
    }

    const isQuestion = await classifyInput(inputText);

    if (isVeryShortAcknowledgement(inputText, isQuestion)) {
      return respond({
        type: "note",
        response: "I understand. How can I help you?",
        message: "Acknowledged",
      });
    }

    const knowledgeTopic = parseKnowledgeTopic(inputText);
    if (knowledgeTopic) {
      const gap = await detectKnowledgeGap({
        userId,
        topic: knowledgeTopic,
        spaceId: selectedSpaceId,
      });
      let newLesson: string | null = null;
      let generatedSave: SaveMemoryWithIntelligenceResult | null = null;

      if (gap.status === "unknown") {
        newLesson = await generateWithWebSearch(
          `Explain ${knowledgeTopic} clearly for a learner. Include the core idea and a small example.`
        );
        generatedSave = await createGeneratedLearningMemory({
          userId,
          topic: knowledgeTopic,
          body: `AI-generated primer on ${knowledgeTopic}:\n\n${newLesson}`,
          spaceId: selectedSpaceId,
        });
      }

      return respond({
        type: "knowledge_gap",
        response: formatKnowledgeGapResponse({
          topic: knowledgeTopic,
          gap,
          newLesson,
        }),
        knowledgeStatus: gap.status,
        knownPoints: gap.knownPoints,
        missingPoints: gap.missingPoints,
        suggestedNextSteps: gap.suggestedNextSteps,
        relatedCount: gap.relatedMemories.length,
        saved: generatedSave?.memorySaved ?? false,
        generatedMemoryId: generatedSave?.memoryId,
        topic: knowledgeTopic,
      });
    }

    if (isQuestion) {
      const relatedMemories = await searchRelatedMemories({
        inputText,
        userId,
        spaceId: selectedSpaceId,
        count: 12,
      });

      if (relatedMemories.length > 0) {
        const storedAnswer = await answerFromStoredMemories(
          inputText,
          relatedMemories
        );

        if (!answerWasNotInStoredInfo(storedAnswer)) {
          return respond({
            type: "question",
            response: storedAnswer,
            answer: storedAnswer,
            known: true,
            knowledgeStatus: "known",
            relatedCount: relatedMemories.length,
            topic: relatedMemories[0]?.topic ?? undefined,
          });
        }
      }

      const answer = await generateWithWebSearch(inputText);
      const generatedMemory = createGeneratedMemoryBody(inputText, answer);
      const memorySave = await createGeneratedLearningMemory({
        userId,
        topic: generatedMemory.topic,
        body: generatedMemory.body,
        spaceId: selectedSpaceId,
      });

      return respond({
        type: "question",
        response: answer,
        answer,
        known: false,
        knowledgeStatus: "unknown",
        learned: true,
        ...saveMetadata(memorySave),
      });
    }

    const memorySave = await saveMemoryWithIntelligence({
      userId,
      title: truncateTitle(inputText),
      body: inputText,
      memoryType: "note",
      source: "user",
      spaceId: selectedSpaceId,
    });

    return respond({
      type: "note",
      response: buildSaveResponse(memorySave),
      message: memorySave.memorySaved ? "Memory saved" : "Memory save failed",
      ...saveMetadata(memorySave),
    });
  } catch (err: unknown) {
    console.error("Error processing memory:", err);
    const errorMessage = getPublicErrorMessage(err) || "Internal Server Error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
