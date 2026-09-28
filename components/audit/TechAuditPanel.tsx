"use client";

import { useState } from "react";
import type { TechAuditResult, TechCheckStatus, SFImportResult } from "@/types";

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

export default function TechAuditPanel({ domain, psiApiKey, sfResult }: Props) {
  const [result, setResult] = useState<TechAuditResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runPsi, setRunPsi] = useState(false);

  async function runAudit() {
    setLoading(true);
    setError(null);
    try {
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
            Дані SF завантажено · {sfResult.rows.length.toLocaleString("uk")} URL для порівняння
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
          {sfResult && <p className="text-xs">Аналіз robots.txt відносно {Math.min(sfResult.rows.length, 2000).toLocaleString("uk")} URL з SF…</p>}
        </div>
      )}

      {result && !loading && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="bg-gray-50 dark:bg-gray-800/50 px-4 py-2 text-xs text-gray-500 dark:text-gray-400">
            Перевірено: {result.domain} · {new Date(result.checkedAt).toLocaleString("uk-UA")}
          </div>
          <div className="px-4 divide-y divide-gray-100 dark:divide-gray-800">

            {/* Mirror */}
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

            {/* HTTPS */}
            <CheckRow title="HTTPS / HTTP редирект" status={result.https.status} note={result.https.note} />

            {/* robots.txt */}
            <CheckRow title="robots.txt" status={result.robotsTxt.status} note={result.robotsTxt.note}>
              {result.robotsTxt.sitemapUrls.length > 0 && (
                <p className="text-xs text-gray-400 mb-2">
                  Sitemap у robots.txt: {result.robotsTxt.sitemapUrls.map((u) => (
                    <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-500 mr-2">{u}</a>
                  ))}
                </p>
              )}
              {/* Path analysis */}
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

            {/* Sitemap */}
            <CheckRow title="Sitemap.xml" status={result.sitemap.status} note={result.sitemap.note}>
              {/* SF comparison bar */}
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
              {/* Status issues */}
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

            {/* PageSpeed */}
            {result.pageSpeed && (
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
          </div>
        </div>
      )}
    </div>
  );
}
