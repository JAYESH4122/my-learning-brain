import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { generateSummary } from "@/lib/gemini";
import { embedText } from "@/lib/embeddings";

export async function POST(req: Request) {
  try {
    const { inputText, userId } = await req.json();

    if (!inputText || !userId) {
      return NextResponse.json(
        { error: "inputText and userId are required" },
        { status: 400 }
      );
    }

    // Step 1: Classify input as note or question
    const classifyPrompt = `
      Classify this input as one of:
      - "note" (if user states facts to remember)
      - "question" (if user asks something)

      Input: "${inputText}"
      Return only one word: note or question.
    `;
    const classification = (await generateSummary(classifyPrompt))
      .trim()
      .toLowerCase();

    // Step 2: If it's a note, summarize, embed, and store
    if (classification.includes("note")) {
      const summarizePrompt = `
        Summarize this learning note clearly into key points for memory storage:
        "${inputText}"
      `;
      const summary = await generateSummary(summarizePrompt);
      const embedding = await embedText(summary);

      const { data: memory, error: memoryError } = await supabase
        .from("memories")
        .insert([
          {
            user_id: userId,
            title: summary.slice(0, 60),
            body: summary,
            memory_type: "note",
            source: "Gemini",
          },
        ])
        .select()
        .single();

      if (memoryError) throw memoryError;

      const { error: vectorError } = await supabase
        .from("memory_vectors")
        .insert([{ memory_id: memory.id, embedding }]);

      if (vectorError) throw vectorError;

      return NextResponse.json({
        type: "note",
        message: "Memory saved!",
        summary,
      });
    }

    // Step 3: If it's a question, embed and query memory vectors
    if (classification.includes("question")) {
      const queryEmbedding = await embedText(inputText);

      // Call Supabase RPC to match memories
      const { data: matches, error: matchError } = await supabase.rpc(
        "match_memories",
        {
          query_embedding: queryEmbedding,
          match_threshold: 0.7,
          match_count: 3,
        }
      );

      if (matchError) throw matchError;

      // If matches found, use context
      if (matches && matches.length > 0) {
        const context = matches.map((m: any) => m.body).join("\n\n");
        const answerPrompt = `
          Use the following context to answer the question:

          Context:
          ${context}

          Question: ${inputText}
        `;
        const answer = await generateSummary(answerPrompt);

        return NextResponse.json({
          type: "question",
          known: true,
          answer,
          related: matches,
        });
      }

      // If no known match, generate answer and store as new memory
      const learnPrompt = `
        The user doesn't know this yet. Provide a short, accurate explanation for:
        "${inputText}"
        Include official or factual info if possible.
      `;
      const learnText = await generateSummary(learnPrompt);
      const embedding = await embedText(learnText);

      const { data: newMemory, error: newMemoryError } = await supabase
        .from("memories")
        .insert([
          {
            user_id: userId,
            title: inputText.slice(0, 60),
            body: learnText,
            memory_type: "question",
            source: "Gemini",
          },
        ])
        .select()
        .single();

      if (newMemoryError) throw newMemoryError;

      await supabase.from("memory_vectors").insert([
        { memory_id: newMemory.id, embedding },
      ]);

      return NextResponse.json({
        type: "question",
        known: false,
        learned: true,
        answer: learnText,
      });
    }

    return NextResponse.json({ message: "Unrecognized input type." });
  } catch (err: any) {
    console.error("Error processing memory:", err);
    return NextResponse.json(
      { error: err.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
