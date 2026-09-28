import type {
  Audit,
  Finding,
  ExportOptions,
  Severity,
  TechAuditResult,
  GscAuditResult,
  Ga4AuditResult,
  AiAuditAnalysis,
} from "@/types";
import { format } from "date-fns";

const SEVERITY_EMOJI: Record<Severity, string> = {
  critical: "🔴",
  high: "🟠",
  medium: "🟡",
  low: "🔵",
  info: "⚪",
};

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Критична",
  high: "Висока",
  medium: "Середня",
  low: "Низька",
  info: "Інфо",
};

// ─── Статус перевірки ────────────────────────────────────────────────────────

function statusEmoji(status: string): string {
  switch (status) {
    case "ok": return "✅";
    case "warn": return "⚠️";
    case "error": return "❌";
    case "skip": return "⏭️";
    default: return "❓";
  }
}

// ─── Секція технічного аудиту ─────────────────────────────────────────────────

function buildTechAuditSection(tech: TechAuditResult): string[] {
  const lines: string[] = [];
  const dateStr = format(new Date(tech.checkedAt), "dd.MM.yyyy HH:mm");

  lines.push("## 🔧 Технічний аудит");
  lines.push("");
  lines.push(`**Дата перевірки:** ${dateStr}`);
  lines.push(`**Домен:** ${tech.domain}`);
  lines.push("");

  // Допоміжна функція для рядка таблиці
  const row = (label: string, value: string, status?: string) =>
    `| ${status ? statusEmoji(status) + " " : ""}${label} | ${value} |`;

  lines.push("| Перевірка | Результат |");
  lines.push("|-----------|-----------|");

  // Основний дзеркальний домен
  lines.push(row("Головне дзеркало", tech.mirror.canonical ?? "—", tech.mirror.status));

  // HTTPS
  const httpsInfo = tech.https.httpRedirectsToHttps
    ? `HTTPS ✅ (редирект є)`
    : "❌ HTTP → немає редиректу на HTTPS";
  lines.push(row("HTTPS", httpsInfo, tech.https.status));

  // robots.txt
  const robotsInfo = tech.robotsTxt.exists
    ? `Знайдено (${tech.robotsTxt.blocksGooglebot ? "блокує Googlebot ⚠️" : "Google дозволено"})`
    : "Не знайдено";
  lines.push(row("robots.txt", robotsInfo, tech.robotsTxt.status));

  // Sitemap
  const sitemapInfo = tech.sitemap.exists
    ? `${tech.sitemap.urlCount ?? "?"} URL, URL: ${tech.sitemap.url ?? "—"}`
    : "Не знайдено";
  lines.push(row("Sitemap", sitemapInfo, tech.sitemap.status));

  // PageSpeed desktop
  if (tech.pageSpeed) {
    const ps = tech.pageSpeed;
    const score = ps.performanceScore != null ? `${ps.performanceScore}/100` : "N/A";
    const lcp = ps.lcpMs != null ? `, LCP: ${(ps.lcpMs / 1000).toFixed(1)}s` : "";
    const cls = ps.clsScore != null ? `, CLS: ${ps.clsScore.toFixed(2)}` : "";
    lines.push(row("PageSpeed Desktop", `${score}${lcp}${cls}`, ps.status));
  }

  // PageSpeed mobile
  if (tech.mobilePageSpeed) {
    const mp = tech.mobilePageSpeed;
    const score = mp.performanceScore != null ? `${mp.performanceScore}/100` : "N/A";
    const lcp = mp.lcpMs != null ? `, LCP: ${(mp.lcpMs / 1000).toFixed(1)}s` : "";
    lines.push(row("PageSpeed Mobile", `${score}${lcp}`, mp.status));
  }

  // HTTP/2
  if (tech.http2) {
    lines.push(row("HTTP/2", tech.http2.protocol ?? "—", tech.http2.status));
  }

  // Стиснення
  if (tech.compression) {
    const comp = tech.compression;
    const enc = comp.encoding ?? "";
    const info = enc.includes("br")
      ? `Brotli ✅${enc.includes("gzip") ? " + Gzip ✅" : ""}`
      : enc.includes("gzip") ? "Gzip ✅" : "❌ Відсутнє";
    lines.push(row("Стиснення", info, comp.status));
  }

  // Open Graph
  if (tech.openGraph) {
    const og = tech.openGraph;
    const info = og.hasOgTitle && og.hasOgDescription && og.hasOgImage
      ? "title ✅ description ✅ image ✅"
      : [
          og.hasOgTitle ? "title ✅" : "title ❌",
          og.hasOgDescription ? "description ✅" : "description ❌",
          og.hasOgImage ? "image ✅" : "image ❌",
        ].join(", ");
    lines.push(row("Open Graph", info, og.status));
  }

  // Структуровані дані
  if (tech.structuredData) {
    const sd = tech.structuredData;
    const types = sd.types?.join(", ") || "не знайдено";
    lines.push(row("Structured Data", types, sd.status));
  }

  // Security headers
  if (tech.securityHeaders) {
    const sh = tech.securityHeaders;
    const present = [
      sh.hsts ? "HSTS" : null,
      sh.xFrameOptions ? "X-Frame-Options" : null,
      sh.xContentTypeOptions ? "X-Content-Type" : null,
      sh.csp ? "CSP" : null,
    ].filter(Boolean).join(", ") || "відсутні";
    lines.push(row("Security Headers", present, sh.status));
  }

  // Analytics
  if (tech.analytics) {
    const an = tech.analytics;
    const detected = [
      an.hasGA4 ? "GA4" : null,
      an.hasGTM ? "GTM" : null,
      an.hasMicrosoftClarity ? "MS Clarity" : null,
    ].filter(Boolean).join(", ") || "не виявлено";
    lines.push(row("Analytics", detected, an.status));
  }

  // Hreflang
  if (tech.hreflang) {
    const hl = tech.hreflang;
    const info = hl.hasHreflang
      ? `${hl.languages?.join(", ") ?? ""} (${hl.count ?? 0} тегів)`
      : "Відсутній";
    lines.push(row("Hreflang", info, hl.status));
  }

  // Custom 404
  if (tech.custom404) {
    const c = tech.custom404;
    const info = c.returns404
      ? (c.hasBrandedPage ? "Кастомна 404-сторінка ✅" : "HTTP 404, без кастомної сторінки")
      : c.redirectsToHome ? "Редирект на головну ⚠️" : "Не перевірено";
    lines.push(row("Custom 404", info, c.status));
  }

  // RSS feed
  if (tech.rssFeed) {
    const rss = tech.rssFeed;
    const info = rss.found ? (rss.feedType ?? "Feed") + " (" + rss.feedUrls.join(", ") + ")" : "Не знайдено";
    lines.push(row("RSS / Atom", info, rss.status));
  }

  // Image optimization
  if (tech.imageOpt) {
    const io = tech.imageOpt;
    const lazy = `lazy: ${(io.lazyLoadRatio * 100).toFixed(0)}%`;
    const fmt = io.hasWebP ? "WebP ✅" : "WebP ❌";
    lines.push(row("Оптимізація зображень", `${lazy}, ${fmt}`, io.status));
  }

  // Cookie consent
  if (tech.cookieConsent) {
    const cc = tech.cookieConsent;
    const info = cc.detected ? (cc.provider ?? "Custom") : "Не виявлено ⚠️";
    lines.push(row("Cookie Consent", info, cc.status));
  }

  lines.push("");

  // Примітки про помилки
  if (tech.error) {
    lines.push(`> ⚠️ Помилка під час перевірки: ${tech.error}`);
    lines.push("");
  }

  return lines;
}

