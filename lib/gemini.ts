import { GoogleGenAI, createUserContent } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GOOGLE_API_KEY,
});

/**
 * Generate a text summary using Gemini 2.5 Flash
 * @param prompt - The text input to summarize/explain
 */

export async function generateSummary(prompt: string) {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: createUserContent(prompt),
    config: {
      temperature: 0.2,
    },
  });

  return response.text || "";
}
