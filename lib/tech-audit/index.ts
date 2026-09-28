import type {
  TechAuditResult,
  MirrorCheck,
  HttpsCheck,
  RobotsTxtCheck,
  RobotsTxtPathAnalysis,
  SitemapCheck,
  SitemapStatusIssue,
  PageSpeedCheck,
  StructuredDataCheck,
  OpenGraphCheck,
  SecurityHeadersCheck,
  AnalyticsCheck,
  CompressionCheck,
  ServerInfoCheck,
  HreflangCheck,
  PageTechCheck,
} from "@/types";

const BOT_UA =
  "Mozilla/5.0 (compatible; SEOAuditBot/1.0; +https://seo-audit-engine.vercel.app)";

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function safeHead(
  url: string,
  follow = false
): Promise<{ status: number | null; finalUrl: string; error?: string }> {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": BOT_UA, Accept: "text/html" },
      redirect: follow ? "follow" : "manual",
      signal: AbortSignal.timeout(10000),
    });
    return { status: res.status, finalUrl: res.url || url };
  } catch (e) {
    return { status: null, finalUrl: url, error: (e as Error).message };
  }
}

async function safeGet(url: string, timeoutMs = 12000): Promise<{ text: string | null; status: number | null; headers?: Headers; error?: string }> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": BOT_UA, Accept: "text/html,application/xml,text/xml,*/*" },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
    });
    if (!res.ok) return { text: null, status: res.status };
    const text = await res.text();
    return { text, status: res.status, headers: res.headers };
  } catch (e) {
    return { text: null, status: null, error: (e as Error).message };
  }
}

async function safeStatus(url: string): Promise<number | null> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": BOT_UA },
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
    });
    return res.status;
  } catch {
    return null;
  }
}

// ─── Batch status checker (max 8 concurrent) ─────────────────────────────────
async function batchCheckStatus(urls: string[], limit = 8): Promise<Map<string, number | null>> {
  const results = new Map<string, number | null>();
  for (let i = 0; i < urls.length; i += limit) {
    const chunk = urls.slice(i, i + limit);
    const statuses = await Promise.all(chunk.map((u) => safeStatus(u)));
    chunk.forEach((u, idx) => results.set(u, statuses[idx]));
  }
  return results;
}

// ─── Main mirror check ────────────────────────────────────────────────────────
export async function checkMainMirror(domain: string): Promise<MirrorCheck> {
  const bare = domain.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  const isWww = bare.startsWith("www.");
  const wwwDomain = isWww ? bare : `www.${bare}`;
  const nonWwwDomain = isWww ? bare.replace(/^www\./, "") : bare;

  const [www, nonwww] = await Promise.all([
    safeHead(`https://${wwwDomain}/`, true),
    safeHead(`https://${nonWwwDomain}/`, true),
  ]);

  const wwwOk = www.status !== null && www.status < 400;
  const nonWwwOk = nonwww.status !== null && nonwww.status < 400;

  let wwwFinalHost: string | null = null;
  let nonWwwFinalHost: string | null = null;
  try { wwwFinalHost = www.finalUrl ? new URL(www.finalUrl).hostname : null; } catch {}
  try { nonWwwFinalHost = nonwww.finalUrl ? new URL(nonwww.finalUrl).hostname : null; } catch {}

  let canonical: MirrorCheck["canonical"] = "unknown";
  let note = "";

  if (wwwOk && nonWwwOk) {
    const wwwPointsToNonWww = wwwFinalHost && !wwwFinalHost.startsWith("www.");
    const nonWwwPointsToWww = nonWwwFinalHost && nonWwwFinalHost.startsWith("www.");

    if (wwwPointsToNonWww && !nonWwwPointsToWww) {
      canonical = "non-www";
      note = `www редиректить на non-www (${nonWwwDomain}). Основне дзеркало: ${nonWwwDomain}. ✅`;
    } else if (nonWwwPointsToWww && !wwwPointsToNonWww) {
      canonical = "www";
      note = `non-www редиректить на www (${wwwDomain}). Основне дзеркало: ${wwwDomain}. ✅`;
    } else if (!wwwPointsToNonWww && !nonWwwPointsToWww) {
      canonical = "both";
      note = `Обидва дзеркала відповідають без редиректу між собою — можливе дублювання контенту! Налаштуйте 301-редирект з одного на інше.`;
    } else {
      canonical = "unknown";
      note = "Неоднозначна конфігурація редиректів між www та non-www. Перевірте вручну.";
    }
  } else if (!wwwOk) {
    canonical = "non-www";
    note = `www не відповідає (статус ${www.status ?? "timeout"}). Основний домен: ${nonWwwDomain}.`;
  } else if (!nonWwwOk) {
    canonical = "www";
    note = `non-www не відповідає (статус ${nonwww.status ?? "timeout"}). Основний домен: ${wwwDomain}.`;
  } else {
    note = "Не вдалося визначити основне дзеркало.";
  }

  return {
    status: canonical === "both" ? "issue" : canonical === "unknown" ? "error" : "ok",
    canonical,
    wwwFinalUrl: www.finalUrl,
    nonWwwFinalUrl: nonwww.finalUrl,
    wwwStatusCode: www.status,
    nonWwwStatusCode: nonwww.status,
    note,
  };
}

// ─── HTTPS check ──────────────────────────────────────────────────────────────
export async function checkHttps(domain: string): Promise<HttpsCheck> {
  const bare = domain.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  const root = bare.replace(/^www\./, "");

  const [httpRes, httpsRes] = await Promise.all([
    safeHead(`http://${root}/`, true),
    safeHead(`https://${root}/`, true),
  ]);

  const httpsWorks = httpsRes.status !== null && httpsRes.status < 400;
  const httpRedirectsToHttps = httpRes.finalUrl?.startsWith("https://") ?? false;

  let note = "";
  let status: HttpsCheck["status"] = "ok";

  if (!httpsWorks) {
    status = "error";
    note = `HTTPS не працює (статус: ${httpsRes.status ?? "timeout/error"}).`;
  } else if (!httpRedirectsToHttps) {
    status = "issue";
    note = `HTTP не редиректить на HTTPS — обидва протоколи доступні одночасно (дублювання контенту!). Налаштуйте 301 HTTP→HTTPS.`;
  } else {
    note = `HTTP → HTTPS редирект налаштовано правильно. ✅`;
  }

  return { status, httpRedirectsToHttps, httpsStatusCode: httpsRes.status, note };
}

// ─── robots.txt check ─────────────────────────────────────────────────────────
// Known "safe to block" path patterns
const SAFE_BLOCK_PATTERNS = [
  /^\/(admin|wp-admin|wp-login|dashboard|backend|cms|panel)/i,
  /^\/(api|graphql|rest|ajax|json|xml)\b/i,
  /^\/(search|results|find|query)\b/i,
  /^\/(cart|checkout|account|login|register|profile|orders|wishlist)\b/i,
  /^\/(filter|sort|facet|tag|tags|label|labels)\b/i,
  /^\/\?/,
  /^\/(feed|rss|atom)\b/i,
  /^\/(wp-content|wp-includes|wp-json)/i,
  /\.(js|css|jpg|jpeg|png|gif|svg|ico|woff|woff2|ttf|map|ts)$/i,
];

function assessBlockedPath(path: string, blockedCount: number): RobotsTxtPathAnalysis {
  const isSafe = SAFE_BLOCK_PATTERNS.some((p) => p.test(path));

  if (path === "/") {
    return { path, blockedSFUrlCount: blockedCount, assessment: "risky", reason: "Заблоковано весь сайт!" };
  }
  if (isSafe && blockedCount === 0) {
    return { path, blockedSFUrlCount: 0, assessment: "safe", reason: "Технічний/утилітарний шлях, не проіндексований SF — норма." };
  }
  if (isSafe && blockedCount > 0) {
    return { path, blockedSFUrlCount: blockedCount, assessment: "review", reason: `Шлях схожий на службовий, але ${blockedCount} URL з SF підпадають — перевірте, чи заблокований потрібний контент.` };
  }
  if (!isSafe && blockedCount === 0) {
    return { path, blockedSFUrlCount: 0, assessment: "safe", reason: "Заблокований шлях, але SF не знайшов таких URL — може бути нормою або застарілим правилом." };
  }
  // Non-safe path with blocked URLs → risky
  return {
    path,
    blockedSFUrlCount: blockedCount,
    assessment: "risky",
    reason: `${blockedCount} сторінок SF заблоковані цим правилом — перевірте, чи це навмисно. Серед них можуть бути важливі сторінки.`,
  };
}

export async function checkRobotsTxt(
  domain: string,
  sfUrls: string[] = []
): Promise<RobotsTxtCheck> {
  const bare = domain.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  const url = `https://${bare}/robots.txt`;

  const { text, status, error } = await safeGet(url);

  if (error || status === null) {
    return {
      status: "error", exists: false, hasSitemapDirective: false,
      blocksGooglebot: false, blocksAll: false, disallowedPaths: [], sitemapUrls: [],
      note: `Не вдалося отримати robots.txt: ${error ?? "помилка з'єднання"}.`,
    };
  }

  if (status === 404 || !text) {
    return {
      status: "issue", exists: false, hasSitemapDirective: false,
      blocksGooglebot: false, blocksAll: false, disallowedPaths: [], sitemapUrls: [],
      note: "robots.txt відсутній (HTTP 404). Рекомендується створити файл із директивою Sitemap.",
    };
  }

  // Parse robots.txt
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  let currentAgent: string | null = null;
  let blocksAll = false;
  let blocksGooglebot = false;
  const disallowedPaths: string[] = [];
  const sitemapUrls: string[] = [];

  for (const line of lines) {
    if (/^#/.test(line)) continue;
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();

    if (key === "user-agent") {
      currentAgent = value.toLowerCase();
    } else if (key === "disallow") {
      if (value === "/") {
        if (currentAgent === "*") blocksAll = true;
        if (currentAgent === "googlebot") blocksGooglebot = true;
      }
      if ((currentAgent === "*" || currentAgent === "googlebot") && value) {
        if (!disallowedPaths.includes(value)) disallowedPaths.push(value);
      }
    } else if (key === "sitemap") {
      if (value) sitemapUrls.push(value);
    }
  }

  // Cross-reference disallowed paths with SF URLs
  const pathAnalysis: RobotsTxtPathAnalysis[] = disallowedPaths.slice(0, 30).map((path) => {
    const blocked = sfUrls.filter((u) => {
      try { return new URL(u).pathname.startsWith(path); } catch { return false; }
    }).length;
    return assessBlockedPath(path, blocked);
  });

  const hasSitemapDirective = sitemapUrls.length > 0;
  const noteparts: string[] = [];
  let checkStatus: RobotsTxtCheck["status"] = "ok";

  if (blocksAll) {
    checkStatus = "issue";
    noteparts.push("⚠️ Заблоковано краулінг для ВСІХ роботів (Disallow: / для *).");
  }
  if (blocksGooglebot) {
    checkStatus = "issue";
    noteparts.push("⚠️ Заблоковано краулінг для Googlebot.");
  }

  const riskyPaths = pathAnalysis.filter((p) => p.assessment === "risky" && p.path !== "/");
  if (riskyPaths.length > 0 && checkStatus === "ok") checkStatus = "issue";
  if (riskyPaths.length > 0) {
    noteparts.push(`⚠️ ${riskyPaths.length} правил Disallow можуть блокувати важливі сторінки.`);
  }

  if (!hasSitemapDirective) {
    noteparts.push("Директива Sitemap відсутня в robots.txt.");
  } else {
    noteparts.push(`Sitemap вказано: ${sitemapUrls.join(", ")}.`);
  }
  if (noteparts.length === 0) noteparts.push("robots.txt налаштовано коректно. ✅");

  return {
    status: checkStatus,
    exists: true,
    hasSitemapDirective,
    blocksGooglebot,
    blocksAll,
    disallowedPaths: disallowedPaths.slice(0, 30),
    sitemapUrls,
    note: noteparts.join(" "),
    pathAnalysis,
  };
}

// ─── Sitemap XML parser ───────────────────────────────────────────────────────
function extractSitemapUrls(xml: string): string[] {
  const urls: string[] = [];
  const locRegex = /<loc>([\s\S]*?)<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = locRegex.exec(xml)) !== null) {
    const loc = m[1].trim();
    if (loc) urls.push(loc);
  }
  return urls;
}

function isSitemapIndex(xml: string): boolean {
  return /<sitemapindex/i.test(xml);
}

// ─── Sitemap check ────────────────────────────────────────────────────────────
export async function checkSitemap(
  domain: string,
  robotsTxtSitemapUrls: string[] = [],
  sfTotalUrls?: number
): Promise<SitemapCheck> {
  const bare = domain.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  const candidates = [
    ...robotsTxtSitemapUrls,
    `https://${bare}/sitemap.xml`,
    `https://${bare}/sitemap_index.xml`,
    `https://${bare}/sitemap/sitemap.xml`,
    `https://${bare}/sitemap-index.xml`,
  ];

  let foundUrl: string | null = null;
  let mainXml: string | null = null;

  for (const url of candidates) {
    const { text, status } = await safeGet(url);
    if (status && status < 400 && text) {
      foundUrl = url;
      mainXml = text;
      break;
    }
  }

  if (!foundUrl || !mainXml) {
    return {
      status: "issue", exists: false, url: null, urlCount: null,
      note: "Sitemap.xml не знайдено. Рекомендується створити та вказати в robots.txt.",
    };
  }

  // Collect all page URLs (follow sitemap index)
  let allPageUrls: string[] = [];

  if (isSitemapIndex(mainXml)) {
    const subSitemapUrls = extractSitemapUrls(mainXml);
    // Fetch sub-sitemaps (max 15 to stay within time budget)
    const subResults = await Promise.all(
      subSitemapUrls.slice(0, 15).map((u) => safeGet(u, 10000))
    );
    for (const res of subResults) {
      if (res.text) {
        allPageUrls.push(...extractSitemapUrls(res.text));
      }
    }
  } else {
    allPageUrls = extractSitemapUrls(mainXml);
  }

  const urlCount = allPageUrls.length;

  // SF comparison
  let sfComparison: SitemapCheck["sfComparison"] | undefined;
  if (sfTotalUrls !== undefined && sfTotalUrls > 0 && urlCount > 0) {
    const missingFromSitemapEstimate = Math.max(0, sfTotalUrls - urlCount);
    sfComparison = { sitemapUrlCount: urlCount, sfUrlCount: sfTotalUrls, missingFromSitemapEstimate };
  }

  // Status code check on sample (first 40 unique page URLs)
  const sampleUrls = Array.from(new Set(allPageUrls)).slice(0, 40);
  const statusMap = await batchCheckStatus(sampleUrls);

  const statusIssues: SitemapStatusIssue[] = [];
  for (const [url, code] of Array.from(statusMap.entries())) {
    if (code === null) continue;
    if (code >= 300 && code < 400) {
      statusIssues.push({ url, statusCode: code, type: "redirect" });
    } else if (code >= 400 && code < 500) {
      statusIssues.push({ url, statusCode: code, type: "client_error" });
    } else if (code >= 500) {
      statusIssues.push({ url, statusCode: code, type: "server_error" });
    }
  }

  // Build note
  const parts: string[] = [];
  let checkStatus: SitemapCheck["status"] = "ok";

  parts.push(`Sitemap знайдено: ${foundUrl} (${urlCount.toLocaleString("uk")} URL).`);

  if (sfComparison && sfComparison.missingFromSitemapEstimate > 0) {
    const pct = Math.round((sfComparison.missingFromSitemapEstimate / sfComparison.sfUrlCount) * 100);
    if (pct > 10) {
      checkStatus = "issue";
      parts.push(`⚠️ SF просканував ${sfComparison.sfUrlCount.toLocaleString("uk")} URL, а в sitemap лише ${urlCount.toLocaleString("uk")} — приблизно ${sfComparison.missingFromSitemapEstimate.toLocaleString("uk")} сторінок (~${pct}%) відсутні в sitemap.`);
    } else {
      parts.push(`SF просканував ${sfComparison.sfUrlCount.toLocaleString("uk")} URL vs ${urlCount.toLocaleString("uk")} у sitemap — незначна різниця (~${pct}%).`);
    }
  } else if (sfComparison && sfComparison.sfUrlCount > urlCount * 1.05) {
    parts.push(`Кількість URL у sitemap (${urlCount.toLocaleString("uk")}) дещо менша за SF (${sfComparison.sfUrlCount.toLocaleString("uk")}).`);
  }

  if (statusIssues.length > 0) {
    const redirects = statusIssues.filter((i) => i.type === "redirect").length;
    const errors = statusIssues.filter((i) => i.type !== "redirect").length;
    if (errors > 0) {
      checkStatus = "issue";
      parts.push(`⚠️ ${errors} URL у sitemap повертають помилки (4xx/5xx).`);
    }
    if (redirects > 0) {
      if (checkStatus === "ok") checkStatus = "issue";
      parts.push(`⚠️ ${redirects} URL у sitemap є редиректами (301/302) — sitemap має посилатись на фінальні URL.`);
    }
  } else if (sampleUrls.length > 0) {
    parts.push(`Перевірено ${sampleUrls.length} URL — всі відповідають 200. ✅`);
  }

  return {
    status: checkStatus,
    exists: true,
    url: foundUrl,
    urlCount,
    note: parts.join(" "),
    sfComparison,
    statusIssues: statusIssues.slice(0, 20),
    sampleChecked: sampleUrls.length,
    allSitemapUrls: allPageUrls.slice(0, 200),
  };
}

// ─── PageSpeed check (Google PSI) ────────────────────────────────────────────
export async function checkPageSpeed(
  url: string,
  apiKey?: string
): Promise<PageSpeedCheck> {
  const apiUrl = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  apiUrl.searchParams.set("url", url);
  apiUrl.searchParams.set("strategy", "mobile");
  apiUrl.searchParams.set("category", "performance");
  if (apiKey) apiUrl.searchParams.set("key", apiKey);

  try {
    const res = await fetch(apiUrl.toString(), { signal: AbortSignal.timeout(45000) });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return {
        status: "error", performanceScore: null, lcpMs: null, clsScore: null, fcpMs: null, tbtMs: null,
        note: `PSI API помилка: HTTP ${res.status}. ${errText.slice(0, 200)}`,
      };
    }

    const data = await res.json();
    const cats = data?.lighthouseResult?.categories;
    const audits = data?.lighthouseResult?.audits;

    const score = cats?.performance?.score != null ? Math.round(cats.performance.score * 100) : null;
    const lcp = audits?.["largest-contentful-paint"]?.numericValue ?? null;
    const cls = audits?.["cumulative-layout-shift"]?.numericValue ?? null;
    const fcp = audits?.["first-contentful-paint"]?.numericValue ?? null;
    const tbt = audits?.["total-blocking-time"]?.numericValue ?? null;

    let status: PageSpeedCheck["status"] = "ok";
    if (score !== null) {
      if (score < 50) status = "poor";
      else if (score < 90) status = "needs_attention";
    }

    return {
      status,
      performanceScore: score,
      lcpMs: lcp ? Math.round(lcp) : null,
      clsScore: cls != null ? parseFloat((cls as number).toFixed(3)) : null,
      fcpMs: fcp ? Math.round(fcp) : null,
      tbtMs: tbt ? Math.round(tbt) : null,
      note: score !== null
        ? `PageSpeed Score (mobile): ${score}/100. LCP: ${lcp ? ((lcp as number) / 1000).toFixed(2) + "s" : "н/д"}, CLS: ${cls != null ? (cls as number).toFixed(3) : "н/д"}, FCP: ${fcp ? ((fcp as number) / 1000).toFixed(2) + "s" : "н/д"}.`
        : "Не вдалося отримати дані PageSpeed.",
    };
  } catch (e) {
    return {
      status: "error", performanceScore: null, lcpMs: null, clsScore: null, fcpMs: null, tbtMs: null,
      note: `Помилка отримання PSI: ${(e as Error).message}`,
    };
  }
}

// ─── Structured data check ───────────────────────────────────────────────────
function checkStructuredDataFromHtml(html: string): StructuredDataCheck {
  const hasJsonLd = /<script[^>]+type=["']application\/ld\+json["']/i.test(html);
  const hasMicrodata = /itemscope/i.test(html);

  const types: string[] = [];
  if (hasJsonLd) {
    const matches = html.matchAll(/"@type"\s*:\s*"([^"]+)"/g);
    for (const m of Array.from(matches)) {
      if (!types.includes(m[1])) types.push(m[1]);
    }
  }

  const found = hasJsonLd || hasMicrodata;
  const hasOrgOrWebsite = types.some((t) => ["Organization", "WebSite", "LocalBusiness"].includes(t));

  let status: StructuredDataCheck["status"] = "ok";
  let note = "";

  if (!found) {
    status = "issue";
    note = "Структуровані дані відсутні. Рекомендується додати Schema.org (Organization, WebSite, BreadcrumbList).";
  } else if (hasJsonLd && types.length > 0) {
    note = `Знайдено JSON-LD: ${types.slice(0, 5).join(", ")}${types.length > 5 ? ` +${types.length - 5}` : ""}.`;
    if (!hasOrgOrWebsite) {
      status = "issue";
      note += " Відсутній тип Organization або WebSite.";
    }
  } else if (hasMicrodata) {
    note = "Знайдено Microdata. Рекомендується перейти на JSON-LD.";
  }

  return { status, found, types, hasJsonLd, hasMicrodata, note };
}

// ─── Open Graph check ─────────────────────────────────────────────────────────
function checkOpenGraphFromHtml(html: string): OpenGraphCheck {
  const hasOgTitle = /<meta[^>]+property=["']og:title["']/i.test(html);
  const hasOgDescription = /<meta[^>]+property=["']og:description["']/i.test(html);
  const hasOgImage = /<meta[^>]+property=["']og:image["']/i.test(html);
  const hasTwitterCard = /<meta[^>]+name=["']twitter:card["']/i.test(html);

  const score = [hasOgTitle, hasOgDescription, hasOgImage, hasTwitterCard].filter(Boolean).length;
  let status: OpenGraphCheck["status"] = "ok";
  const missing: string[] = [];
  if (!hasOgTitle) missing.push("og:title");
  if (!hasOgDescription) missing.push("og:description");
  if (!hasOgImage) missing.push("og:image");
  if (!hasTwitterCard) missing.push("twitter:card");

  let note = "";
  if (score === 4) {
    note = "Open Graph і Twitter Card налаштовано повністю. ✅";
  } else if (score >= 2) {
    status = "issue";
    note = `Частково налаштовано (${score}/4). Відсутні: ${missing.join(", ")}.`;
  } else {
    status = "error";
    note = `Open Graph майже не налаштовано (${score}/4). Відсутні: ${missing.join(", ")}.`;
  }

  return { status, hasOgTitle, hasOgDescription, hasOgImage, hasTwitterCard, note };
}

// ─── Security headers check ───────────────────────────────────────────────────
function checkSecurityHeadersFromHeaders(headers: Headers): SecurityHeadersCheck {
  const hsts = !!headers.get("strict-transport-security");
  const xFrameOptions = !!headers.get("x-frame-options");
  const xContentTypeOptions = (headers.get("x-content-type-options") ?? "").toLowerCase().includes("nosniff");
  const csp = !!headers.get("content-security-policy");

  const score = [hsts, xFrameOptions, xContentTypeOptions, csp].filter(Boolean).length;
  const missing: string[] = [];
  if (!hsts) missing.push("HSTS");
  if (!xFrameOptions) missing.push("X-Frame-Options");
  if (!xContentTypeOptions) missing.push("X-Content-Type-Options");
  if (!csp) missing.push("CSP");

  let status: SecurityHeadersCheck["status"] = "ok";
  let note = "";

  if (score === 4) {
    note = "Всі основні заголовки безпеки присутні. ✅";
  } else if (score >= 2) {
    status = "issue";
    note = `${score}/4 заголовків безпеки. Відсутні: ${missing.join(", ")}.`;
  } else {
    status = "error";
    note = `Заголовки безпеки не налаштовано (${score}/4). Відсутні: ${missing.join(", ")}.`;
  }

  return { status, hsts, xFrameOptions, xContentTypeOptions, csp, note };
}

// ─── Analytics check ──────────────────────────────────────────────────────────
function checkAnalyticsFromHtml(html: string): AnalyticsCheck {
  const hasGA4 = /gtag\s*\(\s*["']config["'].*?["']G-[A-Z0-9]/i.test(html) ||
    /G-[A-Z0-9]{6,}/i.test(html) ||
    /google-analytics\.com\/g\/collect/i.test(html);
  const hasGTM = /googletagmanager\.com\/gtm\.js/i.test(html) ||
    /GTM-[A-Z0-9]{4,}/i.test(html);
  const hasGoogleAds = /AW-[0-9]{7,}/i.test(html) ||
    /gtag\s*\(\s*["']config["'].*?["']AW-/i.test(html) ||
    /google_ads_conversion_id/i.test(html);
  const hasMicrosoftClarity = /clarity\.ms\/tag/i.test(html) ||
    /microsoft\.com\/clarity/i.test(html) ||
    /window\.clarity\s*=/.test(html);

  const found = hasGA4 || hasGTM;
  let status: AnalyticsCheck["status"] = "ok";
  const detected: string[] = [];
  if (hasGA4) detected.push("GA4");
  if (hasGTM) detected.push("GTM");
  if (hasGoogleAds) detected.push("Google Ads");
  if (hasMicrosoftClarity) detected.push("MS Clarity");

  let note = "";
  if (!found) {
    status = "issue";
    note = "GA4 / GTM не виявлено. Перевірте встановлення Google Analytics.";
  } else {
    note = `Виявлено: ${detected.join(", ")}. ✅`;
  }

  return { status, hasGA4, hasGTM, hasGoogleAds, hasMicrosoftClarity, note };
}

// ─── Hreflang check ───────────────────────────────────────────────────────────
function checkHreflangFromHtml(html: string): HreflangCheck {
  // Match <link rel="alternate" hreflang="..." href="...">
  const tagRegex = /<link[^>]+hreflang=["']([^"']+)["'][^>]*href=["']([^"']+)["']|<link[^>]+href=["']([^"']+)["'][^>]*hreflang=["']([^"']+)["']/gi;
  const entries: Array<{ lang: string; url: string }> = [];

  let m: RegExpExecArray | null;
  while ((m = tagRegex.exec(html)) !== null) {
    const lang = (m[1] || m[4] || "").toLowerCase().trim();
    const url = (m[2] || m[3] || "").trim();
    if (lang && url) entries.push({ lang, url });
  }

  const count = entries.length;
  const hasHreflang = count > 0;
  const hasXDefault = entries.some((e) => e.lang === "x-default");
  const languages = Array.from(new Set(entries.map((e) => e.lang).filter((l) => l !== "x-default")));

  // Check lang attr on <html> tag vs hreflang entries
  const langAttrMatch = html.match(/<html[^>]+lang=["']([^"']+)["']/i);
  const pageLang = langAttrMatch ? langAttrMatch[1].toLowerCase().split("-")[0] : null;
  const selfLangMatches = pageLang
    ? languages.some((l) => l.startsWith(pageLang))
    : null;

  let status: HreflangCheck["status"] = "ok";
  const parts: string[] = [];

  if (!hasHreflang) {
    status = "unknown";
    parts.push("Hreflang теги відсутні. Якщо сайт однієї мови — норма. Для мультимовних сайтів — необхідно.");
  } else {
    parts.push(`Hreflang: ${count} тегів (${languages.join(", ")}).`);
    if (!hasXDefault) {
      if (status === "ok") status = "issue";
      parts.push("⚠️ Відсутній x-default hreflang.");
    } else {
      parts.push("x-default ✅");
    }
    if (selfLangMatches === false) {
      if (status === "ok") status = "issue";
      parts.push(`⚠️ Мова HTML (${pageLang}) не збігається з hreflang записами.`);
    }
  }

  return { status, hasHreflang, count, languages, hasXDefault, selfLangMatches, note: parts.join(" ") };
}

// ─── Page-level tech check (canonical, manifest, scripts, mixed content) ──────
function checkPageTechFromHtml(html: string, domain: string): PageTechCheck {
  // Self-canonical
  const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']|<link[^>]+href=["']([^"']+)["'][^>]*rel=["']canonical["']/i);
  const canonicalUrl = canonicalMatch ? (canonicalMatch[1] || canonicalMatch[2] || null) : null;

  let hasSelfCanonical = false;
  if (canonicalUrl) {
    try {
      const parsed = new URL(canonicalUrl);
      const canonicalHost = parsed.hostname.replace(/^www\./, "");
      const domainBare = domain.replace(/^www\./, "");
      // Self-canonical if same domain + root path or no path
      hasSelfCanonical = canonicalHost === domainBare && (parsed.pathname === "/" || parsed.pathname === "");
    } catch {
      hasSelfCanonical = false;
    }
  }

  // PWA manifest
  const hasManifest = /<link[^>]+rel=["'][^"']*manifest[^"']*["']/i.test(html);
  // Apple touch icon
  const hasAppleTouchIcon = /<link[^>]+rel=["'][^"']*apple-touch-icon[^"']*["']/i.test(html);

  // Script count (all <script> tags except inline noscript)
  const scriptTags = html.match(/<script[\s>]/gi) ?? [];
  const scriptCount = scriptTags.length;

  // Mixed content: http:// refs to images/scripts/stylesheets in HTTPS page
  const mixedContentPattern = /(?:src|href)=["']http:\/\/(?!localhost)[^"']+["']/gi;
  const mixedMatches = html.match(mixedContentPattern) ?? [];
  const hasMixedContent = mixedMatches.length > 0;

  let status: PageTechCheck["status"] = "ok";
  const parts: string[] = [];

  if (!canonicalUrl) {
    status = "issue";
    parts.push("⚠️ Canonical тег на головній відсутній.");
  } else if (!hasSelfCanonical) {
    status = "issue";
    parts.push(`⚠️ Canonical вказує на іншу URL: ${canonicalUrl.slice(0, 80)}.`);
  } else {
    parts.push("Self-canonical ✅");
  }

  if (hasMixedContent) {
    if (status === "ok") status = "issue";
    parts.push(`⚠️ Mixed content: ${mixedMatches.length} HTTP-ресурсів на HTTPS сторінці.`);
  }

  if (scriptCount > 25) {
    if (status === "ok") status = "needs_attention";
    parts.push(`⚠️ ${scriptCount} <script> тегів на сторінці (норма < 20).`);
  } else {
    parts.push(`Скриптів: ${scriptCount}.`);
  }

  if (hasManifest) parts.push("PWA manifest ✅");
  if (hasAppleTouchIcon) parts.push("Apple touch icon ✅");

  return {
    status,
    hasSelfCanonical,
    canonicalUrl,
    hasManifest,
    hasAppleTouchIcon,
    scriptCount,
    hasMixedContent,
    note: parts.join(" "),
  };
}

// ─── Compression check ────────────────────────────────────────────────────────
function checkCompressionFromHeaders(headers: Headers): CompressionCheck {
  const encoding = headers.get("content-encoding");
  const hasBr = encoding?.includes("br");
  const hasGzip = encoding?.includes("gzip");

  if (hasBr) return { status: "ok", encoding: "br (Brotli)", note: "Brotli-стиснення увімкнено. ✅" };
  if (hasGzip) return { status: "ok", encoding: "gzip", note: "Gzip-стиснення увімкнено. ✅" };
  return { status: "issue", encoding: null, note: "Стиснення не виявлено. Увімкніть Gzip або Brotli на сервері." };
}

// ─── Server info check (from homepage headers + favicon HEAD) ────────────────
function detectCDN(headers: Headers): string | null {
  if (headers.get("cf-ray") || headers.get("cf-cache-status")) return "Cloudflare";
  if (headers.get("x-served-by")?.includes("cache")) return "Fastly";
  if ((headers.get("x-cache") ?? "").toLowerCase().includes("hit")) return "CDN (generic/Varnish)";
  if (headers.get("x-amz-cf-id") || headers.get("x-amz-request-id")) return "AWS CloudFront";
  if (headers.get("x-azure-ref")) return "Azure CDN";
  if (headers.get("x-goog-") || headers.get("via")?.includes("google")) return "Google CDN";
  if (headers.get("server")?.toLowerCase().includes("cloudflare")) return "Cloudflare";
  return null;
}

async function checkServerInfo(domain: string, html: string, headers: Headers, ttfbMs: number): Promise<ServerInfoCheck> {
  const server = headers.get("server") ?? null;
  const cdn = detectCDN(headers);
  const cacheControl = headers.get("cache-control") ?? null;

  const hasViewportMeta = /<meta[^>]+name=["']viewport["']/i.test(html);
  const hasLangAttr = /<html[^>]+lang=["'][^"']+["']/i.test(html);

  // Quick check for favicon
  let hasFavicon = /<link[^>]+rel=["'][^"']*icon[^"']*["']/i.test(html);
  if (!hasFavicon) {
    const faviconStatus = await safeStatus(`https://${domain}/favicon.ico`);
    hasFavicon = faviconStatus !== null && faviconStatus < 400;
  }

  const parts: string[] = [];
  let status: ServerInfoCheck["status"] = "ok";

  // TTFB assessment
  if (ttfbMs > 600) {
    status = "issue";
    parts.push(`⚠️ TTFB: ${ttfbMs}ms (норма < 600ms).`);
  } else if (ttfbMs > 0) {
    parts.push(`TTFB: ${ttfbMs}ms. ✅`);
  }

  if (server) parts.push(`Сервер: ${server}.`);
  if (cdn) parts.push(`CDN: ${cdn}.`);
  if (cacheControl) parts.push(`Cache-Control: ${cacheControl}.`);

  if (!hasViewportMeta) { if (status === "ok") status = "issue"; parts.push("⚠️ Відсутній <meta name=\"viewport\"> (мобільна оптимізація)."); }
  if (!hasLangAttr) { if (status === "ok") status = "issue"; parts.push("⚠️ Відсутній атрибут lang у <html>."); }
  if (!hasFavicon) { if (status === "ok") status = "issue"; parts.push("⚠️ Favicon не знайдено."); }

  if (parts.length === 0 || (hasViewportMeta && hasLangAttr && hasFavicon && ttfbMs <= 600)) {
    parts.unshift("Базова конфігурація сервера в нормі. ✅");
  }

  return { status, server, cdn, cacheControl, ttfbMs, hasViewportMeta, hasLangAttr, hasFavicon, note: parts.join(" ") };
}

// ─── Combined homepage check ──────────────────────────────────────────────────
async function checkHomepage(domain: string): Promise<{
  structuredData: StructuredDataCheck;
  openGraph: OpenGraphCheck;
  securityHeaders: SecurityHeadersCheck;
  analytics: AnalyticsCheck;
  compression: CompressionCheck;
  serverInfo: ServerInfoCheck;
  hreflang: HreflangCheck;
  pageTech: PageTechCheck;
}> {
  const url = `https://${domain}/`;
  try {
    const t0 = Date.now();
    const res = await fetch(url, {
      headers: { "User-Agent": BOT_UA, Accept: "text/html", "Accept-Encoding": "gzip, br" },
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
    });
    const ttfbMs = Date.now() - t0;

    const html = await res.text();
    const headers = res.headers;

    return {
      structuredData: checkStructuredDataFromHtml(html),
      openGraph: checkOpenGraphFromHtml(html),
      securityHeaders: checkSecurityHeadersFromHeaders(headers),
      analytics: checkAnalyticsFromHtml(html),
      compression: checkCompressionFromHeaders(headers),
      serverInfo: await checkServerInfo(domain, html, headers, ttfbMs),
      hreflang: checkHreflangFromHtml(html),
      pageTech: checkPageTechFromHtml(html, domain),
    };
  } catch (e) {
    const errMsg = `Не вдалось завантажити головну сторінку: ${(e as Error).message}`;
    const unknown = { status: "unknown" as const, note: errMsg };
    return {
      structuredData: { ...unknown, found: false, types: [], hasJsonLd: false, hasMicrodata: false },
      openGraph: { ...unknown, hasOgTitle: false, hasOgDescription: false, hasOgImage: false, hasTwitterCard: false },
      securityHeaders: { ...unknown, hsts: false, xFrameOptions: false, xContentTypeOptions: false, csp: false },
      analytics: { ...unknown, hasGA4: false, hasGTM: false, hasGoogleAds: false, hasMicrosoftClarity: false },
      compression: { ...unknown, encoding: null },
      serverInfo: { ...unknown, server: null, cdn: null, cacheControl: null, ttfbMs: null, hasViewportMeta: false, hasLangAttr: false, hasFavicon: false },
      hreflang: { ...unknown, hasHreflang: false, count: 0, languages: [], hasXDefault: false, selfLangMatches: null },
      pageTech: { ...unknown, hasSelfCanonical: false, canonicalUrl: null, hasManifest: false, hasAppleTouchIcon: false, scriptCount: 0, hasMixedContent: false },
    };
  }
}

// ─── Run full tech audit ──────────────────────────────────────────────────────
export async function runTechAudit(
  domain: string,
  options: {
    psiApiKey?: string;
    runPageSpeed?: boolean;
    sfUrls?: string[];
    sfTotalUrls?: number;
  } = {}
): Promise<TechAuditResult> {
  const bare = domain.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  const sfUrls = options.sfUrls ?? [];

  const [mirror, https, robots, homepageChecks] = await Promise.all([
    checkMainMirror(bare),
    checkHttps(bare),
    checkRobotsTxt(bare, sfUrls),
    checkHomepage(bare),
  ]);

  const sitemap = await checkSitemap(bare, robots.sitemapUrls, options.sfTotalUrls);

  let pageSpeed: PageSpeedCheck | undefined;
  if (options.runPageSpeed) {
    pageSpeed = await checkPageSpeed(`https://${bare}/`, options.psiApiKey);
  }

  return {
    domain: bare,
    checkedAt: new Date().toISOString(),
    mirror,
    https,
    robotsTxt: robots,
    sitemap,
    pageSpeed,
    structuredData: homepageChecks.structuredData,
    openGraph: homepageChecks.openGraph,
    securityHeaders: homepageChecks.securityHeaders,
    analytics: homepageChecks.analytics,
    compression: homepageChecks.compression,
    serverInfo: homepageChecks.serverInfo,
    hreflang: homepageChecks.hreflang,
    pageTech: homepageChecks.pageTech,
  };
}
