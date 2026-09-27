import type { Rule, RuleCondition, PagePassport, Finding, Severity, PageType } from "@/types";
import { SEO_CORE_RULES } from "@/lib/rules/seo-core";
import { detectPageType } from "@/lib/sf-parser";

// ─── Condition Evaluator ──────────────────────────────────────────────────────
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    // Handle array indexing like h1[0]
    const arrMatch = part.match(/^(.+)\[(\d+)\]$/);
    if (arrMatch) {
      const [, key, idx] = arrMatch;
      current = (current as Record<string, unknown>)?.[key];
      current = (current as unknown[])?.[parseInt(idx)];
    } else {
      current = (current as Record<string, unknown>)?.[part];
    }
    if (current === undefined) return undefined;
  }
  return current;
}

function evaluateCondition(
  condition: RuleCondition,
  page: Record<string, unknown>
): boolean {
  const value = getNestedValue(page, condition.field);

  switch (condition.operator) {
    case "equals":
      return value === condition.value;
    case "not_equals":
      return value !== condition.value;
    case "greater_than":
      return typeof value === "number" && value > (condition.value as number);
    case "less_than":
      return typeof value === "number" && value < (condition.value as number);
    case "contains":
      if (Array.isArray(value)) {
        const condVal = condition.value as Record<string, unknown>;
        return value.some((item) =>
          Object.entries(condVal).every(([k, v]) =>
            Array.isArray((item as Record<string, unknown>)[k])
              ? ((item as Record<string, unknown>)[k] as unknown[]).includes(v)
              : (item as Record<string, unknown>)[k] === v
          )
        );
      }
      if (typeof value === "string") {
        return value.includes(condition.value as string);
      }
      return false;
    case "not_contains":
      if (Array.isArray(value)) return !value.includes(condition.value);
      if (typeof value === "string") return !value.includes(condition.value as string);
      return true;
    case "exists":
      return value !== undefined && value !== null && value !== "";
    case "not_exists":
      return value === undefined || value === null || value === "";
    case "in":
      return Array.isArray(condition.value) && (condition.value as unknown[]).includes(value);
    case "not_in":
      return !Array.isArray(condition.value) || !(condition.value as unknown[]).includes(value);
    default:
      return false;
  }
}

function checkExceptions(
  rule: Rule,
  page: Record<string, unknown>
): boolean {
  if (!rule.exceptions || rule.exceptions.length === 0) return false;

  return rule.exceptions.some((exc) => {
    if (exc.pattern) {
      const fieldValue = getNestedValue(page, exc.field);
      if (typeof fieldValue === "string") {
        return fieldValue.includes(exc.pattern);
      }
      return false;
    }
    if (exc.value !== undefined) {
      return getNestedValue(page, exc.field) === exc.value;
    }
    return false;
  });
}

function getEffectiveSeverity(rule: Rule, pageType: PageType): Severity {
  if (rule.pageTypeWeights && rule.pageTypeWeights[pageType]) {
    return rule.pageTypeWeights[pageType]!;
  }
  return rule.severityDefault;
}

// ─── Collect evidence ─────────────────────────────────────────────────────────
function collectEvidence(
  rule: Rule,
  page: Record<string, unknown>
): Record<string, unknown> {
  const evidence: Record<string, unknown> = {};
  for (const field of rule.evidence) {
    const value = getNestedValue(page, field);
    if (value !== undefined) {
      evidence[field] = value;
    }
  }
  return evidence;
}

// ─── Run a single rule against a page ────────────────────────────────────────
export function runRule(
  rule: Rule,
  page: PagePassport
): Finding | null {
  if (!rule.enabled) return null;

  const pageData = page as unknown as Record<string, unknown>;

  // Check exceptions first
  if (checkExceptions(rule, pageData)) return null;

  // All conditions must pass (AND logic)
  if (rule.conditions.length > 0) {
    const allPass = rule.conditions.every((c) => evaluateCondition(c, pageData));
    if (!allPass) return null;
  } else {
    // Rules with no conditions are handled by special logic (e.g., heading.hierarchy.gap)
    if (!runSpecialRule(rule, page)) return null;
  }

  return {
    ruleId: rule.id,
    ruleTitle: rule.title,
    severity: getEffectiveSeverity(rule, page.pageType),
    confidence: 1.0,
    url: page.url,
    pageType: page.pageType,
    evidence: collectEvidence(rule, pageData),
    recommendation: rule.recommendation,
    developerHint: rule.developerHint,
    checked: false,
  };
}

