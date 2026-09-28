import { NextResponse } from "next/server";
import type {
  GscAuditResult,
  GscSitemapData,
  GscCrawlErrors,
  GscCountryData,
  GscSearchDeviceData,
  GscDateData,
} from "@/types";

export const maxDuration = 60;

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

// ─── Отримати список сайтмап зі Search Console ────────────────────────────────
async function fetchSitemaps(
  accessToken: string,
  siteUrl: string
): Promise<GscSitemapData[]> {
  const encodedUrl = encodeURIComponent(siteUrl);
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodedUrl}/sitemaps`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    console.warn("[gsc/sitemaps] HTTP", res.status);
    return [];
  }

  const data = (await res.json()) as {
    sitemap?: Array<{
      path: string;
      lastDownloaded?: string;
      isPending?: boolean;
      isSitemapsIndex?: boolean;
      type?: string;
      warnings?: string;
      errors?: string;
      contents?: Array<{ type: string; submitted?: string; indexed?: string }>;
    }>;
  };

  return (data.sitemap ?? []).map((s) => {
    const contents = (s.contents ?? []).map((c) => ({
      type: c.type,
      submitted: parseInt(c.submitted ?? "0", 10),
      indexed: parseInt(c.indexed ?? "0", 10),
    }));
    return {
      path: s.path,
      lastDownloaded: s.lastDownloaded ?? null,
      isPending: s.isPending ?? false,
      isSitemapsIndex: s.isSitemapsIndex ?? false,
      type: s.type ?? "sitemap",
      warnings: parseInt(s.warnings ?? "0", 10),
      errors: parseInt(s.errors ?? "0", 10),
      contents,
      totalSubmitted: contents.reduce((acc, c) => acc + c.submitted, 0),
      totalIndexed: contents.reduce((acc, c) => acc + c.indexed, 0),
    };
  });
}

// ─── Отримати статистику помилок сканування ───────────────────────────────────
// Використовує webmasters v3 urlCrawlErrorsCounts API
async function fetchCrawlErrors(
  accessToken: string,
  siteUrl: string
): Promise<GscCrawlErrors> {
  const encodedUrl = encodeURIComponent(siteUrl);
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodedUrl}/urlCrawlErrorsCounts/query?latestCountsOnly=true`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10000),
  });

  // API може повернути 403 якщо сайт не має даних — обробляємо м'яко
  if (!res.ok) {
    console.warn("[gsc/crawlErrors] HTTP", res.status, await res.text().catch(() => ""));
    return { categories: [], totalErrors: 0 };
  }

  const data = (await res.json()) as {
    countPerTypes?: Array<{
      platform: string;
      category: string;
      entries?: Array<{ count: string; timestamp: string }>;
    }>;
  };

  const categories = (data.countPerTypes ?? [])
    .filter((ct) => ct.platform === "web") // фокус на web-платформі
    .map((ct) => {
      const entries = ct.entries ?? [];
      const latest = entries[0] ? parseInt(entries[0].count, 10) : 0;
      const prev = entries[1] ? parseInt(entries[1].count, 10) : latest;
      const trend: "up" | "down" | "stable" =
        latest > prev ? "up" : latest < prev ? "down" : "stable";
      return {
        category: ct.category,
        platform: ct.platform,
        latestCount: latest,
        trend,
      };
    })
    .filter((c) => c.latestCount > 0)
    .sort((a, b) => b.latestCount - a.latestCount);

  // Отримати зразки URL для категорії notFound (найпоширеніша)
  let sampleUrls: GscCrawlErrors["sampleUrls"] = [];
  const notFoundCat = categories.find((c) => c.category === "notFound");
  if (notFoundCat && notFoundCat.latestCount > 0) {
    const samplesRes = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodedUrl}/urlCrawlErrorsSamples?category=notFound&platform=web`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(10000),
      }
    ).catch(() => null);

    if (samplesRes?.ok) {
      const samplesData = (await samplesRes.json()) as {
        urlCrawlErrorSample?: Array<{
          pageUrl: string;
          lastCrawled?: string;
          responseCode?: number;
          urlDetails?: { linkedFromUrls?: string[] };
        }>;
      };
      sampleUrls = (samplesData.urlCrawlErrorSample ?? [])
        .slice(0, 10)
        .map((s) => ({
          pageUrl: s.pageUrl,
          lastCrawled: s.lastCrawled ?? null,
          responseCode: s.responseCode ?? null,
          linkedFromUrls: s.urlDetails?.linkedFromUrls?.slice(0, 3),
        }));
    }
  }

  return {
    categories,
    sampleUrls,
    totalErrors: categories.reduce((acc, c) => acc + c.latestCount, 0),
  };
}

// ─── Проксі: GSC розширений звіт ─────────────────────────────────────────────
// Виконує кілька запитів до GSC SearchAnalytics API та додаткових ендпоінтів.
// Повертає агрегований звіт для відображення в UI.
export async function POST(req: Request) {
  try {
    const { accessToken, siteUrl, startDate, endDate } = (await req.json()) as GscReportRequest;

    if (!accessToken || !siteUrl || !startDate || !endDate) {
      return NextResponse.json(
        { error: "accessToken, siteUrl, startDate, endDate — обов'язкові поля" },
        { status: 400 }
      );
    }

    // Паралельно виконуємо всі запити для прискорення
    const [
      queryRows,
      pageRows,
      countryRows,
      deviceRows,
      dateRows,
      sitemaps,
      crawlErrors,
    ] = await Promise.all([
      querySearchAnalytics(accessToken, siteUrl, startDate, endDate, ["query"], 50),
      querySearchAnalytics(accessToken, siteUrl, startDate, endDate, ["page"], 50),
      querySearchAnalytics(accessToken, siteUrl, startDate, endDate, ["country"], 25).catch(() => []),
      querySearchAnalytics(accessToken, siteUrl, startDate, endDate, ["device"], 10).catch(() => []),
      querySearchAnalytics(accessToken, siteUrl, startDate, endDate, ["date"], 90).catch(() => []),
      fetchSitemaps(accessToken, siteUrl).catch(() => [] as GscSitemapData[]),
      fetchCrawlErrors(accessToken, siteUrl).catch(() => ({ categories: [], totalErrors: 0 } as GscCrawlErrors)),
    ]);

    // Загальні метрики з усіх запитів
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

    // Топ країн (за кліками)
    const topCountries: GscCountryData[] = countryRows
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 10)
      .map((r) => ({
        country: r.keys[0] ?? "",
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: r.position,
      }));

    // Розбивка по пристроях (мобільний vs. десктоп у пошуку)
    const totalDeviceClicks = deviceRows.reduce((s, r) => s + r.clicks, 0);
    const searchDeviceBreakdown: GscSearchDeviceData[] = deviceRows
      .sort((a, b) => b.clicks - a.clicks)
      .map((r) => ({
        device: r.keys[0] ?? "",
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: r.position,
        clicksPct: totalDeviceClicks > 0 ? (r.clicks / totalDeviceClicks) * 100 : 0,
      }));

    // Тренд по датах (для міні-графіка)
    const dateTrend: GscDateData[] = dateRows
      .sort((a, b) => a.keys[0].localeCompare(b.keys[0]))
      .map((r) => ({
        date: r.keys[0] ?? "",
        clicks: r.clicks,
        impressions: r.impressions,
      }));

    // Посилання на перевірку ручних дій (API їх не повертає)
    const encodedSite = encodeURIComponent(siteUrl);
    const manualActionsUrl = `https://search.google.com/search-console/manual-actions?resource_id=${encodedSite}`;

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
      // Нові поля
      sitemaps,
      crawlErrors,
      topCountries,
      searchDeviceBreakdown,
      dateTrend,
      manualActionsUrl,
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
