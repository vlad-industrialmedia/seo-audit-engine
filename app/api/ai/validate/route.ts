import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { provider, apiKey, model } = await req.json();

  if (!provider || !apiKey) {
    return NextResponse.json({ valid: false, error: "Missing provider or apiKey" }, { status: 400 });
  }

  try {
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
            model: model || "claude-haiku-4-5-20251001",
            max_tokens: 10,
            messages: [{ role: "user", content: "ping" }],
          }),
        });

        if (res.status === 401) return NextResponse.json({ valid: false, error: "Invalid API key" });
        if (res.status === 400) return NextResponse.json({ valid: true }); // Bad request means key is valid, model might differ
        if (res.ok) return NextResponse.json({ valid: true });

        const err = await res.json();
        return NextResponse.json({ valid: false, error: err.error?.message || "Unknown error" });
      }

      case "openrouter": {
        const res = await fetch("https://openrouter.ai/api/v1/models", {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "HTTP-Referer": "https://seo-audit-engine.vercel.app",
          },
        });

        if (res.status === 401) return NextResponse.json({ valid: false, error: "Invalid API key" });
        if (res.ok) {
          const data = await res.json();
          const modelIds = (data.data || []).slice(0, 10).map((m: { id: string }) => m.id);
          return NextResponse.json({ valid: true, modelsAvailable: modelIds });
        }
        return NextResponse.json({ valid: false, error: "Cannot connect to OpenRouter" });
      }

      case "gemini": {
        // Використовуємо endpoint списку моделей — він чітко розрізняє невалідний ключ від інших помилок
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=1`,
          { method: "GET" }
        );

        if (res.ok) return NextResponse.json({ valid: true });

        const errData = await res.json().catch(() => ({}));
        const errMsg: string = errData?.error?.message || "";
        const errStatus: string = errData?.error?.status || "";

        // API_KEY_INVALID або PERMISSION_DENIED означає невалідний ключ
        if (
          res.status === 400 ||
          errStatus === "INVALID_ARGUMENT" ||
          errMsg.includes("API_KEY_INVALID") ||
          errMsg.includes("API key not valid") ||
          (res.status === 403 && errMsg.toLowerCase().includes("api key"))
        ) {
          return NextResponse.json({ valid: false, error: "Invalid API key" });
        }

        // 429 — ключ валідний, але вичерпано ліміт
        if (res.status === 429) return NextResponse.json({ valid: true });

        // Будь-яка інша відповідь (404 моделі, 503 тощо) — ключ скоріш за все валідний
        return NextResponse.json({ valid: true });
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
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 5,
          }),
        });

        if (res.status === 401) return NextResponse.json({ valid: false, error: "Invalid API key" });
        if (res.ok || res.status === 400) return NextResponse.json({ valid: true });
        return NextResponse.json({ valid: false, error: "Cannot connect to xAI Grok" });
      }

      case "groq": {
        // Groq сумісний з OpenAI API — 401 = невалідний ключ
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: model || "llama-3.3-70b-versatile",
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 5,
          }),
        });

        if (res.status === 401) return NextResponse.json({ valid: false, error: "Invalid API key" });
        if (res.ok || res.status === 400 || res.status === 429) return NextResponse.json({ valid: true });
        return NextResponse.json({ valid: false, error: "Cannot connect to Groq" });
      }

      case "cerebras": {
        // Cerebras сумісний з OpenAI API — 401 = невалідний ключ
        const res = await fetch("https://api.cerebras.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: model || "llama3.1-8b",
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 5,
          }),
        });

        if (res.status === 401) return NextResponse.json({ valid: false, error: "Invalid API key" });
        if (res.ok || res.status === 400 || res.status === 429) return NextResponse.json({ valid: true });
        return NextResponse.json({ valid: false, error: "Cannot connect to Cerebras" });
      }

      default:
        return NextResponse.json({ valid: false, error: "Unknown provider" }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json(
      { valid: false, error: `Network error: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}