// ─── Секція GSC ───────────────────────────────────────────────────────────────

function buildGscSection(gsc: GscAuditResult): string[] {
  const lines: string[] = [];
  const dateStr = format(new Date(gsc.createdAt), "dd.MM.yyyy HH:mm");

  lines.push("## 📈 Google Search Console");
  lines.push("");
  lines.push(`**Ресурс:** ${gsc.property}`);
  lines.push(`**Дата перевірки:** ${dateStr}`);
  lines.push(`**Період:** ${gsc.dateRange.start} — ${gsc.dateRange.end}`);
  lines.push("");

  // Загальні показники
  lines.push("### Загальні показники");
  lines.push("");
  lines.push("| Метрика | Значення |");
  lines.push("|---------|---------|");
  lines.push(`| Кліки | ${gsc.totalClicks.toLocaleString("uk-UA")} |`);
  lines.push(`| Покази | ${gsc.totalImpressions.toLocaleString("uk-UA")} |`);
  lines.push(`| CTR | ${(gsc.avgCtr * 100).toFixed(2)}% |`);
  lines.push(`| Середня позиція | ${gsc.avgPosition.toFixed(1)} |`);
  lines.push("");

  // Топ запити
  if (gsc.topQueries?.length) {
    lines.push("### Топ-10 пошукових запитів");
    lines.push("");
    lines.push("| Запит | Кліки | Покази | CTR | Позиція |");
    lines.push("|-------|-------|--------|-----|---------|");
    for (const q of gsc.topQueries.slice(0, 10)) {
      lines.push(
        `| ${q.query} | ${q.clicks} | ${q.impressions} | ${(q.ctr * 100).toFixed(1)}% | ${q.position.toFixed(1)} |`
      );
    }
    lines.push("");
  }

  // Топ сторінки
  if (gsc.topPages?.length) {
    lines.push("### Топ-10 сторінок");
    lines.push("");
    lines.push("| URL | Кліки | Покази | CTR | Позиція |");
    lines.push("|-----|-------|--------|-----|---------|");
    for (const p of gsc.topPages.slice(0, 10)) {
      const shortUrl = p.page.replace(/^https?:\/\/[^/]+/, "");
      lines.push(
        `| \`${shortUrl}\` | ${p.clicks} | ${p.impressions} | ${(p.ctr * 100).toFixed(1)}% | ${p.position.toFixed(1)} |`
      );
    }
    lines.push("");
  }

  // Сторінки на позиціях 4-10 (потенціал)
  if (gsc.position4to10?.length) {
    lines.push("### Потенціал зростання (позиції 4–10)");
    lines.push("");
    lines.push("| Запит | Покази | Позиція |");
    lines.push("|-------|--------|---------|");
    for (const q of gsc.position4to10.slice(0, 10)) {
      lines.push(`| ${q.query} | ${q.impressions} | ${q.position.toFixed(1)} |`);
    }
    lines.push("");
  }

  // Сторінки з низьким CTR і хорошою позицією
  if (gsc.lowCtrHighPos?.length) {
    lines.push("### Сторінки з низьким CTR (потребують покращення сніппетів)");
    lines.push("");
    lines.push("| URL | Покази | CTR | Позиція |");
    lines.push("|-----|--------|-----|---------|");
    for (const p of gsc.lowCtrHighPos.slice(0, 5)) {
      const shortUrl = p.page.replace(/^https?:\/\/[^/]+/, "");
      lines.push(
        `| \`${shortUrl}\` | ${p.impressions} | ${(p.ctr * 100).toFixed(1)}% | ${p.position.toFixed(1)} |`
      );
    }
    lines.push("");
  }

  // Пристрої
  if (gsc.searchDeviceBreakdown?.length) {
    lines.push("### Пристрої");
    lines.push("");
    lines.push("| Пристрій | Кліки | Частка |");
    lines.push("|----------|-------|--------|");
    for (const d of gsc.searchDeviceBreakdown) {
      lines.push(`| ${d.device} | ${d.clicks} | ${d.clicksPct.toFixed(1)}% |`);
    }
    lines.push("");
  }

  // Помилки сканування
  if (gsc.crawlErrors && gsc.crawlErrors.totalErrors > 0) {
    lines.push(`### Помилки сканування (всього: ${gsc.crawlErrors.totalErrors})`);
    lines.push("");
    for (const cat of gsc.crawlErrors.categories) {
      lines.push(`- **${cat.category}** (${cat.platform}): ${cat.latestCount} (тренд: ${cat.trend})`);
    }
    lines.push("");
  }

  return lines;
}

