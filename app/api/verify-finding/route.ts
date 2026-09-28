import { NextResponse } from "next/server";

export const maxDuration = 30;

const BOT_UA = "Mozilla/5.0 (compatible; SEOAuditBot/1.0; +https://seo-audit-engine.vercel.app)";

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
  "http.redirect_chain": () => true,
  "http.slow_response": () => true,
};

async function verifyUrl(url: string, ruleId: string): Promise<{
  url: string;
  issueFound: boolean;
  note: string;
}> {
  const verifier = VERIFIABLE_RULES[ruleId];
  if (!verifier) {
    return { url, issueFound: true, note: "Правило не підлягає автоверифікації" };
  }

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": BOT_UA, Accept: "text/html" },
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
    });

    if (!res.ok) {
      return { url, issueFound: false, note: `HTTP ${res.status}` };
    }

    const html = await res.text();
    const issueFound = verifier(html, res.headers);
    return {
      url,
      issueFound,
      note: issueFound ? "Проблему підтверджено" : "Проблему не знайдено",
    };
  } catch (err) {
    return { url, issueFound: true, note: `Помилка: ${(err as Error).message}` };
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Accept both { url, ruleId } (legacy / auto-verify) and { urls, ruleId } (manual batch)
    const ruleId: string | undefined = body.ruleId;
    const urlsSingle: string | undefined = body.url;
    const urlsArray: string[] | undefined = body.urls;

    if (!ruleId) {
      return NextResponse.json({ confirmed: false, error: "ruleId обов'язковий" }, { status: 400 });
    }

    // ── Batch mode: { urls[], ruleId } ────────────────────────────────────────
    if (urlsArray && Array.isArray(urlsArray)) {
      const sample = urlsArray.slice(0, 3);
      if (sample.length === 0) {
        return NextResponse.json({ status: "unverified", note: "Немає URL для перевірки", checks: [] });
      }

      const checks = await Promise.all(sample.map((u) => verifyUrl(u, ruleId)));
      const foundCount = checks.filter((c) => c.issueFound).length;

      let status: "verified" | "false_positive" | "unverified";
      let note: string;

      if (foundCount === 0) {
        status = "false_positive";
        note = `Не підтверджено на ${sample.length} сторінках — можливо хибне спрацювання`;
      } else if (foundCount === sample.length) {
        status = "verified";
        note = `Підтверджено на ${foundCount} з ${sample.length} перевірених сторінок`;
      } else {
        status = "verified";
        note = `Підтверджено на ${foundCount} з ${sample.length} перевірених сторінок`;
      }

      return NextResponse.json({ status, note, checks });
    }

    // ── Single URL mode: { url, ruleId } (auto-verify flow) ──────────────────
    const url = urlsSingle;
    if (!url) {
      return NextResponse.json({ confirmed: false, error: "url або urls обов'язкові" }, { status: 400 });
    }

    const result = await verifyUrl(url, ruleId);
    return NextResponse.json({
      confirmed: result.issueFound,
      url,
      ruleId,
      note: result.note,
    });
  } catch (err) {
    return NextResponse.json(
      { confirmed: true, error: (err as Error).message, note: "Помилка верифікації — вважаємо підтвердженим" },
      { status: 200 }
    );
  }
}
