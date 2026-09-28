import type {
  TechAuditResult,
  MirrorCheck,
  HttpsCheck,
  RobotsTxtCheck,
  RobotsTxtPathAnalysis,
  SitemapCheck,
  SitemapStatusIssue,
  PageSpeedCheck,
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

  const [mirror, https, robots] = await Promise.all([
    checkMainMirror(bare),
    checkHttps(bare),
    checkRobotsTxt(bare, sfUrls),
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
  };
}
