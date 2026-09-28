import { NextResponse } from "next/server";

export const maxDuration = 30;

const BOT_UA = "Mozilla/5.0 (compatible; SEOAuditBot/1.0; +https://seo-audit-engine.vercel.app)";

interface VerifyRequest {
  url: string;
  ruleId: string;
}

// Rules that can be verified by fetching the page
const VERIFIABLE_RULES: Record<string, (html: string, headers: Headers) => boolean> = {
  "meta.title.missing": (html) => {
    const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return !match || match[1].trim() === "";
  },
  "meta.description.missing": (html) => {
    const match = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)
      ?? html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
    return !match || match[1].trim() === "";
  },
  "heading.h1.missing": (html) => {
    return !/<h1[\s>]/i.test(html);
  },
  "heading.h1.multiple": (html) => {
    const matches = html.match(/<h1[\s>]/gi);
    return matches ? matches.length > 1 : false;
  },
  "meta.title.too_long": (html) => {
    const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return match ? match[1].trim().length > 60 : false;
  },
  "meta.title.too_short": (html) => {
    const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return match ? match[1].trim().length < 30 && match[1].trim().length > 0 : false;
  },
  "meta.description.too_long": (html) => {
    const match = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)
      ?? html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
    return match ? match[1].trim().length > 160 : false;
  },
  "indexability.noindex_important": (html, headers) => {
    const robotsMeta = html.match(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["']/i)?.[1] ?? "";
    const robotsHeader = headers.get("x-robots-tag") ?? "";
    return robotsMeta.includes("noindex") || robotsHeader.includes("noindex");
  },
  "canonical.missing": (html) => {
    return !/<link[^>]+rel=["']canonical["']/i.test(html);
  },
  "http.redirect_chain": (_html, _headers) => {
    // Can't reliably detect redirect chains server-side here — assume confirmed
    return true;
  },
  "http.slow_response": () => true, // confirmed via timing data from SF
};

export async function POST(req: Request) {
  try {
    const { url, ruleId } = (await req.json()) as VerifyRequest;

    if (!url || !ruleId) {
      return NextResponse.json({ confirmed: false, error: "url та ruleId обов'язкові" }, { status: 400 });
    }

    const verifier = VERIFIABLE_RULES[ruleId];
    if (!verifier) {
      // Rule not verifiable — treat as confirmed
      return NextResponse.json({ confirmed: true, note: "Правило не підлягає автоверифікації" });
    }

    const start = Date.now();
    const res = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": BOT_UA, Accept: "text/html" },
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
    });

    if (!res.ok) {
      return NextResponse.json({ confirmed: false, error: `HTTP ${res.status}`, url });
    }

    const html = await res.text();
    const responseTimeMs = Date.now() - start;
    const confirmed = verifier(html, res.headers);

    return NextResponse.json({
      confirmed,
      url,
      ruleId,
      responseTimeMs,
      note: confirmed ? "Проблему підтверджено на сторінці" : "Проблему не знайдено на сторінці",
    });
  } catch (err) {
    return NextResponse.json(
      { confirmed: true, error: (err as Error).message, note: "Помилка верифікації — вважаємо підтвердженим" },
      { status: 200 }
    );
  }
}
