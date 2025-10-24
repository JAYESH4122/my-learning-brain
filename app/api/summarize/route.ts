import { generateSummary } from "@/lib/gemini";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { InputText } = await req.json();

    if (!InputText) {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      );
    }

    const prompt = `
    Summarize the following learning note into clear, structured points:
    - Focus on key concepts.
    - Add small factual context from official documentation if relevant.
    - Keep the explanation simple, as if for future self-learning.
    
    Learning note: ${InputText}
    `;

    const summary = await generateSummary(prompt);

    return NextResponse.json({ summary }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error }, { status: 500 });
  }
}
