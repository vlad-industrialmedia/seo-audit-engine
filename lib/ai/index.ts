import type { AIProvider, AIProviderConfig, AIModel, Finding, PagePassport } from "@/types";

// ─── Provider configs ─────────────────────────────────────────────────────────
export const AI_PROVIDER_CONFIGS: Record<AIProvider, Omit<AIProviderConfig, "apiKey" | "validated" | "validatedAt">> = {
  anthropic: {
    provider: "anthropic",
    label: "Anthropic (Claude)",
    description: "Claude — найкращий для аналізу складної логіки та розуміння коду",
    models: [
      { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", contextWindow: 200000, costPer1KInput: 0.0008, costPer1KOutput: 0.004 },
      { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", contextWindow: 200000, costPer1KInput: 0.003, costPer1KOutput: 0.015, recommended: true },
      { id: "claude-sonnet-5", name: "Claude Sonnet 5", contextWindow: 200000, costPer1KInput: 0.003, costPer1KOutput: 0.015 },
      { id: "claude-opus-5-5", name: "Claude Opus 5.5", contextWindow: 200000, costPer1KInput: 0.015, costPer1KOutput: 0.075 },
    ],
  },
  openrouter: {
    provider: "openrouter",
    label: "OpenRouter",
    description: "Єдиний API для 100+ моделей (Claude, Gemini, Llama, Mistral та інших)",
    models: [
      { id: "anthropic/claude-sonnet-4-6", name: "Claude Sonnet 4.6 (via OR)", contextWindow: 200000, costPer1KInput: 0.003, costPer1KOutput: 0.015, recommended: true },
      { id: "google/gemini-flash-1.5", name: "Gemini 1.5 Flash", contextWindow: 1000000, costPer1KInput: 0.000075, costPer1KOutput: 0.0003 },
      { id: "google/gemini-pro-1.5", name: "Gemini 1.5 Pro", contextWindow: 2000000, costPer1KInput: 0.00125, costPer1KOutput: 0.005 },
      { id: "meta-llama/llama-3.1-8b-instruct:free", name: "Llama 3.1 8B (Free)", contextWindow: 131072, costPer1KInput: 0, costPer1KOutput: 0 },
      { id: "x-ai/grok-beta", name: "Grok Beta", contextWindow: 131072, costPer1KInput: 0.005, costPer1KOutput: 0.015 },
    ],
  },
  gemini: {
    provider: "gemini",
    label: "Google Gemini",
    description: "Gemini — ідеальний для великих SF-файлів (до 2M токенів контексту)",
    models: [
      // gemini-2.0-flash — стабільний GA-релізод (замінив -exp який видалено Google)
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", contextWindow: 1048576, costPer1KInput: 0, costPer1KOutput: 0, recommended: true },
      { id: "gemini-2.0-flash-lite", name: "Gemini 2.0 Flash Lite", contextWindow: 1048576, costPer1KInput: 0, costPer1KOutput: 0 },
      { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash", contextWindow: 1000000, costPer1KInput: 0.000075, costPer1KOutput: 0.0003 },
      { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", contextWindow: 2000000, costPer1KInput: 0.00125, costPer1KOutput: 0.005 },
    ],
  },
  grok: {
    provider: "grok",
    label: "xAI Grok",
    description: "Grok — модель від xAI з доступом до актуальних даних",
    models: [
      { id: "grok-beta", name: "Grok Beta", contextWindow: 131072, costPer1KInput: 0.005, costPer1KOutput: 0.015, recommended: true },
      { id: "grok-vision-beta", name: "Grok Vision Beta", contextWindow: 8192, costPer1KInput: 0.005, costPer1KOutput: 0.015 },
    ],
  },
  groq: {
    provider: "groq",
    label: "Groq (LPU)",
    description: "Groq — надшвидкий inference на LPU-чипах, безкоштовний tier з щедрими лімітами",
    models: [
      { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B", contextWindow: 128000, costPer1KInput: 0.00059, costPer1KOutput: 0.00079, recommended: true },
      { id: "llama3-8b-8192", name: "Llama 3 8B", contextWindow: 8192, costPer1KInput: 0.00005, costPer1KOutput: 0.00008 },
      { id: "mixtral-8x7b-32768", name: "Mixtral 8x7B", contextWindow: 32768, costPer1KInput: 0.00024, costPer1KOutput: 0.00024 },
      { id: "gemma2-9b-it", name: "Gemma 2 9B", contextWindow: 8192, costPer1KInput: 0.0002, costPer1KOutput: 0.0002 },
    ],
  },
  cerebras: {
    provider: "cerebras",
    label: "Cerebras",
    description: "Cerebras — рекордно швидкий inference на CS-3 чипах, безкоштовний tier",
    models: [
      { id: "llama3.1-8b", name: "Llama 3.1 8B", contextWindow: 8192, costPer1KInput: 0, costPer1KOutput: 0, recommended: true },
      { id: "llama3.1-70b", name: "Llama 3.1 70B", contextWindow: 8192, costPer1KInput: 0, costPer1KOutput: 0 },
    ],
  },
};

// ─── Validate API key ─────────────────────────────────────────────────────────
export async function validateApiKey(
  provider: AIProvider,
  apiKey: string,
  model?: string
): Promise<{ valid: boolean; error?: string; modelsAvailable?: string[] }> {
  try {
    switch (provider) {
      case "anthropic":
        return await validateAnthropic(apiKey, model || "claude-haiku-4-5-20251001");
      case "openrouter":
        return await validateOpenRouter(apiKey);
      case "gemini":
        return await validateGemini(apiKey, model || "gemini-1.5-flash");
      case "grok":
        return await validateGrok(apiKey);
      case "groq":
        return await validateGeneric(apiKey, "groq", model || "llama-3.3-70b-versatile");
      case "cerebras":
        return await validateGeneric(apiKey, "cerebras", model || "llama3.1-8b");
      default:
        return { valid: false, error: "Unknown provider" };
    }
  } catch (err) {
    return { valid: false, error: (err as Error).message };
  }
}

async function validateAnthropic(apiKey: string, model: string): Promise<{ valid: boolean; error?: string }> {
  const res = await fetch("/api/ai/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider: "anthropic", apiKey, model }),
  });
  const data = await res.json();
  return data;
}

async function validateOpenRouter(apiKey: string): Promise<{ valid: boolean; error?: string; modelsAvailable?: string[] }> {
  const res = await fetch("/api/ai/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider: "openrouter", apiKey }),
  });
  const data = await res.json();
  return data;
}

async function validateGemini(apiKey: string, model: string): Promise<{ valid: boolean; error?: string }> {
  const res = await fetch("/api/ai/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider: "gemini", apiKey, model }),
  });
  const data = await res.json();
  return data;
}

async function validateGrok(apiKey: string): Promise<{ valid: boolean; error?: string }> {
  const res = await fetch("/api/ai/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider: "grok", apiKey }),
  });
  const data = await res.json();
  return data;
}

// Загальна валідація для провайдерів Groq та Cerebras через уніфікований роут
async function validateGeneric(apiKey: string, provider: AIProvider, model: string): Promise<{ valid: boolean; error?: string }> {
  const res = await fetch("/api/ai/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, apiKey, model }),
  });
  const data = await res.json();
  return data;
}

