// ─── Severity Levels ───────────────────────────────────────────────────────
export type Severity = "critical" | "high" | "medium" | "low" | "info";

// ─── Page Types ─────────────────────────────────────────────────────────────
export type PageType =
  | "homepage"
  | "category"
  | "product"
  | "blog"
  | "service"
  | "filter"
  | "pagination"
  | "search"
  | "tag"
  | "404"
  | "other";

// ─── AI Provider ────────────────────────────────────────────────────────────
export type AIProvider = "anthropic" | "openrouter" | "gemini" | "grok" | "groq" | "cerebras";

export interface AIProviderConfig {
  provider: AIProvider;
  apiKey: string;
  model?: string;
  validated?: boolean;
  validatedAt?: string;
  label: string;
  description: string;
  models: AIModel[];
}

export interface AIModel {
  id: string;
  name: string;
  contextWindow: number;
  costPer1KInput: number;
  costPer1KOutput: number;
  recommended?: boolean;
}

// ─── Heading System ─────────────────────────────────────────────────────────
export interface SemanticHeading {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
  count: number;
}

export interface VisualHeadingCandidate {
  tag: string;
  selector: string;
  text: string;
  fontSize: number;
  fontWeight: number;
  positionTopPercent: number;
  visible: boolean;
  confidence: number;
}

export interface HeadingAnalysis {
  semantic: { h1: string[]; h2: string[]; h3: string[]; h4: string[]; h5: string[]; h6: string[] };
  aria: Array<{ level: number; text: string }>;
  visualCandidates: VisualHeadingCandidate[];
  hidden: Array<{ tag: string; text: string; reason: string }>;
  issues: string[];
  h1Length?: number;  // length of first H1 in characters (from SF h1_1Length)
}

// ─── Page Passport (normalized per-URL data) ────────────────────────────────
export interface PagePassport {
  url: string;
  crawlSource: "screaming_frog" | "direct_crawl" | "manual";
  pageType: PageType;
  pageTypeConfidence: number;
  deepAnalyzed: boolean;
  crawledAt: string;

  http: {
    statusCode: number;
    redirectChain: Array<{ url: string; statusCode: number }>;
    responseTimeMs?: number;
    contentType?: string;
    server?: string;
  };

  indexability: {
    indexable: boolean;
    reasons: string[];
    canonicalSelf: boolean;
    canonicalUrl?: string;
    robotsDirective?: string;
    inSitemap?: boolean;
    noindexTag: boolean;
    noindexHeader: boolean;
  };

  meta: {
    title?: string;
    titleLength?: number;
    description?: string;
    descriptionLength?: number;
    ogTitle?: string;
    ogDescription?: string;
    ogImage?: string;
    keywords?: string;
  };

  headings: HeadingAnalysis;

  content: {
    wordCount?: number;
    hasMainContent?: boolean;
    thinContent?: boolean;
    visibleTextHash?: string;
  };

  images: Array<{
    src: string;
    alt?: string;
    title?: string;
    widthPx?: number;
    heightPx?: number;
    sizeKb?: number;
    format?: string;
    lazy?: boolean;
    issues: string[];
  }>;

  links: {
    internalTotal: number;
    externalTotal: number;
    broken: number;
    redirecting: number;
  };

  structuredData: {
    typesFound: string[];
    hasProduct?: boolean;
    hasOrganization?: boolean;
    hasBreadcrumb?: boolean;
    hasArticle?: boolean;
    hasFAQ?: boolean;
    valid?: boolean;
    errors?: string[];
  };

  hreflang?: Array<{
    lang: string;
    url: string;
    valid: boolean;
  }>;

  performance?: {
    lcpMs?: number;
    cls?: number;
    inpMs?: number;
  };

  inlinks?: number;
  crawlDepth?: number;      // how many clicks from homepage
  nearDuplicates?: number;  // count of near-duplicate pages (from SF)
  urlLength?: number;       // character length of URL
  screenshot?: {
    path: string;
    highlightedIssues: string[];
  };

  findings: Finding[];
}

