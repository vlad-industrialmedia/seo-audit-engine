import { NextResponse } from "next/server";
import type { GscAuditResult } from "@/types";

export const maxDuration = 45;

interface GscReportRequest {
  accessToken: string;
  siteUrl: string;      // напр. "https://example.com/" або "sc-domain:example.com"
  startDate: string;    // формат YYYY-MM-DD
  endDate: string;
}

// ─── Допоміжна функція запиту до searchAnalytics ─────────────────────────────
async function querySearchAnalytics(
  accessToken: string,
  siteUrl: string,
  startDate: string,
  endDate: string,
  dimensions: string[],
  rowLimit = 25
): Promise<Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }>> {
  const encodedUrl = encodeURIComponent(siteUrl);
  const apiUrl = `https://www.googleapis.com/webmasters/v3/sites/${encodedUrl}/searchAnalytics/query`;

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      startDate,
      endDate,
      dimensions,
      rowLimit,
      dataState: "all",
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GSC query error ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    rows?: Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }>;
  };
  return data.rows ?? [];
}

// ─── Проксі: GSC звіт з аналізом ─────────────────────────────────────────────
// Виконує кілька запитів до GSC SearchAnalytics API та повертає
// агрегований звіт для відображення в UI.
export async function POST(req: Request) {
  try {
    const { accessToken, siteUrl, startDate, endDate } = (await req.json()) as GscReportRequest;

    if (!accessToken || !siteUrl || !startDate || !endDate) {
      return NextResponse.json(
        { error: "accessToken, siteUrl, startDate, endDate — обов'язкові поля" },
        { status: 400 }
      );
    }

    // Паралельно запитуємо: топ-запити та топ-сторінки
    const [queryRows, pageRows] = await Promise.all([
      querySearchAnalytics(accessToken, siteUrl, startDate, endDate, ["query"], 50),
      querySearchAnalytics(accessToken, siteUrl, startDate, endDate, ["page"], 50),
    ]);

    // Агрегуємо загальні метрики з усіх запитів
    const totalClicks = queryRows.reduce((s, r) => s + r.clicks, 0);
    const totalImpressions = queryRows.reduce((s, r) => s + r.impressions, 0);
    const avgCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;
    const avgPosition =
      queryRows.length > 0
        ? queryRows.reduce((s, r) => s + r.position, 0) / queryRows.length
        : 0;

    // Топ-10 запитів за кліками
    const topQueries = queryRows
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 10)
      .map((r) => ({
        query: r.keys[0] ?? "",
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: r.position,
      }));

    // Топ-10 сторінок за кліками
    const topPages = pageRows
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 10)
      .map((r) => ({
        page: r.keys[0] ?? "",
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: r.position,
      }));

    // Запити з позицією 4–10 (низько висять — можна покращити)
    const position4to10 = queryRows
      .filter((r) => r.position >= 4 && r.position <= 10)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 15)
      .map((r) => ({
        query: r.keys[0] ?? "",
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: r.position,
      }));

    // Сторінки з низьким CTR, але хорошими показами (потенціал мета-оптимізації)
    const lowCtrHighPos = pageRows
      .filter((r) => r.impressions > 100 && r.ctr < 0.03 && r.position < 20)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 10)
      .map((r) => ({
        page: r.keys[0] ?? "",
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: r.position,
      }));

    const result: GscAuditResult = {
      property: siteUrl,
      dateRange: { start: startDate, end: endDate },
      totalClicks,
      totalImpressions,
      avgCtr,
      avgPosition,
      topQueries,
      topPages,
      lowCtrHighPos,
      position4to10,
      createdAt: new Date().toISOString(),
    };

    return NextResponse.json({ result });
  } catch (err) {
    console.error("[gsc/report]", err);
    return NextResponse.json(
      { error: "Помилка отримання GSC звіту", detail: (err as Error).message },
      { status: 500 }
    );
  }
}
