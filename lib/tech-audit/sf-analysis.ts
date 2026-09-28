import type {
  SFRow,
  SFAnalysis,
  SFHttpStatusCheck,
  SFCanonicalCheck,
  SFIndexabilityCheck,
  SFTitleCheck,
  SFDescriptionCheck,
  SFH1Check,
  SFContentCheck,
  SFUrlCheck,
  SFCrawlDepthCheck,
  TechCheckStatus,
} from "@/types";

// Only analyze HTML pages — skip images, JS, CSS, fonts
function isHtmlPage(row: SFRow): boolean {
  const ct = (row.contentType ?? "").toLowerCase();
  // If no content type recorded, include by default (SF often omits it for HTML)
  if (!ct) return true;
  return ct.includes("text/html");
}

const EMPTY_STATUS = { status: "unknown" as TechCheckStatus, note: "Немає даних SF" };

export function analyzeSFData(rows: SFRow[]): SFAnalysis {
  const htmlRows = rows.filter(isHtmlPage);
  const total = htmlRows.length;

  if (total === 0) {
    return {
      httpStatus:   { ...EMPTY_STATUS, total: 0, ok200: 0, redirect3xx: 0, error4xx: 0, error5xx: 0 },
      canonical:    { ...EMPTY_STATUS, total: 0, withCanonical: 0, withoutCanonical: 0, selfCanonical: 0, crossCanonical: 0 },
      indexability: { ...EMPTY_STATUS, total: 0, indexable: 0, nonIndexable: 0, noindexMeta: 0, noindexHeader: 0, byRobots: 0, byCanonical: 0 },
      titles:       { ...EMPTY_STATUS, total: 0, missing: 0, tooShort: 0, tooLong: 0, duplicates: 0 },
      descriptions: { ...EMPTY_STATUS, total: 0, missing: 0, tooShort: 0, tooLong: 0, duplicates: 0 },
      h1s:          { ...EMPTY_STATUS, total: 0, missing: 0, multiple: 0 },
      content:      { ...EMPTY_STATUS, total: 0, thinContent: 0, orphanPages: 0, nearDuplicates: 0 },
      urlStructure: { ...EMPTY_STATUS, total: 0, tooLong: 0, withParameters: 0, deepUrls: 0 },
      crawlDepth:   { ...EMPTY_STATUS, avgDepth: 0, maxDepth: 0, deepPages: 0, distribution: {} },
    };
  }

  return {
    httpStatus:   sfHttpStatus(htmlRows, total),
    canonical:    sfCanonical(htmlRows, total),
    indexability: sfIndexability(htmlRows, total),
    titles:       sfTitles(htmlRows, total),
    descriptions: sfDescriptions(htmlRows, total),
    h1s:          sfH1s(htmlRows, total),
    content:      sfContent(htmlRows, total),
    urlStructure: sfUrlStructure(htmlRows, total),
    crawlDepth:   sfCrawlDepth(htmlRows, total),
  };
}

// ─── HTTP Status ──────────────────────────────────────────────────────────────
function sfHttpStatus(rows: SFRow[], total: number): SFHttpStatusCheck {
  let ok200 = 0, redirect3xx = 0, error4xx = 0, error5xx = 0;

  for (const r of rows) {
    const code = r.statusCode ?? r.httpStatusCode ?? 0;
    if (code >= 200 && code < 300) ok200++;
    else if (code >= 300 && code < 400) redirect3xx++;
    else if (code >= 400 && code < 500) error4xx++;
    else if (code >= 500) error5xx++;
    else ok200++; // unknown — count as ok if SF crawled it
  }

  let status: TechCheckStatus = "ok";
  const parts: string[] = [`Всього: ${total.toLocaleString("uk")} сторінок.`];

  if (error5xx > 0) { status = "error"; parts.push(`🔴 ${error5xx} серверних помилок (5xx).`); }
  if (error4xx > 0) { if (status === "ok") status = "issue"; parts.push(`🟠 ${error4xx} клієнтських помилок (4xx).`); }
  if (redirect3xx > 0) { if (status === "ok") status = "issue"; parts.push(`🟡 ${redirect3xx} редиректів (3xx) у краулі — sitemap/посилання мають вести на фінальні URL.`); }
  if (ok200 === total) parts.push("✅ Всі сторінки повертають 200.");

  return { status, total, ok200, redirect3xx, error4xx, error5xx, note: parts.join(" ") };
}