// ─── Finding (Rule Engine output) ───────────────────────────────────────────
export interface Finding {
  ruleId: string;
  ruleTitle: string;
  severity: Severity;
  confidence: number; // 0-1
  url: string;        // first affected URL (representative)
  pageType: PageType;
  evidence: Record<string, unknown>;
  recommendation?: string;
  developerHint?: string;
  aiExplanation?: string;
  affectedCount?: number;    // total number of pages with this issue
  affectedUrls?: string[];   // all affected URLs (populated by aggregateFindings)
  checked?: boolean;         // whole rule resolved
  notes?: string;            // user notes
  verificationStatus?: "verified" | "false_positive" | "unverified";
  verificationNote?: string; // result from live verification
}

// ─── Audit ───────────────────────────────────────────────────────────────────
export interface AuditSummary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  checked: number;
}

export interface Audit {
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
  completedAt?: string;
  status: "pending" | "running" | "completed" | "failed";
  progress: number; // 0-100
  pagesAnalyzed: number;
  pagesTotal: number;
  summary: AuditSummary;
  findings: Finding[];
  pages: PagePassport[];
  sfImportFiles: string[];
  sfStats?: {
    totalUrls: number;
    detectedPageTypes: Record<PageType, number>;
    indexableCount: number;
    nonIndexableCount: number;
  };
  aiProvider?: AIProvider;
  aiModel?: string;
  rulePacks: string[];
  error?: string;
  // ─── Кешовані результати для збереженого проєкту ─────────────────────────
  // Дозволяють відновити весь стан аудиту без повторного завантаження даних
  cachedSfData?: SFImportResult | null;
  cachedTechAudit?: TechAuditResult | null;
  cachedGscAudit?: GscAuditResult | null;
  cachedGa4Audit?: Ga4AuditResult | null;
  cachedAiResult?: AiAuditAnalysis | null;  // результат AI-аудиту (по типах сторінок)
}

// ─── Project ─────────────────────────────────────────────────────────────────
export interface Project {
  id: string;
  name: string;
  domain: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  audits: Audit[];
  settings: {
    defaultAIProvider?: AIProvider;
    defaultAIModel?: string;
    enabledRulePacks: string[];
    sampleSize: number; // pages per type for deep analysis
    pageTypeWeights: Record<PageType, number>;
  };
  tags?: string[];
}

// ─── Rule Engine ─────────────────────────────────────────────────────────────
export interface RuleCondition {
  field: string;
  operator: "equals" | "not_equals" | "greater_than" | "less_than" | "contains" | "not_contains" | "exists" | "not_exists" | "in" | "not_in";
  value?: unknown;
}

export interface Rule {
  id: string;
  module: string;
  rulePack: string;
  title: string;
  description?: string;
  severityDefault: Severity;
  pageTypeWeights?: Partial<Record<PageType, Severity>>;
  conditions: RuleCondition[];
  exceptions?: Array<{ field: string; pattern?: string; value?: unknown }>;
  evidence: string[];
  recommendation?: string;
  developerHint?: string;
  aiPromptContext?: string;
  enabled: boolean;
}

// ─── SF (Screaming Frog) Import ──────────────────────────────────────────────
export interface SFRow {
  address: string;
  contentType?: string;
  statusCode?: number;
  status?: string;
  indexability?: string;
  indexabilityStatus?: string;
  title1?: string;
  title1Length?: number;
  title1PixelWidth?: number;
  metaDescription1?: string;
  metaDescription1Length?: number;
  metaDescription1PixelWidth?: number;
  h1_1?: string;
  h1_1Length?: number;
  h2_1?: string;
  h2_1Length?: number;
  canonicalLinkElement1?: string;
  metaRobots1?: string;
  xRobotsTag?: string;
  wordCount?: number;
  textRatio?: number;
  spellingErrors?: number;
  grammarErrors?: number;
  readability?: string;
  fleschReadingEaseScore?: number;
  crawlDepth?: number;
  folderDepth?: number;
  responseTime?: number;
  size?: number;
  inlinks?: number;
  uniqueInlinks?: number;
  outlinks?: number;
  uniqueOutlinks?: number;
  externalOutlinks?: number;
  httpStatusCode?: number;
  redirectURL?: string;
  redirectType?: string;
  language?: string;
  // GSC
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
  // Pagination
  relNext1?: string;
  relPrev1?: string;
  // Duplicate detection
  nearDuplicates?: number;
  // Images
  imageCount?: number;
  imageSizeBytes?: number;
  // Performance (Lighthouse)
  performanceScore?: number;
  lcp?: number;
  cls?: number;
  tbt?: number;
  fcp?: number;
  [key: string]: unknown;
}