// ─── Секція GA4 ───────────────────────────────────────────────────────────────

function buildGa4Section(ga4: Ga4AuditResult): string[] {
  const lines: string[] = [];
  const dateStr = format(new Date(ga4.createdAt), "dd.MM.yyyy HH:mm");

  lines.push("## 📊 Google Analytics 4");
  lines.push("");
  lines.push(`**Ресурс:** ${ga4.property}`);
  lines.push(`**Дата перевірки:** ${dateStr}`);
  lines.push(`**Період:** ${ga4.dateRange.start} — ${ga4.dateRange.end}`);
  lines.push("");

  // Загальні показники
  lines.push("### Загальні показники");
  lines.push("");
  lines.push("| Метрика | Значення |");
  lines.push("|---------|---------|");
  lines.push(`| Сесії | ${ga4.sessions.toLocaleString("uk-UA")} |`);
  lines.push(`| Користувачі | ${ga4.users.toLocaleString("uk-UA")} |`);
  lines.push(`| Нові користувачі | ${ga4.newUsers.toLocaleString("uk-UA")} |`);
  lines.push(`| Показник відмов | ${(ga4.bounceRate * 100).toFixed(1)}% |`);

  const avgDur = ga4.avgSessionDuration;
  const durMin = Math.floor(avgDur / 60);
  const durSec = Math.round(avgDur % 60);
  lines.push(`| Середня тривалість сесії | ${durMin}хв ${durSec}с |`);
  lines.push("");

  // Топ сторінки
  if (ga4.topPages?.length) {
    lines.push("### Топ сторінки");
    lines.push("");
    lines.push("| URL | Сесії | Відмови |");
    lines.push("|-----|-------|---------|");
    for (const p of ga4.topPages.slice(0, 10)) {
      const shortUrl = p.page.replace(/^https?:\/\/[^/]+/, "");
      lines.push(`| \`${shortUrl}\` | ${p.sessions} | ${(p.bounceRate * 100).toFixed(1)}% |`);
    }
    lines.push("");
  }

  // Джерела трафіку
  if (ga4.topSources?.length) {
    lines.push("### Джерела трафіку");
    lines.push("");
    lines.push("| Джерело | Medium | Сесії |");
    lines.push("|---------|--------|-------|");
    for (const s of ga4.topSources.slice(0, 10)) {
      lines.push(`| ${s.source} | ${s.medium} | ${s.sessions} |`);
    }
    lines.push("");
  }

  // Пристрої
  if (ga4.deviceBreakdown?.length) {
    lines.push("### Пристрої");
    lines.push("");
    lines.push("| Пристрій | Сесії | Частка |");
    lines.push("|----------|-------|--------|");
    for (const d of ga4.deviceBreakdown) {
      lines.push(`| ${d.device} | ${d.sessions} | ${d.pct.toFixed(1)}% |`);
    }
    lines.push("");
  }

  return lines;
}