// ─── Canonical tags ───────────────────────────────────────────────────────────
function sfCanonical(rows: SFRow[], total: number): SFCanonicalCheck {
  let withCanonical = 0, withoutCanonical = 0, selfCanonical = 0, crossCanonical = 0;

  for (const r of rows) {
    const canonical = (r.canonicalLinkElement1 ?? "").trim();
    if (!canonical) {
      withoutCanonical++;
      continue;
    }
    withCanonical++;
    try {
      const cu = new URL(canonical);
      const pu = new URL(r.address);
      // Self-canonical: same host + same path (ignoring trailing slash difference)
      const samePath = cu.pathname.replace(/\/$/, "") === pu.pathname.replace(/\/$/, "");
      if (cu.hostname === pu.hostname && samePath) {
        selfCanonical++;
      } else {
        crossCanonical++;
      }
    } catch {
      selfCanonical++; // Can't parse — treat as self
    }
  }

  const missingPct = total > 0 ? Math.round((withoutCanonical / total) * 100) : 0;
  let status: TechCheckStatus = "ok";
  const parts: string[] = [];

  if (missingPct > 20) {
    status = "error";
    parts.push(`🔴 ${withoutCanonical.toLocaleString("uk")} сторінок (~${missingPct}%) без canonical тегу.`);
  } else if (withoutCanonical > 0) {
    status = "issue";
    parts.push(`${withoutCanonical} сторінок без canonical.`);
  } else {
    parts.push(`Canonical присутній на всіх ${total.toLocaleString("uk")} сторінках. ✅`);
  }

  if (crossCanonical > 0) {
    if (status === "ok") status = "issue";
    parts.push(`${crossCanonical} cross-domain/нестандартних canonical — перевірте вручну.`);
  }
  if (selfCanonical > 0 && withoutCanonical === 0) {
    parts.push(`${selfCanonical} self-canonical. ✅`);
  }

  return { status, total, withCanonical, withoutCanonical, selfCanonical, crossCanonical, note: parts.join(" ") };
}

// ─── Indexability ─────────────────────────────────────────────────────────────
function sfIndexability(rows: SFRow[], total: number): SFIndexabilityCheck {
  let indexable = 0, nonIndexable = 0, noindexMeta = 0, noindexHeader = 0, byRobots = 0, byCanonical = 0;

  for (const r of rows) {
    const isIdx = (r.indexability ?? "").toLowerCase() === "indexable";
    if (isIdx) {
      indexable++;
    } else {
      nonIndexable++;
      const reason = (r.indexabilityStatus ?? "").toLowerCase();
      if (reason.includes("noindex") && (reason.includes("meta") || reason.includes("tag"))) noindexMeta++;
      else if (reason.includes("noindex") && reason.includes("header")) noindexHeader++;
      else if (reason.includes("robots")) byRobots++;
      else if (reason.includes("canonical")) byCanonical++;
    }
  }

  const nonPct = total > 0 ? Math.round((nonIndexable / total) * 100) : 0;
  let status: TechCheckStatus = "ok";
  const parts: string[] = [`${indexable.toLocaleString("uk")} з ${total.toLocaleString("uk")} сторінок індексується.`];

  if (nonIndexable > 0) {
    if (nonPct > 40) status = "issue";
    parts.push(`${nonIndexable.toLocaleString("uk")} (~${nonPct}%) не індексується.`);
    if (noindexMeta > 0)   parts.push(`Noindex-мета: ${noindexMeta}.`);
    if (noindexHeader > 0) parts.push(`Noindex-заголовок: ${noindexHeader}.`);
    if (byRobots > 0)      parts.push(`Robots.txt: ${byRobots}.`);
    if (byCanonical > 0)   parts.push(`Canonical: ${byCanonical}.`);
  }

  return { status, total, indexable, nonIndexable, noindexMeta, noindexHeader, byRobots, byCanonical, note: parts.join(" ") };
}