export interface SFRedirectRow {
  source: string;
  destination: string;
  statusCode: number;
  chainLength?: number;
}

export interface SFImageRow {
  src: string;
  alt?: string;
  title?: string;
  size?: string;
  status?: string;
  inlinks?: number;
}

export interface SFImportResult {
  rows: SFRow[];
  redirects: SFRedirectRow[];
  images: SFImageRow[];
  totalUrls: number;
  errors: string[];
  detectedPageTypes: Record<PageType, number>;
  fileNames: string[];
}

// ─── Technical Audit ──────────────────────────────────────────────────────────
export type TechCheckStatus = "ok" | "issue" | "error" | "unknown" | "poor" | "needs_attention" | "warning";

export interface MirrorCheck {
  status: TechCheckStatus;
  canonical: "www" | "non-www" | "both" | "unknown";
  wwwFinalUrl: string | null;
  nonWwwFinalUrl: string | null;
  wwwStatusCode: number | null;
  nonWwwStatusCode: number | null;
  note: string;
}

export interface HttpsCheck {
  status: TechCheckStatus;
  httpRedirectsToHttps: boolean;
  httpsStatusCode: number | null;
  note: string;
}

export interface RobotsTxtPathAnalysis {
  path: string;
  blockedSFUrlCount: number;
  assessment: "safe" | "review" | "risky";
  reason: string;
}

export interface RobotsTxtCheck {
  status: TechCheckStatus;
  exists: boolean;
  hasSitemapDirective: boolean;
  blocksGooglebot: boolean;
  blocksAll: boolean;
  disallowedPaths: string[];
  sitemapUrls: string[];
  note: string;
  pathAnalysis?: RobotsTxtPathAnalysis[];
}

export interface SitemapStatusIssue {
  url: string;
  statusCode: number;
  type: "redirect" | "client_error" | "server_error";
}

export interface SitemapCheck {
  status: TechCheckStatus;
  exists: boolean;
  url: string | null;
  urlCount: number | null;
  note: string;
  sfComparison?: {
    sitemapUrlCount: number;
    sfUrlCount: number;
    missingFromSitemapEstimate: number;
  };
  statusIssues?: SitemapStatusIssue[];
  sampleChecked?: number;
  allSitemapUrls?: string[]; // first 200 for display
}

export interface PageSpeedCheck {
  status: TechCheckStatus;
  performanceScore: number | null;  // мобільний скор
  desktopScore: number | null;      // десктопний скор
  lcpMs: number | null;
  clsScore: number | null;
  fcpMs: number | null;
  tbtMs: number | null;
  note: string;
}

export interface StructuredDataCheck {
  status: TechCheckStatus;
  found: boolean;
  types: string[];   // e.g. ["Organization", "WebSite", "BreadcrumbList"]
  hasJsonLd: boolean;
  hasMicrodata: boolean;
  note: string;
}

export interface OpenGraphCheck {
  status: TechCheckStatus;
  hasOgTitle: boolean;
  hasOgDescription: boolean;
  hasOgImage: boolean;
  hasTwitterCard: boolean;
  note: string;
}

export interface SecurityHeadersCheck {
  status: TechCheckStatus;
  hsts: boolean;
  xFrameOptions: boolean;
  xContentTypeOptions: boolean;
  csp: boolean;
  note: string;
}

export interface AnalyticsCheck {
  status: TechCheckStatus;
  hasGA4: boolean;
  hasGTM: boolean;
  hasGoogleAds: boolean;
  hasMicrosoftClarity: boolean;
  note: string;
}

export interface CompressionCheck {
  status: TechCheckStatus;
  encoding: string | null; // "gzip" | "br" | null
  note: string;
}

// ─── Hreflang check (from homepage HTML) ─────────────────────────────────────
export interface HreflangCheck {
  status: TechCheckStatus;
  hasHreflang: boolean;
  count: number;
  languages: string[];        // e.g. ["uk", "en", "ru"]
  hasXDefault: boolean;
  selfLangMatches: boolean | null; // homepage lang attr matches a hreflang entry
  note: string;
}