// ─── Секція AI-аудиту ─────────────────────────────────────────────────────────

function buildAiSection(ai: AiAuditAnalysis): string[] {
  const lines: string[] = [];
  const dateStr = format(new Date(ai.createdAt), "dd.MM.yyyy HH:mm");

  lines.push("## 🤖 AI-аудит");
  lines.push("");
  lines.push(`**Дата:** ${dateStr}`);
  lines.push(`**Провайдер:** ${ai.provider} / ${ai.model}`);
  lines.push("");

  if (ai.overallSummary) {
    lines.push("### Загальний висновок");
    lines.push("");
    lines.push(ai.overallSummary);
    lines.push("");
  }

  if (ai.pageTypeAnalyses?.length) {
    lines.push("### Аналіз по типах сторінок");
    lines.push("");

    const priorityEmoji: Record<string, string> = {
      critical: "🔴", high: "🟠", medium: "🟡", low: "🔵",
    };

    for (const analysis of ai.pageTypeAnalyses) {
      const emoji = priorityEmoji[analysis.priority] ?? "⚪";
      lines.push(`#### ${emoji} ${analysis.pageType} (${analysis.pageCount} стор., ${analysis.issueCount} проблем)`);
      lines.push("");
      lines.push(analysis.summary);
      lines.push("");

      if (analysis.recommendations?.length) {
        lines.push("**Рекомендації:**");
        for (const rec of analysis.recommendations) {
          lines.push(`- ${rec}`);
        }
        lines.push("");
      }
    }
  }

  return lines;
}

// ─── Головна функція експорту ─────────────────────────────────────────────────

