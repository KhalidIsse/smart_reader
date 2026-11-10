import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

export const runtime = "nodejs";

const MAX_CHARS = 5000;

const SYSTEM_PROMPT = `You are an expert editor who writes crisp summaries.
Respond in exactly this format and nothing else:

**<A short, bolded headline>**

<One overview sentence.>

- <Core takeaway 1>
- <Core takeaway 2>
- <Core takeaway 3>

Rules: exactly 3 bullet points, no extra sections, no preamble.`;

export async function POST(req: Request) {
  try {
    const { text } = await req.json();

    if (typeof text !== "string" || !text.trim()) {
      return Response.json({ error: "Please provide some text." }, { status: 400 });
    }
    if (text.length > MAX_CHARS) {
      return Response.json(
        { error: `Text must be ${MAX_CHARS} characters or fewer.` },
        { status: 400 }
      );
    }

    const { text: summary } = await generateText({
      model: openai("gpt-4o-mini"),
      system: SYSTEM_PROMPT,
      prompt: text,
      temperature: 0,
    });

    return Response.json({ summary });
  } catch (err) {
    console.error("[summarize]", err);
    return Response.json({ error: "Could not generate a summary." }, { status: 500 });
  }
}