// ─── Page-level tech checks (from homepage HTML) ─────────────────────────────
export interface PageTechCheck {
  status: TechCheckStatus;
  hasSelfCanonical: boolean;
  canonicalUrl: string | null;
  hasManifest: boolean;
  hasAppleTouchIcon: boolean;
  scriptCount: number;
  hasMixedContent: boolean;   // http:// assets on https page
  note: string;
}

// ─── Server / Infrastructure checks (from homepage fetch) ───────────────────
export interface ServerInfoCheck {
  status: TechCheckStatus;
  server: string | null;        // nginx, Apache, etc.
  cdn: string | null;           // Cloudflare, Fastly, etc.
  cacheControl: string | null;  // cache-control header value
  ttfbMs: number | null;        // time to first byte
  hasViewportMeta: boolean;     // <meta name="viewport">
  hasLangAttr: boolean;         // <html lang="...">
  hasFavicon: boolean;          // /favicon.ico resolves
  note: string;
}

// ─── SF-based analysis (from Screaming Frog data, no extra HTTP) ────────────
export interface SFHttpStatusCheck {
  status: TechCheckStatus;
  total: number;
  ok200: number;
  redirect3xx: number;
  error4xx: number;
  error5xx: number;
  note: string;
}

export interface SFCanonicalCheck {
  status: TechCheckStatus;
  total: number;
  withCanonical: number;
  withoutCanonical: number;
  selfCanonical: number;
  crossCanonical: number;
  note: string;
}

export interface SFIndexabilityCheck {
  status: TechCheckStatus;
  total: number;
  indexable: number;
  nonIndexable: number;
  noindexMeta: number;
  noindexHeader: number;
  byRobots: number;
  byCanonical: number;
  note: string;
}

export interface SFTitleCheck {
  status: TechCheckStatus;
  total: number;
  missing: number;
  tooShort: number;
  tooLong: number;
  duplicates: number;
  note: string;
}

export interface SFDescriptionCheck {
  status: TechCheckStatus;
  total: number;
  missing: number;
  tooShort: number;
  tooLong: number;
  duplicates: number;
  note: string;
}

export interface SFH1Check {
  status: TechCheckStatus;
  total: number;
  missing: number;
  multiple: number;
  note: string;
}

export interface SFContentCheck {
  status: TechCheckStatus;
  total: number;
  thinContent: number;
  orphanPages: number;
  nearDuplicates: number;
  note: string;
}

export interface SFUrlCheck {
  status: TechCheckStatus;
  total: number;
  tooLong: number;
  withParameters: number;
  deepUrls: number;
  note: string;
}

export interface SFCrawlDepthCheck {
  status: TechCheckStatus;
  avgDepth: number;
  maxDepth: number;
  deepPages: number;
  distribution: Record<string, number>;
  note: string;
}

export interface SFH2Check {
  status: TechCheckStatus;
  total: number;
  missing: number;        // pages with no H2
  duplicateH1: number;    // pages sharing same H1 text as another page
  note: string;
}

export interface SFResponseTimeCheck {
  status: TechCheckStatus;
  total: number;
  avgMs: number | null;
  slowPages: number;      // > 2000ms
  verySlowPages: number;  // > 4000ms
  note: string;
}

// ─── New SF extended checks ──────────────────────────────────────────────────

export interface SFImagesAltCheck {
  status: TechCheckStatus;
  totalImages: number;
  missingAlt: number;   // no alt attribute
  emptyAlt: number;     // alt="" (decorative)
  genericAlt: number;   // alt is filename, "image", "photo", etc.
  note: string;
}

export interface SFInternalLinksCheck {
  status: TechCheckStatus;
  total: number;
  orphanPages: number;   // 0 inlinks (not counting homepage)
  poorlyLinked: number;  // 1–2 inlinks
  wellLinked: number;    // 5+ inlinks
  avgInlinks: number;
  note: string;
}

export interface SFRedirectChainCheck {
  status: TechCheckStatus;
  totalRedirects: number;
  longChains: number;    // 2+ hops
  note: string;
}

