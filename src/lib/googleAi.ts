import { GoogleGenAI, createUserContent } from "@google/genai";

function getGoogleApiKey() {
  const apiKey = process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Missing GOOGLE_API_KEY. Set it before starting the app or running server-side AI features."
    );
  }

  return apiKey;
}

export function createGoogleAiClient() {
  return new GoogleGenAI({
    apiKey: getGoogleApiKey(),
  });
}

export { createUserContent };
