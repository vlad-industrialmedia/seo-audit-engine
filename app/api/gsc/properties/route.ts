import { NextResponse } from "next/server";

export const maxDuration = 30;

// ─── Проксі: GSC список властивостей ─────────────────────────────────────────
// Отримує список сайтів з Google Search Console, використовуючи
// access_token, який надходить від клієнта після GIS OAuth флоу.
// Потрібен scope: https://www.googleapis.com/auth/webmasters.readonly

export async function POST(req: Request) {
  try {
    const { accessToken } = (await req.json()) as { accessToken: string };

    if (!accessToken) {
      return NextResponse.json(
        { error: "accessToken обов'язковий" },
        { status: 400 }
      );
    }

    // Запит до GSC API — отримуємо список верифікованих сайтів
    const res = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[gsc/properties] Google API error:", res.status, err);
      return NextResponse.json(
        { error: `Google API: ${res.status}`, detail: err.slice(0, 200) },
        { status: res.status }
      );
    }

    const data = (await res.json()) as {
      siteEntry?: Array<{ siteUrl: string; permissionLevel: string }>;
    };

    // Повертаємо нормалізований список властивостей
    const properties = (data.siteEntry ?? []).map((s) => ({
      siteUrl: s.siteUrl,
      permissionLevel: s.permissionLevel,
    }));

    return NextResponse.json({ properties });
  } catch (err) {
    console.error("[gsc/properties]", err);
    return NextResponse.json(
      { error: "Помилка отримання GSC властивостей", detail: (err as Error).message },
      { status: 500 }
    );
  }
}
