import Papa from "papaparse";
import * as XLSX from "xlsx";
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

// ─── Normalize SF column names ────────────────────────────────────────────────
function normalizeKey(key: string): string {
  return key
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[()]/g, "")
    .replace(/-/g, "_");
}

function toStr(v: unknown): string | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  return String(v).trim() || undefined;
}

function toInt(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = typeof v === "number" ? v : parseInt(String(v), 10);
  return isNaN(n) ? undefined : n;
}

function toFloat(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return isNaN(n) ? undefined : n;
}

function normalizeSFRow(raw: Record<string, unknown>): SFRow {
  // Build normalized key map
  const norm: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    norm[normalizeKey(k)] = v;
  }

  return {
    // Core
    address: toStr(norm["address"] ?? norm["url"]) || "",
    contentType: toStr(norm["content_type"]),
    statusCode: toInt(norm["status_code"]),
    status: toStr(norm["status"]),
    indexability: toStr(norm["indexability"]),
    indexabilityStatus: toStr(norm["indexability_status"]),

    // Title
    title1: toStr(norm["title_1"] ?? norm["page_title"]),
    title1Length: toInt(norm["title_1_length"]),
    title1PixelWidth: toInt(norm["title_1_pixel_width"]),

    // Meta description
    metaDescription1: toStr(norm["meta_description_1"] ?? norm["meta_description"]),
    metaDescription1Length: toInt(norm["meta_description_1_length"]),

    // Headings
    h1_1: toStr(norm["h1_1"] ?? norm["h1"]),
    h1_1Length: toInt(norm["h1_1_length"]),
    h2_1: toStr(norm["h2_1"] ?? norm["h2"]),
    h2_1Length: toInt(norm["h2_1_length"]),

    // Canonical / robots
    canonicalLinkElement1: toStr(norm["canonical_link_element_1"] ?? norm["canonical"]),
    metaRobots1: toStr(norm["meta_robots_1"] ?? norm["meta_robots"]),

    // Content metrics
    wordCount: toInt(norm["word_count"]),
    textRatio: toFloat(norm["text_ratio"]),
    spellingErrors: toInt(norm["spelling_errors"]),
    grammarErrors: toInt(norm["grammar_errors"]),
    readability: toStr(norm["readability"]),
    fleschReadingEaseScore: toFloat(norm["flesch_reading_ease_score"]),

    // Links
    inlinks: toInt(norm["inlinks"]),
    uniqueInlinks: toInt(norm["unique_inlinks"]),
    outlinks: toInt(norm["outlinks"]),
    uniqueOutlinks: toInt(norm["unique_outlinks"]),
    externalOutlinks: toInt(norm["external_outlinks"]),

    // Crawl
    crawlDepth: toInt(norm["crawl_depth"]),
    folderDepth: toInt(norm["folder_depth"]),
    responseTime: toFloat(norm["response_time"]),
    size: toInt(norm["size_bytes"] ?? norm["size"]),

    // Redirect
    redirectURL: toStr(norm["redirect_url"] ?? norm["redirect_uri"]),
    redirectType: toStr(norm["redirect_type"]),

    // Language
    language: toStr(norm["language"]),

    // GSC data
    clicks: toInt(norm["clicks"]),
    impressions: toInt(norm["impressions"]),
    ctr: toFloat(norm["ctr"]),
    position: toFloat(norm["position"]),

    // Performance (Lighthouse)
    performanceScore: toFloat(norm["performance_score"]),
    lcp: toFloat(norm["largest_contentful_paint_time_ms"]),
    cls: toFloat(norm["cumulative_layout_shift"]),
    tbt: toFloat(norm["total_blocking_time_ms"]),
    fcp: toFloat(norm["first_contentful_paint_time_ms"]),

    // Spread raw fields too (for rule engine access)
    ...norm,
  } as SFRow;
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

