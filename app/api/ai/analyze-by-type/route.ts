import { NextResponse } from "next/server";
import type { Finding, PageType, SFImportResult } from "@/types";

export const maxDuration = 60;

interface AnalyzeRequest {
  findings: Finding[];
  sfStats: {
    totalUrls: number;
    detectedPageTypes: Record<PageType, number>;
    indexableCount: number;
    nonIndexableCount: number;
  };
  domain: string;
  provider: string;
  apiKey: string;
  model: string;
}

function buildPrompt(req: AnalyzeRequest): string {
  const { findings, sfStats, domain } = req;

  // Group findings by severity
  const bySev = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) bySev[f.severity] = (bySev[f.severity] || 0) + 1;

  // Build page type stats
  const pageTypeLines = Object.entries(sfStats.detectedPageTypes)
    .filter(([, count]) => count > 0)
    .map(([type, count]) => `  - ${type}: ${count} сторінок`)
    .join("\n");

  // Top findings (critical + high first)
  const topFindings = [...findings]
    .sort((a, b) => {
      const ord: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
      return (ord[a.severity] ?? 9) - (ord[b.severity] ?? 9);
    })
    .slice(0, 30)
    .map((f) => `  [${f.severity.toUpperCase()}] ${f.ruleTitle} — ${f.affectedCount ?? 1} стор. (${f.pageType}): ${f.recommendation ?? ""}`)
    .join("\n");

  return `Ти — досвідчений SEO-спеціаліст із 10+ роками практики. Проведи детальний аналіз результатів SEO-аудиту сайту.

ДОМЕН: ${domain}
ЗАГАЛЬНА СТАТИСТИКА:
- Всього URL: ${sfStats.totalUrls}
- Індексовані: ${sfStats.indexableCount}
- Не індексовані: ${sfStats.nonIndexableCount}
- Типи сторінок:
${pageTypeLines}

ЗНАЙДЕНІ ПРОБЛЕМИ (${findings.length} всього):
- Critical: ${bySev.critical}
- High: ${bySev.high}
- Medium: ${bySev.medium}
- Low: ${bySev.low}

ТОП ПРОБЛЕМИ:
${topFindings}

Твоє завдання: надай структурований аналіз для КОЖНОГО типу сторінок, що має проблеми.

Відповідай ВИКЛЮЧНО у JSON-форматі (без markdown, без пояснень поза JSON):
{
  "overallSummary": "Загальний висновок по сайту (2-4 речення українською, конкретно і без лестощів)",
  "pageTypeAnalyses": [
    {
      "pageType": "назва типу",
      "pageCount": число,
      "issueCount": число,
      "priority": "critical|high|medium|low",
      "summary": "Опис ситуації для цього типу сторінок (1-2 речення)",
      "recommendations": [
        "Конкретна рекомендація 1",
        "Конкретна рекомендація 2",
        "..."
      ]
    }
  ]
}

Рекомендації мають бути:
- Конкретними (що саме зробити)
- Вимірюваними (якщо є — числові показники)
- Пріоритетними (від найважливішого)
- Мовою: УКРАЇНСЬКА
- Без загальних фраз типу "покращити контент" — тільки дії`;
}

