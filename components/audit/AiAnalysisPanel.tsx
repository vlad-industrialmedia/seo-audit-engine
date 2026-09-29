"use client";

import { useState, useMemo } from "react";
import type { Finding, PageType, AIProvider, AiAuditAnalysis, AIProviderConfig } from "@/types";

interface Props {
  findings: Finding[];
  sfStats: {
    totalUrls: number;
    detectedPageTypes: Record<PageType, number>;
    indexableCount: number;
    nonIndexableCount: number;
  };
  domain: string;
  // Дефолтний провайдер з налаштувань
  provider: AIProvider;
  apiKey: string;
  model: string;
  // Усі налаштовані провайдери — для селектора вибору в панелі
  allProviders?: Record<AIProvider, Partial<AIProviderConfig>>;
  // Кешування результату між перезавантаженнями проєкту
  initialResult?: AiAuditAnalysis | null;
  onResult?: (result: AiAuditAnalysis) => void;
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

// Відображувані назви провайдерів
const PROVIDER_LABELS: Record<AIProvider, string> = {
  anthropic: "Anthropic",
  openrouter: "OpenRouter",
  gemini: "Gemini",
  grok: "Grok",
  groq: "Groq",
  cerebras: "Cerebras",
};

export default function AiAnalysisPanel({
  findings,
  sfStats,
  domain,
  provider,
  apiKey,
  model,
  allProviders,
  initialResult,
  onResult,
}: Props) {
  // Ініціалізуємо результат з кешу, якщо він є
  const [result, setResult] = useState<AiAuditAnalysis | null>(initialResult ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Вибраний провайдер та модель (можна змінити прямо в панелі)
  const [selectedProvider, setSelectedProvider] = useState<AIProvider>(provider);
  const [selectedModel, setSelectedModel] = useState<string>(model);

  // Список провайдерів з API-ключем (валідованих або хоча б налаштованих)
  const availableProviders = useMemo(() => {
    if (!allProviders) {
      // Якщо allProviders не передано, показуємо лише поточний провайдер
      return apiKey ? [{ id: provider, label: PROVIDER_LABELS[provider], models: [] as string[], defaultModel: model }] : [];
    }
    return (Object.keys(allProviders) as AIProvider[])
      .filter((p) => allProviders[p]?.apiKey)
      .map((p) => {
        const cfg = allProviders[p];
        const models = cfg?.models?.map((m) => m.id) ?? [];
        return {
          id: p,
          label: `${PROVIDER_LABELS[p]}${cfg?.validated ? " ✓" : ""}`,
          models,
          defaultModel: cfg?.model ?? "",
        };
      });
  }, [allProviders, provider, apiKey, model]);

  // Отримуємо API-ключ для вибраного провайдера
  const selectedApiKey = useMemo(() => {
    if (!allProviders) return apiKey;
    return allProviders[selectedProvider]?.apiKey ?? "";
  }, [allProviders, selectedProvider, apiKey]);

  // При зміні провайдера — оновлюємо модель на дефолтну для нового провайдера
  function handleProviderChange(newProvider: AIProvider) {
    setSelectedProvider(newProvider);
    const defaultMdl = allProviders?.[newProvider]?.model ?? "";
    setSelectedModel(defaultMdl);
  }

  async function runAnalysis() {
    if (!selectedApiKey || !selectedProvider) {
      setError("Не налаштовано AI провайдер. Перейдіть в налаштування.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Зменшуємо payload — прибираємо великі масиви affectedUrls перед відправкою
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
        body: JSON.stringify({
          findings: slimFindings,
          sfStats,
          domain,
          provider: selectedProvider,
          apiKey: selectedApiKey,
          model: selectedModel,
        }),
      });

      // Захисний парсинг: завжди читаємо текст спочатку, потім парсимо JSON
      const rawText = await res.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        // Сервер повернув не-JSON (наприклад, HTML-сторінку помилки)
        throw new Error(`Сервер повернув неочікувану відповідь: ${rawText.slice(0, 200)}`);
      }

      const body = parsed as Record<string, unknown>;

      if (!res.ok) {
        const detail = (body.detail as string) || (body.error as string) || `HTTP ${res.status}`;
        throw new Error(detail);
      }

      const aiResult = body.result as AiAuditAnalysis;
      // Зберігаємо метадані про провайдер/модель
      aiResult.provider = selectedProvider;
      aiResult.model = selectedModel;
      setResult(aiResult);

      // Зберігаємо в кеш проєкту
      onResult?.(aiResult);
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

  const hasNoFindings = findings.length === 0 && !result;
  const hasNoProvider = availableProviders.length === 0;

  return (
    <div className="space-y-4">
      {/* Рядок керування: вибір провайдера + моделі + кнопка запуску */}
      <div className="flex flex-wrap items-center gap-2">

        {/* Вибір провайдера */}
        {availableProviders.length > 1 && (
          <select
            value={selectedProvider}
            onChange={(e) => handleProviderChange(e.target.value as AIProvider)}
            disabled={loading}
            className="h-9 px-2 py-1 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50"
            title="Провайдер AI"
          >
            {availableProviders.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        )}

        {/* Вибір / введення моделі */}
        {availableProviders.length > 0 && (
          <div className="relative">
            {/* Показуємо список моделей якщо вони є, або текстове поле */}
            {(allProviders?.[selectedProvider]?.models?.length ?? 0) > 0 ? (
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                disabled={loading}
                className="h-9 px-2 py-1 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50 max-w-[220px]"
                title="Модель"
              >
                {allProviders![selectedProvider]!.models!.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            ) : selectedModel ? (
              <input
                type="text"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                disabled={loading}
                placeholder="ID моделі"
                className="h-9 px-2 py-1 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50 max-w-[220px] font-mono"
                title="Модель"
              />
            ) : null}
          </div>
        )}

        <button
          onClick={runAnalysis}
          disabled={loading || findings.length === 0 || hasNoProvider}
          className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "AI аналіз…" : result ? "Оновити AI аналіз" : "Запустити AI аналіз"}
        </button>

        {hasNoFindings && (
          <span className="text-xs text-gray-400">Спочатку запустіть аудит Screaming Frog</span>
        )}
        {hasNoProvider && !hasNoFindings && (
          <span className="text-xs text-amber-500">Налаштуйте AI провайдер у Налаштуваннях</span>
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
          {/* Загальний висновок */}
          <div className="p-4 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-violet-800 dark:text-violet-300">Загальний висновок</h3>
              {result.provider && (
                <span className="text-xs text-violet-500 dark:text-violet-400 opacity-70">
                  {PROVIDER_LABELS[result.provider] ?? result.provider} / {result.model}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">{result.overallSummary}</p>
          </div>

          {/* Аналіз по типах сторінок */}
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