// Special rules that require custom logic beyond simple conditions
function runSpecialRule(rule: Rule, page: PagePassport): boolean {
  switch (rule.id) {
    case "heading.hierarchy.gap": {
      const h = page.headings.semantic;
      const levels = [
        h.h1.length > 0 ? 1 : null,
        h.h2.length > 0 ? 2 : null,
        h.h3.length > 0 ? 3 : null,
        h.h4.length > 0 ? 4 : null,
        h.h5.length > 0 ? 5 : null,
        h.h6.length > 0 ? 6 : null,
      ].filter((l): l is number => l !== null);

      for (let i = 1; i < levels.length; i++) {
        if (levels[i] - levels[i - 1] > 1) return true;
      }
      return false;
    }
    default:
      return false;
  }
}

// ─── Run all rules against a page ────────────────────────────────────────────
export function runAllRules(
  page: PagePassport,
  enabledPacks: string[] = ["seo_core"]
): Finding[] {
  const rules = SEO_CORE_RULES.filter(
    (r) => r.enabled && enabledPacks.includes(r.rulePack)
  );

  const findings: Finding[] = [];
  for (const rule of rules) {
    const finding = runRule(rule, page);
    if (finding) {
      findings.push(finding);
    }
  }

  return findings;
}

// ─── Convert SF row to PagePassport (minimal, without Playwright data) ────────
export function sfRowToPagePassport(row: import("@/types").SFRow): PagePassport {
  const { type: pageType, confidence: pageTypeConfidence } =
    detectPageType(row.address);

  const statusCode = row.statusCode || row.httpStatusCode || 200;
  const isNoindex = (row.metaRobots1 || "").toLowerCase().includes("noindex");
  const isIndexable = (row.indexability || "").toLowerCase() === "indexable" || !isNoindex;
  const canonical = row.canonicalLinkElement1 || "";
  const canonicalSelf = !canonical || canonical === row.address;

  const h1List = row.h1_1 ? [row.h1_1] : [];
  const h2List = row.h2_1 ? [row.h2_1] : [];

  const redirectChain: Array<{ url: string; statusCode: number }> = [];
  if (row.redirectURL && row.redirectURL !== row.address) {
    redirectChain.push({ url: row.redirectURL, statusCode: statusCode });
  }

  return {
    url: row.address,
    crawlSource: "screaming_frog",
    pageType,
    pageTypeConfidence,
    deepAnalyzed: false,
    crawledAt: new Date().toISOString(),
    http: {
      statusCode,
      redirectChain,
    },
    indexability: {
      indexable: isIndexable,
      reasons: isNoindex ? ["noindex_meta"] : [],
      canonicalSelf,
      canonicalUrl: canonical || undefined,
      robotsDirective: row.metaRobots1,
      noindexTag: isNoindex,
      noindexHeader: false,
    },
    meta: {
      title: row.title1,
      titleLength: row.title1Length || (row.title1 ? row.title1.length : undefined),
      description: row.metaDescription1,
      descriptionLength: row.metaDescription1Length || (row.metaDescription1 ? row.metaDescription1.length : undefined),
    },
    headings: {
      semantic: { h1: h1List, h2: h2List, h3: [], h4: [], h5: [], h6: [] },
      aria: [],
      visualCandidates: [],
      hidden: [],
      issues: [],
    },
    content: {
      wordCount: row.wordCount,
    },
    images: [],
    links: {
      internalTotal: 0,
      externalTotal: 0,
      broken: 0,
      redirecting: 0,
    },
    structuredData: {
      typesFound: [],
      hasBreadcrumb: false,
    },
    hreflang: [],
    inlinks: row.inlinks || row.uniqueInlinks,
    findings: [],
  };
}

