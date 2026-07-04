import { createGoogleAiClient } from "@/src/lib/googleAi";

/**
 * @param text - The text to embed
 * @returns Array<number> embedding vector
 */

export async function embedText(text: string): Promise<number[]> {
  const ai = createGoogleAiClient();
  const response = await ai.models.embedContent({
    model: "gemini-embedding-001",
    contents: { parts: [{ text }] },
    config: { outputDimensionality: 1536 },
  });

  const embeddingObj = response.embeddings?.[0];
  if (!embeddingObj?.values) throw new Error("Embedding not returned");

  return embeddingObj.values;
}
