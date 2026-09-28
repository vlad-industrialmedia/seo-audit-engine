"use client";

import { useState } from "react";
import type {
  TechAuditResult,
  TechCheckStatus,
  SFImportResult,
  StructuredDataCheck,
  OpenGraphCheck,
  SecurityHeadersCheck,
  AnalyticsCheck,
  CompressionCheck,
  SFAnalysis,
  HreflangCheck,
  PageTechCheck,
} from "@/types";
import { analyzeSFData } from "@/lib/tech-audit/sf-analysis";

interface Props {
  domain: string;
  psiApiKey?: string;
  sfResult?: SFImportResult | null;
}

function StatusBadge({ status }: { status: TechCheckStatus }) {
  const map: Record<TechCheckStatus, { label: string; cls: string }> = {
    ok: { label: "✓ OK", cls: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
    issue: { label: "⚠ Проблема", cls: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
    error: { label: "✗ Помилка", cls: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
    unknown: { label: "? Невідомо", cls: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
    poor: { label: "✗ Погано", cls: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
    needs_attention: { label: "⚠ Увага", cls: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
  };
  const s = (map as Record<string, { label: string; cls: string }>)[status] ?? map.unknown;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}

function AssessmentBadge({ assessment }: { assessment: "safe" | "review" | "risky" }) {
  const map = {
    safe: { label: "✓ Норма", cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
    review: { label: "👁 Перевірте", cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300" },
    risky: { label: "⚠ Ризик", cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  };
  const s = map[assessment];
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}

function CheckRow({
  title,
  status,
  note,
  children,
}: {
  title: string;
  status: TechCheckStatus;
  note: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="py-3 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <div className="flex items-center justify-between gap-3 mb-1">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{title}</span>
        <StatusBadge status={status} />
      </div>
      {note && <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{note}</p>}
      {children}
    </div>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="px-0 py-2 flex items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{label}</span>
      <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
    </div>
  );
}

function StatPill({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div className={`text-center px-2 py-1.5 rounded ${warn ? "bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800" : "bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"}`}>
      <p className={`text-sm font-bold ${warn ? "text-orange-600 dark:text-orange-400" : "text-gray-700 dark:text-gray-200"}`}>{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

export default function TechAuditPanel({ domain, psiApiKey, sfResult }: Props) {
  const [result, setResult] = useState<TechAuditResult | null>(null);
  const [sfAnalysis, setSfAnalysis] = useState<SFAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runPsi, setRunPsi] = useState(false);

  async function runAudit() {
    setLoading(true);
    setError(null);
    try {
      // Run SF analysis client-side immediately (no HTTP, uses already-loaded data)
      if (sfResult?.rows && sfResult.rows.length > 0) {
        setSfAnalysis(analyzeSFData(sfResult.rows));
      } else {
        setSfAnalysis(null);
      }

      // Pass SF URLs for robots.txt cross-reference and total count for sitemap comparison
      const sfUrls = sfResult?.rows.map((r) => r.address) ?? [];
      const sfTotalUrls = sfResult?.rows.length;

      const res = await fetch("/api/tech-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain,
          psiApiKey,
          runPageSpeed: runPsi,
          // Send up to 2000 URLs to avoid huge payloads
          sfUrls: sfUrls.slice(0, 2000),
          sfTotalUrls,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        {sfResult && (
          <span className="text-xs text-muted-foreground bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-2 py-1 rounded">
            Дані SF завантажено · {sfResult.rows.length.toLocaleString("uk")} URL для аналізу
          </span>
        )}
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 cursor-pointer select-none ml-auto">
          <input
            type="checkbox"
            checked={runPsi}
            onChange={(e) => setRunPsi(e.target.checked)}
            className="rounded"
          />
          PageSpeed Insights (повільніше)
        </label>
        <button
          onClick={runAudit}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Перевірка…" : "Запустити технічний аудит"}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {loading && (
        <div className="p-6 flex flex-col items-center gap-3 text-gray-500 dark:text-gray-400">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm">Перевірка технічних параметрів сайту…</p>
          {runPsi && <p className="text-xs">PageSpeed може займати до 45 секунд</p>}
          {sfResult && <p className="text-xs">Аналіз {sfResult.rows.length.toLocaleString("uk")} сторінок із SF…</p>}
        </div>
      )}

      {(result || sfAnalysis) && !loading && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {result && (
            <div className="bg-gray-50 dark:bg-gray-800/50 px-4 py-2 text-xs text-gray-500 dark:text-gray-400">
              Перевірено: {result.domain} · {new Date(result.checkedAt).toLocaleString("uk-UA")}
            </div>
          )}
          <div className="px-4 divide-y divide-gray-100 dark:divide-gray-800">

            {/* ═══ SECTION: DOMAIN & SERVER ═══ */}
            {result && <SectionDivider label="Домен і сервер" />}

            {/* Mirror */}
            {result && (
              <CheckRow title="Основне дзеркало (www / non-www)" status={result.mirror.status} note={result.mirror.note}>
                <div className="flex gap-4 text-xs text-gray-400">
                  {result.mirror.wwwStatusCode !== null && (
                    <span>www → {result.mirror.wwwStatusCode} · {result.mirror.wwwFinalUrl}</span>
                  )}
                  {result.mirror.nonWwwStatusCode !== null && (
                    <span>non-www → {result.mirror.nonWwwStatusCode}</span>
                  )}
                </div>
              </CheckRow>
            )}

            {/* HTTPS */}
            {result && (
              <CheckRow title="HTTPS / HTTP редирект" status={result.https.status} note={result.https.note} />
            )}

            {/* Server Info */}
            {result?.serverInfo && (
              <CheckRow title="Сервер / CDN / TTFB" status={result.serverInfo.status} note={result.serverInfo.note}>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  <StatPill label="TTFB" value={result.serverInfo.ttfbMs !== null ? `${result.serverInfo.ttfbMs}ms` : "н/д"} warn={(result.serverInfo.ttfbMs ?? 0) > 600} />
                  <StatPill label="Сервер" value={result.serverInfo.server ?? "—"} />
                  <StatPill label="CDN" value={result.serverInfo.cdn ?? "немає"} />
                </div>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {[
                    { ok: result.serverInfo.hasViewportMeta, label: "viewport meta" },
                    { ok: result.serverInfo.hasLangAttr, label: "lang attr" },
                    { ok: result.serverInfo.hasFavicon, label: "favicon" },
                  ].map(({ ok, label }) => (
                    <span key={label} className={`text-xs px-1.5 py-0.5 rounded font-mono border ${
                      ok
                        ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800"
                        : "bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800"
                    }`}>
                      {ok ? "✓" : "✗"} {label}
                    </span>
                  ))}
                  {result.serverInfo.cacheControl && (
                    <span className="text-xs px-1.5 py-0.5 rounded font-mono border bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800">
                      cache: {result.serverInfo.cacheControl}
                    </span>
                  )}
                </div>
              </CheckRow>
            )}

            {/* Compression */}
            {result?.compression && (
              <CheckRow title="Стиснення (Gzip / Brotli)" status={result.compression.status} note={result.compression.note} />
            )}

            {/* Hreflang */}
            {result?.hreflang && (
              <CheckRow title="Hreflang (мовні версії)" status={result.hreflang.status} note={result.hreflang.note}>
                {result.hreflang.hasHreflang && (
                  <div className="flex flex-wrap gap-2 mt-1">
                    <div className="grid grid-cols-3 gap-2 w-full">
                      <StatPill label="Мовних тегів" value={result.hreflang.count} />
                      <StatPill label="Мов" value={result.hreflang.languages.length} />
                      <StatPill label="x-default" value={result.hreflang.hasXDefault ? "✓" : "✗"} warn={!result.hreflang.hasXDefault} />
                    </div>
                    {result.hreflang.languages.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {result.hreflang.languages.slice(0, 10).map((lang) => (
                          <span key={lang} className="text-xs bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 px-1.5 py-0.5 rounded font-mono">
                            {lang}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CheckRow>
            )}

            {/* Page Tech */}
            {result?.pageTech && (
              <CheckRow title="Технічні теги сторінки" status={result.pageTech.status} note={result.pageTech.note}>
                <div className="flex flex-wrap gap-2 mt-1">
                  {[
                    { ok: result.pageTech.hasSelfCanonical, label: "self-canonical" },
                    { ok: result.pageTech.hasManifest, label: "manifest.json" },
                    { ok: result.pageTech.hasAppleTouchIcon, label: "apple-touch-icon" },
                    { ok: !result.pageTech.hasMixedContent, label: "без mixed-content" },
                  ].map(({ ok, label }) => (
                    <span key={label} className={`text-xs px-1.5 py-0.5 rounded font-mono border ${
                      ok
                        ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800"
                        : "bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800"
                    }`}>
                      {ok ? "✓" : "✗"} {label}
                    </span>
                  ))}
                  <span className={`text-xs px-1.5 py-0.5 rounded font-mono border ${
                    result.pageTech.scriptCount > 25
                      ? "bg-orange-50 dark:bg-orange-950/20 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800"
                      : "bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700"
                  }`}>
                    📜 {result.pageTech.scriptCount} скриптів{result.pageTech.scriptCount > 25 ? " ⚠" : ""}
                  </span>
                </div>
              </CheckRow>
            )}

            {/* Security Headers */}
            {result?.securityHeaders && (
              <CheckRow title="Заголовки безпеки" status={result.securityHeaders.status} note={result.securityHeaders.note}>
                <div className="flex flex-wrap gap-2 mt-1">
                  {[
                    { key: "hsts", label: "HSTS" },
                    { key: "xFrameOptions", label: "X-Frame-Options" },
                    { key: "xContentTypeOptions", label: "X-Content-Type-Options" },
                    { key: "csp", label: "CSP" },
                  ].map(({ key, label }) => {
                    const val = result.securityHeaders![key as keyof SecurityHeadersCheck] as boolean;
                    return (
                      <span key={key} className={`text-xs px-1.5 py-0.5 rounded font-mono border ${
                        val
                          ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800"
                          : "bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800"
                      }`}>
                        {val ? "✓" : "✗"} {label}
                      </span>
                    );
                  })}
                </div>
              </CheckRow>
            )}

            {/* ═══ SECTION: CRAWL & INDEXATION ═══ */}
            {result && <SectionDivider label="Краулінг і індексація" />}

            {/* robots.txt */}
            {result && (
              <CheckRow title="robots.txt" status={result.robotsTxt.status} note={result.robotsTxt.note}>
                {result.robotsTxt.sitemapUrls.length > 0 && (
                  <p className="text-xs text-gray-400 mb-2">
                    Sitemap у robots.txt: {result.robotsTxt.sitemapUrls.map((u) => (
                      <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-500 mr-2">{u}</a>
                    ))}
                  </p>
                )}
                {result.robotsTxt.pathAnalysis && result.robotsTxt.pathAnalysis.length > 0 && (
                  <div className="mb-2 space-y-1">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Аналіз Disallow правил:</p>
                    <div className="space-y-1.5 max-h-60 overflow-y-auto">
                      {result.robotsTxt.pathAnalysis.map((pa) => (
                        <div key={pa.path} className="flex items-start gap-2 text-xs">
                          <code className="shrink-0 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-300 min-w-[120px]">
                            {pa.path}
                          </code>
                          <AssessmentBadge assessment={pa.assessment} />
                          <span className="text-gray-500 dark:text-gray-400 flex-1">{pa.reason}</span>
                          {pa.blockedSFUrlCount > 0 && (
                            <span className="shrink-0 text-orange-600 dark:text-orange-400 font-medium">
                              {pa.blockedSFUrlCount} URL SF
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CheckRow>
            )}

            {/* Sitemap */}
            {result && (
              <CheckRow title="Sitemap.xml" status={result.sitemap.status} note={result.sitemap.note}>
                {result.sitemap.sfComparison && (
                  <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg text-xs space-y-2">
                    <p className="font-medium text-blue-800 dark:text-blue-300">Порівняння sitemap vs Screaming Frog</p>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-white dark:bg-gray-900 rounded p-2">
                        <p className="text-lg font-bold text-blue-700 dark:text-blue-400">
                          {result.sitemap.sfComparison.sitemapUrlCount.toLocaleString("uk")}
                        </p>
                        <p className="text-gray-500">у Sitemap</p>
                      </div>
                      <div className="bg-white dark:bg-gray-900 rounded p-2">
                        <p className="text-lg font-bold text-green-700 dark:text-green-400">
                          {result.sitemap.sfComparison.sfUrlCount.toLocaleString("uk")}
                        </p>
                        <p className="text-gray-500">у SF</p>
                      </div>
                      <div className={`rounded p-2 ${result.sitemap.sfComparison.missingFromSitemapEstimate > 0 ? "bg-orange-50 dark:bg-orange-950/30" : "bg-white dark:bg-gray-900"}`}>
                        <p className={`text-lg font-bold ${result.sitemap.sfComparison.missingFromSitemapEstimate > 0 ? "text-orange-600 dark:text-orange-400" : "text-gray-600"}`}>
                          {result.sitemap.sfComparison.missingFromSitemapEstimate > 0
                            ? `~${result.sitemap.sfComparison.missingFromSitemapEstimate.toLocaleString("uk")}`
                            : "0"}
                        </p>
                        <p className="text-gray-500">відсутніх</p>
                      </div>
                    </div>
                    {result.sitemap.sampleChecked && result.sitemap.sampleChecked > 0 && (
                      <p className="text-gray-500">Перевірено статус {result.sitemap.sampleChecked} URL з sitemap</p>
                    )}
                  </div>
                )}
                {result.sitemap.statusIssues && result.sitemap.statusIssues.length > 0 && (
                  <div className="mb-2 space-y-1">
                    <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">
                      Проблеми в URL sitemap:
                    </p>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {result.sitemap.statusIssues.map((issue) => (
                        <div key={issue.url} className="flex items-center gap-2 text-xs">
                          <span className={`shrink-0 font-mono font-bold ${
                            issue.type === "redirect" ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400"
                          }`}>
                            {issue.statusCode}
                          </span>
                          <a
                            href={issue.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gray-600 dark:text-gray-400 hover:underline truncate"
                          >
                            {issue.url}
                          </a>
                          <span className="shrink-0 text-gray-400">
                            {issue.type === "redirect" ? "редирект" : issue.type === "client_error" ? "4xx помилка" : "5xx помилка"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CheckRow>
            )}

            {/* SF: HTTP Status */}
            {sfAnalysis && (
              <CheckRow title="[SF] Статус-коди сторінок" status={sfAnalysis.httpStatus.status} note={sfAnalysis.httpStatus.note}>
                <div className="grid grid-cols-4 gap-2 mt-1">
                  <StatPill label="200 OK" value={sfAnalysis.httpStatus.ok200.toLocaleString("uk")} />
                  <StatPill label="3xx редир." value={sfAnalysis.httpStatus.redirect3xx} warn={sfAnalysis.httpStatus.redirect3xx > 0} />
                  <StatPill label="4xx помилки" value={sfAnalysis.httpStatus.error4xx} warn={sfAnalysis.httpStatus.error4xx > 0} />
                  <StatPill label="5xx помилки" value={sfAnalysis.httpStatus.error5xx} warn={sfAnalysis.httpStatus.error5xx > 0} />
                </div>
              </CheckRow>
            )}

            {/* SF: Indexability */}
            {sfAnalysis && (
              <CheckRow title="[SF] Індексація сторінок" status={sfAnalysis.indexability.status} note={sfAnalysis.indexability.note}>
                <div className="grid grid-cols-4 gap-2 mt-1">
                  <StatPill label="Індексуються" value={sfAnalysis.indexability.indexable.toLocaleString("uk")} />
                  <StatPill label="Неіндекс." value={sfAnalysis.indexability.nonIndexable} warn={sfAnalysis.indexability.nonIndexable > 0} />
                  <StatPill label="Noindex-мета" value={sfAnalysis.indexability.noindexMeta} warn={sfAnalysis.indexability.noindexMeta > 0} />
                  <StatPill label="Robots.txt" value={sfAnalysis.indexability.byRobots} warn={sfAnalysis.indexability.byRobots > 0} />
                </div>
              </CheckRow>
            )}

            {/* SF: Crawl Depth */}
            {sfAnalysis && (
              <CheckRow title="[SF] Глибина краулінгу" status={sfAnalysis.crawlDepth.status} note={sfAnalysis.crawlDepth.note}>
                <div className="flex gap-3 mt-1 flex-wrap">
                  {Object.entries(sfAnalysis.crawlDepth.distribution)
                    .sort(([a], [b]) => (a === "5+" ? 1 : b === "5+" ? -1 : parseInt(a) - parseInt(b)))
                    .map(([depth, count]) => (
                      <div key={depth} className="text-center">
                        <div className="text-xs font-bold text-gray-700 dark:text-gray-200">{count}</div>
                        <div className="text-xs text-gray-400">глиб. {depth}</div>
                      </div>
                    ))}
                </div>
              </CheckRow>
            )}

            {/* SF: Response Times */}
            {sfAnalysis && (
              <CheckRow title="[SF] Час відповіді сервера" status={sfAnalysis.responseTimes.status} note={sfAnalysis.responseTimes.note}>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  <StatPill
                    label="Середній (мс)"
                    value={sfAnalysis.responseTimes.avgMs !== null ? sfAnalysis.responseTimes.avgMs : "н/д"}
                    warn={(sfAnalysis.responseTimes.avgMs ?? 0) > 2000}
                  />
                  <StatPill label="> 2 с (повільні)" value={sfAnalysis.responseTimes.slowPages} warn={sfAnalysis.responseTimes.slowPages > 0} />
                  <StatPill label="> 4 с (критичні)" value={sfAnalysis.responseTimes.verySlowPages} warn={sfAnalysis.responseTimes.verySlowPages > 0} />
                </div>
              </CheckRow>
            )}

            {/* ═══ SECTION: ON-PAGE SEO (from SF) ═══ */}
            {sfAnalysis && <SectionDivider label="On-Page SEO (Screaming Frog)" />}

            {/* SF: Canonical */}
            {sfAnalysis && (
              <CheckRow title="[SF] Canonical теги" status={sfAnalysis.canonical.status} note={sfAnalysis.canonical.note}>
                <div className="grid grid-cols-4 gap-2 mt-1">
                  <StatPill label="З canonical" value={sfAnalysis.canonical.withCanonical.toLocaleString("uk")} />
                  <StatPill label="Без canonical" value={sfAnalysis.canonical.withoutCanonical} warn={sfAnalysis.canonical.withoutCanonical > 0} />
                  <StatPill label="Self" value={sfAnalysis.canonical.selfCanonical} />
                  <StatPill label="Cross" value={sfAnalysis.canonical.crossCanonical} warn={sfAnalysis.canonical.crossCanonical > 0} />
                </div>
              </CheckRow>
            )}

            {/* SF: Titles */}
            {sfAnalysis && (
              <CheckRow title="[SF] Title теги" status={sfAnalysis.titles.status} note={sfAnalysis.titles.note}>
                <div className="grid grid-cols-4 gap-2 mt-1">
                  <StatPill label="Всього" value={sfAnalysis.titles.total.toLocaleString("uk")} />
                  <StatPill label="Відсутніх" value={sfAnalysis.titles.missing} warn={sfAnalysis.titles.missing > 0} />
                  <StatPill label="Задовгих" value={sfAnalysis.titles.tooLong} warn={sfAnalysis.titles.tooLong > 0} />
                  <StatPill label="Дублікатів" value={sfAnalysis.titles.duplicates} warn={sfAnalysis.titles.duplicates > 0} />
                </div>
              </CheckRow>
            )}

            {/* SF: Descriptions */}
            {sfAnalysis && (
              <CheckRow title="[SF] Meta Description" status={sfAnalysis.descriptions.status} note={sfAnalysis.descriptions.note}>
                <div className="grid grid-cols-4 gap-2 mt-1">
                  <StatPill label="Всього" value={sfAnalysis.descriptions.total.toLocaleString("uk")} />
                  <StatPill label="Відсутніх" value={sfAnalysis.descriptions.missing} warn={sfAnalysis.descriptions.missing > 0} />
                  <StatPill label="Задовгих (>160)" value={sfAnalysis.descriptions.tooLong} warn={sfAnalysis.descriptions.tooLong > 0} />
                  <StatPill label="Дублікатів" value={sfAnalysis.descriptions.duplicates} warn={sfAnalysis.descriptions.duplicates > 0} />
                </div>
              </CheckRow>
            )}

            {/* SF: H1 */}
            {sfAnalysis && (
              <CheckRow title="[SF] H1 заголовки" status={sfAnalysis.h1s.status} note={sfAnalysis.h1s.note}>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  <StatPill label="Всього" value={sfAnalysis.h1s.total.toLocaleString("uk")} />
                  <StatPill label="Без H1" value={sfAnalysis.h1s.missing} warn={sfAnalysis.h1s.missing > 0} />
                  <StatPill label="Кілька H1" value={sfAnalysis.h1s.multiple} warn={sfAnalysis.h1s.multiple > 0} />
                </div>
              </CheckRow>
            )}

            {/* SF: H2 */}
            {sfAnalysis && (
              <CheckRow title="[SF] H2 заголовки" status={sfAnalysis.h2s.status} note={sfAnalysis.h2s.note}>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  <StatPill label="Всього" value={sfAnalysis.h2s.total.toLocaleString("uk")} />
                  <StatPill label="Без H2" value={sfAnalysis.h2s.missing} warn={sfAnalysis.h2s.missing > 0} />
                  <StatPill label="Дубл. H1 (крос-сторінки)" value={sfAnalysis.h2s.duplicateH1} warn={sfAnalysis.h2s.duplicateH1 > 0} />
                </div>
              </CheckRow>
            )}

            {/* ═══ SECTION: CONTENT ═══ */}
            {sfAnalysis && <SectionDivider label="Контент і URL" />}

            {/* SF: Content */}
            {sfAnalysis && (
              <CheckRow title="[SF] Якість контенту" status={sfAnalysis.content.status} note={sfAnalysis.content.note}>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  <StatPill label="Тонкий контент (<300 сл.)" value={sfAnalysis.content.thinContent} warn={sfAnalysis.content.thinContent > 0} />
                  <StatPill label="Сторінки-сироти" value={sfAnalysis.content.orphanPages} warn={sfAnalysis.content.orphanPages > 0} />
                  <StatPill label="Near-duplicate" value={sfAnalysis.content.nearDuplicates} warn={sfAnalysis.content.nearDuplicates > 0} />
                </div>
              </CheckRow>
            )}

            {/* SF: URL Structure */}
            {sfAnalysis && (
              <CheckRow title="[SF] Структура URL" status={sfAnalysis.urlStructure.status} note={sfAnalysis.urlStructure.note}>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  <StatPill label="Задовгих URL" value={sfAnalysis.urlStructure.tooLong} warn={sfAnalysis.urlStructure.tooLong > 0} />
                  <StatPill label="З параметрами (?)" value={sfAnalysis.urlStructure.withParameters} warn={sfAnalysis.urlStructure.withParameters > 0} />
                  <StatPill label="Глибина > 4" value={sfAnalysis.urlStructure.deepUrls} warn={sfAnalysis.urlStructure.deepUrls > 0} />
                </div>
              </CheckRow>
            )}

            {/* ═══ SECTION: PERFORMANCE & SOCIAL ═══ */}
            {result && <SectionDivider label="Продуктивність і соціальні мережі" />}

            {/* PageSpeed */}
            {result?.pageSpeed && (
              <CheckRow title="PageSpeed (мобільний)" status={result.pageSpeed.status} note={result.pageSpeed.note}>
                {result.pageSpeed.performanceScore !== null && (
                  <div className="flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
                    <div className="flex items-center gap-1">
                      <span className={`text-2xl font-bold ${
                        result.pageSpeed.performanceScore >= 90 ? "text-green-600" :
                        result.pageSpeed.performanceScore >= 50 ? "text-yellow-600" : "text-red-600"
                      }`}>
                        {result.pageSpeed.performanceScore}
                      </span>
                      <span className="text-gray-400">/100</span>
                    </div>
                    {result.pageSpeed.lcpMs && (
                      <span>LCP: <b className="text-gray-700 dark:text-gray-200">{(result.pageSpeed.lcpMs / 1000).toFixed(2)}s</b></span>
                    )}
                    {result.pageSpeed.clsScore != null && (
                      <span>CLS: <b className="text-gray-700 dark:text-gray-200">{result.pageSpeed.clsScore}</b></span>
                    )}
                    {result.pageSpeed.fcpMs && (
                      <span>FCP: <b className="text-gray-700 dark:text-gray-200">{(result.pageSpeed.fcpMs / 1000).toFixed(2)}s</b></span>
                    )}
                    {result.pageSpeed.tbtMs && (
                      <span>TBT: <b className="text-gray-700 dark:text-gray-200">{result.pageSpeed.tbtMs}ms</b></span>
                    )}
                  </div>
                )}
              </CheckRow>
            )}

            {/* Open Graph */}
            {result?.openGraph && (
              <CheckRow title="Open Graph / Social Meta" status={result.openGraph.status} note={result.openGraph.note}>
                <div className="flex flex-wrap gap-2 mt-1">
                  {(["hasOgTitle", "hasOgDescription", "hasOgImage", "hasTwitterCard"] as const).map((key) => {
                    const labels: Record<string, string> = {
                      hasOgTitle: "og:title",
                      hasOgDescription: "og:description",
                      hasOgImage: "og:image",
                      hasTwitterCard: "twitter:card",
                    };
                    const val = result.openGraph![key];
                    return (
                      <span key={key} className={`text-xs px-1.5 py-0.5 rounded font-mono border ${
                        val
                          ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800"
                          : "bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800"
                      }`}>
                        {val ? "✓" : "✗"} {labels[key]}
                      </span>
                    );
                  })}
                </div>
              </CheckRow>
            )}

            {/* ═══ SECTION: STRUCTURED DATA & ANALYTICS ═══ */}
            {result && <SectionDivider label="Мікророзмітка і аналітика" />}

            {/* Structured Data */}
            {result?.structuredData && (
              <CheckRow title="Структуровані дані (Schema.org)" status={result.structuredData.status} note={result.structuredData.note}>
                {result.structuredData.types.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {result.structuredData.types.slice(0, 8).map((t) => (
                      <span key={t} className="text-xs bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 px-1.5 py-0.5 rounded font-mono">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </CheckRow>
            )}

            {/* Analytics */}
            {result?.analytics && (
              <CheckRow title="Системи аналітики та реклами" status={result.analytics.status} note={result.analytics.note}>
                <div className="flex flex-wrap gap-2 mt-1">
                  {[
                    { key: "hasGA4", label: "GA4", primary: true },
                    { key: "hasGTM", label: "GTM", primary: true },
                    { key: "hasGoogleAds", label: "Google Ads", primary: false },
                    { key: "hasMicrosoftClarity", label: "MS Clarity", primary: false },
                  ].map(({ key, label, primary }) => {
                    const val = result.analytics![key as keyof AnalyticsCheck] as boolean;
                    return (
                      <span key={key} className={`text-xs px-1.5 py-0.5 rounded font-mono border ${
                        val
                          ? primary
                            ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800"
                            : "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800"
                          : "bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-700"
                      }`}>
                        {val ? "✓" : "—"} {label}
                      </span>
                    );
                  })}
                </div>
              </CheckRow>
            )}

          </div>
        </div>
      )}

      {/* Summary: what gets checked without SF data */}
      {!result && !sfAnalysis && !loading && (
        <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-5 text-xs text-gray-400 dark:text-gray-500 space-y-1">
          <p className="font-medium text-gray-500 dark:text-gray-400 mb-2">Що перевіряє аудит:</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
            <span>✦ Дзеркало сайту (www / non-www)</span>
            <span>✦ HTTPS і HTTP→HTTPS редирект</span>
            <span>✦ TTFB, сервер, CDN, кеш</span>
            <span>✦ Заголовки безпеки (HSTS, CSP…)</span>
            <span>✦ Viewport, lang attr, favicon</span>
            <span>✦ Стиснення (Gzip / Brotli)</span>
            <span>✦ robots.txt + аналіз Disallow правил</span>
            <span>✦ Sitemap.xml (URL-кількість, статуси)</span>
            <span>✦ Hreflang (мовні версії, x-default)</span>
            <span>✦ Self-canonical, PWA manifest, mixed-content</span>
            <span>✦ Open Graph / Twitter Card</span>
            <span>✦ Schema.org мікророзмітка</span>
            <span>✦ GA4 / GTM / Google Ads / MS Clarity</span>
            <span>✦ Кількість скриптів на сторінці</span>
            <span>✦ PageSpeed / CWV (опційно)</span>
            <span></span>
            {sfResult && (
              <>
                <span>✦ [SF] HTTP статус-коди (200/3xx/4xx/5xx)</span>
                <span>✦ [SF] Canonical теги (self / cross)</span>
                <span>✦ [SF] Індексація (noindex, robots)</span>
                <span>✦ [SF] Title теги (дублі, довжина)</span>
                <span>✦ [SF] Meta description (дублі, довжина)</span>
                <span>✦ [SF] H1 (відсутні, кілька H1)</span>
                <span>✦ [SF] H2 (відсутні, дублі H1 між сторінками)</span>
                <span>✦ [SF] Час відповіді сервера (TTFB)</span>
                <span>✦ [SF] Тонкий контент / сторінки-сироти</span>
                <span>✦ [SF] Near-duplicate сторінки</span>
                <span>✦ [SF] Структура URL (довжина, параметри)</span>
                <span>✦ [SF] Глибина краулінгу</span>
              </>
            )}
          </div>
          {!sfResult && (
            <p className="mt-2 text-blue-500 dark:text-blue-400">
              💡 Завантажте CSV зі Screaming Frog для розширеного аналізу ще +12 параметрів
            </p>
          )}
        </div>
      )}
    </div>
  );
}