// Async version for use in components
export async function sfRowToPagePassportAsync(
  row: import("@/types").SFRow
): Promise<PagePassport> {
  const { detectPageType } = await import("@/lib/sf-parser");
  const { type: pageType, confidence: pageTypeConfidence } = detectPageType(row.address);

  const statusCode = row.statusCode || (row.httpStatusCode as number) || 200;
  const metaRobots = (row.metaRobots1 as string || "").toLowerCase();
  const isNoindex = metaRobots.includes("noindex");
  const indexabilityStr = (row.indexability as string || "").toLowerCase();
  const isIndexable = indexabilityStr === "indexable" || (!isNoindex && statusCode < 300);
  const canonical = (row.canonicalLinkElement1 as string) || "";
  const canonicalSelf = !canonical || canonical === row.address;

  const h1List = row.h1_1 ? [row.h1_1 as string] : [];
  const h2List = row.h2_1 ? [row.h2_1 as string] : [];

  const redirectChain: Array<{ url: string; statusCode: number }> = [];
  if (row.redirectURL && row.redirectURL !== row.address) {
    redirectChain.push({ url: row.redirectURL as string, statusCode });
  }

  return {
    url: row.address,
    crawlSource: "screaming_frog",
    pageType,
    pageTypeConfidence,
    deepAnalyzed: false,
    crawledAt: new Date().toISOString(),
    http: { statusCode, redirectChain },
    indexability: {
      indexable: isIndexable,
      reasons: isNoindex ? ["noindex_meta"] : [],
      canonicalSelf,
      canonicalUrl: canonical || undefined,
      robotsDirective: row.metaRobots1 as string,
      noindexTag: isNoindex,
      noindexHeader: false,
    },
    meta: {
      title: row.title1 as string,
      titleLength: row.title1Length || (row.title1 ? String(row.title1).length : undefined),
      description: row.metaDescription1 as string,
      descriptionLength: row.metaDescription1Length || (row.metaDescription1 ? String(row.metaDescription1).length : undefined),
    },
    headings: {
      semantic: { h1: h1List, h2: h2List, h3: [], h4: [], h5: [], h6: [] },
      aria: [],
      visualCandidates: [],
      hidden: [],
      issues: [],
    },
    content: { wordCount: row.wordCount },
    images: [],
    links: { internalTotal: 0, externalTotal: 0, broken: 0, redirecting: 0 },
    structuredData: { typesFound: [], hasBreadcrumb: false },
    hreflang: [],
    inlinks: (row.inlinks as number) || (row.uniqueInlinks as number),
    findings: [],
  };
}

// ─── Aggregate findings — detect template-level issues ────────────────────────
export function aggregateFindings(allFindings: Finding[]): Finding[] {
  const grouped: Record<string, Finding[]> = {};
  for (const f of allFindings) {
    if (!grouped[f.ruleId]) grouped[f.ruleId] = [];
    grouped[f.ruleId].push(f);
  }

  const result: Finding[] = [];
  for (const [, group] of Object.entries(grouped)) {
    if (group.length === 1) {
      result.push(group[0]);
    } else {
      // Multiple pages with same issue — could be template-level
      const representative = { ...group[0], affectedCount: group.length };
      result.push(representative);
      // Also push individual findings (for detailed view)
      result.push(...group.slice(1));
    }
  }

  return result;
}

// ─── Audit summary ────────────────────────────────────────────────────────────
export function buildAuditSummary(findings: Finding[]): import("@/types").AuditSummary {
  // Deduplicate by ruleId + url for counting
  const unique = findings;
  return {
    total: unique.length,
    critical: unique.filter((f) => f.severity === "critical").length,
    high: unique.filter((f) => f.severity === "high").length,
    medium: unique.filter((f) => f.severity === "medium").length,
    low: unique.filter((f) => f.severity === "low").length,
    info: unique.filter((f) => f.severity === "info").length,
    checked: unique.filter((f) => f.checked).length,
  };
}