export interface SFTitleH1MatchCheck {
  status: TechCheckStatus;
  total: number;
  strongMismatch: number;  // no common words between title & H1
  weakMismatch: number;    // few overlapping words
  note: string;
}

export interface SFPaginationCheck {
  status: TechCheckStatus;
  total: number;
  withRelNext: number;
  withRelPrev: number;
  paginated: number;
  note: string;
}

// ─── Per-page sampling (live HTTP) ───────────────────────────────────────────

export interface PageSampleAltIssue {
  src: string;
  issue: "missing" | "empty" | "generic" | "filename_only";
  currentAlt: string;
  suggestion: string;
}

export interface PageSampleCheck {
  url: string;
  pageType: string;
  fetchOk: boolean;
  error?: string;
  imagesTotal: number;
  imagesMissingAlt: number;
  imagesEmptyAlt: number;
  imagesGenericAlt: number;
  altIssues: PageSampleAltIssue[];
  schemaTypes: string[];
  internalLinksCount: number;
  externalLinksCount: number;
  wordCount: number;
  issues: string[];
  // Розширені перевірки (lazy loading, формати зображень, cookie banner)
  lazyLoadRatio?: number;       // частка зображень з loading="lazy" (0-1)
  hasWebP?: boolean;            // сторінка використовує WebP або AVIF
  hasCookieBanner?: boolean;    // виявлено cookie consent / GDPR банер
}

export interface SFPageSamplingResult {
  status: TechCheckStatus;
  sampledCount: number;
  pageTypeSampled: string[];
  pages: PageSampleCheck[];
  note: string;
}

// ─── Updated SF analysis ─────────────────────────────────────────────────────

export interface SFAnalysis {
  httpStatus: SFHttpStatusCheck;
  canonical: SFCanonicalCheck;
  indexability: SFIndexabilityCheck;
  titles: SFTitleCheck;
  descriptions: SFDescriptionCheck;
  h1s: SFH1Check;
  h2s: SFH2Check;
  content: SFContentCheck;
  urlStructure: SFUrlCheck;
  crawlDepth: SFCrawlDepthCheck;
  responseTimes: SFResponseTimeCheck;
  // Extended checks (require additional SF export sheets)
  imagesAlt?: SFImagesAltCheck;
  internalLinks?: SFInternalLinksCheck;
  redirectChains?: SFRedirectChainCheck;
  titleH1Match?: SFTitleH1MatchCheck;
  pagination?: SFPaginationCheck;
}

// ─── Custom 404 check ────────────────────────────────────────────────────────
export interface Custom404Check {
  status: TechCheckStatus;
  returns404: boolean;         // сервер повертає HTTP 404 для неіснуючих URL
  hasBrandedPage: boolean;     // наявна кастомна branded 404-сторінка
  redirectsToHome: boolean;    // редирект на головну замість 404
  checkedUrl: string;
  note: string;
}

// ─── Mobile PageSpeed (окремо від desktop) ───────────────────────────────────
export interface MobilePageSpeedCheck {
  status: TechCheckStatus;
  performanceScore: number | null;    // 0-100 для mobile
  lcpMs: number | null;
  clsScore: number | null;
  fcpMs: number | null;
  tbtMs: number | null;
  note: string;
}

// ─── RSS / Atom feed ─────────────────────────────────────────────────────────
export interface RssFeedCheck {
  status: TechCheckStatus;
  found: boolean;
  feedUrls: string[];          // знайдені URL фідів
  feedType: string | null;     // "RSS" | "Atom" | null
  note: string;
}

// ─── HTTP/2 підтримка ─────────────────────────────────────────────────────────
export interface Http2Check {
  status: TechCheckStatus;
  supported: boolean;
  protocol: string | null;     // "HTTP/1.1" | "HTTP/2" | "HTTP/3" | null
  note: string;
}

// ─── Оптимізація зображень (з домашньої сторінки) ────────────────────────────
export interface ImageOptCheck {
  status: TechCheckStatus;
  totalImgs: number;
  lazyLoadedImgs: number;      // кількість з loading="lazy"
  lazyLoadRatio: number;       // 0-1
  hasWebP: boolean;            // використовуються WebP або AVIF
  hasModernFormat: boolean;    // WebP або AVIF наявні в src
  oversizedImgs: number;       // без width/height атрибутів
  note: string;
}