// ─── AI Analysis ──────────────────────────────────────────────────────────────
export interface AIAnalysisInput {
  page: Partial<PagePassport>;
  findings: Finding[];
  analysisType: "heading" | "meta" | "content" | "technical" | "full";
}

export interface AIAnalysisResult {
  summary: string;
  prioritizedFindings: Array<{
    ruleId: string;
    priority: number;
    explanation: string;
    businessImpact: string;
    developerNote?: string;
  }>;
  overallScore: number;
  quickWins: string[];
}

export async function analyzeWithAI(
  input: AIAnalysisInput,
  provider: AIProvider,
  apiKey: string,
  model: string
): Promise<AIAnalysisResult | null> {
  const prompt = buildAnalysisPrompt(input);

  try {
    const res = await fetch("/api/ai/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, provider, apiKey, model }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data.result;
  } catch {
    return null;
  }
}

// ─── Карусель провайдерів — автоматичний fallback при перевищенні лімітів ─────
export interface CarouselProvider {
  provider: AIProvider;
  apiKey: string;
  model: string;
}

// Перевірка чи помилка пов'язана з лімітом запитів (429 або rate limit у тексті)
function isRateLimitError(statusCode: number, errorMessage?: string): boolean {
  if (statusCode === 429) return true;
  if (!errorMessage) return false;
  const lower = errorMessage.toLowerCase();
  return (
    lower.includes("rate limit") ||
    lower.includes("quota") ||
    lower.includes("exceeded") ||
    lower.includes("too many requests") ||
    lower.includes("tokens per") ||
    lower.includes("requests per")
  );
}

// Аналіз з автоматичним перемиканням на наступний провайдер при вичерпанні лімітів
export async function analyzeWithFallback(
  input: AIAnalysisInput,
  providers: CarouselProvider[]
): Promise<{ result: AIAnalysisResult | null; usedProvider: AIProvider | null; fallbackUsed: boolean }> {
  if (providers.length === 0) {
    return { result: null, usedProvider: null, fallbackUsed: false };
  }

  const prompt = buildAnalysisPrompt(input);
  let fallbackUsed = false;

  for (let i = 0; i < providers.length; i++) {
    const { provider, apiKey, model } = providers[i];

    try {
      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, provider, apiKey, model }),
      });

      // Якщо вичерпано ліміт — переходимо до наступного провайдера
      if (res.status === 429) {
        console.warn(`[AI Carousel] Провайдер ${provider} — ліміт вичерпано, переключаємось...`);
        fallbackUsed = i > 0 || true;
        continue;
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const errMsg: string = errData?.error || "";
        // Якщо rate limit у тексті помилки — також переключаємось
        if (isRateLimitError(res.status, errMsg)) {
          console.warn(`[AI Carousel] Провайдер ${provider} — ліміт у відповіді, переключаємось...`);
          fallbackUsed = true;
          continue;
        }
        // Інші помилки — вважаємо фатальними для цього провайдера
        console.error(`[AI Carousel] Провайдер ${provider} помилка: ${res.status}`);
        continue;
      }

      const data = await res.json();
      return { result: data.result, usedProvider: provider, fallbackUsed: i > 0 };
    } catch (err) {
      // Мережева помилка — переходимо до наступного
      console.error(`[AI Carousel] Провайдер ${provider} мережева помилка:`, err);
      fallbackUsed = true;
      continue;
    }
  }

  // Всі провайдери вичерпані
  return { result: null, usedProvider: null, fallbackUsed };
}

