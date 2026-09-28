import type {
  TechAuditResult,
  MirrorCheck,
  HttpsCheck,
  RobotsTxtCheck,
  SitemapCheck,
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

async function safeGet(url: string): Promise<{ text: string | null; status: number | null; error?: string }> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": BOT_UA },
      signal: AbortSignal.timeout(12000),
      redirect: "follow",
    });
    if (!res.ok) return { text: null, status: res.status };
    const text = await res.text();
    return { text, status: res.status };
  } catch (e) {
    return { text: null, status: null, error: (e as Error).message };
  }
}

// ─── Main mirror check ────────────────────────────────────────────────────────
export async function checkMainMirror(domain: string): Promise<MirrorCheck> {
  // Normalize: strip protocol and trailing slash
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

  // Determine canonical
  const wwwFinalHost = www.finalUrl ? new URL(www.finalUrl).hostname : null;
  const nonWwwFinalHost = nonwww.finalUrl ? new URL(nonwww.finalUrl).hostname : null;

  let canonical: MirrorCheck["canonical"] = "unknown";
  let note = "";

  if (wwwOk && nonWwwOk) {
    const wwwPointsToNonWww =
      wwwFinalHost && !wwwFinalHost.startsWith("www.");
    const nonWwwPointsToWww =
      nonWwwFinalHost && nonWwwFinalHost.startsWith("www.");

    if (wwwPointsToNonWww && !nonWwwPointsToWww) {
      canonical = "non-www";
      note = `www редиректить на non-www (${nonWwwDomain}). Основне дзеркало: ${nonWwwDomain}.`;
    } else if (nonWwwPointsToWww && !wwwPointsToNonWww) {
      canonical = "www";
      note = `non-www редиректить на www (${wwwDomain}). Основне дзеркало: ${wwwDomain}.`;
    } else if (!wwwPointsToNonWww && !nonWwwPointsToWww) {
      canonical = "both";
      note = `Обидва дзеркала відповідають без редиректу між собою — можливе дублювання контенту!`;
    } else {
      canonical = "unknown";
      note = "Неоднозначна конфігурація редиректів між www та non-www.";
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
  // Remove www for root check
  const root = bare.replace(/^www\./, "");

  const [httpRes, httpsRes] = await Promise.all([
    safeHead(`http://${root}/`, true),
    safeHead(`https://${root}/`, true),
  ]);

  const httpsWorks = httpsRes.status !== null && httpsRes.status < 400;
  const httpRedirectsToHttps =
    httpRes.finalUrl?.startsWith("https://") ?? false;

  let note = "";
  let status: HttpsCheck["status"] = "ok";

  if (!httpsWorks) {
    status = "error";
    note = `HTTPS не працює (статус: ${httpsRes.status ?? "timeout/error"}).`;
  } else if (!httpRedirectsToHttps) {
    status = "issue";
    note = `HTTP не редиректить на HTTPS — обидва протоколи доступні одночасно (дублювання!).`;
  } else {
    note = `HTTP → HTTPS редирект налаштовано правильно.`;
  }

  return {
    status,
    httpRedirectsToHttps,
    httpsStatusCode: httpsRes.status,
    note,
  };
}

// ─── robots.txt check ─────────────────────────────────────────────────────────
export async function checkRobotsTxt(domain: string): Promise<RobotsTxtCheck> {
  const bare = domain.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  const url = `https://${bare}/robots.txt`;

  const { text, status, error } = await safeGet(url);

  if (error || status === null) {
    return {
      status: "error",
      exists: false,
      hasSitemapDirective: false,
      blocksGooglebot: false,
      blocksAll: false,
      disallowedPaths: [],
      sitemapUrls: [],
      note: `Не вдалося отримати robots.txt: ${error ?? "помилка з'єднання"}.`,
    };
  }

  if (status === 404 || !text) {
    return {
      status: "issue",
      exists: false,
      hasSitemapDirective: false,
      blocksGooglebot: false,
      blocksAll: false,
      disallowedPaths: [],
      sitemapUrls: [],
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
    const [key, ...rest] = line.split(":");
    const value = rest.join(":").trim();

    if (key.toLowerCase() === "user-agent") {
      currentAgent = value.toLowerCase();
    } else if (key.toLowerCase() === "disallow") {
      if (value === "/") {
        if (currentAgent === "*") blocksAll = true;
        if (currentAgent === "googlebot") blocksGooglebot = true;
      }
      if (currentAgent === "*" || currentAgent === "googlebot") {
        if (value) disallowedPaths.push(value);
      }
    } else if (key.toLowerCase() === "sitemap") {
      sitemapUrls.push(value);
    }
  }

  const hasSitemapDirective = sitemapUrls.length > 0;
  let noteparts: string[] = [];
  let checkStatus: RobotsTxtCheck["status"] = "ok";

  if (blocksAll) {
    checkStatus = "issue";
    noteparts.push("⚠️ Заблоковано краулінг для ВСІХ роботів (Disallow: / для *).");
  }
  if (blocksGooglebot) {
    checkStatus = "issue";
    noteparts.push("⚠️ Заблоковано краулінг для Googlebot.");
  }
  if (!hasSitemapDirective) {
    noteparts.push("Директива Sitemap відсутня.");
  } else {
    noteparts.push(`Sitemap вказано: ${sitemapUrls.join(", ")}.`);
  }
  if (noteparts.length === 0) noteparts.push("robots.txt налаштовано коректно.");

  return {
    status: checkStatus,
    exists: true,
    hasSitemapDirective,
    blocksGooglebot,
    blocksAll,
    disallowedPaths: disallowedPaths.slice(0, 20),
    sitemapUrls,
    note: noteparts.join(" "),
  };
}

// ─── Sitemap check ────────────────────────────────────────────────────────────
export async function checkSitemap(
  domain: string,
  robotsTxtSitemapUrls: string[] = []
): Promise<SitemapCheck> {
  const bare = domain.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  const candidates = [
    ...robotsTxtSitemapUrls,
    `https://${bare}/sitemap.xml`,
    `https://${bare}/sitemap_index.xml`,
    `https://${bare}/sitemap/sitemap.xml`,
  ];

  for (const url of candidates) {
    const { text, status } = await safeGet(url);
    if (status && status < 400 && text) {
      // Count <url> or <sitemap> entries
      const urlMatches = text.match(/<url>/gi) ?? [];
      const sitemapMatches = text.match(/<sitemap>/gi) ?? [];
      const count = urlMatches.length + sitemapMatches.length;
      return {
        status: "ok",
        exists: true,
        url,
        urlCount: count || null,
        note: `Sitemap знайдено: ${url}${count ? ` (${count} записів)` : ""}. `,
      };
    }
  }

  return {
    status: "issue",
    exists: false,
    url: null,
    urlCount: null,
    note: "Sitemap.xml не знайдено. Рекомендується створити та вказати в robots.txt.",
  };
}

// ─── PageSpeed check (Google PSI) ────────────────────────────────────────────
export async function checkPageSpeed(
  url: string,
  apiKey?: string
): Promise<PageSpeedCheck> {
  const apiUrl = new URL(
    "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"
  );
  apiUrl.searchParams.set("url", url);
  apiUrl.searchParams.set("strategy", "mobile");
  apiUrl.searchParams.set("category", "performance");
  if (apiKey) apiUrl.searchParams.set("key", apiKey);

  try {
    const res = await fetch(apiUrl.toString(), {
      signal: AbortSignal.timeout(45000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return {
        status: "error",
        performanceScore: null,
        lcpMs: null,
        clsScore: null,
        fcpMs: null,
        tbtMs: null,
        note: `PSI API помилка: HTTP ${res.status}. ${errText.slice(0, 200)}`,
      };
    }

    const data = await res.json();
    const cats = data?.lighthouseResult?.categories;
    const audits = data?.lighthouseResult?.audits;

    const score = cats?.performance?.score != null
      ? Math.round(cats.performance.score * 100)
      : null;
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
      clsScore: cls ? parseFloat(cls.toFixed(3)) : null,
      fcpMs: fcp ? Math.round(fcp) : null,
      tbtMs: tbt ? Math.round(tbt) : null,
      note:
        score !== null
          ? `PageSpeed Score (mobile): ${score}/100. LCP: ${lcp ? (lcp / 1000).toFixed(2) + "s" : "н/д"}, CLS: ${cls?.toFixed(3) ?? "н/д"}, FCP: ${fcp ? (fcp / 1000).toFixed(2) + "s" : "н/д"}.`
          : "Не вдалося отримати дані PageSpeed.",
    };
  } catch (e) {
    return {
      status: "error",
      performanceScore: null,
      lcpMs: null,
      clsScore: null,
      fcpMs: null,
      tbtMs: null,
      note: `Помилка отримання PSI: ${(e as Error).message}`,
    };
  }
}

// ─── Run full tech audit ──────────────────────────────────────────────────────
export async function runTechAudit(
  domain: string,
  options: { psiApiKey?: string; runPageSpeed?: boolean } = {}
): Promise<TechAuditResult> {
  const bare = domain.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  const canonical = bare.startsWith("www.") ? bare : bare;

  const [mirror, https, robots] = await Promise.all([
    checkMainMirror(bare),
    checkHttps(bare),
    checkRobotsTxt(bare),
  ]);

  const sitemap = await checkSitemap(bare, robots.sitemapUrls);

  let pageSpeed: PageSpeedCheck | undefined;
  if (options.runPageSpeed) {
    pageSpeed = await checkPageSpeed(`https://${canonical}/`, options.psiApiKey);
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