// ─── Внутрішні посилання домашньої сторінки ──────────────────────────────────
export interface InternalLinksCheck {
  status: TechCheckStatus;
  totalInternalLinks: number;
  totalExternalLinks: number;
  noFollowExternal: number;    // external з rel="nofollow"
  anchorTextEmpty: number;     // посилання без тексту (лише іконки)
  note: string;
}

// ─── Cookie / GDPR ───────────────────────────────────────────────────────────
export interface CookieConsentCheck {
  status: TechCheckStatus;
  detected: boolean;           // знайдено cookie banner або consent скрипт
  provider: string | null;     // "Cookiebot" | "OneTrust" | "CookieYes" | "Custom" | null
  note: string;
}

export interface TechAuditResult {
  domain: string;
  checkedAt: string;
  mirror: MirrorCheck;
  https: HttpsCheck;
  robotsTxt: RobotsTxtCheck;
  sitemap: SitemapCheck;
  pageSpeed?: PageSpeedCheck;
  structuredData?: StructuredDataCheck;
  openGraph?: OpenGraphCheck;
  securityHeaders?: SecurityHeadersCheck;
  analytics?: AnalyticsCheck;
  compression?: CompressionCheck;
  serverInfo?: ServerInfoCheck;
  hreflang?: HreflangCheck;
  pageTech?: PageTechCheck;
  custom404?: Custom404Check;       // перевірка кастомної 404-сторінки
  // ── Нові розширені перевірки ──────────────────────────────────────────────
  mobilePageSpeed?: MobilePageSpeedCheck;  // окремий PageSpeed для мобільних
  rssFeed?: RssFeedCheck;                  // RSS / Atom feed
  http2?: Http2Check;                      // HTTP/2 підтримка
  imageOpt?: ImageOptCheck;               // оптимізація зображень
  internalLinks?: InternalLinksCheck;     // внутрішні посилання
  cookieConsent?: CookieConsentCheck;     // GDPR / cookie consent
  error?: string;
}

// ─── AI Page-Type Analysis ────────────────────────────────────────────────────
export interface PageTypeAnalysis {
  pageType: PageType;
  pageCount: number;
  issueCount: number;
  summary: string;          // Ukrainian
  recommendations: string[]; // Ukrainian bullet list
  priority: "critical" | "high" | "medium" | "low";
}

export interface AiAuditAnalysis {
  createdAt: string;
  provider: AIProvider;
  model: string;
  pageTypeAnalyses: PageTypeAnalysis[];
  overallSummary: string;  // Ukrainian
}

// ─── Google OAuth / GSC / GA4 налаштування ────────────────────────────────────
export interface GoogleOAuthSettings {
  clientId: string;    // OAuth 2.0 Client ID з Google Cloud Console
}

// ─── GSC (Google Search Console) ─────────────────────────────────────────────
export interface GscProperty {
  siteUrl: string;
  permissionLevel: string;
}

