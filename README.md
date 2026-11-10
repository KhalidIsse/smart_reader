# Smart Reader

**An AI reading companion that turns any article, pasted text or web link into a structured summary and a human-like audio voiceover.**

Paste a block of text *or just a URL*. Smart Reader fetches the page when needed, extracts the readable content, distills it into a headline, an overview and three core takeaways, then narrates that summary with natural-sounding speech you can play in the browser or download as an MP3.

---

## Highlights

- **Text or URL input.** Paste up to 5,000 characters of text, or paste a link to an article and the server fetches and cleans the page for you.
- **Structured, deterministic summaries.** Every summary follows the same format: a bolded headline, one overview sentence, and exactly three bullet-point takeaways. Generation runs at temperature 0 for consistent output.
- **Natural audio narration.** The summary is converted to speech with OpenAI's `tts-1` model (`alloy` voice) and delivered as `audio/mpeg`.
- **Two AI SDKs, each used for what it does best.** The Vercel AI SDK handles text generation; the official OpenAI Node SDK handles speech synthesis.
- **Secure server-side URL fetching.** Built-in protection against server-side request forgery (SSRF), redirect limits, timeouts and download size caps.
- **Polished, accessible UI.** Skeleton loaders, per-stage progress messages, live character counter, visible disabled states that prevent overlapping requests, keyboard focus styles and reduced-motion support.
- **No client-side secrets.** The OpenAI key lives only in server environment variables and is never sent to the browser.

---

## How it works

```
                        ┌──────────────────────────────────────────────┐
                        │                  Browser                     │
                        │  app/page.tsx  (React state + <audio> player)│
                        └──────────────┬───────────────▲───────────────┘
                1. { text | url }      │               │  3. audio/mpeg blob
                                       ▼               │     → URL.createObjectURL
                        ┌──────────────────────┐       │
                        │  POST /api/summarize │       │
                        │                      │       │
                        │  URL?  ──yes──► lib/extract-url.ts
                        │   │             (SSRF checks, fetch, HTML → text)
                        │   └─no─► use pasted text
                        │                      │       │
                        │  Vercel AI SDK       │       │
                        │  generateText        │       │
                        │  (gpt-4o-mini)       │       │
                        └──────────┬───────────┘       │
                2. { summary, source }                 │
                                   │          ┌────────┴─────────┐
                                   └────────► │  POST /api/speak │
                                              │  OpenAI Node SDK │
                                              │  audio.speech    │
                                              │  (tts-1, alloy)  │
                                              └──────────────────┘
```