// ─── Parse XLSX/XLS ArrayBuffer via SheetJS ───────────────────────────────────
export function parseSFExcel(buffer: ArrayBuffer): SFRow[] {
  const workbook = XLSX.read(buffer, { type: "array", cellText: true, cellDates: false });

  // Find the best sheet — prefer "Internal HTML", "All", first sheet
  const sheetName =
    workbook.SheetNames.find((n) => /internal.*html/i.test(n)) ??
    workbook.SheetNames.find((n) => /all|html/i.test(n)) ??
    workbook.SheetNames[0];

  if (!sheetName) return [];

  const sheet = workbook.Sheets[sheetName];

  // Convert to JSON rows (raw values)
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: true, // keep numbers as numbers
  });

  return rows
    .map(normalizeSFRow)
    .filter((row) => row.address && typeof row.address === "string" && row.address.startsWith("http"));
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

// ─── File readers ─────────────────────────────────────────────────────────────
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file, "UTF-8");
  });
}

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as ArrayBuffer);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsArrayBuffer(file);
  });
}

function isExcelFile(name: string): boolean {
  return /\.(xlsx|xls|xlsb|xlsm)$/i.test(name);
}

// ─── Main import function ─────────────────────────────────────────────────────
export async function importSFFiles(files: File[]): Promise<SFImportResult> {
  const result: SFImportResult = {
    rows: [],
    redirects: [],
    images: [],
    totalUrls: 0,
    errors: [],
    fileNames: files.map((f) => f.name),
    detectedPageTypes: {
      homepage: 0, category: 0, product: 0, blog: 0,
      service: 0, filter: 0, pagination: 0, search: 0,
      tag: 0, "404": 0, other: 0,
    },
  };

  for (const file of files) {
    const fileName = file.name.toLowerCase();

    try {
      let parsedRows: SFRow[] = [];

      if (isExcelFile(fileName)) {
        // ── Excel file: use SheetJS ──────────────────────────────────────────
        const buffer = await readFileAsArrayBuffer(file);
        parsedRows = parseSFExcel(buffer);
      } else {
        // ── CSV / TSV ────────────────────────────────────────────────────────
        const text = await readFileAsText(file);

        if (fileName.includes("redirect")) {
          result.redirects = parseSFRedirects(text);
          continue;
        }

        parsedRows = parseSFCsv(text);
      }

      // Route parsed rows to appropriate buckets
      if (fileName.includes("redirect") && !isExcelFile(fileName)) {
        // already handled above
      } else if (fileName.includes("image") || fileName.includes("img")) {
        result.images = parsedRows.map((r) => ({
          src: r.address,
          alt: (r["alt_text"] as string) || (r["alt"] as string),
          status: r.status as string,
          inlinks: r.inlinks,
        }));
      } else {
        // HTML / All pages
        const htmlRows = parsedRows.filter((r) => {
          // Accept rows that are HTML or have no content-type (e.g., single-sheet exports)
          const ct = String(r.contentType || "").toLowerCase();
          return ct === "" || ct.includes("html") || ct.includes("text");
        });

        if (result.rows.length === 0) {
          result.rows = htmlRows;
        } else {
          // Merge — deduplicate by URL
          const existing = new Set(result.rows.map((r) => r.address));
          result.rows.push(...htmlRows.filter((r) => !existing.has(r.address)));
        }
      }
    } catch (err) {
      result.errors.push(`Помилка парсингу ${file.name}: ${(err as Error).message}`);
    }
  }

  // Detect page types & count
  for (const row of result.rows) {
    const statusCode = row.statusCode ?? 200;
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
    homepage: [], category: [], product: [], blog: [],
    service: [], filter: [], pagination: [], search: [],
    tag: [], "404": [], other: [],
  };

  for (const row of rows) {
    const code = row.statusCode ?? 200;
    if (code === 404) {
      byType["404"].push(row);
    } else {
      const { type } = detectPageType(row.address);
      byType[type].push(row);
    }
  }

  const sampled: Record<PageType, SFRow[]> = {} as Record<PageType, SFRow[]>;
  for (const [type, typeRows] of Object.entries(byType)) {
    const sorted = [...typeRows].sort((a, b) => (b.inlinks || 0) - (a.inlinks || 0));
    if (type === "homepage") {
      sampled[type as PageType] = sorted.slice(0, 1);
    } else if (type === "pagination" || type === "tag") {
      sampled[type as PageType] = sorted.slice(0, Math.min(2, sampleSize));
    } else {
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
