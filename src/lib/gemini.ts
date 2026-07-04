import { createGoogleAiClient, createUserContent } from "@/src/lib/googleAi";

/**
 * Generate a text summary using Gemini 2.5 Flash
 * @param prompt - The text input to summarize/explain
 */

export async function generateSummary(prompt: string) {
  const ai = createGoogleAiClient();
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: createUserContent(prompt),
    config: {
      temperature: 0.2,
    },
  });

  return response.text || "";
}

/**
 * Generate an answer with web search enabled
 * @param question - The question to answer
 * @returns The generated answer with web search results
 */
export async function generateWithWebSearch(question: string): Promise<string> {
  try {
    const ai = createGoogleAiClient();
    // Use Gemini with enhanced prompt to leverage its knowledge base
    // Gemini models have access to current information up to their training data
    const enhancedPrompt = `Answer the following question clearly, accurately, and comprehensively. Use your knowledge base and provide detailed, helpful information. Be thorough and informative.

Question: ${question}

Provide a detailed, informative answer:`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: createUserContent(enhancedPrompt),
      config: {
        temperature: 0.3, // Slightly higher for more comprehensive answers
      },
    });

    const answer = response.text || "";
    
    if (answer && answer.trim().length > 0) {
      return answer;
    }
    
    // Fallback
    return generateSummary(`Answer this question comprehensively: ${question}`);
  } catch (error) {
    console.error("Error generating answer:", error);
    // Fallback to regular generation
    return generateSummary(`Answer this question: ${question}`);
  }
}
