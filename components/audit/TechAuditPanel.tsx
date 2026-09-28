"use client";

import { useState } from "react";
import type { TechAuditResult, TechCheckStatus } from "@/types";

interface Props {
  domain: string;
  psiApiKey?: string;
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

function CheckRow({ title, status, note }: { title: string; status: TechCheckStatus; note: string }) {
  return (
    <div className="flex flex-col gap-1 py-3 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{title}</span>
        <StatusBadge status={status} />
      </div>
      {note && <p className="text-xs text-gray-500 dark:text-gray-400">{note}</p>}
    </div>
  );
}

export default function TechAuditPanel({ domain, psiApiKey }: Props) {
  const [result, setResult] = useState<TechAuditResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runPsi, setRunPsi] = useState(false);

  async function runAudit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tech-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, psiApiKey, runPageSpeed: runPsi }),
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
      <div className="flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={runPsi}
            onChange={(e) => setRunPsi(e.target.checked)}
            className="rounded"
          />
          Запустити PageSpeed Insights (повільніше)
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
        </div>
      )}

      {result && !loading && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="bg-gray-50 dark:bg-gray-800/50 px-4 py-2 text-xs text-gray-500 dark:text-gray-400">
            Перевірено: {result.domain} · {new Date(result.checkedAt).toLocaleString("uk-UA")}
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            <div className="px-4">
              <CheckRow
                title="Основне дзеркало (www / non-www)"
                status={result.mirror.status}
                note={result.mirror.note}
              />
            </div>
            <div className="px-4">
              <CheckRow
                title="HTTPS / HTTP редирект"
                status={result.https.status}
                note={result.https.note}
              />
            </div>
            <div className="px-4">
              <CheckRow
                title="robots.txt"
                status={result.robotsTxt.status}
                note={result.robotsTxt.note}
              />
              {result.robotsTxt.exists && result.robotsTxt.disallowedPaths.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs text-gray-400 mb-1">Заблоковані шляхи:</p>
                  <div className="flex flex-wrap gap-1">
                    {result.robotsTxt.disallowedPaths.slice(0, 10).map((p) => (
                      <code key={p} className="text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-300">
                        {p}
                      </code>
                    ))}
                    {result.robotsTxt.disallowedPaths.length > 10 && (
                      <span className="text-xs text-gray-400">+{result.robotsTxt.disallowedPaths.length - 10} ще</span>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="px-4">
              <CheckRow
                title="Sitemap.xml"
                status={result.sitemap.status}
                note={result.sitemap.note}
              />
            </div>
            {result.pageSpeed && (
              <div className="px-4">
                <CheckRow
                  title="PageSpeed (мобільний)"
                  status={result.pageSpeed.status}
                  note={result.pageSpeed.note}
                />
                {result.pageSpeed.performanceScore !== null && (
                  <div className="flex flex-wrap gap-4 mb-3 text-xs text-gray-500 dark:text-gray-400">
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
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