1. **Input.** The user pastes text or a link and clicks **Generate Summary**.
2. **Extraction (links only).** `/api/summarize` detects that the input is a single `http(s)` URL, validates it, downloads the page and converts the HTML into clean text (see [URL handling](#url-handling)).
3. **Summarization.** The text is sent to `gpt-4o-mini` through the Vercel AI SDK's `generateText`, guided by a strict system prompt that enforces the output format.
4. **Narration.** The UI strips markdown symbols from the summary and sends it to `/api/speak`, which calls the OpenAI SDK's `audio.speech.create` and returns the MP3 bytes.
5. **Playback.** The browser turns the response into a Blob, creates an object URL and plays it in a native `<audio>` element, with a download link alongside.

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 15 (App Router) with React 19 |
| Language | TypeScript (strict mode) |
| Styling | Tailwind CSS 3 with `next/font` (Public Sans and Literata) |
| Text generation | Vercel AI SDK: `ai` + `@ai-sdk/openai`, model `gpt-4o-mini` |
| Text-to-speech | Official `openai` Node SDK, model `tts-1`, voice `alloy` |
| State | React `useState` for input, loading stage, summary, source, audio URL and playback status |

---

## Getting started

**Requirements:** Node.js 18.18 or newer and an OpenAI API key.

```bash
# 1. Install dependencies
npm install

# 2. Add your API key
#    Open .env.local and replace the placeholder:
#    OPENAI_API_KEY=sk-...

# 3. Start the dev server
npm run dev
```

Then open http://localhost:3000.

For a production build:

```bash
npm run build
npm run start
```

---

## Usage

1. Paste **either**:
   - an article or any block of text (up to 5,000 characters), **or**
   - a link such as `https://example.com/some-article`
2. Click **Generate Summary**.
3. Read the summary, press play on the audio companion, or choose **Download MP3**.
4. Use **Clear** to reset the input and results.

---

## API reference

### `POST /api/summarize`

Generates a structured summary from text or a URL.

**Request**

```json
{ "text": "Paste your article here, or a URL like https://example.com/article" }
```

**Response `200`**

```json
{
  "summary": "**Headline**\n\nOne-sentence overview.\n\n- Takeaway 1\n- Takeaway 2\n- Takeaway 3",
  "source": { "type": "url", "url": "https://example.com/article", "title": "Page title" }
}
```

`source` is `null` when plain text was submitted.

**Errors:** `400` for empty or oversized input, `422` when a link can't be fetched or has no readable text, `500` for generation failures.

### `POST /api/speak`

Converts text to speech.

**Request**

```json
{ "text": "Text to narrate (max 4,096 characters)" }
```

**Response `200`:** binary MP3 with `Content-Type: audio/mpeg`.

---

## URL handling

Fetching arbitrary user-supplied links from a server is a known security risk, so URL support is implemented defensively in `lib/extract-url.ts`:

- **Protocol allow-list:** only `http` and `https` links are accepted.
- **SSRF protection:** the hostname is resolved before every request and rejected if it points to localhost, loopback, link-local, carrier-grade NAT or private network ranges (IPv4 and IPv6).
- **Safe redirects:** redirects are followed manually, up to 3 hops, and each hop is re-validated.
- **Timeouts and size caps:** requests time out after 8 seconds and at most 1.5 MB of HTML is read.
- **Content-type check:** only HTML and plain-text responses are processed.
- **Clean extraction:** scripts, styles, navigation, headers, footers, forms and other page chrome are removed. When the page has an `<article>` or `<main>` element, that content is preferred. HTML entities are decoded and whitespace is normalized.
- **Model input cap:** extracted text is trimmed to 12,000 characters before summarization to control cost and latency.

**Known limitations:** pages that render their content with client-side JavaScript, sit behind a login or paywall, or block automated requests can't be read. In those cases the app shows a clear message suggesting that you paste the text instead.

---

## Project structure

```
smart-reader/
├── app/
│   ├── api/
│   │   ├── summarize/route.ts   # Text/URL → summary (Vercel AI SDK)
│   │   └── speak/route.ts       # Summary → MP3 (OpenAI SDK)
│   ├── globals.css
│   ├── layout.tsx               # Fonts and global layout
│   └── page.tsx                 # Dashboard UI, state and audio player
├── lib/
│   └── extract-url.ts           # Secure URL fetching and HTML-to-text extraction
├── .env.local                   # OPENAI_API_KEY (never commit this file)
├── .env.example
├── package.json
└── tailwind.config.ts
```

---

## Design decisions

- **Two routes, two SDKs.** Summarization and speech are separate endpoints, so each can be changed, cached or rate-limited independently.
- **Non-streaming summary.** `generateText` returns the full summary in one response, which keeps the UI simple and lets the audio step start from complete text.
- **Audio built from the summary, not the source.** Narrating three sentences is fast and inexpensive, and it stays well inside the TTS input limit.
- **Overlap-proof UI.** Inputs and buttons are disabled while a request is in flight, and each stage has its own loading indicator.
- **Memory hygiene.** Audio object URLs are revoked when replaced or when the page unmounts.

---

## Configuration

| Variable | Required | Description |
| --- | --- | --- |
| `OPENAI_API_KEY` | Yes | Server-side key used by both API routes |

You can change the model, voice and limits in the route files:

- `app/api/summarize/route.ts`: `gpt-4o-mini`, `MAX_CHARS`, `MAX_MODEL_CHARS`, system prompt
- `app/api/speak/route.ts`: `tts-1`, voice (`alloy`, `echo`, and others)
- `lib/extract-url.ts`: timeout, redirect and size limits

---

## Troubleshooting

| Problem | Fix |
| --- | --- |
| "Could not generate a summary" | Check that `OPENAI_API_KEY` is set correctly and has available credit, then restart `npm run dev`. |
| "Couldn't find enough readable text on that page" | The page likely renders client-side or blocks bots. Paste the article text instead. |
| "That address can't be fetched" | The link points to a local or private address, which is blocked on purpose. |
| No audio appears | Open the browser's network tab and check the `/api/speak` response for an error message. |

---

## Ideas for future work

- Streaming summaries with the AI SDK's `streamText`
- Voice and language selection
- Adjustable summary length and style
- Rate limiting and response caching
- Support for PDF uploads

---

## Security notes

- Keep `.env.local` out of version control (it is already in `.gitignore`).
- Before deploying publicly, add rate limiting to both routes to protect your OpenAI usage.
