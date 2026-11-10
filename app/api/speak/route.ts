import OpenAI from "openai";

export const runtime = "nodejs";

// tts-1 accepts up to 4,096 characters of input.
const MAX_CHARS = 4096;

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

    const mp3 = await client.audio.speech.create({
      model: "tts-1",
      voice: "alloy",
      input: text,
    });

    const buffer = await mp3.arrayBuffer();

    return new Response(buffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": buffer.byteLength.toString(),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[speak]", err);
    return Response.json({ error: "Could not generate audio." }, { status: 500 });
  }
}