export interface GscSearchQuery {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscPageData {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscCoverageData {
  excluded?: number;
  valid?: number;
  error?: number;
  warning?: number;
}

// ─── GSC Сайтмапи ─────────────────────────────────────────────────────────────
export interface GscSitemapContent {
  type: string;         // "web" | "image" | "video" | "news"
  submitted: number;    // кількість URL у сайтмапі
  indexed: number;      // кількість проіндексованих URL
}

export interface GscSitemapData {
  path: string;                    // URL сайтмапи
  lastDownloaded: string | null;   // дата останнього завантаження Googlebot
  isPending: boolean;
  isSitemapsIndex: boolean;        // чи є це індексним файлом
  type: string;                    // "sitemap" | "sitemapsIndex"
  warnings: number;                // кількість попереджень
  errors: number;                  // кількість помилок
  contents: GscSitemapContent[];
  totalSubmitted: number;          // всього URL подано
  totalIndexed: number;            // всього URL проіндексовано
}

// ─── GSC Помилки сканування ───────────────────────────────────────────────────
export interface GscCrawlErrorCategory {
  category: string;    // "notFound" | "serverError" | "soft404" | "roboted" | "authPermission" | "other"
  platform: string;    // "web" | "mobile"
  latestCount: number; // кількість помилок станом на останній знімок
  trend: "up" | "down" | "stable";  // тренд (порівняно з тижнем тому)
}

export interface GscCrawlErrorSample {
  pageUrl: string;
  lastCrawled: string | null;
  responseCode: number | null;
  linkedFromUrls?: string[];   // сторінки, що посилаються на цей URL
}

export interface GscCrawlErrors {
  categories: GscCrawlErrorCategory[];
  sampleUrls?: GscCrawlErrorSample[];  // зразки URL для категорії notFound
  totalErrors: number;
}

// ─── GSC Розбивка по країнах ──────────────────────────────────────────────────
export interface GscCountryData {
  country: string;      // код країни (ISO 3166-1 alpha-3, напр. "ukr", "usa", "deu")
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

// ─── GSC Розбивка по пристроях (пошук) ───────────────────────────────────────
export interface GscSearchDeviceData {
  device: string;       // "MOBILE" | "DESKTOP" | "TABLET"
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  clicksPct: number;    // частка кліків (%)
}

// ─── GSC Тренд по датах ──────────────────────────────────────────────────────
export interface GscDateData {
  date: string;         // YYYY-MM-DD
  clicks: number;
  impressions: number;
}

// ─── GSC Результат розширеного аудиту ─────────────────────────────────────────
export interface GscAuditResult {
  property: string;
  dateRange: { start: string; end: string };
  totalClicks: number;
  totalImpressions: number;
  avgCtr: number;
  avgPosition: number;
  topQueries: GscSearchQuery[];
  topPages: GscPageData[];
  // Проблемні сторінки (низький CTR, висока позиція)
  lowCtrHighPos: GscPageData[];
  // Сторінки на позиції 4-10 (потенціал для зростання)
  position4to10: GscSearchQuery[];
  // ── Нові поля (розширений аудит) ──────────────────────────────────────────
  // Сайтмапи зі Search Console
  sitemaps?: GscSitemapData[];
  // Помилки сканування Googlebot
  crawlErrors?: GscCrawlErrors;
  // Розбивка по країнах (топ-10 за кліками)
  topCountries?: GscCountryData[];
  // Розбивка по пристроях у пошуку
  searchDeviceBreakdown?: GscSearchDeviceData[];
  // Тренд кліків/показів по датах
  dateTrend?: GscDateData[];
  // Примітка: ручні дії API не повертає — посилання для ручної перевірки
  manualActionsUrl?: string;
  createdAt: string;
}

// ─── GA4 (Google Analytics 4) ────────────────────────────────────────────────
export interface Ga4Property {
  property: string;   // projects/123/locations/global/catalogs/default_catalog
  displayName: string;
  account: string;
}

export interface Ga4AuditResult {
  property: string;
  dateRange: { start: string; end: string };
  sessions: number;
  users: number;
  newUsers: number;
  bounceRate: number;
  avgSessionDuration: number;
  topPages: Array<{ page: string; sessions: number; bounceRate: number }>;
  topSources: Array<{ source: string; medium: string; sessions: number }>;
  deviceBreakdown: Array<{ device: string; sessions: number; pct: number }>;
  createdAt: string;
}

// ─── Settings ─────────────────────────────────────────────────────────────────
export interface AppSettings {
  aiProviders: Record<AIProvider, Partial<AIProviderConfig>>;
  defaultProvider?: AIProvider;
  theme: "light" | "dark" | "system";
  googleOAuth?: GoogleOAuthSettings;
}

// ─── Export ───────────────────────────────────────────────────────────────────
export interface ExportOptions {
  format: "md" | "json" | "csv";
  includeSummary: boolean;
  includeFindings: boolean;
  includeEvidence: boolean;
  includeDeveloperHints: boolean;
  includeTechAudit: boolean;     // технічний аудит (HTTP/2, PageSpeed, тощо)
  includeGscAudit: boolean;      // Google Search Console дані
  includeGa4Audit: boolean;      // Google Analytics 4 дані
  includeAiAnalysis: boolean;    // AI-аудит по типах сторінок
  severityFilter: Severity[];
  checkedFilter: "all" | "checked" | "unchecked";
}
