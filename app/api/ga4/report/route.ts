import { NextResponse } from "next/server";
import type { Ga4AuditResult } from "@/types";

export const maxDuration = 45;

interface Ga4ReportRequest {
  accessToken: string;
  propertyId: string;  // напр. "properties/123456789"
  startDate: string;   // формат YYYY-MM-DD
  endDate: string;
}

interface Ga4Row {
  dimensionValues?: Array<{ value: string }>;
  metricValues?: Array<{ value: string }>;
}

// ─── Запит до GA4 Data API ────────────────────────────────────────────────────
async function runGa4Report(
  accessToken: string,
  propertyId: string,
  body: object
): Promise<{ rows?: Ga4Row[]; rowCount?: number }> {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/${propertyId}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GA4 API error ${res.status}: ${errText.slice(0, 300)}`);
  }

  return res.json();
}

// ─── Проксі: GA4 звіт ─────────────────────────────────────────────────────────
// Виконує кілька GA4 Data API запитів та агрегує їх в один звіт.
export async function POST(req: Request) {
  try {
    const { accessToken, propertyId, startDate, endDate } = (await req.json()) as Ga4ReportRequest;

    if (!accessToken || !propertyId || !startDate || !endDate) {
      return NextResponse.json(
        { error: "accessToken, propertyId, startDate, endDate — обов'язкові поля" },
        { status: 400 }
      );
    }

    const dateRange = { startDate, endDate };

    // Паралельно отримуємо 4 звіти:
    // 1. Загальні метрики (сесії, юзери, відмови)
    // 2. Топ-сторінки
    // 3. Джерела трафіку
    // 4. Розподіл по пристроях
    const [overviewData, pagesData, sourcesData, devicesData] = await Promise.all([
      runGa4Report(accessToken, propertyId, {
        dateRanges: [dateRange],
        metrics: [
          { name: "sessions" },
          { name: "totalUsers" },
          { name: "newUsers" },
          { name: "bounceRate" },
          { name: "averageSessionDuration" },
        ],
      }),
      runGa4Report(accessToken, propertyId, {
        dateRanges: [dateRange],
        dimensions: [{ name: "pagePath" }],
        metrics: [{ name: "sessions" }, { name: "bounceRate" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 15,
      }),
      runGa4Report(accessToken, propertyId, {
        dateRanges: [dateRange],
        dimensions: [{ name: "sessionSource" }, { name: "sessionMedium" }],
        metrics: [{ name: "sessions" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 10,
      }),
      runGa4Report(accessToken, propertyId, {
        dateRanges: [dateRange],
        dimensions: [{ name: "deviceCategory" }],
        metrics: [{ name: "sessions" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      }),
    ]);

    // Парсимо загальні метрики з першого рядка
    const overviewRow = overviewData.rows?.[0];
    const sessions = parseInt(overviewRow?.metricValues?.[0]?.value ?? "0", 10);
    const users = parseInt(overviewRow?.metricValues?.[1]?.value ?? "0", 10);
    const newUsers = parseInt(overviewRow?.metricValues?.[2]?.value ?? "0", 10);
    const bounceRate = parseFloat(overviewRow?.metricValues?.[3]?.value ?? "0");
    const avgSessionDuration = parseFloat(overviewRow?.metricValues?.[4]?.value ?? "0");

    // Топ-сторінки
    const topPages = (pagesData.rows ?? []).map((row) => ({
      page: row.dimensionValues?.[0]?.value ?? "",
      sessions: parseInt(row.metricValues?.[0]?.value ?? "0", 10),
      bounceRate: parseFloat(row.metricValues?.[1]?.value ?? "0"),
    }));

    // Джерела трафіку
    const totalSessionsForSources = (sourcesData.rows ?? []).reduce(
      (sum, row) => sum + parseInt(row.metricValues?.[0]?.value ?? "0", 10),
      0
    );
    const topSources = (sourcesData.rows ?? []).map((row) => ({
      source: row.dimensionValues?.[0]?.value ?? "",
      medium: row.dimensionValues?.[1]?.value ?? "",
      sessions: parseInt(row.metricValues?.[0]?.value ?? "0", 10),
    }));

    // Пристрої з відсотковим розподілом
    const totalSessionsForDevices = (devicesData.rows ?? []).reduce(
      (sum, row) => sum + parseInt(row.metricValues?.[0]?.value ?? "0", 10),
      0
    );
    const deviceBreakdown = (devicesData.rows ?? []).map((row) => {
      const s = parseInt(row.metricValues?.[0]?.value ?? "0", 10);
      return {
        device: row.dimensionValues?.[0]?.value ?? "",
        sessions: s,
        pct: totalSessionsForDevices > 0 ? (s / totalSessionsForDevices) * 100 : 0,
      };
    });

    // Уникаємо unused variable warning
    void totalSessionsForSources;

    const result: Ga4AuditResult = {
      property: propertyId,
      dateRange: { start: startDate, end: endDate },
      sessions,
      users,
      newUsers,
      bounceRate,
      avgSessionDuration,
      topPages,
      topSources,
      deviceBreakdown,
      createdAt: new Date().toISOString(),
    };

    return NextResponse.json({ result });
  } catch (err) {
    console.error("[ga4/report]", err);
    return NextResponse.json(
      { error: "Помилка отримання GA4 звіту", detail: (err as Error).message },
      { status: 500 }
    );
  }
}
