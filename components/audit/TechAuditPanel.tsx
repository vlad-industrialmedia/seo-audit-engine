"use client";

import { useState, useRef, useCallback } from "react";
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
  SFPageSamplingResult,
  PageSampleCheck,
  Custom404Check,
  Http2Check,
  RssFeedCheck,
  ImageOptCheck,
  InternalLinksCheck,
  CookieConsentCheck,
} from "@/types";
import { analyzeSFData } from "@/lib/tech-audit/sf-analysis";

interface Props {
  domain: string;
  psiApiKey?: string;
  sfResult?: SFImportResult | null;
  // Колбек для збереження результатів у батьківський компонент (кешування в store)
  onResult?: (result: TechAuditResult) => void;
  // Початкові кешовані дані для відновлення збереженого проєкту
  initialResult?: TechAuditResult | null;
}

function StatusBadge({ status }: { status: TechCheckStatus }) {
  const map: Record<TechCheckStatus, { label: string; cls: string }> = {
    ok: { label: "✓ OK", cls: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
    issue: { label: "⚠ Проблема", cls: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
    error: { label: "✗ Помилка", cls: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
    unknown: { label: "? Невідомо", cls: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
    poor: { label: "✗ Погано", cls: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
    needs_attention: { label: "⚠ Увага", cls: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
    warning: { label: "⚠ Попередження", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
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

// Посилання для зовнішньої перевірки результатів аудиту
type VerifyLink = { label: string; url: string };

function CheckRow({
  title,
  status,
  note,
  verifyLinks,
  children,
}: {
  title: string;
  status: TechCheckStatus;
  note: string;
  // Масив посилань на зовнішні сервіси для верифікації результату
  verifyLinks?: VerifyLink[];
  children?: React.ReactNode;
}) {
  return (
    <div className="py-3 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{title}</span>
          {/* Посилання на зовнішні сервіси перевірки */}
          {verifyLinks && verifyLinks.length > 0 && (
            <div className="flex items-center gap-1 flex-shrink-0">
              {verifyLinks.map((link) => (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Перевірити: ${link.label}`}
                  className="inline-flex items-center gap-0.5 text-xs text-blue-500 hover:text-blue-700 hover:underline border border-blue-200 hover:border-blue-400 rounded px-1.5 py-0.5 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-400 transition-colors"
                >
                  {link.label} ↗
                </a>
              ))}
            </div>
          )}
        </div>
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

/** Pick up to `perType` URLs per detected page-type group from SF rows */
function samplePagesByType(
  sfResult: SFImportResult,
  perType = 2,
  maxTotal = 20,
): Array<{ url: string; pageType: string }> {
  // Group indexable HTML pages by their detected type
  const groups: Record<string, string[]> = {};
  for (const row of sfResult.rows) {
    if (
      row.indexabilityStatus?.toLowerCase() !== "indexable" &&
      row.indexabilityStatus?.toLowerCase() !== ""
    ) continue;
    const ct = (row.contentType ?? "").toLowerCase();
    if (!ct.includes("text/html") && ct !== "") continue;

    // Derive page type from common URL patterns
    const url = row.address ?? "";
    let type = "other";
    if (/\/(blog|news|articles?|posts?)\//i.test(url)) type = "blog";
    else if (/\/(cases?|portfolio|projects?|work)\//i.test(url)) type = "case";
    else if (/\/(products?|catalog|shop|store|goods|tovar)\//i.test(url)) type = "product";
    else if (/\/(services?|poslug|service)\//i.test(url)) type = "service";
    else if (/\/(categor|category|katehor)\//i.test(url)) type = "category";
    else if (/\/(about|pro-nas|contact|kontakt|team|about-us)\//i.test(url)) type = "info";
    else if (url.replace(/^https?:\/\/[^/]+\/?$/, "").length < 3) type = "homepage";

    if (!groups[type]) groups[type] = [];
    groups[type].push(url);
  }

  const sampled: Array<{ url: string; pageType: string }> = [];
  for (const [type, urls] of Object.entries(groups)) {
    // Pick random subset of up to perType per group
    const shuffled = [...urls].sort(() => Math.random() - 0.5);
    for (const url of shuffled.slice(0, perType)) {
      if (sampled.length >= maxTotal) break;
      sampled.push({ url, pageType: type });
    }
    if (sampled.length >= maxTotal) break;
  }
  return sampled;
}

export default function TechAuditPanel({ domain, psiApiKey, sfResult, onResult, initialResult }: Props) {
  // Якщо є кешований результат — ініціалізуємо ним, інакше починаємо з null
  const [result, setResult] = useState<TechAuditResult | null>(initialResult ?? null);

  // ─── URL для зовнішніх сервісів верифікації ───────────────────────────────
  // Будуємо посилання один раз на базі домену проєкту
  const domainUrl = domain.startsWith("http") ? domain : `https://${domain}`;
  const domainEncoded = encodeURIComponent(domainUrl);
  const domainHost = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");

  const ext = {
    pagespeed:    `https://pagespeed.web.dev/analysis?url=${domainEncoded}`,
    richResults:  `https://search.google.com/test/rich-results?url=${domainEncoded}`,
    schemaOrg:    `https://validator.schema.org/#url=${domainEncoded}`,
    mobileFriend: `https://search.google.com/test/mobile-friendly?url=${domainEncoded}`,
    secHeaders:   `https://securityheaders.com/?q=${domainEncoded}&followRedirects=on`,
    sslLabs:      `https://www.ssllabs.com/ssltest/analyze.html?d=${domainHost}&hideResults=on`,
    ogDebug:      `https://www.opengraph.xyz/url/${domainEncoded}`,
    robotsTxt:    `${domainUrl}/robots.txt`,
    sitemapXml:   `${domainUrl}/sitemap.xml`,
    hreflangChk:  `https://hreflang.org/tester/?url=${domainEncoded}`,
    redirectChk:  `https://httpstatus.io/?url=${domainEncoded}`,
    gtmetrix:     `https://gtmetrix.com/?url=${domainEncoded}`,
  };
  const [sfAnalysis, setSfAnalysis] = useState<SFAnalysis | null>(null);
  const [pageSampling, setPageSampling] = useState<SFPageSamplingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [samplingLoading, setSamplingLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runPsi, setRunPsi] = useState(false);
  const [expandedPage, setExpandedPage] = useState<string | null>(null);
  const [screenshotLoading, setScreenshotLoading] = useState(false);
  // ─── Локальний PSI API ключ (зберігається в компоненті, не в store) ─────────
  // Дозволяємо ввести ключ прямо в панелі; якщо передано через props — використовуємо його
  const [localPsiKey, setLocalPsiKey] = useState(psiApiKey ?? "");

  // Ref на блок з результатами для html2canvas
  const resultsRef = useRef<HTMLDivElement>(null);

  /** Зробити скріншот панелі результатів і завантажити як PNG */
  const handleScreenshot = useCallback(async () => {
    if (!resultsRef.current) return;
    setScreenshotLoading(true);
    try {
      // Динамічний імпорт html2canvas (клієнтська бібліотека)
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(resultsRef.current, {
        scale: 2,               // Вища чіткість для ретина-екранів
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      });
      // Конвертуємо canvas у PNG і завантажуємо
      const link = document.createElement("a");
      link.download = `tech-audit-${domain}-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (e) {
      console.error("html2canvas помилка:", e);
    } finally {
      setScreenshotLoading(false);
    }
  }, [domain]);

  async function runAudit() {
    setLoading(true);
    setError(null);
    setPageSampling(null);
    try {
      // Run SF analysis client-side immediately (no HTTP, uses already-loaded data)
      if (sfResult?.rows && sfResult.rows.length > 0) {
        setSfAnalysis(analyzeSFData(sfResult.rows, sfResult.images, sfResult.redirects));
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
          // Використовуємо локальний ключ якщо є, інакше переданий через props
          psiApiKey: localPsiKey || psiApiKey,
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
      // Сповіщаємо батьківський компонент про результат для збереження в кеш
      onResult?.(data);

      // Kick off per-page sampling in the background if SF data is available
      if (sfResult?.rows && sfResult.rows.length > 0) {
        runPageSampling(sfResult);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function runPageSampling(sf: SFImportResult) {
    setSamplingLoading(true);
    try {
      const pages = samplePagesByType(sf);
      if (pages.length === 0) return;

      const res = await fetch("/api/check-pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pages, domain }),
      });
      if (!res.ok) return;
      const data = await res.json();
      const checked: PageSampleCheck[] = data.pages ?? [];

      const pageTypeSampled = Array.from(new Set(checked.map((p) => p.pageType)));
      const hasIssue = checked.some((p) => p.issues.length > 0);
      setPageSampling({
        status: hasIssue ? "issue" : "ok",
        sampledCount: checked.length,
        pageTypeSampled,
        pages: checked,
        note: `Перевірено ${checked.length} сторінок із ${pageTypeSampled.length} типів`,
      });
    } catch {
      // Sampling errors are non-fatal
    } finally {
      setSamplingLoading(false);
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
        <div className="flex items-center gap-2 flex-wrap ml-auto">
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={runPsi}
              onChange={(e) => setRunPsi(e.target.checked)}
              className="rounded"
            />
            PageSpeed Insights (повільніше)
          </label>
          {/* Поле для PSI API ключа — з'являється тільки коли увімкнена перевірка PSI */}
          {runPsi && (
            <div className="flex items-center gap-1.5">
              <input
                type="password"
                value={localPsiKey}
                onChange={(e) => setLocalPsiKey(e.target.value)}
                placeholder="PSI API ключ (необов'язково)"
                title="Google PageSpeed Insights API ключ. Без ключа — ліміт 25 запитів/добу."
                className="w-52 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 placeholder:text-gray-400"
              />
              <a
                href="https://developers.google.com/speed/docs/insights/v5/get-started#key"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-500 hover:underline whitespace-nowrap"
              >
                Отримати ключ
              </a>
            </div>
          )}
        </div>
        {/* Кнопка скріншоту — доступна тільки коли є результати */}
        {(result || sfAnalysis) && !loading && (
          <button
            onClick={handleScreenshot}
            disabled={screenshotLoading}
            title="Зберегти результати аудиту як PNG"
            className="px-3 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-sm rounded-lg disabled:opacity-50 transition-colors"
          >
            {screenshotLoading ? "📷…" : "📷 PNG"}
          </button>
        )}
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
          {sfResult && <p className="text-xs">Аналіз {sfResult.rows.length.toLocaleString("uk")} сторінок із SF + вибірка реальних…</p>}
        </div>
      )}

      {(result || sfAnalysis) && !loading && (
        <div ref={resultsRef} className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
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
              <CheckRow title="Основне дзеркало (www / non-www)" status={result.mirror.status} note={result.mirror.note}
                verifyLinks={[{ label: "httpstatus.io", url: ext.redirectChk }]}
              >
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
              <CheckRow title="HTTPS / HTTP редирект" status={result.https.status} note={result.https.note}
                verifyLinks={[{ label: "SSL Labs", url: ext.sslLabs }]}
              />
            )}

            {/* Server Info */}
            {result?.serverInfo && (
              <CheckRow title="Сервер / CDN / TTFB" status={result.serverInfo.status} note={result.serverInfo.note}
                verifyLinks={[{ label: "PageSpeed", url: ext.pagespeed }, { label: "GTmetrix", url: ext.gtmetrix }]}
              >
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
              <CheckRow title="Стиснення (Gzip / Brotli)" status={result.compression.status} note={result.compression.note}
                verifyLinks={[{ label: "PageSpeed", url: ext.pagespeed }]}
              />
            )}

            {/* HTTP/2 */}
            {result?.http2 && (
              <CheckRow title="HTTP/2 підтримка" status={result.http2.status} note={result.http2.note}
                verifyLinks={[{ label: "HTTP/2 Test", url: `https://tools.keycdn.com/http2-test?url=${domainUrl}` }]}
              >
                {result.http2.protocol && (
                  <span className="text-xs font-mono bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800 px-2 py-0.5 rounded mt-1 inline-block">
                    {result.http2.protocol}
                  </span>
                )}
              </CheckRow>
            )}

            {/* Внутрішні посилання */}
            {result?.internalLinks && (
              <CheckRow title="Внутрішня перелінковка" status={result.internalLinks.status} note={result.internalLinks.note}>
                <div className="grid grid-cols-4 gap-2 mt-1">
                  <StatPill label="Внутрішніх" value={result.internalLinks.totalInternalLinks} />
                  <StatPill label="Зовнішніх" value={result.internalLinks.totalExternalLinks} />
                  <StatPill label="nofollow" value={result.internalLinks.noFollowExternal} />
                  <StatPill label="Порожніх" value={result.internalLinks.anchorTextEmpty} warn={result.internalLinks.anchorTextEmpty > 2} />
                </div>
              </CheckRow>
            )}

            {/* Hreflang */}
            {result?.hreflang && (
              <CheckRow title="Hreflang (мовні версії)" status={result.hreflang.status} note={result.hreflang.note}
                verifyLinks={[{ label: "hreflang.org", url: ext.hreflangChk }]}
              >
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
              <CheckRow title="Технічні теги сторінки" status={result.pageTech.status} note={result.pageTech.note}
                verifyLinks={[{ label: "Mobile Test", url: ext.mobileFriend }, { label: "PageSpeed", url: ext.pagespeed }]}
              >
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
              <CheckRow title="Заголовки безпеки" status={result.securityHeaders.status} note={result.securityHeaders.note}
                verifyLinks={[{ label: "securityheaders.com", url: ext.secHeaders }]}
              >
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

            {/* Custom 404 */}
            {result?.custom404 && (
              <CheckRow title="Кастомна 404-сторінка" status={result.custom404.status} note={result.custom404.note}
                verifyLinks={[{ label: "Перевірити 404", url: `${domainUrl}/seo-audit-test-404-page-nonexistent` }]}
              >
                <div className="flex flex-wrap gap-2 mt-1">
                  {[
                    { ok: result.custom404.returns404, label: "HTTP 404 для неіснуючих URL" },
                    { ok: result.custom404.hasBrandedPage, label: "Branded 404-сторінка" },
                    { ok: !result.custom404.redirectsToHome, label: "Не редиректить на головну" },
                  ].map(({ ok, label }) => (
                    <span key={label} className={`text-xs px-1.5 py-0.5 rounded font-mono border ${
                      ok
                        ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800"
                        : "bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800"
                    }`}>
                      {ok ? "✓" : "✗"} {label}
                    </span>
                  ))}
                </div>
              </CheckRow>
            )}

            {/* ═══ SECTION: CRAWL & INDEXATION ═══ */}
            {result && <SectionDivider label="Краулінг і індексація" />}

            {/* robots.txt */}
            {result && (
              <CheckRow title="robots.txt" status={result.robotsTxt.status} note={result.robotsTxt.note}
                verifyLinks={[{ label: "robots.txt", url: ext.robotsTxt }]}
              >
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
              <CheckRow title="Sitemap.xml" status={result.sitemap.status} note={result.sitemap.note}
                verifyLinks={[{ label: "sitemap.xml", url: ext.sitemapXml }]}
              >
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

            {/* RSS / Atom Feed */}
            {result?.rssFeed && (
              <CheckRow title="RSS / Atom фід" status={result.rssFeed.status} note={result.rssFeed.note}>
                {result.rssFeed.found && result.rssFeed.feedUrls.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-1">
                    {result.rssFeed.feedUrls.map((url) => (
                      <a key={url} href={url} target="_blank" rel="noopener noreferrer"
                        className="text-xs font-mono text-blue-600 dark:text-blue-400 hover:underline bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-2 py-0.5 rounded">
                        {result.rssFeed!.feedType} ↗
                      </a>
                    ))}
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

            {/* SF: Internal Links */}
            {sfAnalysis?.internalLinks && (
              <CheckRow title="[SF] Внутрішня перелінковка" status={sfAnalysis.internalLinks.status} note={sfAnalysis.internalLinks.note}>
                <div className="grid grid-cols-4 gap-2 mt-1">
                  <StatPill label="Всього" value={sfAnalysis.internalLinks.total.toLocaleString("uk")} />
                  <StatPill label="Сторінки-сироти (0 inlinks)" value={sfAnalysis.internalLinks.orphanPages} warn={sfAnalysis.internalLinks.orphanPages > 0} />
                  <StatPill label="Слабо пов'язані (1–2)" value={sfAnalysis.internalLinks.poorlyLinked} warn={sfAnalysis.internalLinks.poorlyLinked > 0} />
                  <StatPill label="Середнє inlinks" value={sfAnalysis.internalLinks.avgInlinks} />
                </div>
              </CheckRow>
            )}

            {/* SF: Redirect Chains */}
            {sfAnalysis?.redirectChains && (
              <CheckRow title="[SF] Ланцюжки редиректів" status={sfAnalysis.redirectChains.status} note={sfAnalysis.redirectChains.note}>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <StatPill label="Всього редиректів" value={sfAnalysis.redirectChains.totalRedirects} />
                  <StatPill label="Довгі ланцюжки (2+ хопи)" value={sfAnalysis.redirectChains.longChains} warn={sfAnalysis.redirectChains.longChains > 0} />
                </div>
              </CheckRow>
            )}

            {/* SF: Title / H1 Match */}
            {sfAnalysis?.titleH1Match && (
              <CheckRow title="[SF] Відповідність Title ↔ H1" status={sfAnalysis.titleH1Match.status} note={sfAnalysis.titleH1Match.note}>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  <StatPill label="Всього сторінок" value={sfAnalysis.titleH1Match.total.toLocaleString("uk")} />
                  <StatPill label="Повна розбіжність" value={sfAnalysis.titleH1Match.strongMismatch} warn={sfAnalysis.titleH1Match.strongMismatch > 0} />
                  <StatPill label="Часткова розбіжність" value={sfAnalysis.titleH1Match.weakMismatch} warn={sfAnalysis.titleH1Match.weakMismatch > 0} />
                </div>
              </CheckRow>
            )}

            {/* SF: Pagination */}
            {sfAnalysis?.pagination && (
              <CheckRow title="[SF] Пагінація (rel=next/prev)" status={sfAnalysis.pagination.status} note={sfAnalysis.pagination.note}>
                <div className="grid grid-cols-4 gap-2 mt-1">
                  <StatPill label="Всього URL" value={sfAnalysis.pagination.total.toLocaleString("uk")} />
                  <StatPill label="Сторінок пагінації" value={sfAnalysis.pagination.paginated} />
                  <StatPill label="З rel=next" value={sfAnalysis.pagination.withRelNext} />
                  <StatPill label="З rel=prev" value={sfAnalysis.pagination.withRelPrev} />
                </div>
              </CheckRow>
            )}

            {/* SF: Images Alt (from SF images export) */}
            {sfAnalysis?.imagesAlt && (
              <CheckRow title="[SF] Alt-теги зображень" status={sfAnalysis.imagesAlt.status} note={sfAnalysis.imagesAlt.note}>
                <div className="grid grid-cols-4 gap-2 mt-1">
                  <StatPill label="Всього зображень" value={sfAnalysis.imagesAlt.totalImages.toLocaleString("uk")} />
                  <StatPill label="Без alt" value={sfAnalysis.imagesAlt.missingAlt} warn={sfAnalysis.imagesAlt.missingAlt > 0} />
                  <StatPill label="Порожній alt" value={sfAnalysis.imagesAlt.emptyAlt} />
                  <StatPill label="Неінформативний alt" value={sfAnalysis.imagesAlt.genericAlt} warn={sfAnalysis.imagesAlt.genericAlt > 0} />
                </div>
              </CheckRow>
            )}

            {/* ═══ SECTION: PER-PAGE SAMPLING ═══ */}
            {(pageSampling || samplingLoading) && sfAnalysis && (
              <SectionDivider label="Перевірка реальних сторінок (вибірка)" />
            )}

            {samplingLoading && (
              <div className="py-3 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                Перевірка реальних сторінок сайту…
              </div>
            )}

            {pageSampling && !samplingLoading && (
              <div className="py-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={pageSampling.status} />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                      Вибіркова перевірка сторінок
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">{pageSampling.note}</span>
                </div>

                <div className="space-y-2 mt-2">
                  {pageSampling.pages.map((page) => {
                    const isExpanded = expandedPage === page.url;
                    const hasIssues = page.issues.length > 0;
                    return (
                      <div key={page.url} className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-xs">
                        <button
                          onClick={() => setExpandedPage(isExpanded ? null : page.url)}
                          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`flex-shrink-0 px-1.5 py-0.5 rounded font-medium ${
                              hasIssues
                                ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                                : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            }`}>
                              {page.pageType}
                            </span>
                            <span className="text-gray-500 dark:text-gray-400 truncate">{page.url}</span>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            {!page.fetchOk ? (
                              <span className="text-red-500">{page.error ?? "Помилка"}</span>
                            ) : (
                              <>
                                {page.imagesTotal > 0 && (
                                  <span className={page.imagesMissingAlt > 0 || page.imagesGenericAlt > 0 ? "text-orange-500" : "text-gray-400"}>
                                    🖼 {page.imagesTotal} ({page.imagesMissingAlt + page.imagesGenericAlt} проблем)
                                  </span>
                                )}
                                {page.wordCount > 0 && (
                                  <span className={page.wordCount < 300 ? "text-orange-500" : "text-gray-400"}>
                                    📝 {page.wordCount}сл.
                                  </span>
                                )}
                                {/* Lazy loading — показуємо тільки якщо є проблема */}
                                {page.imagesTotal >= 3 && (page.lazyLoadRatio ?? 1) < 0.5 && (
                                  <span className="text-orange-500">lazy:{Math.round((page.lazyLoadRatio ?? 0) * 100)}%</span>
                                )}
                                {/* WebP/AVIF — показуємо якщо відсутній */}
                                {page.imagesTotal > 0 && page.hasWebP === false && (
                                  <span className="text-orange-500">no WebP</span>
                                )}
                                {page.schemaTypes.length > 0 && (
                                  <span className="text-blue-400">Schema✓</span>
                                )}
                              </>
                            )}
                            <svg
                              className={`w-3 h-3 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                              fill="none" viewBox="0 0 24 24" stroke="currentColor"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="px-3 pb-3 pt-1 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/30">
                            <div className="grid grid-cols-4 gap-2 mb-2">
                              <StatPill label="Зображень" value={page.imagesTotal} />
                              <StatPill label="Без alt" value={page.imagesMissingAlt} warn={page.imagesMissingAlt > 0} />
                              <StatPill label="Generic alt" value={page.imagesGenericAlt} warn={page.imagesGenericAlt > 0} />
                              <StatPill label="Слів" value={page.wordCount} warn={page.wordCount > 0 && page.wordCount < 300} />
                            </div>
                            <div className="grid grid-cols-3 gap-2 mb-2">
                              <StatPill label="Внутр. посил." value={page.internalLinksCount} warn={page.internalLinksCount < 3} />
                              <StatPill label="Зовн. посил." value={page.externalLinksCount} />
                              <StatPill label="Schema типів" value={page.schemaTypes.length} />
                            </div>
                            {/* Розширені перевірки: lazy, WebP, cookie */}
                            <div className="flex flex-wrap gap-1 mb-2">
                              {page.lazyLoadRatio !== undefined && (
                                <span className={`text-xs px-1.5 py-0.5 rounded font-mono border ${
                                  page.lazyLoadRatio >= 0.5
                                    ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800"
                                    : page.imagesTotal >= 3
                                      ? "bg-orange-50 dark:bg-orange-950/20 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800"
                                      : "bg-gray-50 dark:bg-gray-800 text-gray-500 border-gray-200 dark:border-gray-700"
                                }`}>
                                  lazy: {Math.round((page.lazyLoadRatio ?? 0) * 100)}%
                                </span>
                              )}
                              {page.hasWebP !== undefined && (
                                <span className={`text-xs px-1.5 py-0.5 rounded font-mono border ${
                                  page.hasWebP
                                    ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800"
                                    : page.imagesTotal > 0
                                      ? "bg-orange-50 dark:bg-orange-950/20 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800"
                                      : "bg-gray-50 dark:bg-gray-800 text-gray-500 border-gray-200 dark:border-gray-700"
                                }`}>
                                  {page.hasWebP ? "✓ WebP/AVIF" : "✗ WebP/AVIF"}
                                </span>
                              )}
                              {page.hasCookieBanner !== undefined && (
                                <span className={`text-xs px-1.5 py-0.5 rounded font-mono border ${
                                  page.hasCookieBanner
                                    ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800"
                                    : "bg-gray-50 dark:bg-gray-800 text-gray-400 border-gray-200 dark:border-gray-700"
                                }`}>
                                  {page.hasCookieBanner ? "✓ Cookie consent" : "— Cookie consent"}
                                </span>
                              )}
                            </div>
                            {page.schemaTypes.length > 0 && (
                              <div className="flex flex-wrap gap-1 mb-2">
                                {page.schemaTypes.map((t) => (
                                  <span key={t} className="text-xs bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 px-1.5 py-0.5 rounded font-mono">
                                    {t}
                                  </span>
                                ))}
                              </div>
                            )}
                            {page.altIssues.length > 0 && (
                              <div className="mt-2">
                                <p className="text-xs font-semibold text-orange-700 dark:text-orange-400 mb-1">
                                  Проблеми з alt у контентній зоні:
                                </p>
                                <div className="space-y-1.5">
                                  {page.altIssues.map((issue, i) => (
                                    <div key={i} className="rounded bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 p-2">
                                      <div className="flex items-center gap-2 mb-0.5">
                                        <span className={`px-1 py-0.5 rounded font-medium text-xs ${
                                          issue.issue === "missing"
                                            ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                            : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                                        }`}>
                                          {issue.issue === "missing" ? "Відсутній alt" : issue.issue === "generic" ? "Неінформативний" : issue.issue}
                                        </span>
                                        {issue.currentAlt && (
                                          <span className="text-gray-500 italic">"{issue.currentAlt}"</span>
                                        )}
                                      </div>
                                      <p className="text-gray-500 dark:text-gray-400 truncate font-mono text-xs">{issue.src}</p>
                                      <p className="text-blue-600 dark:text-blue-400 mt-0.5">💡 {issue.suggestion}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {page.issues.length > 0 && (
                              <div className="mt-2 space-y-1">
                                {page.issues.map((iss, i) => (
                                  <p key={i} className="text-orange-600 dark:text-orange-400">⚠ {iss}</p>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ═══ SECTION: PERFORMANCE & SOCIAL ═══ */}
            {result && <SectionDivider label="Продуктивність і соціальні мережі" />}

            {/* PageSpeed — mobile + desktop */}
            {result?.pageSpeed && (
              <CheckRow title="PageSpeed Insights" status={result.pageSpeed.status} note={result.pageSpeed.note}
                verifyLinks={[{ label: "PageSpeed", url: ext.pagespeed }, { label: "Mobile Test", url: ext.mobileFriend }]}
              >
                {/* Блок із двома скорами поруч */}
                <div className="flex flex-wrap gap-6 mt-1">
                  {/* Mobile score */}
                  {result.pageSpeed.performanceScore !== null && (
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-xs text-gray-400">📱 Mobile</span>
                      <span className={`text-3xl font-bold leading-none ${
                        result.pageSpeed.performanceScore >= 90 ? "text-green-600" :
                        result.pageSpeed.performanceScore >= 50 ? "text-yellow-600" : "text-red-600"
                      }`}>
                        {result.pageSpeed.performanceScore}
                      </span>
                      <span className="text-xs text-gray-400">/100</span>
                    </div>
                  )}
                  {/* Desktop score */}
                  {result.pageSpeed.desktopScore !== null && (
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-xs text-gray-400">🖥️ Desktop</span>
                      <span className={`text-3xl font-bold leading-none ${
                        result.pageSpeed.desktopScore >= 90 ? "text-green-600" :
                        result.pageSpeed.desktopScore >= 50 ? "text-yellow-600" : "text-red-600"
                      }`}>
                        {result.pageSpeed.desktopScore}
                      </span>
                      <span className="text-xs text-gray-400">/100</span>
                    </div>
                  )}
                  {/* Core Web Vitals (mobile) */}
                  <div className="flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400 self-end">
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
                </div>
              </CheckRow>
            )}

            {/* Оптимізація зображень */}
            {result?.imageOpt && (
              <CheckRow title="Оптимізація зображень" status={result.imageOpt.status} note={result.imageOpt.note}
                verifyLinks={[{ label: "PageSpeed", url: ext.pagespeed }]}
              >
                {result.imageOpt.totalImgs > 0 && (
                  <div className="grid grid-cols-4 gap-2 mt-1">
                    <StatPill label="Зображень" value={result.imageOpt.totalImgs} />
                    <StatPill label="Lazy load" value={`${Math.round(result.imageOpt.lazyLoadRatio * 100)}%`} warn={result.imageOpt.lazyLoadRatio < 0.5 && result.imageOpt.totalImgs >= 3} />
                    <StatPill label="WebP/AVIF" value={result.imageOpt.hasModernFormat ? "✓" : "✗"} warn={!result.imageOpt.hasModernFormat} />
                    <StatPill label="Oversized" value={result.imageOpt.oversizedImgs} warn={result.imageOpt.oversizedImgs > 0} />
                  </div>
                )}
              </CheckRow>
            )}

            {/* Open Graph */}
            {result?.openGraph && (
              <CheckRow title="Open Graph / Social Meta" status={result.openGraph.status} note={result.openGraph.note}
                verifyLinks={[{ label: "OG Preview", url: ext.ogDebug }]}
              >
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
              <CheckRow title="Структуровані дані (Schema.org)" status={result.structuredData.status} note={result.structuredData.note}
                verifyLinks={[{ label: "Rich Results", url: ext.richResults }, { label: "Schema.org", url: ext.schemaOrg }]}
              >
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
              <CheckRow title="Системи аналітики та реклами" status={result.analytics.status} note={result.analytics.note}
                verifyLinks={[{ label: "Tag Assistant", url: `https://tagassistant.google.com/#/?source=TAG_MANAGER&url=${domainEncoded}` }]}
              >
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

            {/* Cookie Consent / GDPR */}
            {result?.cookieConsent && (
              <CheckRow title="Cookie Consent / GDPR" status={result.cookieConsent.status} note={result.cookieConsent.note}
                verifyLinks={[{ label: "CookieMetrix", url: `https://www.cookiemetrix.com/?url=${domainEncoded}` }]}
              >
                {result.cookieConsent.provider && (
                  <span className="text-xs font-mono bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 px-2 py-0.5 rounded mt-1 inline-block">
                    {result.cookieConsent.provider}
                  </span>
                )}
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
            <span>✦ HTTP/2 / HTTP/3 підтримка</span>
            <span>✦ robots.txt + аналіз Disallow правил</span>
            <span>✦ Sitemap.xml (URL-кількість, статуси)</span>
            <span>✦ RSS / Atom фід</span>
            <span>✦ Hreflang (мовні версії, x-default)</span>
            <span>✦ Self-canonical, PWA manifest, mixed-content</span>
            <span>✦ Внутрішня перелінковка (homepage)</span>
            <span>✦ Оптимізація зображень (lazy load, WebP/AVIF)</span>
            <span>✦ Open Graph / Twitter Card</span>
            <span>✦ Schema.org мікророзмітка</span>
            <span>✦ GA4 / GTM / Google Ads / MS Clarity</span>
            <span>✦ Cookie Consent / GDPR банер</span>
            <span>✦ Кількість скриптів на сторінці</span>
            <span>✦ PageSpeed / CWV (опційно)</span>
            <span>✦ Кастомна 404-сторінка (branded vs soft-404)</span>
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
                <span>✦ [SF] Внутрішня перелінковка (orphan, inlinks)</span>
                <span>✦ [SF] Ланцюжки редиректів (2+ хопи)</span>
                <span>✦ [SF] Відповідність Title ↔ H1</span>
                <span>✦ [SF] Пагінація (rel=next / rel=prev)</span>
                <span>✦ [SF] Alt-теги зображень (missing/generic)</span>
                <span>✦ Вибірка по 2 сторінки кожного типу</span>
                <span>✦ Alt в контентній зоні (main/article)</span>
                <span>✦ Schema.org на реальних сторінках</span>
                <span>✦ Кількість слів і внутрішніх посилань</span>
                <span>✦ Lazy loading ratio (loading="lazy")</span>
                <span>✦ WebP / AVIF формати зображень</span>
                <span>✦ Cookie consent / GDPR банер</span>
              </>
            )}
          </div>
          {!sfResult && (
            <p className="mt-2 text-blue-500 dark:text-blue-400">
              💡 Завантажте CSV зі Screaming Frog для розширеного аналізу ще +17 параметрів
            </p>
          )}
        </div>
      )}
    </div>
  );
}
