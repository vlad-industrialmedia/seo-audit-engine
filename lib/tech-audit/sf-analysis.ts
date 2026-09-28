import type {
  SFRow,
  SFImageRow,
  SFRedirectRow,
  SFAnalysis,
  SFHttpStatusCheck,
  SFCanonicalCheck,
  SFIndexabilityCheck,
  SFTitleCheck,
  SFDescriptionCheck,
  SFH1Check,
  SFH2Check,
  SFContentCheck,
  SFUrlCheck,
  SFCrawlDepthCheck,
  SFResponseTimeCheck,
  SFImagesAltCheck,
  SFInternalLinksCheck,
  SFRedirectChainCheck,
  SFTitleH1MatchCheck,
  SFPaginationCheck,
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

export function analyzeSFData(
  rows: SFRow[],
  images?: SFImageRow[],
  redirects?: SFRedirectRow[],
): SFAnalysis {
  const htmlRows = rows.filter(isHtmlPage);
  const total = htmlRows.length;

  if (total === 0) {
    return {
      httpStatus:    { ...EMPTY_STATUS, total: 0, ok200: 0, redirect3xx: 0, error4xx: 0, error5xx: 0 },
      canonical:     { ...EMPTY_STATUS, total: 0, withCanonical: 0, withoutCanonical: 0, selfCanonical: 0, crossCanonical: 0 },
      indexability:  { ...EMPTY_STATUS, total: 0, indexable: 0, nonIndexable: 0, noindexMeta: 0, noindexHeader: 0, byRobots: 0, byCanonical: 0 },
      titles:        { ...EMPTY_STATUS, total: 0, missing: 0, tooShort: 0, tooLong: 0, duplicates: 0 },
      descriptions:  { ...EMPTY_STATUS, total: 0, missing: 0, tooShort: 0, tooLong: 0, duplicates: 0 },
      h1s:           { ...EMPTY_STATUS, total: 0, missing: 0, multiple: 0 },
      h2s:           { ...EMPTY_STATUS, total: 0, missing: 0, duplicateH1: 0 },
      content:       { ...EMPTY_STATUS, total: 0, thinContent: 0, orphanPages: 0, nearDuplicates: 0 },
      urlStructure:  { ...EMPTY_STATUS, total: 0, tooLong: 0, withParameters: 0, deepUrls: 0 },
      crawlDepth:    { ...EMPTY_STATUS, avgDepth: 0, maxDepth: 0, deepPages: 0, distribution: {} },
      responseTimes: { ...EMPTY_STATUS, total: 0, avgMs: null, slowPages: 0, verySlowPages: 0 },
    };
  }

  return {
    httpStatus:    sfHttpStatus(htmlRows, total),
    canonical:     sfCanonical(htmlRows, total),
    indexability:  sfIndexability(htmlRows, total),
    titles:        sfTitles(htmlRows, total),
    descriptions:  sfDescriptions(htmlRows, total),
    h1s:           sfH1s(htmlRows, total),
    h2s:           sfH2s(htmlRows, total),
    content:       sfContent(htmlRows, total),
    urlStructure:  sfUrlStructure(htmlRows, total),
    crawlDepth:    sfCrawlDepth(htmlRows, total),
    responseTimes: sfResponseTimes(rows, total),
    // Extended checks
    imagesAlt:     images && images.length > 0 ? sfImagesAlt(images) : undefined,
    internalLinks: sfInternalLinks(htmlRows, total),
    redirectChains: redirects && redirects.length > 0 ? sfRedirectChains(redirects) : undefined,
    titleH1Match:  sfTitleH1Match(htmlRows, total),
    pagination:    sfPagination(htmlRows, total),
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

// ─── H2 tags ──────────────────────────────────────────────────────────────────
function sfH2s(rows: SFRow[], total: number): SFH2Check {
  let missing = 0;
  const h1Seen = new Map<string, number>();

  for (const r of rows) {
    // SF exports h2_1 column; empty means no H2
    const h2 = (r as Record<string, unknown>)["h2_1"];
    if (!h2 || (typeof h2 === "string" && h2.trim().length === 0)) {
      missing++;
    }

    // Track H1 texts to detect duplicates across pages
    const h1 = (r.h1_1 ?? "").trim().toLowerCase();
    if (h1) {
      h1Seen.set(h1, (h1Seen.get(h1) ?? 0) + 1);
    }
  }

  // Count pages that share an H1 with at least one other page
  const duplicateH1 = Array.from(h1Seen.values())
    .filter((count) => count > 1)
    .reduce((sum, count) => sum + count, 0);

  const missingPct = total > 0 ? Math.round((missing / total) * 100) : 0;
  let status: TechCheckStatus = "ok";
  const parts: string[] = [];

  if (missingPct > 30) {
    status = "error";
    parts.push(`🔴 ${missing} (~${missingPct}%) сторінок без H2 заголовку.`);
  } else if (missing > 0) {
    status = "issue";
    parts.push(`${missing} сторінок без H2.`);
  }

  if (duplicateH1 > 0) {
    if (status === "ok") status = "issue";
    parts.push(`${duplicateH1} сторінок мають однаковий H1 з іншими сторінками.`);
  }

  if (parts.length === 0) parts.push(`H2 присутній на всіх ${total.toLocaleString("uk")} сторінках. ✅`);

  return { status, total, missing, duplicateH1, note: parts.join(" ") };
}

// ─── Internal links analysis ──────────────────────────────────────────────────
function sfInternalLinks(rows: SFRow[], total: number): SFInternalLinksCheck {
  let orphanPages = 0, poorlyLinked = 0, wellLinked = 0, sumInlinks = 0;

  for (const r of rows) {
    // Skip homepage - always has many inlinks
    try {
      const u = new URL(r.address);
      if (u.pathname === "/" || u.pathname === "") continue;
    } catch { /* ignore parse errors */ }

    const links = r.inlinks ?? r.uniqueInlinks ?? 0;
    sumInlinks += links;
    if (links === 0) orphanPages++;
    else if (links <= 2) poorlyLinked++;
    else if (links >= 5) wellLinked++;
  }

  const relevant = total > 0 ? total - 1 : 0; // excluding homepage
  const avgInlinks = relevant > 0 ? parseFloat((sumInlinks / relevant).toFixed(1)) : 0;

  let status: TechCheckStatus = "ok";
  const parts: string[] = [`Середня кількість внутрішніх посилань на сторінку: ${avgInlinks}.`];

  if (orphanPages > relevant * 0.1) {
    status = "error";
    parts.push(`🔴 ${orphanPages} сторінок-сиріт (0 вхідних посилань).`);
  } else if (orphanPages > 0) {
    status = "issue";
    parts.push(`${orphanPages} сторінок без жодного внутрішнього посилання.`);
  }
  if (poorlyLinked > relevant * 0.2) {
    if (status === "ok") status = "issue";
    parts.push(`${poorlyLinked} сторінок з 1–2 вхідними посиланнями — слабка перелінковка.`);
  }
  if (parts.length <= 1) parts.push("Внутрішня перелінковка в нормі. ✅");

  return { status, total, orphanPages, poorlyLinked, wellLinked, avgInlinks, note: parts.join(" ") };
}

// ─── Redirect chains ──────────────────────────────────────────────────────────
function sfRedirectChains(redirects: SFRedirectRow[]): SFRedirectChainCheck {
  const totalRedirects = redirects.length;
  const longChains = redirects.filter((r) => (r.chainLength ?? 1) >= 2).length;

  let status: TechCheckStatus = "ok";
  const parts: string[] = [`Загалом редиректів у краулі: ${totalRedirects}.`];

  if (longChains > 5) {
    status = "error";
    parts.push(`🔴 ${longChains} ланцюжків редиректів (2+ хопи) — уповільнює краулінг і передачу PageRank.`);
  } else if (longChains > 0) {
    status = "issue";
    parts.push(`${longChains} ланцюжків редиректів (2+ хопи). Рекомендовано вести посилання одразу на фінальний URL.`);
  }
  if (totalRedirects === 0) parts.push("Редиректів не знайдено. ✅");
  else if (longChains === 0 && totalRedirects > 0) parts.push("Всі редиректи — одиночні. ✅");

  return { status, totalRedirects, longChains, note: parts.join(" ") };
}

// ─── Title / H1 mismatch ─────────────────────────────────────────────────────
function sfTitleH1Match(rows: SFRow[], total: number): SFTitleH1MatchCheck {
  let strongMismatch = 0, weakMismatch = 0;

  for (const r of rows) {
    const title = (r.title1 ?? "").trim().toLowerCase();
    const h1 = (r.h1_1 ?? "").trim().toLowerCase();

    if (!title || !h1) continue; // skip pages missing either

    // Tokenize: extract words of 3+ characters
    const titleWords = new Set(title.match(/\b\w{3,}\b/g) ?? []);
    const h1Words = new Set(h1.match(/\b\w{3,}\b/g) ?? []);

    if (titleWords.size === 0 || h1Words.size === 0) continue;

    // Count overlap
    let overlap = 0;
    Array.from(h1Words).forEach((w) => {
      if (titleWords.has(w)) overlap++;
    });
    const overlapRatio = overlap / Math.max(titleWords.size, h1Words.size);

    if (overlapRatio === 0) {
      strongMismatch++; // no common words at all
    } else if (overlapRatio < 0.3) {
      weakMismatch++; // < 30% overlap
    }
  }

  const mismatchPct = total > 0 ? Math.round(((strongMismatch + weakMismatch) / total) * 100) : 0;
  let status: TechCheckStatus = "ok";
  const parts: string[] = [];

  if (strongMismatch > total * 0.05) {
    status = "issue";
    parts.push(`${strongMismatch} сторінок: Title і H1 не мають спільних слів — перевірте узгодженість.`);
  }
  if (weakMismatch > total * 0.15) {
    if (status === "ok") status = "needs_attention";
    parts.push(`${weakMismatch} сторінок: Title і H1 слабо збігаються (~${mismatchPct}% розбіжностей).`);
  }
  if (parts.length === 0) parts.push(`Title і H1 добре узгоджені на ${total.toLocaleString("uk")} сторінках. ✅`);

  return { status, total, strongMismatch, weakMismatch, note: parts.join(" ") };
}

// ─── Pagination (rel prev/next) ───────────────────────────────────────────────
function sfPagination(rows: SFRow[], total: number): SFPaginationCheck {
  let withRelNext = 0, withRelPrev = 0;

  for (const r of rows) {
    const relNext = (r.relNext1 ?? "").trim();
    const relPrev = (r.relPrev1 ?? "").trim();
    if (relNext) withRelNext++;
    if (relPrev) withRelPrev++;
  }

  const paginated = Math.max(withRelNext, withRelPrev);
  let status: TechCheckStatus = "ok";
  const parts: string[] = [];

  if (paginated === 0 && total > 50) {
    // Large site with no pagination tags — might be issue
    status = "needs_attention";
    parts.push(`Жодної сторінки з rel="next"/"prev". Якщо є пагінація — додайте ці мета-теги.`);
  } else if (paginated > 0) {
    parts.push(`${paginated} пагінованих сторінок: rel=next: ${withRelNext}, rel=prev: ${withRelPrev}.`);
    if (withRelNext !== withRelPrev) {
      status = "issue";
      parts.push(`Асиметрія: rel=next і rel=prev відрізняються — перевірте правильність ланцюжка пагінації.`);
    } else {
      parts.push("Пагінація налаштована коректно. ✅");
    }
  } else {
    parts.push("Пагінація відсутня або дані SF не містять rel=next/prev. ✅");
  }

  return { status, total, withRelNext, withRelPrev, paginated, note: parts.join(" ") };
}

// ─── Images alt text (from SF Images export) ─────────────────────────────────
const GENERIC_ALTS = new Set([
  "image", "photo", "picture", "img", "icon", "logo", "banner",
  "slider", "thumbnail", "thumb", "preview", "pic", "jpg", "jpeg",
  "png", "webp", "gif", "svg", "foto", "зображення", "фото",
]);

function sfImagesAlt(images: SFImageRow[]): SFImagesAltCheck {
  const totalImages = images.length;
  let missingAlt = 0, emptyAlt = 0, genericAlt = 0;

  for (const img of images) {
    if (img.alt === undefined || img.alt === null) {
      missingAlt++;
    } else if (img.alt.trim() === "") {
      emptyAlt++;
    } else {
      const altClean = img.alt.trim().toLowerCase();
      // Check if alt is just a generic word
      if (GENERIC_ALTS.has(altClean)) {
        genericAlt++;
        continue;
      }
      // Check if alt is just a filename (remove extension, compare)
      const srcFilename = (img.src ?? "").split("/").pop()?.split("?")[0] ?? "";
      const srcBase = srcFilename.replace(/\.[a-z]{2,5}$/i, "").replace(/[-_]/g, " ").toLowerCase();
      if (srcBase && altClean === srcBase) {
        genericAlt++;
      }
    }
  }

  const problemPct = totalImages > 0 ? Math.round(((missingAlt + genericAlt) / totalImages) * 100) : 0;
  let status: TechCheckStatus = "ok";
  const parts: string[] = [`Зображень у краулі: ${totalImages.toLocaleString("uk")}.`];

  if (missingAlt > totalImages * 0.1) {
    status = "error";
    parts.push(`🔴 ${missingAlt} зображень (~${problemPct}%) без атрибуту alt — критично для доступності та SEO.`);
  } else if (missingAlt > 0) {
    status = "issue";
    parts.push(`${missingAlt} зображень без alt.`);
  }
  if (genericAlt > totalImages * 0.05) {
    if (status === "ok") status = "issue";
    parts.push(`${genericAlt} зображень із загальним alt ("image", "photo", ім'я файлу тощо).`);
  } else if (genericAlt > 0) {
    parts.push(`${genericAlt} зображень із неінформативним alt.`);
  }
  if (emptyAlt > 0) parts.push(`${emptyAlt} зображень з порожнім alt (декоративні — перевірте навмисність).`);
  if (parts.length <= 1) parts.push("Alt-тексти в нормі. ✅");

  return { status, totalImages, missingAlt, emptyAlt, genericAlt, note: parts.join(" ") };
}

// ─── Response times ───────────────────────────────────────────────────────────
function sfResponseTimes(rows: SFRow[], total: number): SFResponseTimeCheck {
  const SLOW_MS = 2000;
  const VERY_SLOW_MS = 4000;

  let slowPages = 0, verySlowPages = 0, sumMs = 0, withTime = 0;

  for (const r of rows) {
    const ms = r.responseTime ?? 0;
    if (ms > 0) {
      sumMs += ms;
      withTime++;
      if (ms > VERY_SLOW_MS) verySlowPages++;
      else if (ms > SLOW_MS) slowPages++;
    }
  }

  const avgMs = withTime > 0 ? Math.round(sumMs / withTime) : null;
  let status: TechCheckStatus = "ok";
  const parts: string[] = [];

  if (avgMs !== null) {
    parts.push(`Середній час відповіді: ${avgMs} мс.`);
  }

  if (verySlowPages > 0) {
    status = "error";
    parts.push(`🔴 ${verySlowPages} сторінок відповідають > ${VERY_SLOW_MS / 1000} с.`);
  }
  if (slowPages > 0) {
    if (status === "ok") status = "issue";
    parts.push(`🟠 ${slowPages} сторінок відповідають > ${SLOW_MS / 1000} с.`);
  }
  if (parts.length <= 1 && avgMs !== null && avgMs <= SLOW_MS) {
    parts.push("Час відповіді в нормі. ✅");
  }
  if (withTime === 0) {
    parts.push("Дані часу відповіді відсутні в експорті SF.");
  }

  return { status, total, avgMs, slowPages, verySlowPages, note: parts.join(" ") };
}
