import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { ExtractError, extractFromUrl, looksLikeUrl } from "@/lib/extract-url";

export const runtime = "nodejs";

const MAX_CHARS = 5000; // pasted text limit
const MAX_MODEL_CHARS = 12000; // extracted-from-URL text sent to the model

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
      return Response.json({ error: "Please provide some text or a link." }, { status: 400 });
    }

    let content = text;
    let source: { type: "url"; url: string; title: string } | null = null;

    if (looksLikeUrl(text)) {
      const url = text.trim();
      const page = await extractFromUrl(url);
      content = page.text.slice(0, MAX_MODEL_CHARS);
      source = { type: "url", url, title: page.title };
    } else if (text.length > MAX_CHARS) {
      return Response.json(
        { error: `Text must be ${MAX_CHARS} characters or fewer.` },
        { status: 400 }
      );
    }

    const { text: summary } = await generateText({
      model: openai("gpt-4o-mini"),
      system: SYSTEM_PROMPT,
      prompt: content,
      temperature: 0,
    });

    return Response.json({ summary, source });
  } catch (err) {
    if (err instanceof ExtractError) {
      return Response.json({ error: err.message }, { status: 422 });
    }
    console.error("[summarize]", err);
    return Response.json({ error: "Could not generate a summary." }, { status: 500 });
  }
}
