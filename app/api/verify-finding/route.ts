import { NextResponse } from "next/server";

interface VerifyRequest {
  urls: string[];
  ruleId: string;
}

interface CheckResult {
  url: string;
  issueFound: boolean; // true = issue IS present (confirmed), false = issue NOT present (false positive)
  note: string;
  error?: string;
}

// Fetch a live page and return its HTML
async function fetchPageHtml(url: string): Promise<{ html: string; ok: boolean; error?: string }> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; SEOAuditBot/1.0; +https://seo-audit-engine.vercel.app)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(12000),
      redirect: "follow",
    });

    if (!res.ok) {
      return { html: "", ok: false, error: `HTTP ${res.status}` };
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("html")) {
      return { html: "", ok: false, error: "Не HTML відповідь" };
    }

    const html = await res.text();
    return { html, ok: true };
  } catch (e) {
    return { html: "", ok: false, error: (e as Error).message };
  }
}

// Check specific rule against HTML
function checkRule(ruleId: string, html: string): { issueFound: boolean; note: string } {
  switch (ruleId) {
    case "schema.missing": {
      const hasJsonLd = /<script[^>]*type=["']application\/ld\+json["'][^>]*>/i.test(html);
      const hasMicrodata = /\bitemscope\b/i.test(html) && /\bitemtype\b/i.test(html);
      const hasRDFa = /\btypeof=["'][^"']+["']/i.test(html);
      const found = hasJsonLd || hasMicrodata || hasRDFa;
      const types: string[] = [];
      if (hasJsonLd) types.push("JSON-LD");
      if (hasMicrodata) types.push("Microdata");
      if (hasRDFa) types.push("RDFa");
      return {
        issueFound: !found,
        note: found
          ? `Schema.org знайдено (${types.join(", ")}) — помилка SF є хибно-позитивною`
          : "Schema.org не знайдено у статичному HTML (можлива JS-рендеризація)",
      };
    }

    case "schema.breadcrumb.missing": {
      const hasBreadcrumb =
        /"@type"\s*:\s*"BreadcrumbList"/i.test(html) ||
        /<[^>]+itemtype=["'][^"']*BreadcrumbList["']/i.test(html);
      return {
        issueFound: !hasBreadcrumb,
        note: hasBreadcrumb
          ? "BreadcrumbList знайдено — помилка SF є хибно-позитивною"
          : "BreadcrumbList не знайдено у статичному HTML",
      };
    }

    case "meta.title.missing": {
      const hasTitle = /<title[^>]*>[^<]+<\/title>/i.test(html);
      return {
        issueFound: !hasTitle,
        note: hasTitle ? "Title тег знайдено" : "Title тег відсутній або порожній",
      };
    }

    case "meta.title.too_long":
    case "meta.title.too_short": {
      const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
      const titleText = match?.[1]?.trim() ?? "";
      const len = titleText.length;
      return {
        issueFound: len > 65 || (len > 0 && len < 10),
        note: titleText
          ? `Title знайдено (${len} символів): "${titleText.slice(0, 80)}${titleText.length > 80 ? "…" : ""}"`
          : "Title не знайдено",
      };
    }

    case "heading.h1.missing": {
      const hasH1 = /<h1[\s>]/i.test(html);
      return {
        issueFound: !hasH1,
        note: hasH1 ? "H1 знайдено у HTML" : "H1 відсутній (перевірте JS-рендеринг)",
      };
    }

    case "heading.h1.duplicate": {
      const matches = html.match(/<h1[\s>]/gi) ?? [];
      return {
        issueFound: matches.length > 1,
        note: `Знайдено ${matches.length} тег(ів) H1`,
      };
    }

    case "meta.description.missing": {
      const hasDesc =
        /<meta[^>]+name=["']description["'][^>]+content=["'][^"']{3,}["']/i.test(html) ||
        /<meta[^>]+content=["'][^"']{3,}["'][^>]+name=["']description["']/i.test(html);
      return {
        issueFound: !hasDesc,
        note: hasDesc ? "Meta description знайдено" : "Meta description відсутній або порожній",
      };
    }

    case "indexability.noindex_important": {
      const hasNoindex =
        /<meta[^>]+name=["']robots["'][^>]*noindex/i.test(html) ||
        /<meta[^>]+content=["'][^"']*noindex[^"']*["'][^>]*name=["']robots["']/i.test(html);
      return {
        issueFound: hasNoindex,
        note: hasNoindex
          ? "noindex директива знайдена у HTML"
          : "noindex НЕ знайдено у HTML (можливо прибрано)",
      };
    }

    default:
      return {
        issueFound: false,
        note: "Автоматична перевірка не підтримується для цього правила. Перевірте вручну.",
      };
  }
}

function pickSample(urls: string[], n = 2): string[] {
  if (urls.length <= n) return [...urls];
  const shuffled = [...urls].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as VerifyRequest;
    const { urls, ruleId } = body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json({ error: "Список URL не надано" }, { status: 400 });
    }
    if (!ruleId) {
      return NextResponse.json({ error: "ruleId не надано" }, { status: 400 });
    }

    // Sample up to 2 URLs for verification
    const sample = pickSample(urls, 2);

    // Fetch all in parallel
    const fetched = await Promise.all(
      sample.map(async (url) => {
        const { html, ok, error } = await fetchPageHtml(url);
        return { url, html, ok, error };
      })
    );

    const checks: CheckResult[] = fetched.map(({ url, html, ok, error }) => {
      if (!ok || !html) {
        return {
          url,
          issueFound: false,
          note: `Не вдалося отримати сторінку: ${error ?? "невідома помилка"}`,
          error,
        };
      }
      const { issueFound, note } = checkRule(ruleId, html);
      return { url, issueFound, note };
    });

    // Determine overall verdict
    const successfulChecks = checks.filter((c) => !c.error);
    let overallStatus: "verified" | "false_positive" | "unverified" = "unverified";
    let overallNote = "";

    if (successfulChecks.length === 0) {
      overallStatus = "unverified";
      overallNote = "Не вдалося перевірити жодну сторінку";
    } else {
      const issueFoundCount = successfulChecks.filter((c) => c.issueFound).length;
      const falsePositiveCount = successfulChecks.filter((c) => !c.issueFound).length;

      if (falsePositiveCount > 0 && issueFoundCount === 0) {
        overallStatus = "false_positive";
        overallNote = `Перевірено ${successfulChecks.length} сторінок — проблема НЕ підтверджена. Можливо хибно-позитивна.`;
      } else if (issueFoundCount > 0 && falsePositiveCount === 0) {
        overallStatus = "verified";
        overallNote = `Перевірено ${successfulChecks.length} сторінок — проблема ПІДТВЕРДЖЕНА.`;
      } else {
        overallStatus = "unverified";
        overallNote = `Перевірено ${successfulChecks.length} сторінок — суперечливі результати (${issueFoundCount} підтверджено, ${falsePositiveCount} не підтверджено).`;
      }
    }

    return NextResponse.json({
      status: overallStatus,
      note: overallNote,
      sampledUrls: sample,
      checks,
    });
  } catch (err) {
    console.error("[verify-finding]", err);
    return NextResponse.json(
      { error: "Помилка сервера при перевірці" },
      { status: 500 }
    );
  }
}
