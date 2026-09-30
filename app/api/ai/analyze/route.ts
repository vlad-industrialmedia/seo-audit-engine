import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { prompt, provider, apiKey, model } = await req.json();

  if (!prompt || !provider || !apiKey) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  try {
    let responseText = "";

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
            max_tokens: 2048,
            messages: [{ role: "user", content: prompt }],
            system: "You are a Senior SEO specialist. Always respond in valid JSON format as requested.",
          }),
        });
        if (!res.ok) throw new Error(`Anthropic error: ${res.status}`);
        const data = await res.json();
        responseText = data.content?.[0]?.text || "";
        break;
      }

      case "openrouter": {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://seo-audit-engine.vercel.app",
            "X-Title": "SEO Audit Engine",
          },
          body: JSON.stringify({
            model: model || "anthropic/claude-sonnet-4-6",
            messages: [
              { role: "system", content: "You are a Senior SEO specialist. Always respond in valid JSON format as requested." },
              { role: "user", content: prompt },
            ],
            max_tokens: 2048,
          }),
        });
        if (!res.ok) throw new Error(`OpenRouter error: ${res.status}`);
        const data = await res.json();
        responseText = data.choices?.[0]?.message?.content || "";
        break;
      }

      case "gemini": {
        // Нормалізація ID — деякі застарілі моделі видалені Google (напр. gemini-2.0-flash-exp → gemini-2.0-flash)
        const GEMINI_ID_MAP: Record<string, string> = {
          "gemini-2.0-flash":          "gemini-2.0-flash",
          "gemini-2.0-flash-exp":      "gemini-2.0-flash",
          "gemini-2.0-flash-lite":     "gemini-2.0-flash-lite",
          "gemini-2.0-pro-exp":        "gemini-2.0-pro-exp-03-25",
          "gemini-2.0-pro-exp-03-25":  "gemini-2.0-pro-exp-03-25",
          "gemini-1.5-flash":          "gemini-1.5-flash",
          "gemini-1.5-flash-8b":       "gemini-1.5-flash-8b",
          "gemini-1.5-pro":            "gemini-1.5-pro",
          "gemini-1.0-pro":            "gemini-1.0-pro",
        };
        const rawModel = (model || "gemini-2.0-flash").trim().toLowerCase().replace(/\s+/g, "-");
        const modelId = GEMINI_ID_MAP[rawModel] ?? GEMINI_ID_MAP[model] ?? rawModel;
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { maxOutputTokens: 2048, responseMimeType: "application/json" },
              systemInstruction: { parts: [{ text: "You are a Senior SEO specialist. Respond only in valid JSON." }] },
            }),
          }
        );
        if (!res.ok) throw new Error(`Gemini error: ${res.status}`);
        const data = await res.json();
        responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        break;
      }

      case "grok": {
        const res = await fetch("https://api.x.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: model || "grok-3-mini",
            messages: [
              { role: "system", content: "You are a Senior SEO specialist. Respond in valid JSON." },
              { role: "user", content: prompt },
            ],
            max_tokens: 2048,
          }),
        });
        if (!res.ok) throw new Error(`Grok error: ${res.status}`);
        const data = await res.json();
        responseText = data.choices?.[0]?.message?.content || "";
        break;
      }

      case "groq": {
        // Groq — OpenAI-сумісний API, надзвичайно швидкий inference
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: model || "llama-3.3-70b-versatile",
            messages: [
              { role: "system", content: "You are a Senior SEO specialist. Always respond in valid JSON format as requested." },
              { role: "user", content: prompt },
            ],
            max_tokens: 2048,
          }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(`Groq error: ${res.status} — ${errData?.error?.message || ""}`);
        }
        const data = await res.json();
        responseText = data.choices?.[0]?.message?.content || "";
        break;
      }

      case "cerebras": {
        // Cerebras — OpenAI-сумісний API з надшвидким апаратним inference
        const res = await fetch("https://api.cerebras.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: model || "llama3.1-8b",
            messages: [
              { role: "system", content: "You are a Senior SEO specialist. Always respond in valid JSON format as requested." },
              { role: "user", content: prompt },
            ],
            max_tokens: 2048,
          }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(`Cerebras error: ${res.status} — ${errData?.error?.message || ""}`);
        }
        const data = await res.json();
        responseText = data.choices?.[0]?.message?.content || "";
        break;
      }

      default:
        return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
    }

    // Try to extract JSON; fall back to returning plain text (e.g. for free-form explanations)
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        return NextResponse.json({ result });
      }
    } catch {
      // JSON parse failed — fall through to raw text
    }

    // Return raw text as result (free-form explanations, plain Ukrainian text, etc.)
    return NextResponse.json({ result: responseText });
  } catch (err) {
    return NextResponse.json(
      { error: `AI analysis failed: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}
