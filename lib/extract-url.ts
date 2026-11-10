import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class ExtractError extends Error {}

const MAX_BYTES = 1_500_000; // stop reading very large pages
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 8000;

/** True when the whole input is a single http(s) URL. */
export function looksLikeUrl(input: string): boolean {
  const value = input.trim();
  if (/\s/.test(value)) return false;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateIp(v6.slice(7));
  return v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
}

/** Blocks requests to localhost / private networks (SSRF protection). */
async function assertPublicHost(url: URL) {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local")) {
    throw new ExtractError("That address can't be fetched.");
  }
  const addresses = isIP(host)
    ? [{ address: host }]
    : await lookup(host, { all: true }).catch(() => {
        throw new ExtractError("Couldn't find that website.");
      });
  if (addresses.some((a) => isPrivateIp(a.address))) {
    throw new ExtractError("That address can't be fetched.");
  }
}

async function fetchHtml(startUrl: string): Promise<string> {
  let url = new URL(startUrl);

  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    await assertPublicHost(url);

    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SmartReaderBot/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
    }).catch(() => {
      throw new ExtractError("Couldn't reach that page.");
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new ExtractError("Couldn't load that page.");
      url = new URL(location, url);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new ExtractError("Couldn't load that page.");
      }
      continue;
    }

    if (!res.ok) throw new ExtractError(`That page returned an error (${res.status}).`);

    const type = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml|text\/plain/i.test(type)) {
      throw new ExtractError("That link doesn't point to a readable web page.");
    }

    // Read at most MAX_BYTES.
    const reader = res.body?.getReader();
    if (!reader) throw new ExtractError("That page was empty.");
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
    }
    reader.cancel().catch(() => {});
    return new TextDecoder("utf-8").decode(Buffer.concat(chunks));
  }

  throw new ExtractError("That link redirected too many times.");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function htmlToText(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1]).replace(/\s+/g, " ").trim() : "";

  let body = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|nav|header|footer|aside|form|iframe)[\s\S]*?<\/\1>/gi, " ");

  // Prefer the main article content when the page marks it up.
  const main =
    body.match(/<article[\s\S]*?<\/article>/i) ?? body.match(/<main[\s\S]*?<\/main>/i);
  if (main) body = main[0];

  const text = decodeEntities(
    body
      .replace(/<\/(p|div|h[1-6]|li|blockquote|tr|br)>|<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { title, text };
}

/** Downloads a web page and returns its readable text. */
export async function extractFromUrl(
  url: string
): Promise<{ title: string; text: string }> {
  const html = await fetchHtml(url);
  const { title, text } = htmlToText(html);
  if (text.length < 200) {
    throw new ExtractError(
      "Couldn't find enough readable text on that page. Try pasting the article text instead."
    );
  }
  return { title, text };
}
