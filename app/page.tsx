"use client";

import { useEffect, useRef, useState } from "react";

const MAX_CHARS = 5000;

type Stage = "idle" | "summarizing" | "audio";

/** Renders **bold** segments without any markdown dependency. */
function renderInline(line: string) {
  return line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-semibold text-zinc-900">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

function Summary({ text }: { text: string }) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const bullets = lines.filter((l) => /^[-*•]\s+/.test(l));
  const rest = lines.filter((l) => !/^[-*•]\s+/.test(l));
  const [headline, ...overview] = rest;

  return (
    <div className="font-serif">
      {headline && (
        <h2 className="text-2xl font-semibold leading-snug tracking-tight text-zinc-900">
          {renderInline(headline)}
        </h2>
      )}
      {overview.map((l, i) => (
        <p key={i} className="mt-3 leading-7 text-zinc-700">
          {renderInline(l)}
        </p>
      ))}
      {bullets.length > 0 && (
        <ul className="mt-5 space-y-3 border-l-2 border-teal-700 pl-4">
          {bullets.map((b, i) => (
            <li key={i} className="leading-7 text-zinc-800">
              {renderInline(b.replace(/^[-*•]\s+/, ""))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

function SummarySkeleton() {
  return (
    <div className="animate-pulse space-y-3" role="status" aria-label="Summarizing text">
      <div className="h-6 w-3/4 rounded bg-zinc-200" />
      <div className="h-4 w-full rounded bg-zinc-200" />
      <div className="mt-5 h-4 w-11/12 rounded bg-zinc-200" />
      <div className="h-4 w-10/12 rounded bg-zinc-200" />
      <div className="h-4 w-9/12 rounded bg-zinc-200" />
    </div>
  );
}

export default function Home() {
  const [text, setText] = useState("");
  const [summary, setSummary] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);

  const busy = stage !== "idle";
  const hasOutput = busy || summary !== "";

  // Free the blob URL when it is replaced or the page unmounts.
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  function resetOutput() {
    setSummary("");
    setAudioUrl(null);
    setIsPlaying(false);
    setError("");
  }

  function handleClear() {
    setText("");
    resetOutput();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;

    resetOutput();
    setStage("summarizing");

    try {
      // 1) Summary: Vercel AI SDK route
      const sumRes = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const sumData = await sumRes.json();
      if (!sumRes.ok) throw new Error(sumData.error ?? "Summary failed.");
      setSummary(sumData.summary);

      // 2) Audio: OpenAI SDK route (speak the summary without markdown symbols)
      setStage("audio");
      const spokenText = (sumData.summary as string)
        .replace(/\*\*/g, "")
        .replace(/^\s*[-*•]\s+/gm, "");

      const audioRes = await fetch("/api/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: spokenText }),
      });
      if (!audioRes.ok) {
        const data = await audioRes.json().catch(() => ({}));
        throw new Error(data.error ?? "Audio failed.");
      }
      const blob = await audioRes.blob();
      setAudioUrl(URL.createObjectURL(blob));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setStage("idle");
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-12 sm:py-16">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Smart Reader</h1>
        <p className="mt-2 max-w-prose text-zinc-600">
          Paste an article. Get a three-point summary you can read or listen to.
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6"
      >
        <label htmlFor="article" className="mb-2 block text-sm font-medium text-zinc-800">
          Article text
        </label>
        <textarea
          id="article"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX_CHARS}
          disabled={busy}
          rows={10}
          placeholder="Paste the text you want summarized…"
          className="w-full resize-y rounded-lg border border-zinc-300 bg-zinc-50 px-4 py-3 text-[15px] leading-7 text-zinc-900 placeholder:text-zinc-400 focus:border-teal-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-700/25 disabled:cursor-not-allowed disabled:opacity-50"
        />

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <span
            className={`text-sm tabular-nums ${
              text.length >= MAX_CHARS ? "text-red-600" : "text-zinc-500"
            }`}
          >
            {text.length.toLocaleString()} / {MAX_CHARS.toLocaleString()} characters
          </span>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleClear}
              disabled={busy || (!text && !summary)}
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-700/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Clear
            </button>
            <button
              type="submit"
              disabled={busy || !text.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-700/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy && <Spinner />}
              {stage === "summarizing"
                ? "Summarizing text…"
                : stage === "audio"
                ? "Generating audio…"
                : "Generate Summary"}
            </button>
          </div>
        </div>
      </form>

      {error && (
        <div
          role="alert"
          className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </div>
      )}

      {hasOutput && (
        <section className="mt-6 grid gap-6 md:grid-cols-5">
          <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm md:col-span-3">
            <h3 className="mb-4 text-sm font-medium text-zinc-500">Summary</h3>
            {stage === "summarizing" ? <SummarySkeleton /> : <Summary text={summary} />}
          </div>

          <div className="self-start rounded-xl border border-zinc-200 bg-white p-6 shadow-sm md:col-span-2">
            <h3 className="mb-4 text-sm font-medium text-zinc-500">Audio companion</h3>

            {stage === "summarizing" && (
              <p className="text-sm text-zinc-500">Audio starts after the summary is ready.</p>
            )}

            {stage === "audio" && (
              <div
                className="flex items-center gap-3 text-sm text-zinc-600"
                role="status"
              >
                <Spinner />
                Generating audio companion…
              </div>
            )}

            {audioUrl && stage === "idle" && (
              <div className="space-y-3">
                <audio
                  ref={audioRef}
                  src={audioUrl}
                  controls
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onEnded={() => setIsPlaying(false)}
                  className="w-full"
                />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">
                    {isPlaying ? "Playing…" : "Ready to play"}
                  </span>
                  <a
                    href={audioUrl}
                    download="summary.mp3"
                    className="font-medium text-teal-700 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-700/40"
                  >
                    Download MP3
                  </a>
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