export function exportAuditToMarkdown(audit: Audit, options: ExportOptions): string {
  const lines: string[] = [];
  const dateStr = format(new Date(audit.createdAt), "dd.MM.yyyy HH:mm");

  // Заголовок
  lines.push(`# SEO Аудит: ${audit.name}`);
  lines.push(`\n**Дата:** ${dateStr}`);
  lines.push(`**Статус:** ${audit.status === "completed" ? "Завершено" : audit.status}`);
  lines.push(`**Сторінок проаналізовано:** ${audit.pagesAnalyzed}`);
  lines.push("");

  // Зведення по знахідках
  if (options.includeSummary) {
    lines.push("## 📊 Зведення");
    lines.push("");
    lines.push("| Рівень | Кількість | Перевірено |");
    lines.push("|--------|-----------|------------|");

    const s = audit.summary;
    const findings = audit.findings;
    const critical = findings.filter((f) => f.severity === "critical");
    const high = findings.filter((f) => f.severity === "high");
    const medium = findings.filter((f) => f.severity === "medium");
    const low = findings.filter((f) => f.severity === "low");

    lines.push(`| 🔴 Критичні | ${s.critical} | ${critical.filter((f) => f.checked).length}/${s.critical} |`);
    lines.push(`| 🟠 Високі | ${s.high} | ${high.filter((f) => f.checked).length}/${s.high} |`);
    lines.push(`| 🟡 Середні | ${s.medium} | ${medium.filter((f) => f.checked).length}/${s.medium} |`);
    lines.push(`| 🔵 Низькі | ${s.low} | ${low.filter((f) => f.checked).length}/${s.low} |`);
    lines.push(`| **Всього** | **${s.total}** | **${s.checked}/${s.total}** |`);
    lines.push("");

    const completionPct = s.total > 0 ? Math.round((s.checked / s.total) * 100) : 0;
    lines.push(`**Прогрес виправлення:** ${completionPct}% (${s.checked} з ${s.total} проблем позначено як вирішені)`);
    lines.push("");
  }

  // Знахідки Screaming Frog
  if (options.includeFindings) {
    let filtered = audit.findings.filter((f) =>
      options.severityFilter.includes(f.severity)
    );

    if (options.checkedFilter === "checked") {
      filtered = filtered.filter((f) => f.checked);
    } else if (options.checkedFilter === "unchecked") {
      filtered = filtered.filter((f) => !f.checked);
    }

    const bySeverity: Record<Severity, Finding[]> = {
      critical: [], high: [], medium: [], low: [], info: [],
    };
    for (const f of filtered) {
      bySeverity[f.severity].push(f);
    }

    const severityOrder: Severity[] = ["critical", "high", "medium", "low", "info"];

    for (const severity of severityOrder) {
      const group = bySeverity[severity];
      if (group.length === 0) continue;

      lines.push(`## ${SEVERITY_EMOJI[severity]} ${SEVERITY_LABEL[severity]} проблеми (${group.length})`);
      lines.push("");

      for (const finding of group) {
        const checkMark = finding.checked ? "[x]" : "[ ]";
        lines.push(`### ${checkMark} ${finding.ruleTitle}`);
        lines.push("");
        lines.push(`**URL:** \`${finding.url}\``);
        lines.push(`**Тип сторінки:** ${finding.pageType}`);
        if (finding.affectedCount && finding.affectedCount > 1) {
          lines.push(`**Зачіпає сторінок:** ${finding.affectedCount}`);
        }
        lines.push(`**Confidence:** ${Math.round(finding.confidence * 100)}%`);
        lines.push("");

        if (options.includeEvidence && Object.keys(finding.evidence).length > 0) {
          lines.push("**Докази:**");
          lines.push("```json");
          lines.push(JSON.stringify(finding.evidence, null, 2));
          lines.push("```");
          lines.push("");
        }

        if (finding.recommendation) {
          lines.push(`**Рекомендація:** ${finding.recommendation}`);
          lines.push("");
        }

        if (options.includeDeveloperHints && finding.developerHint) {
          lines.push(`**Для розробника:** ${finding.developerHint}`);
          lines.push("");
        }

        if (finding.aiExplanation) {
          lines.push(`**AI-аналіз:** ${finding.aiExplanation}`);
          lines.push("");
        }

        if (finding.notes) {
          lines.push(`**Нотатки:** ${finding.notes}`);
          lines.push("");
        }

        lines.push("---");
        lines.push("");
      }
    }
  }

  // Технічний аудит
  if (options.includeTechAudit && audit.cachedTechAudit) {
    lines.push(...buildTechAuditSection(audit.cachedTechAudit));
    lines.push("---");
    lines.push("");
  }

  // Google Search Console
  if (options.includeGscAudit && audit.cachedGscAudit) {
    lines.push(...buildGscSection(audit.cachedGscAudit));
    lines.push("---");
    lines.push("");
  }

  // Google Analytics 4
  if (options.includeGa4Audit && audit.cachedGa4Audit) {
    lines.push(...buildGa4Section(audit.cachedGa4Audit));
    lines.push("---");
    lines.push("");
  }

  // AI-аудит по типах сторінок
  if (options.includeAiAnalysis && audit.cachedAiResult) {
    lines.push(...buildAiSection(audit.cachedAiResult));
    lines.push("---");
    lines.push("");
  }

  // Підвал
  lines.push(`\n---\n*Згенеровано SEO Audit Engine · ${dateStr}*`);

  return lines.join("\n");
}

export function downloadMarkdown(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadJson(data: unknown, filename: string): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportAuditToCsv(audit: Audit): string {
  const headers = [
    "URL", "Тип сторінки", "Правило", "Проблема", "Severity",
    "Перевірено", "Рекомендація", "Нотатки"
  ];

  const rows = audit.findings.map((f) => [
    f.url,
    f.pageType,
    f.ruleId,
    f.ruleTitle,
    f.severity,
    f.checked ? "Так" : "Ні",
    f.recommendation || "",
    f.notes || "",
  ]);

  const escape = (val: string) => `"${val.replace(/"/g, '""')}"`;
  const csvLines = [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))];
  return csvLines.join("\n");
}