function buildAnalysisPrompt(input: AIAnalysisInput): string {
  const { page, findings } = input;

  const findingsSummary = findings.map((f) => ({
    rule: f.ruleId,
    severity: f.severity,
    evidence: f.evidence,
  }));

  return `Ти — Senior SEO-спеціаліст. Проаналізуй знайдені проблеми на сторінці та надай структуровані рекомендації.

ДАНІ СТОРІНКИ:
URL: ${page.url}
Тип сторінки: ${page.pageType}
H1: ${JSON.stringify(page.headings?.semantic?.h1)}
Title: ${page.meta?.title}
Description: ${page.meta?.description}
HTTP Status: ${page.http?.statusCode}

ЗНАЙДЕНІ ПРОБЛЕМИ (${findings.length} шт.):
${JSON.stringify(findingsSummary, null, 2)}

ЗАВДАННЯ:
1. Поясни кожну проблему простою мовою (для SEO-спеціаліста)
2. Оціни бізнес-вплив кожної проблеми
3. Визнач 3 "швидких виправлення" з найбільшим ефектом
4. Дай загальний SEO-скор сторінки (0-100)

ВІДПОВІДЬ у JSON форматі:
{
  "summary": "Загальний опис стану сторінки",
  "prioritizedFindings": [
    {
      "ruleId": "rule.id",
      "priority": 1,
      "explanation": "Пояснення проблеми",
      "businessImpact": "Вплив на бізнес",
      "developerNote": "Технічна підказка розробнику"
    }
  ],
  "overallScore": 65,
  "quickWins": ["Виправлення 1", "Виправлення 2", "Виправлення 3"]
}`;
}
