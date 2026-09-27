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
export type AIProvider = "anthropic" | "openrouter" | "gemini" | "grok";

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
  url: string;
  pageType: PageType;
  evidence: Record<string, unknown>;
  recommendation?: string;
  developerHint?: string;
  aiExplanation?: string;
  affectedCount?: number; // for template-level issues
  checked?: boolean; // for checklist UI
  notes?: string; // user notes
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
  aiProvider?: AIProvider;
  aiModel?: string;
  rulePacks: string[];
  error?: string;
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
  value: unknown;
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

// ─── Settings ─────────────────────────────────────────────────────────────────
export interface AppSettings {
  aiProviders: Record<AIProvider, Partial<AIProviderConfig>>;
  defaultProvider?: AIProvider;
  theme: "light" | "dark" | "system";
}

// ─── Export ───────────────────────────────────────────────────────────────────
export interface ExportOptions {
  format: "md" | "json" | "csv";
  includeSummary: boolean;
  includeFindings: boolean;
  includeEvidence: boolean;
  includeDeveloperHints: boolean;
  severityFilter: Severity[];
  checkedFilter: "all" | "checked" | "unchecked";
}
