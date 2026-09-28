"use client";

import { useState } from "react";
import type { Finding, PageType, AIProvider } from "@/types";

interface PageTypeAnalysis {
  pageType: string;
  pageCount: number;
  issueCount: number;
  priority: "critical" | "high" | "medium" | "low";
  summary: string;
  recommendations: string[];
}

interface AiResult {
  overallSummary: string;
  pageTypeAnalyses: PageTypeAnalysis[];
}

interface Props {
  findings: Finding[];
  sfStats: {
    totalUrls: number;
    detectedPageTypes: Record<PageType, number>;
    indexableCount: number;
    nonIndexableCount: number;
  };
  domain: string;
  provider: AIProvider;
  apiKey: string;
  model: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  low: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
};

const PRIORITY_LABELS: Record<string, string> = {
  critical: "Критично",
  high: "Важливо",
  medium: "Середнє",
  low: "Низьке",
};

export default function AiAnalysisPanel({ findings, sfStats, domain, provider, apiKey, model }: Props) {
  const [result, setResult] = useState<AiResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  async function runAnalysis() {
    if (!apiKey || !provider) {
      setError("Не налаштовано AI провайдер. Перейдіть в налаштування.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Slim down payload — strip large affectedUrls arrays before sending
      const slimFindings = findings.slice(0, 60).map((f) => ({
        ruleId: f.ruleId,
        ruleTitle: f.ruleTitle,
        severity: f.severity,
        affectedCount: f.affectedCount ?? (f.affectedUrls?.length ?? 1),
        pageType: f.pageType,
        recommendation: f.recommendation,
      }));

      const res = await fetch("/api/ai/analyze-by-type", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ findings: slimFindings, sfStats, domain, provider, apiKey, model }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.detail || d.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setResult(data.result as AiResult);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function toggleExpand(pt: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(pt)) next.delete(pt);
      else next.add(pt);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={runAnalysis}
          disabled={loading || findings.length === 0}
          className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "AI аналіз…" : "Запустити AI аналіз"}
        </button>
        {findings.length === 0 && (
          <span className="text-xs text-gray-400">Спочатку запустіть аудит</span>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {loading && (
        <div className="p-6 flex flex-col items-center gap-3 text-gray-500 dark:text-gray-400">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm">AI аналізує знайдені проблеми по типах сторінок…</p>
        </div>
      )}

      {result && !loading && (
        <div className="space-y-4">
          {/* Overall summary */}
          <div className="p-4 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-xl">
            <h3 className="text-sm font-semibold text-violet-800 dark:text-violet-300 mb-2">Загальний висновок</h3>
            <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">{result.overallSummary}</p>
          </div>

          {/* Per-page-type analyses */}
          <div className="space-y-2">
            {result.pageTypeAnalyses.map((analysis) => {
              const isOpen = expanded.has(analysis.pageType);
              return (
                <div
                  key={analysis.pageType}
                  className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden"
                >
                  <button
                    onClick={() => toggleExpand(analysis.pageType)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 ${PRIORITY_COLORS[analysis.priority] || PRIORITY_COLORS.low}`}
                      >
                        {PRIORITY_LABELS[analysis.priority] || analysis.priority}
                      </span>
                      <span className="font-medium text-sm text-gray-800 dark:text-gray-100 truncate">
                        {analysis.pageType}
                      </span>
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        {analysis.pageCount} стор. · {analysis.issueCount} проблем
                      </span>
                    </div>
                    <svg
                      className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-800">
                      <p className="text-sm text-gray-600 dark:text-gray-300 mt-3 mb-3 leading-relaxed">
                        {analysis.summary}
                      </p>
                      {analysis.recommendations.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                            Рекомендації
                          </h4>
                          <ul className="space-y-1.5">
                            {analysis.recommendations.map((rec, i) => (
                              <li key={i} className="flex gap-2 text-sm text-gray-700 dark:text-gray-200">
                                <span className="text-violet-500 flex-shrink-0 font-bold">{i + 1}.</span>
                                <span>{rec}</span>
                              </li>
                            ))}
                          </ul>
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
    </div>
  );
}
