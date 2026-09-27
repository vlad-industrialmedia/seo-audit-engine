import Papa from "papaparse";
import type { SFRow, SFRedirectRow, SFImportResult, PageType } from "@/types";

// ─── Page Type Detection from URL patterns ────────────────────────────────────
const PAGE_TYPE_PATTERNS: Array<{ pattern: RegExp; type: PageType; confidence: number }> = [
  { pattern: /^https?:\/\/[^/]+\/?$/, type: "homepage", confidence: 1.0 },
  { pattern: /\/product\/|\/goods\/|\/item\/|\/p\/[^/]+$|\/tovar\//, type: "product", confidence: 0.9 },
  { pattern: /\/catalog\/|\/category\/|\/cat\/|\/shop\/|\/collections\//, type: "category", confidence: 0.9 },
  { pattern: /\/blog\/|\/news\/|\/article\/|\/post\/|\/articles\//, type: "blog", confidence: 0.9 },
  { pattern: /[?&](filter|sort|price|brand|color|size|type)=/, type: "filter", confidence: 0.85 },
  { pattern: /[?&]page=\d+|\/page\/\d+/, type: "pagination", confidence: 0.9 },
  { pattern: /\/search[/?]|[?&](q|query|s)=/, type: "search", confidence: 0.95 },
  { pattern: /\/tag\/|\/label\/|\/topic\//, type: "tag", confidence: 0.9 },
  { pattern: /\/about|\/contact|\/delivery|\/payment|\/services|\/pricing/, type: "service", confidence: 0.7 },
];

export function detectPageType(url: string): { type: PageType; confidence: number } {
  for (const { pattern, type, confidence } of PAGE_TYPE_PATTERNS) {
    if (pattern.test(url)) {
      return { type, confidence };
    }
  }
  return { type: "other", confidence: 0.5 };
}

// ─── Normalize SF column names (SF uses varying capitalization/spacing) ────────
function normalizeKey(key: string): string {
  return key
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[()]/g, "")
    .replace(/-/g, "_");
}

function normalizeSFRow(raw: Record<string, string>): SFRow {
  const norm: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    norm[normalizeKey(k)] = v;
  }
  return {
    address: (norm["address"] as string) || (norm["url"] as string) || "",
    contentType: norm["content_type"] as string,
    statusCode: norm["status_code"] ? parseInt(norm["status_code"] as string) : undefined,
    status: norm["status"] as string,
    indexability: norm["indexability"] as string,
    indexabilityStatus: norm["indexability_status"] as string,
    title1: norm["title_1"] as string || norm["page_title"] as string,
    title1Length: norm["title_1_length"] ? parseInt(norm["title_1_length"] as string) : undefined,
    metaDescription1: norm["meta_description_1"] as string || norm["meta_description"] as string,
    metaDescription1Length: norm["meta_description_1_length"]
      ? parseInt(norm["meta_description_1_length"] as string)
      : undefined,
    h1_1: norm["h1_1"] as string || norm["h1"] as string,
    h1_1Length: norm["h1_1_length"] ? parseInt(norm["h1_1_length"] as string) : undefined,
    h2_1: norm["h2_1"] as string || norm["h2"] as string,
    canonicalLinkElement1: norm["canonical_link_element_1"] as string || norm["canonical"] as string,
    metaRobots1: norm["meta_robots_1"] as string || norm["meta_robots"] as string,
    wordCount: norm["word_count"] ? parseInt(norm["word_count"] as string) : undefined,
    inlinks: norm["inlinks"] ? parseInt(norm["inlinks"] as string) : undefined,
    uniqueInlinks: norm["unique_inlinks"] ? parseInt(norm["unique_inlinks"] as string) : undefined,
    outlinks: norm["outlinks"] ? parseInt(norm["outlinks"] as string) : undefined,
    redirectURL: norm["redirect_url"] as string || norm["redirect_uri"] as string,
    ...norm,
  };
}

// ─── Parse CSV string ─────────────────────────────────────────────────────────
export function parseSFCsv(csvText: string): SFRow[] {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  return result.data.map(normalizeSFRow).filter((row) => row.address);
}

// ─── Parse redirect chain CSV ─────────────────────────────────────────────────
export function parseSFRedirects(csvText: string): SFRedirectRow[] {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
  });
  return result.data
    .filter((row) => row.source || row.from)
    .map((row) => ({
      source: row.source || row.from || "",
      destination: row.destination || row.to || "",
      statusCode: parseInt(row.status_code || row.type || "301"),
      chainLength: row.chain_length ? parseInt(row.chain_length) : undefined,
    }));
}