async function callAI(prompt: string, provider: string, apiKey: string, model: string): Promise<string> {
  switch (provider) {
    case "anthropic": {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: model || "claude-sonnet-4-6",
          max_tokens: 4096,
          messages: [{ role: "user", content: prompt }],
          system: "Ти досвідчений SEO-спеціаліст. Відповідай лише валідним JSON. Мова: українська.",
        }),
      });
      if (!res.ok) throw new Error(`Anthropic error: ${res.status}`);
      const data = await res.json();
      return data.content?.[0]?.text || "";
    }

    case "openrouter": {
      const orModel = model || "anthropic/claude-sonnet-4-6";
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://seo-audit-engine.vercel.app",
          "X-Title": "SEO Audit Engine",
        },
        body: JSON.stringify({
          model: orModel,
          messages: [
            { role: "system", content: "Ти досвідчений SEO-спеціаліст. Відповідай лише валідним JSON." },
            { role: "user", content: prompt },
          ],
          // Обмежуємо токени до безпечного значення для безкоштовних акаунтів OpenRouter
          max_tokens: 2000,
        }),
      });
      if (!res.ok) {
        const errBody = await res.text();
        // Специфічна обробка помилки 402 — недостатньо кредитів
        if (res.status === 402) {
          throw new Error(
            "Недостатньо кредитів OpenRouter. Поповніть баланс на openrouter.ai/settings/credits або перейдіть на платний план. " +
            "Alternatively, use Anthropic / Gemini API key in settings."
          );
        }
        throw new Error(`OpenRouter error ${res.status}: ${errBody.slice(0, 300)}`);
      }
      const data = await res.json();
      // Помилка може прийти у тілі відповіді зі статусом 200
      if (data.error) {
        if (data.error.code === 402 || String(data.error.message).includes("credits")) {
          throw new Error(
            "Недостатньо кредитів OpenRouter. Поповніть баланс на openrouter.ai/settings/credits."
          );
        }
        throw new Error(`OpenRouter: ${JSON.stringify(data.error)}`);
      }
      return data.choices?.[0]?.message?.content || "";
    }

    case "gemini": {
      const modelId = model || "gemini-1.5-flash";
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 4096, responseMimeType: "application/json" },
            systemInstruction: { parts: [{ text: "Ти SEO-спеціаліст. Відповідай JSON українською мовою." }] },
          }),
        }
      );
      if (!res.ok) throw new Error(`Gemini error: ${res.status}`);
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    }

    case "grok": {
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: model || "grok-beta",
          messages: [
            { role: "system", content: "Ти SEO-спеціаліст. Відповідай JSON українською мовою." },
            { role: "user", content: prompt },
          ],
          max_tokens: 4096,
        }),
      });
      if (!res.ok) throw new Error(`Grok error: ${res.status}`);
      const data = await res.json();
      return data.choices?.[0]?.message?.content || "";
    }

    default:
      throw new Error(`Невідомий провайдер: ${provider}`);
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as AnalyzeRequest;
    const { provider, apiKey, model } = body;

    if (!provider || !apiKey) {
      return NextResponse.json({ error: "provider та apiKey обов'язкові" }, { status: 400 });
    }

    console.log(`[analyze-by-type] provider=${provider} model=${model || "(default)"} findings=${body.findings.length}`);
    const prompt = buildPrompt(body);
    const raw = await callAI(prompt, provider, apiKey, model);

    // Розбір JSON з кількома стратегіями відновлення
    let parsed: unknown;

    // Спроба 1: очищаємо markdown-фенси і парсимо напряму
    const clean = raw.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
    try { parsed = JSON.parse(clean); } catch { /* переходимо до наступної спроби */ }

    // Спроба 2: витягуємо перший JSON-об'єкт регексом (ігноруємо текст до/після)
    if (!parsed) {
      const objMatch = raw.match(/\{[\s\S]*\}/);
      if (objMatch) {
        try { parsed = JSON.parse(objMatch[0]); } catch { /* переходимо до наступної спроби */ }
      }
    }

    // Спроба 3: витягуємо JSON-масив (якщо модель повернула масив)
    if (!parsed) {
      const arrMatch = raw.match(/\[[\s\S]*\]/);
      if (arrMatch) {
        try { parsed = JSON.parse(arrMatch[0]); } catch { /* переходимо до помилки */ }
      }
    }

    if (!parsed) {
      console.error("[analyze-by-type] Не вдалось розпарсити JSON. Відповідь AI:", raw.slice(0, 800));
      return NextResponse.json(
        { error: "AI повернув не валідний JSON", raw: raw.slice(0, 500) },
        { status: 422 }
      );
    }

    return NextResponse.json({ result: parsed, model, provider });
  } catch (err) {
    console.error("[analyze-by-type]", err);
    return NextResponse.json(
      { error: "Помилка AI аналізу", detail: (err as Error).message },
      { status: 500 }
    );
  }
}
