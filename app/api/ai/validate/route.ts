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
        const modelId = model || "gemini-1.5-flash";
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: "ping" }] }],
              generationConfig: { maxOutputTokens: 5 },
            }),
          }
        );

        if (res.status === 400) {
          const err = await res.json();
          if (err.error?.message?.includes("API_KEY_INVALID")) {
            return NextResponse.json({ valid: false, error: "Invalid API key" });
          }
          return NextResponse.json({ valid: true }); // Other 400s mean key is valid
        }
        if (res.ok) return NextResponse.json({ valid: true });
        return NextResponse.json({ valid: false, error: "Cannot connect to Gemini" });
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