// ─── Title tags ───────────────────────────────────────────────────────────────
function sfTitles(rows: SFRow[], total: number): SFTitleCheck {
  let missing = 0, tooShort = 0, tooLong = 0;
  const seen = new Map<string, number>();

  for (const r of rows) {
    const title = (r.title1 ?? "").trim();
    const len = r.title1Length ?? title.length;

    if (!title || len === 0) { missing++; continue; }

    const key = title.toLowerCase();
    seen.set(key, (seen.get(key) ?? 0) + 1);

    if (len < 30) tooShort++;
    else if (len > 60) tooLong++;
  }

  const duplicates = Array.from(seen.values()).filter((v) => v > 1).reduce((s, v) => s + v, 0);
  let status: TechCheckStatus = "ok";
  const parts: string[] = [];

  if (missing > 0) { status = "error"; parts.push(`🔴 ${missing} сторінок без title.`); }
  if (tooLong > 0) { if (status === "ok") status = "issue"; parts.push(`${tooLong} title > 60 символів.`); }
  if (tooShort > 0) { if (status === "ok") status = "issue"; parts.push(`${tooShort} title < 30 символів.`); }
  if (duplicates > 0) { if (status === "ok") status = "issue"; parts.push(`${duplicates} сторінок з дублікатом title.`); }
  if (parts.length === 0) parts.push(`Title в нормі на ${total.toLocaleString("uk")} сторінках. ✅`);

  return { status, total, missing, tooShort, tooLong, duplicates, note: parts.join(" ") };
}

// ─── Meta descriptions ────────────────────────────────────────────────────────
function sfDescriptions(rows: SFRow[], total: number): SFDescriptionCheck {
  let missing = 0, tooShort = 0, tooLong = 0;
  const seen = new Map<string, number>();

  for (const r of rows) {
    const desc = (r.metaDescription1 ?? "").trim();
    const len = r.metaDescription1Length ?? desc.length;

    if (!desc || len === 0) { missing++; continue; }

    const key = desc.toLowerCase();
    seen.set(key, (seen.get(key) ?? 0) + 1);

    if (len < 70) tooShort++;
    else if (len > 160) tooLong++;
  }

  const duplicates = Array.from(seen.values()).filter((v) => v > 1).reduce((s, v) => s + v, 0);
  const missingPct = total > 0 ? Math.round((missing / total) * 100) : 0;
  let status: TechCheckStatus = "ok";
  const parts: string[] = [];

  if (missingPct > 30) { status = "error"; parts.push(`🔴 ${missing} (~${missingPct}%) сторінок без meta description.`); }
  else if (missing > 0) { status = "issue"; parts.push(`${missing} сторінок без meta description.`); }
  if (tooLong > 0) { if (status === "ok") status = "issue"; parts.push(`${tooLong} description > 160 символів.`); }
  if (tooShort > 0) { if (status === "ok") status = "issue"; parts.push(`${tooShort} description < 70 символів.`); }
  if (duplicates > 0) { if (status === "ok") status = "issue"; parts.push(`${duplicates} сторінок з дублікатом description.`); }
  if (parts.length === 0) parts.push(`Meta description в нормі на ${total.toLocaleString("uk")} сторінках. ✅`);

  return { status, total, missing, tooShort, tooLong, duplicates, note: parts.join(" ") };
}

// ─── H1 tags ──────────────────────────────────────────────────────────────────
function sfH1s(rows: SFRow[], total: number): SFH1Check {
  let missing = 0, multiple = 0;

  for (const r of rows) {
    const h1 = (r.h1_1 ?? "").trim();
    if (!h1) {
      missing++;
    }
    // SF exports h1_2 column when there are multiple H1s on a page
    const h1_2 = (r as Record<string, unknown>)["h1_2"];
    if (h1_2 && typeof h1_2 === "string" && h1_2.trim().length > 0) {
      multiple++;
    }
  }

  const missingPct = total > 0 ? Math.round((missing / total) * 100) : 0;
  let status: TechCheckStatus = "ok";
  const parts: string[] = [];

  if (missingPct > 20) { status = "error"; parts.push(`🔴 ${missing} (~${missingPct}%) сторінок без H1.`); }
  else if (missing > 0) { status = "issue"; parts.push(`${missing} сторінок без H1.`); }
  if (multiple > 0) { if (status === "ok") status = "issue"; parts.push(`${multiple} сторінок з кількома H1.`); }
  if (parts.length === 0) parts.push(`H1 в нормі на ${total.toLocaleString("uk")} сторінках. ✅`);

  return { status, total, missing, multiple, note: parts.join(" ") };
}