// ─── Main import function ─────────────────────────────────────────────────────
export async function importSFFiles(
  files: File[]
): Promise<SFImportResult> {
  const result: SFImportResult = {
    rows: [],
    redirects: [],
    images: [],
    totalUrls: 0,
    errors: [],
    fileNames: files.map((f) => f.name),
    detectedPageTypes: {
      homepage: 0,
      category: 0,
      product: 0,
      blog: 0,
      service: 0,
      filter: 0,
      pagination: 0,
      search: 0,
      tag: 0,
      "404": 0,
      other: 0,
    },
  };

  for (const file of files) {
    const text = await readFileAsText(file);
    const fileName = file.name.toLowerCase();

    try {
      if (fileName.includes("redirect")) {
        result.redirects = parseSFRedirects(text);
      } else if (fileName.includes("internal_html") || fileName.includes("internal html")) {
        result.rows = parseSFCsv(text);
      } else if (fileName.includes("image") || fileName.includes("img")) {
        // Parse image CSV — just use generic parser for now
        const rows = parseSFCsv(text);
        result.images = rows.map((r) => ({
          src: r.address,
          alt: r["alt_text"] as string || r["alt"] as string,
          status: r.status as string,
          inlinks: r.inlinks,
        }));
      } else {
        // Try to parse as generic internal HTML
        const parsed = parseSFCsv(text);
        if (parsed.length > 0 && parsed[0].address) {
          if (result.rows.length === 0) {
            result.rows = parsed;
          } else {
            // Merge — deduplicate by URL
            const existing = new Set(result.rows.map((r) => r.address));
            const newRows = parsed.filter((r) => !existing.has(r.address));
            result.rows.push(...newRows);
          }
        }
      }
    } catch (err) {
      result.errors.push(`Error parsing ${file.name}: ${(err as Error).message}`);
    }
  }

  // Detect page types
  for (const row of result.rows) {
    const statusCode = row.statusCode || 200;
    if (statusCode === 404) {
      result.detectedPageTypes["404"]++;
    } else {
      const { type } = detectPageType(row.address);
      result.detectedPageTypes[type]++;
    }
  }

  result.totalUrls = result.rows.length;
  return result;
}

// ─── Smart Sampler ────────────────────────────────────────────────────────────
export function smartSample(
  rows: SFRow[],
  sampleSize: number = 3
): Record<PageType, SFRow[]> {
  const byType: Record<PageType, SFRow[]> = {
    homepage: [],
    category: [],
    product: [],
    blog: [],
    service: [],
    filter: [],
    pagination: [],
    search: [],
    tag: [],
    "404": [],
    other: [],
  };

  // Group by page type
  for (const row of rows) {
    const code = row.statusCode || 200;
    if (code === 404) {
      byType["404"].push(row);
    } else {
      const { type } = detectPageType(row.address);
      byType[type].push(row);
    }
  }

  // Sample from each type
  // Priority: sort by inlinks descending so we pick pages that matter most
  const sampled: Record<PageType, SFRow[]> = {} as Record<PageType, SFRow[]>;
  for (const [type, typeRows] of Object.entries(byType)) {
    const sorted = [...typeRows].sort((a, b) => (b.inlinks || 0) - (a.inlinks || 0));
    if (type === "homepage") {
      sampled[type as PageType] = sorted.slice(0, 1);
    } else if (type === "pagination" || type === "tag") {
      sampled[type as PageType] = sorted.slice(0, Math.min(2, sampleSize));
    } else {
      // Reservoir sampling for diversity — take from different depths
      sampled[type as PageType] = reservoirSample(sorted, sampleSize);
    }
  }

  return sampled;
}

function reservoirSample<T>(arr: T[], k: number): T[] {
  if (arr.length <= k) return arr;
  const result = arr.slice(0, k);
  for (let i = k; i < arr.length; i++) {
    const j = Math.floor(Math.random() * (i + 1));
    if (j < k) result[j] = arr[i];
  }
  return result;
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file, "UTF-8");
  });
}
