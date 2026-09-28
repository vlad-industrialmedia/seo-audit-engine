import { NextResponse } from "next/server";
import type { PageSampleCheck, PageSampleAltIssue } from "@/types";

export const maxDuration = 60;

interface CheckPagesRequest {
  pages: Array<{ url: string; pageType: string }>;
  domain: string;
}

// ─── HTML helpers ─────────────────────────────────────────────────────────────

function extractAttr(tag: string, attr: string): string | null {
  const re = new RegExp(`${attr}\\s*=\\s*(?:"([^"]*?)"|'([^']*?)'|([^\\s>]+))`, "i");
  const m = tag.match(re);
  if (!m) return null;
  return (m[1] ?? m[2] ?? m[3] ?? "").trim();
}

/** Extract the main content HTML block. Tries <main>, <article>, then falls back to <body>. */
function extractContentArea(html: string): string {
  const mainM = html.match(/<main[\s>][^]*?<\/main>/i);
  if (mainM) return mainM[0];
  const articleM = html.match(/<article[\s>][^]*?<\/article>/i);
  if (articleM) return articleM[0];
  // Content div patterns
  const contentM = html.match(/<(?:div|section)[^>]+(?:class|id)=["'][^"']*(?:content|main|body|post|article)[^"']*["'][^>]*>[^]*?<\/(?:div|section)>/i);
  if (contentM) return contentM[0];
  // Fall back to body
  const bodyM = html.match(/<body[^>]*>([^]*?)<\/body>/i);
  return bodyM ? bodyM[1] : html;
}

const GENERIC_ALT_WORDS = new Set([
  "image", "photo", "picture", "img", "icon", "logo", "banner",
  "slider", "thumbnail", "thumb", "preview", "pic", "foto",
  "зображення", "фото", "картинка", "логотип",
]);

function isGenericAlt(alt: string, src: string): boolean {
  const a = alt.toLowerCase().trim();
  if (GENERIC_ALT_WORDS.has(a)) return true;
  // Check if alt is just the filename without extension
  const filename = (src.split("/").pop()?.split("?")[0] ?? "").replace(/\.[a-z]{2,5}$/i, "").replace(/[-_]/g, " ").toLowerCase().trim();
  if (filename && filename === a) return true;
  // Number-only or very short (1-2 chars) alt
  if (/^\d+$/.test(a) || a.length <= 2) return true;
  return false;
}

function getAltSuggestion(src: string, pageTitle: string): string {
  // Try to craft a suggestion from the URL path
  const filename = (src.split("/").pop()?.split("?")[0] ?? "").replace(/\.[a-z]{2,5}$/i, "");
  const words = filename.replace(/[-_]/g, " ").replace(/\d+/g, "").trim();
  if (words.length > 3) return `Описовий alt, напр.: "${words}" або пов'язаний з "${pageTitle.slice(0, 30)}"`;
  return `Описовий alt, що відображає зміст зображення на сторінці "${pageTitle.slice(0, 30)}"`;
}

function analyzeImages(contentHtml: string, domain: string, pageTitle: string): {
  imagesTotal: number;
  imagesMissingAlt: number;
  imagesEmptyAlt: number;
  imagesGenericAlt: number;
  altIssues: PageSampleAltIssue[];
} {
  const imgTags = Array.from(contentHtml.matchAll(/<img\b[^>]*>/gi)).map((m) => m[0]);
  const altIssues: PageSampleAltIssue[] = [];
  let imagesMissingAlt = 0, imagesEmptyAlt = 0, imagesGenericAlt = 0;

  for (const tag of imgTags) {
    const src = extractAttr(tag, "src") ?? "";
    // Skip tracking pixels, data URIs, tiny images
    if (src.startsWith("data:") || src.includes("tracking") || src.includes("pixel")) continue;

    const hasAlt = /\balt\s*=/i.test(tag);
    const alt = extractAttr(tag, "alt") ?? "";

    if (!hasAlt) {
      imagesMissingAlt++;
      if (altIssues.length < 5) {
        altIssues.push({ src: src.slice(0, 120), issue: "missing", currentAlt: "", suggestion: getAltSuggestion(src, pageTitle) });
      }
    } else if (alt.trim() === "") {
      imagesEmptyAlt++;
      // Empty alt is OK for decorative images — flag but don't error
    } else if (isGenericAlt(alt, src)) {
      imagesGenericAlt++;
      if (altIssues.length < 5) {
        altIssues.push({ src: src.slice(0, 120), issue: "generic", currentAlt: alt.slice(0, 60), suggestion: getAltSuggestion(src, pageTitle) });
      }
    }
  }

  return {
    imagesTotal: imgTags.length,
    imagesMissingAlt,
    imagesEmptyAlt,
    imagesGenericAlt,
    altIssues,
  };
}

function extractSchemaTypes(html: string): string[] {
  const types: string[] = [];
  const scripts = Array.from(html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi));
  for (const s of scripts) {
    try {
      const data = JSON.parse(s[1]);
      const extractType = (obj: unknown): void => {
        if (!obj || typeof obj !== "object") return;
        const o = obj as Record<string, unknown>;
        if (o["@type"]) {
          const t = Array.isArray(o["@type"]) ? o["@type"] : [o["@type"]];
          types.push(...t.filter((x): x is string => typeof x === "string"));
        }
        for (const v of Object.values(o)) {
          if (Array.isArray(v)) v.forEach(extractType);
          else if (v && typeof v === "object") extractType(v);
        }
      };
      if (Array.isArray(data)) data.forEach(extractType);
      else extractType(data);
    } catch { /* ignore invalid JSON-LD */ }
  }
  return Array.from(new Set(types));
}

// ─── Lazy loading аналіз ─────────────────────────────────────────────────────

/** Повертає частку зображень з атрибутом loading="lazy" (від 0 до 1). */
function analyzeLazyLoading(html: string): number {
  const imgTags = Array.from(html.matchAll(/<img\b[^>]*>/gi)).map((m) => m[0]);
  if (imgTags.length === 0) return 1; // Немає зображень — вважаємо ок
  const lazyCount = imgTags.filter((tag) => /\bloading\s*=\s*["']?lazy["']?/i.test(tag)).length;
  return lazyCount / imgTags.length;
}

// ─── WebP / AVIF детекція ────────────────────────────────────────────────────

/** Повертає true, якщо сторінка використовує WebP або AVIF зображення. */
function detectWebPUsage(html: string): boolean {
  // Перевіряємо <picture> з source type=image/webp або image/avif
  if (/<source\b[^>]+type=["']image\/(webp|avif)["'][^>]*>/i.test(html)) return true;
  // Перевіряємо srcset або src з .webp/.avif розширенням
  if (/(?:src|srcset)=["'][^"']*\.(webp|avif)(?:\?[^"']*)?["']/i.test(html)) return true;
  return false;
}

// ─── Cookie banner / GDPR детекція ──────────────────────────────────────────

/** Повертає true, якщо виявлено ознаки cookie consent банера або GDPR. */
function detectCookieBanner(html: string): boolean {
  const lower = html.toLowerCase();

  // Популярні cookie consent сервіси та їх ознаки
  const signals = [
    "cookiebot",
    "onetrust",
    "cookieconsent",
    "cookie-consent",
    "cookieinformation",
    "cookie_notice",
    "gdpr-cookie",
    "cc-window",
    "cookie-law-info",
    "js-cookie-banner",
    "cookie-banner",
    "consent-banner",
    "privacy-consent",
    "data-cookieconsent",
    "wp-gdpr",
    "complianz",
    // Загальні атрибути data-*
    'data-cookiename',
    'data-cookie-banner',
  ];

  for (const s of signals) {
    if (lower.includes(s)) return true;
  }

  // Перевіряємо наявність типових текстових ознак cookie-повідомлень
  const cookieTextPatterns = [
    /we use cookies/i,
    /cookie policy/i,
    /accept cookies/i,
    /gdpr/i,
    /ми використовуємо cookies/i,
    /використання cookies/i,
    /погодитися з cookie/i,
  ];

  return cookieTextPatterns.some((p) => p.test(html));
}

function countLinks(html: string, domain: string): { internal: number; external: number } {
  const hrefs = Array.from(html.matchAll(/href=["']([^"']+)["']/gi)).map((m) => m[1]);
  let internal = 0, external = 0;
  const domainClean = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  for (const href of hrefs) {
    if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
    if (href.startsWith("/") || href.includes(domainClean)) internal++;
    else if (href.startsWith("http")) external++;
    else internal++; // relative links
  }
  return { internal, external };
}

function estimateWordCount(html: string): number {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.split(/\s+/).filter((w) => w.length > 1).length;
}

// ─── Per-page check ───────────────────────────────────────────────────────────
async function checkPage(url: string, pageType: string, domain: string): Promise<PageSampleCheck> {
  const TIMEOUT_MS = 12000;
  const issues: string[] = [];
  const result: PageSampleCheck = {
    url,
    pageType,
    fetchOk: false,
    imagesTotal: 0,
    imagesMissingAlt: 0,
    imagesEmptyAlt: 0,
    imagesGenericAlt: 0,
    altIssues: [],
    schemaTypes: [],
    internalLinksCount: 0,
    externalLinksCount: 0,
    wordCount: 0,
    issues: [],
    // Розширені поля
    lazyLoadRatio: 0,
    hasWebP: false,
    hasCookieBanner: false,
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SEO-Audit-Bot/1.0)",
        Accept: "text/html",
      },
      redirect: "follow",
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      result.error = `HTTP ${res.status}`;
      result.issues.push(`Сторінка повернула ${res.status}`);
      return result;
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      result.error = `Not HTML (${contentType})`;
      return result;
    }

    const html = await res.text();
    result.fetchOk = true;

    // Extract title for alt suggestions
    const titleM = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const pageTitle = (titleM?.[1] ?? "").trim();

    // Content area analysis
    const contentArea = extractContentArea(html);
    const imgData = analyzeImages(contentArea, domain, pageTitle);
    result.imagesTotal = imgData.imagesTotal;
    result.imagesMissingAlt = imgData.imagesMissingAlt;
    result.imagesEmptyAlt = imgData.imagesEmptyAlt;
    result.imagesGenericAlt = imgData.imagesGenericAlt;
    result.altIssues = imgData.altIssues;

    // Schema types from whole page
    result.schemaTypes = extractSchemaTypes(html);

    // Link count
    const links = countLinks(html, domain);
    result.internalLinksCount = links.internal;
    result.externalLinksCount = links.external;

    // Word count from content area
    result.wordCount = estimateWordCount(contentArea);

    // ─── Розширені перевірки ────────────────────────────────────────────────

    // Lazy loading: аналіз усього HTML (включно з фоновими зображеннями поза content-area)
    result.lazyLoadRatio = analyzeLazyLoading(html);

    // WebP/AVIF: перевірка використання сучасних форматів
    result.hasWebP = detectWebPUsage(html);

    // Cookie banner: перевірка наявності GDPR-банера
    result.hasCookieBanner = detectCookieBanner(html);

    // Issue detection
    if (result.imagesMissingAlt > 0) {
      issues.push(`${result.imagesMissingAlt} зображень без alt у контентній зоні`);
    }
    if (result.imagesGenericAlt > 0) {
      issues.push(`${result.imagesGenericAlt} зображень із неінформативним alt`);
    }
    if (result.wordCount < 300 && result.wordCount > 0) {
      issues.push(`Тонкий контент: ~${result.wordCount} слів`);
    }
    if (result.internalLinksCount < 3 && pageType !== "homepage") {
      issues.push(`Мало внутрішніх посилань: ${result.internalLinksCount}`);
    }
    if (result.schemaTypes.length === 0) {
      issues.push("Відсутня мікророзмітка Schema.org");
    }

    // Lazy loading: якщо менше 50% зображень мають lazy — попередження
    if (result.imagesTotal >= 3 && result.lazyLoadRatio < 0.5) {
      const pct = Math.round(result.lazyLoadRatio * 100);
      issues.push(`Lazy loading: лише ${pct}% зображень мають loading="lazy"`);
    }

    // WebP: відсутність сучасних форматів
    if (result.imagesTotal > 0 && !result.hasWebP) {
      issues.push("Зображення не використовують WebP/AVIF — можливе збільшення LCP");
    }

    result.issues = issues;
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    result.error = msg.includes("abort") ? "Timeout (>12s)" : msg.slice(0, 100);
    result.issues.push(`Помилка завантаження: ${result.error}`);
  }

  return result;
}

// ─── Route handler ────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CheckPagesRequest;
    const { pages, domain } = body;

    if (!pages?.length || !domain) {
      return NextResponse.json({ error: "pages та domain обов'язкові" }, { status: 400 });
    }

    // Cap at 20 pages to stay within timeout
    const toCheck = pages.slice(0, 20);

    console.log(`[check-pages] domain=${domain} pages=${toCheck.length}`);

    // Run checks in parallel (max 5 at a time to avoid overloading)
    const BATCH = 5;
    const results: PageSampleCheck[] = [];
    for (let i = 0; i < toCheck.length; i += BATCH) {
      const batch = toCheck.slice(i, i + BATCH);
      const batchResults = await Promise.all(batch.map((p) => checkPage(p.url, p.pageType, domain)));
      results.push(...batchResults);
    }

    return NextResponse.json({ pages: results });
  } catch (err) {
    console.error("[check-pages]", err);
    return NextResponse.json(
      { error: "Помилка перевірки сторінок", detail: (err as Error).message },
      { status: 500 }
    );
  }
}