// ─── Content quality ──────────────────────────────────────────────────────────
function sfContent(rows: SFRow[], total: number): SFContentCheck {
  let thinContent = 0, orphanPages = 0, nearDuplicates = 0;

  for (const r of rows) {
    const wc = r.wordCount ?? 0;
    if (wc > 0 && wc < 300) thinContent++;
    if ((r.inlinks ?? r.uniqueInlinks ?? 1) === 0) orphanPages++;
    if ((r.nearDuplicates ?? 0) > 0) nearDuplicates++;
  }

  let status: TechCheckStatus = "ok";
  const parts: string[] = [];

  if (thinContent > total * 0.3) { status = "issue"; parts.push(`${thinContent} сторінок із тонким контентом (< 300 слів).`); }
  else if (thinContent > 0) parts.push(`${thinContent} сторінок < 300 слів.`);

  if (orphanPages > total * 0.1) { if (status === "ok") status = "issue"; parts.push(`${orphanPages} сторінок-сиріт (0 внутрішніх посилань).`); }
  else if (orphanPages > 0) parts.push(`${orphanPages} сторінок без внутрішніх посилань.`);

  if (nearDuplicates > 0) { if (status === "ok") status = "issue"; parts.push(`${nearDuplicates} сторінок зі схожим контентом (near-duplicate).`); }
  if (parts.length === 0) parts.push(`Якість контенту в нормі. ✅`);

  return { status, total, thinContent, orphanPages, nearDuplicates, note: parts.join(" ") };
}

// ─── URL structure ────────────────────────────────────────────────────────────
function sfUrlStructure(rows: SFRow[], total: number): SFUrlCheck {
  let tooLong = 0, withParameters = 0, deepUrls = 0;

  for (const r of rows) {
    const url = r.address ?? "";
    if (url.length > 115) tooLong++;
    if (url.includes("?")) withParameters++;
    const depth = r.folderDepth ?? r.crawlDepth ?? 0;
    if (depth > 4) deepUrls++;
  }

  let status: TechCheckStatus = "ok";
  const parts: string[] = [];

  if (tooLong > total * 0.1) { status = "issue"; parts.push(`${tooLong} URL довших за 115 символів.`); }
  else if (tooLong > 0) parts.push(`${tooLong} довгих URL.`);

  if (withParameters > total * 0.2) { if (status === "ok") status = "issue"; parts.push(`${withParameters} URL з GET-параметрами (?).`); }
  else if (withParameters > 0) parts.push(`${withParameters} URL з параметрами.`);

  if (deepUrls > total * 0.1) { if (status === "ok") status = "issue"; parts.push(`${deepUrls} URL глибше 4 рівнів.`); }
  else if (deepUrls > 0) parts.push(`${deepUrls} URL на глибині > 4.`);

  if (parts.length === 0) parts.push(`Структура URL у нормі. ✅`);

  return { status, total, tooLong, withParameters, deepUrls, note: parts.join(" ") };
}

// ─── Crawl depth ──────────────────────────────────────────────────────────────
function sfCrawlDepth(rows: SFRow[], total: number): SFCrawlDepthCheck {
  const distribution: Record<string, number> = {};
  let deepPages = 0, sumDepth = 0, maxDepth = 0;

  for (const r of rows) {
    const d = r.crawlDepth ?? 0;
    const key = d >= 5 ? "5+" : String(d);
    distribution[key] = (distribution[key] ?? 0) + 1;
    sumDepth += d;
    if (d > maxDepth) maxDepth = d;
    if (d > 3) deepPages++;
  }

  const avgDepth = total > 0 ? parseFloat((sumDepth / total).toFixed(1)) : 0;
  const deepPct = total > 0 ? Math.round((deepPages / total) * 100) : 0;

  let status: TechCheckStatus = "ok";
  const parts: string[] = [`Середня глибина: ${avgDepth}, макс.: ${maxDepth}.`];

  if (deepPct > 30) { status = "issue"; parts.push(`${deepPages} сторінок (~${deepPct}%) на глибині > 3 — важко для краулінгу.`); }
  else if (deepPages > 0) parts.push(`${deepPages} сторінок на глибині > 3.`);
  else parts.push("Структура сайту плоска. ✅");

  return { status, avgDepth, maxDepth, deepPages, distribution, note: parts.join(" ") };
}
