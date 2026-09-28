"use client";

import { useState } from "react";
import { Settings, Brain, Database, RefreshCw, Trash2, AlertTriangle } from "lucide-react";
import { useProjectStore } from "@/lib/store/project-store";
import { ApiKeyCard } from "@/components/settings/ApiKeyCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import type { AIProvider } from "@/types";

const AI_PROVIDERS: { id: AIProvider; order: number }[] = [
  { id: "gemini", order: 1 },
  { id: "openrouter", order: 2 },
  { id: "anthropic", order: 3 },
  { id: "grok", order: 4 },
  { id: "groq", order: 5 },      // безкоштовний tier, LPU-inference
  { id: "cerebras", order: 6 },  // безкоштовний tier, надшвидкий CS-3
];

export default function SettingsPage() {
  const { projects, settings } = useProjectStore();
  const [confirmClear, setConfirmClear] = useState(false);

  const validatedCount = Object.values(settings.aiProviders).filter((p) => p.validated).length;
  const configuredCount = Object.values(settings.aiProviders).filter((p) => p.apiKey).length;

  const totalAudits = projects.reduce((s, p) => s + p.audits.length, 0);
  const totalFindings = projects.reduce(
    (s, p) => s + p.audits.reduce((ss, a) => ss + a.findings.length, 0),
    0
  );

  const handleClearAllData = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 5000);
      return;
    }
    // Clear localStorage
    if (typeof window !== "undefined") {
      localStorage.removeItem("seo-audit-projects");
      toast.success("Всі дані видалено. Перезавантаження...");
      setTimeout(() => window.location.reload(), 1500);
    }
  };

  return (
    <div className="p-6 max-w-4xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="h-6 w-6" />
          Налаштування
        </h1>
        <p className="text-muted-foreground mt-1">
          Управління API ключами та параметрами застосунку
        </p>
      </div>

      {/* AI Provider Status Overview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-4 w-4" />
            Статус AI провайдерів
          </CardTitle>
          <CardDescription>
            {validatedCount > 0
              ? `${validatedCount} з ${AI_PROVIDERS.length} провайдерів валідовані`
              : "Додайте API ключі для увімкнення AI-аналізу аудитів"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {AI_PROVIDERS.map(({ id }) => {
              const providerSettings = settings.aiProviders[id];
              const isConfigured = !!providerSettings.apiKey;
              const isValidated = providerSettings.validated;

              const labels: Record<AIProvider, string> = {
                gemini: "Gemini",
                openrouter: "OpenRouter",
                anthropic: "Anthropic",
                grok: "Grok",
                groq: "Groq",
                cerebras: "Cerebras",
              };

              const icons: Record<AIProvider, string> = {
                gemini: "✨",
                openrouter: "🔀",
                anthropic: "🤖",
                grok: "⚡",
                groq: "🚀",
                cerebras: "🧠",
              };

              return (
                <div
                  key={id}
                  className={`rounded-lg border p-3 text-center text-sm transition-colors ${
                    isValidated
                      ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30"
                      : isConfigured
                      ? "border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950/30"
                      : "border-dashed"
                  }`}
                >
                  <div className="text-xl mb-1">{icons[id]}</div>
                  <p className="font-medium text-xs">{labels[id]}</p>
                  <p className={`text-[10px] mt-0.5 ${
                    isValidated
                      ? "text-green-600 dark:text-green-400"
                      : isConfigured
                      ? "text-yellow-600 dark:text-yellow-400"
                      : "text-muted-foreground"
                  }`}>
                    {isValidated ? "✓ Валідний" : isConfigured ? "Не перевірено" : "Не налаштовано"}
                  </p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* AI Provider API Keys */}
      <section>
        <h2 className="text-lg font-semibold mb-1">API Ключі</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Додайте API ключі для AI провайдерів. Ключі зберігаються локально у вашому браузері.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          {AI_PROVIDERS.map(({ id }) => (
            <ApiKeyCard key={id} provider={id} />
          ))}
        </div>
      </section>

      <Separator />

      {/* Data & Storage */}
      <section>
        <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
          <Database className="h-4 w-4" />
          Дані та сховище
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Всі дані зберігаються локально у браузері за допомогою localStorage.
        </p>

        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <StatItem label="Проєктів" value={projects.length} />
              <StatItem label="Аудитів" value={totalAudits} />
              <StatItem label="Знайдених проблем" value={totalFindings} />
              <StatItem label="AI провайдерів" value={`${configuredCount}/${AI_PROVIDERS.length}`} />
            </div>

            <Separator className="my-4" />

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Очистити всі дані</p>
                <p className="text-xs text-muted-foreground">
                  Видалить всі проєкти, аудити та API ключі
                </p>
              </div>
              <Button
                variant={confirmClear ? "destructive" : "outline"}
                onClick={handleClearAllData}
                className="flex-shrink-0"
              >
                {confirmClear ? (
                  <>
                    <AlertTriangle className="h-4 w-4 mr-2" />
                    Натисніть ще раз для підтвердження
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Очистити всі дані
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      <Separator />

      {/* About */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Про застосунок</h2>
        <Card>
          <CardContent className="p-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Версія</span>
              <span className="font-mono">1.0.0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Технологія</span>
              <span>Next.js 14 + TypeScript</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Сховище</span>
              <span>LocalStorage (браузер)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">SEO правил</span>
              <span>21 детермінованих правил</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Підтримувані AI</span>
              <span>Gemini, OpenRouter, Anthropic, Grok</span>
            </div>

            <Separator />

            <p className="text-xs text-muted-foreground leading-relaxed">
              SEO Audit Engine аналізує дані зі Screaming Frog для виявлення SEO проблем.
              Підтримує імпорт CSV та Excel файлів, AI-аналіз знайдених проблем,
              та експорт результатів у Markdown, CSV і JSON форматах.
            </p>

            <div className="flex gap-2 pt-1">
              <a
                href="https://github.com/searchfit-seo/seo-audit-engine"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline"
              >
                GitHub репозиторій →
              </a>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}
