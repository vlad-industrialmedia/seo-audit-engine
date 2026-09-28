"use client";

import { useState, useMemo } from "react";
import {
  CheckSquare, Square, ChevronDown, ChevronRight, ExternalLink,
  Filter, StickyNote, Sparkles, Loader2, ShieldCheck, ShieldAlert,
  ShieldQuestion, List,
} from "lucide-react";
import type { Finding, Severity, AIProvider } from "@/types";
import { useProjectStore } from "@/lib/store/project-store";
import { SeverityBadge } from "./SeverityBadge";
import { EvidenceCard } from "./EvidenceCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];
const VERIFY_THRESHOLD = 10; // Show "Verify live" when this many pages affected

interface FindingsTableProps {
  findings: Finding[];
  projectId: string;
  auditId: string;
}

// ─── Single Rule Card ────────────────────────────────────────────────────────

function FindingCard({
  finding,
  projectId,
  auditId,
}: {
  finding: Finding;
  projectId: string;
  auditId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showAllUrls, setShowAllUrls] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [noteText, setNoteText] = useState(finding.notes || "");
  const [loadingAI, setLoadingAI] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const {
    toggleFindingChecked,
    updateFindingNote,
    updateFindingAiExplanation,
    updateFindingVerification,
    settings,
  } = useProjectStore();

  const affectedUrls = finding.affectedUrls ?? [finding.url];
  const totalAffected = finding.affectedCount ?? affectedUrls.length;
  const canVerify = totalAffected >= VERIFY_THRESHOLD;
  const urlsToShow = showAllUrls ? affectedUrls : affectedUrls.slice(0, 5);

  const handleToggle = () => {
    toggleFindingChecked(projectId, auditId, finding.ruleId, finding.url);
  };

  const handleSaveNote = () => {
    updateFindingNote(projectId, auditId, finding.ruleId, finding.url, noteText);
    setEditingNote(false);
    toast.success("Нотатку збережено");
  };

  const handleAIExplain = async () => {
    const provider = (
      settings.defaultProvider ||
      (Object.entries(settings.aiProviders).find(([, v]) => v.validated)?.[0] as AIProvider | undefined)
    );
    if (!provider) {
      toast.error("Налаштуйте AI-провайдер у Налаштуваннях");
      return;
    }
    const cfg = settings.aiProviders[provider];
    if (!cfg?.apiKey) {
      toast.error(`Немає API-ключа для ${cfg?.label ?? provider}`);
      return;
    }

    setLoadingAI(true);
    try {
      const sampleUrls = affectedUrls.slice(0, 3).join(", ");
      const prompt = `You are an SEO expert. Analyze this finding and provide a concise 2-3 sentence explanation (in Ukrainian) of why it matters, its SEO impact, and a specific actionable fix beyond the recommendation.

Rule: ${finding.ruleTitle}
Affected pages: ${totalAffected} (samples: ${sampleUrls})
Severity: ${finding.severity}
Evidence: ${JSON.stringify(finding.evidence)}
Recommendation: ${finding.recommendation ?? ""}`;

      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, provider, apiKey: cfg.apiKey, model: cfg.model }),
      });
      const data = await res.json() as { result?: unknown; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "Помилка API");
      const text = typeof data.result === "string" ? data.result : JSON.stringify(data.result);
      updateFindingAiExplanation(projectId, auditId, finding.ruleId, finding.url, text);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI-аналіз не вдався");
    } finally {
      setLoadingAI(false);
    }
  };

  const handleVerifyLive = async () => {
    setVerifying(true);
    try {
      const res = await fetch("/api/verify-finding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: affectedUrls, ruleId: finding.ruleId }),
      });
      const data = await res.json() as {
        status?: "verified" | "false_positive" | "unverified";
        note?: string;
        checks?: Array<{ url: string; issueFound: boolean; note: string }>;
        error?: string;
      };
      if (!res.ok || data.error) throw new Error(data.error ?? "Помилка верифікації");

      updateFindingVerification(
        projectId,
        auditId,
        finding.ruleId,
        data.status ?? "unverified",
        data.note ?? ""
      );

      if (data.status === "false_positive") {
        toast.success("Хибно-позитивне спрацювання — проблема відсутня на живих сторінках");
      } else if (data.status === "verified") {
        toast.warning("Проблема підтверджена на живих сторінках");
      } else {
        toast.info("Результат верифікації: неоднозначний");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Помилка верифікації");
    } finally {
      setVerifying(false);
    }
  };

  const verStatus = finding.verificationStatus;

  return (
    <div className={cn(
      "border rounded-lg transition-all",
      finding.checked
        ? "border-green-200 bg-green-50/30 dark:border-green-900 dark:bg-green-950/20"
        : verStatus === "false_positive"
          ? "border-yellow-200 bg-yellow-50/20 dark:border-yellow-900 dark:bg-yellow-950/10"
          : "border-border bg-card"
    )}>
      {/* Header row */}
      <div className="flex items-start gap-3 p-3">
        {/* Checkbox */}
        <button
          onClick={handleToggle}
          className={cn(
            "mt-0.5 flex-shrink-0 transition-colors",
            finding.checked ? "text-green-500" : "text-muted-foreground hover:text-foreground"
          )}
          title={finding.checked ? "Позначити як не вирішено" : "Позначити як вирішено"}
        >
          {finding.checked ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              {/* Title row */}
              <div className="flex items-center gap-2 flex-wrap">
                <SeverityBadge severity={finding.severity} />
                <span className={cn(
                  "font-semibold text-sm",
                  finding.checked && "line-through text-muted-foreground"
                )}>
                  {finding.ruleTitle}
                </span>

                {/* Affected count badge */}
                <span className={cn(
                  "text-xs rounded-full px-2 py-0.5 font-medium",
                  totalAffected >= 50
                    ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400"
                    : totalAffected >= 10
                      ? "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-400"
                      : "bg-muted text-muted-foreground"
                )}>
                  {totalAffected === 1 ? "1 сторінка" : `${totalAffected} сторінок`}
                </span>

                {/* Verification status */}
                {verStatus === "false_positive" && (
                  <span className="flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded px-1.5 py-0.5">
                    <ShieldAlert className="h-3 w-3" />
                    Хибно-позитивне
                  </span>
                )}
                {verStatus === "verified" && (
                  <span className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded px-1.5 py-0.5">
                    <ShieldCheck className="h-3 w-3" />
                    Підтверджено
                  </span>
                )}
              </div>

              {/* Verification note */}
              {finding.verificationNote && (
                <p className="text-xs text-muted-foreground mt-1 italic">
                  🔍 {finding.verificationNote}
                </p>
              )}

              {/* Quick URL preview */}
              {!expanded && totalAffected === 1 && (
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-xs text-muted-foreground truncate font-mono">{finding.url}</span>
                  <a href={finding.url} target="_blank" rel="noopener noreferrer"
                    className="flex-shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={(e) => e.stopPropagation()}>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
            </div>

            {/* Actions + expand */}
            <div className="flex items-center gap-1 flex-shrink-0">
              {/* Verify live button */}
              {canVerify && verStatus !== "false_positive" && verStatus !== "verified" && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleVerifyLive(); }}
                  disabled={verifying}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-border hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
                  title="Перевірити на живих сторінках"
                >
                  {verifying
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <ShieldQuestion className="h-3 w-3" />
                  }
                  {verifying ? "Перевірка..." : "Перевірити"}
                </button>
              )}

              <button
                onClick={() => setExpanded(!expanded)}
                className="text-muted-foreground hover:text-foreground p-1"
              >
                {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Expanded details */}
          {expanded && (
            <div className="mt-3 space-y-3 border-t pt-3">

              {/* Affected URLs list */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Уражені сторінки ({totalAffected})
                  </p>
                  {totalAffected > VERIFY_THRESHOLD && (
                    <button
                      onClick={handleVerifyLive}
                      disabled={verifying || verStatus === "false_positive" || verStatus === "verified"}
                      className="flex items-center gap-1 text-xs px-2 py-0.5 rounded border border-border hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
                    >
                      {verifying
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <ShieldQuestion className="h-3 w-3" />
                      }
                      {verifying ? "Перевірка..." : "Перевірити 2 сторінки"}
                    </button>
                  )}
                </div>
                <div className="space-y-0.5 font-mono text-xs max-h-48 overflow-y-auto">
                  {urlsToShow.map((url) => (
                    <div key={url} className="flex items-center gap-1 group">
                      <span className="truncate text-muted-foreground group-hover:text-foreground transition-colors">
                        {url}
                      </span>
                      <a href={url} target="_blank" rel="noopener noreferrer"
                        className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-all">
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  ))}
                </div>
                {affectedUrls.length > 5 && (
                  <button
                    onClick={() => setShowAllUrls(!showAllUrls)}
                    className="mt-1 flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <List className="h-3 w-3" />
                    {showAllUrls
                      ? "Сховати"
                      : `Показати всі ${affectedUrls.length} URL`
                    }
                  </button>
                )}
              </div>

              {/* Recommendation */}
              {finding.recommendation && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    Рекомендація
                  </p>
                  <p className="text-sm">{finding.recommendation}</p>
                </div>
              )}

              {/* Developer hint */}
              {finding.developerHint && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    Для розробника
                  </p>
                  <p className="text-sm font-mono bg-muted rounded p-2 text-xs whitespace-pre-wrap">
                    {finding.developerHint}
                  </p>
                </div>
              )}

              {/* AI explanation */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    AI-аналіз
                  </p>
                  <button
                    onClick={handleAIExplain}
                    disabled={loadingAI}
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 disabled:opacity-50"
                  >
                    {loadingAI
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <Sparkles className="h-3 w-3" />
                    }
                    {loadingAI ? "Аналізую..." : finding.aiExplanation ? "Оновити" : "Пояснити"}
                  </button>
                </div>
                {finding.aiExplanation
                  ? <p className="text-sm text-muted-foreground">{finding.aiExplanation}</p>
                  : !loadingAI && (
                    <p className="text-xs text-muted-foreground italic">
                      Натисніть «Пояснити» для AI-аналізу
                    </p>
                  )
                }
              </div>

              {/* Evidence */}
              <EvidenceCard evidence={finding.evidence} />

              {/* Notes */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Нотатки
                  </p>
                  {!editingNote && (
                    <button
                      onClick={() => setEditingNote(true)}
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                    >
                      <StickyNote className="h-3 w-3" />
                      {finding.notes ? "Редагувати" : "Додати"}
                    </button>
                  )}
                </div>
                {editingNote ? (
                  <div className="space-y-2">
                    <Textarea
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder="Додайте нотатку про цю проблему..."
                      className="text-sm min-h-[80px]"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSaveNote}>Зберегти</Button>
                      <Button size="sm" variant="outline" onClick={() => {
                        setEditingNote(false);
                        setNoteText(finding.notes || "");
                      }}>
                        Скасувати
                      </Button>
                    </div>
                  </div>
                ) : finding.notes ? (
                  <p className="text-sm text-muted-foreground italic">{finding.notes}</p>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Severity Group ──────────────────────────────────────────────────────────

const SEVERITY_LABELS: Record<Severity, string> = {
  critical: "🔴 Критичні",
  high: "🟠 Високі",
  medium: "🟡 Середні",
  low: "🔵 Низькі",
  info: "⚪ Інформаційні",
};

function SeverityGroup({
  severity,
  items,
  projectId,
  auditId,
}: {
  severity: Severity;
  items: Finding[];
  projectId: string;
  auditId: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const checkedCount = items.filter((f) => f.checked).length;

  return (
    <div>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 w-full text-left py-2 group"
      >
        {collapsed
          ? <ChevronRight className="h-4 w-4 text-muted-foreground" />
          : <ChevronDown className="h-4 w-4 text-muted-foreground" />
        }
        <span className="font-semibold text-sm">{SEVERITY_LABELS[severity]}</span>
        <span className="text-xs text-muted-foreground">
          ({items.length} {items.length === 1 ? "правило" : "правил"},{" "}
          {checkedCount} вирішено)
        </span>
      </button>

      {!collapsed && (
        <div className="space-y-2 ml-2 mb-4">
          {items.map((finding) => (
            <FindingCard
              key={finding.ruleId}
              finding={finding}
              projectId={projectId}
              auditId={auditId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Table ──────────────────────────────────────────────────────────────

export function FindingsTable({ findings, projectId, auditId }: FindingsTableProps) {
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState<Severity | "all">("all");
  const [checkedFilter, setCheckedFilter] = useState<"all" | "checked" | "unchecked">("unchecked");

  const filtered = useMemo(() => {
    let result = findings;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (f) =>
          f.ruleTitle.toLowerCase().includes(q) ||
          f.url.toLowerCase().includes(q) ||
          f.recommendation?.toLowerCase().includes(q) ||
          f.affectedUrls?.some((u) => u.toLowerCase().includes(q))
      );
    }

    if (severityFilter !== "all") {
      result = result.filter((f) => f.severity === severityFilter);
    }

    if (checkedFilter === "checked") {
      result = result.filter((f) => f.checked);
    } else if (checkedFilter === "unchecked") {
      result = result.filter((f) => !f.checked);
    }

    return result;
  }, [findings, search, severityFilter, checkedFilter]);

  const grouped = useMemo(() => {
    return SEVERITY_ORDER.reduce((acc, sev) => {
      const items = filtered.filter((f) => f.severity === sev);
      if (items.length > 0) acc[sev] = items;
      return acc;
    }, {} as Partial<Record<Severity, Finding[]>>);
  }, [filtered]);

  const totalChecked = findings.filter((f) => f.checked).length;
  const totalRules = findings.length;
  const totalPages = findings.reduce((sum, f) => sum + (f.affectedCount ?? 1), 0);
  const pct = totalRules > 0 ? Math.round((totalChecked / totalRules) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Stats + progress */}
      <div className="rounded-lg border bg-card p-3 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            <strong className="text-foreground">{totalRules}</strong> правил ·{" "}
            <strong className="text-foreground">{totalPages.toLocaleString()}</strong> сторінок уражено
          </span>
          <span className="text-muted-foreground">
            {totalChecked}/{totalRules} вирішено ({pct}%)
          </span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 transition-all duration-500 rounded-full"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="flex-1 min-w-[200px]">
          <Input
            placeholder="Пошук за правилом, URL, рекомендацією..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-sm"
          />
        </div>

        <div className="flex gap-1 flex-wrap">
          {(["all", "critical", "high", "medium", "low", "info"] as const).map((sev) => (
            <button
              key={sev}
              onClick={() => setSeverityFilter(sev)}
              className={cn(
                "px-2 py-1 text-xs rounded-md border transition-colors",
                severityFilter === sev
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:bg-accent"
              )}
            >
              {sev === "all" ? "Всі" : sev}
            </button>
          ))}
        </div>

        <div className="flex gap-1">
          {(["all", "unchecked", "checked"] as const).map((val) => (
            <button
              key={val}
              onClick={() => setCheckedFilter(val)}
              className={cn(
                "px-2 py-1 text-xs rounded-md border transition-colors",
                checkedFilter === val
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:bg-accent"
              )}
            >
              {val === "all" ? "Всі" : val === "checked" ? "✓ Вирішені" : "○ Активні"}
            </button>
          ))}
        </div>
      </div>

      {/* Count */}
      <p className="text-xs text-muted-foreground">
        Показано {filtered.length} з {findings.length} правил
      </p>

      {/* Severity groups */}
      {Object.keys(grouped).length > 0 ? (
        (SEVERITY_ORDER.filter((s) => grouped[s]) as Severity[]).map((sev) => (
          <SeverityGroup
            key={sev}
            severity={sev}
            items={grouped[sev]!}
            projectId={projectId}
            auditId={auditId}
          />
        ))
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <Filter className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>Проблем не знайдено за вибраними фільтрами</p>
        </div>
      )}
    </div>
  );
}
