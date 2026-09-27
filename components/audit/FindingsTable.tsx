"use client";

import { useState, useMemo } from "react";
import { CheckSquare, Square, ChevronDown, ChevronRight, ExternalLink, Filter, StickyNote } from "lucide-react";
import type { Finding, Severity } from "@/types";
import { useProjectStore } from "@/lib/store/project-store";
import { SeverityBadge } from "./SeverityBadge";
import { EvidenceCard } from "./EvidenceCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];

interface FindingsTableProps {
  findings: Finding[];
  projectId: string;
  auditId: string;
}

interface FindingRowProps {
  finding: Finding;
  projectId: string;
  auditId: string;
}

function FindingRow({ finding, projectId, auditId }: FindingRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [noteText, setNoteText] = useState(finding.notes || "");

  const { toggleFindingChecked, updateFindingNote } = useProjectStore();

  const handleToggle = () => {
    toggleFindingChecked(projectId, auditId, finding.ruleId, finding.url);
  };

  const handleSaveNote = () => {
    updateFindingNote(projectId, auditId, finding.ruleId, finding.url, noteText);
    setEditingNote(false);
  };

  return (
    <div className={cn(
      "border rounded-lg transition-colors",
      finding.checked
        ? "border-green-200 bg-green-50/30 dark:border-green-900 dark:bg-green-950/20"
        : "border-border bg-card"
    )}>
      {/* Main row */}
      <div className="flex items-start gap-3 p-3">
        {/* Checkbox */}
        <button
          onClick={handleToggle}
          className={cn(
            "mt-0.5 flex-shrink-0 transition-colors",
            finding.checked ? "text-green-500" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {finding.checked
            ? <CheckSquare className="h-5 w-5" />
            : <Square className="h-5 w-5" />
          }
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <SeverityBadge severity={finding.severity} />
                <span className={cn(
                  "font-medium text-sm",
                  finding.checked && "line-through text-muted-foreground"
                )}>
                  {finding.ruleTitle}
                </span>
                {finding.affectedCount && finding.affectedCount > 1 && (
                  <span className="text-xs text-muted-foreground bg-muted rounded px-1.5 py-0.5">
                    {finding.affectedCount} сторінок
                  </span>
                )}
              </div>

              {/* URL */}
              <div className="flex items-center gap-1 mt-1">
                <span className="text-xs text-muted-foreground truncate font-mono">{finding.url}</span>
                <a
                  href={finding.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              {/* Page type + confidence */}
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                <span>Тип: {finding.pageType}</span>
                <span>Confidence: {Math.round(finding.confidence * 100)}%</span>
              </div>
            </div>

            {/* Expand button */}
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex-shrink-0 text-muted-foreground hover:text-foreground mt-0.5"
            >
              {expanded
                ? <ChevronDown className="h-4 w-4" />
                : <ChevronRight className="h-4 w-4" />
              }
            </button>
          </div>

          {/* Expanded details */}
          {expanded && (
            <div className="mt-3 space-y-3 border-t pt-3">
              {finding.recommendation && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Рекомендація</p>
                  <p className="text-sm">{finding.recommendation}</p>
                </div>
              )}

              {finding.developerHint && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Для розробника</p>
                  <p className="text-sm font-mono bg-muted rounded p-2 text-xs">{finding.developerHint}</p>
                </div>
              )}

              {finding.aiExplanation && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">AI-аналіз</p>
                  <p className="text-sm text-muted-foreground">{finding.aiExplanation}</p>
                </div>
              )}

              <EvidenceCard evidence={finding.evidence} />

              {/* Notes */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Нотатки</p>
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
                      placeholder="Додати нотатку..."
                      className="text-sm min-h-[80px]"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSaveNote}>Зберегти</Button>
                      <Button size="sm" variant="outline" onClick={() => { setEditingNote(false); setNoteText(finding.notes || ""); }}>
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

export function FindingsTable({ findings, projectId, auditId }: FindingsTableProps) {
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState<Severity | "all">("all");
  const [checkedFilter, setCheckedFilter] = useState<"all" | "checked" | "unchecked">("all");
  const [groupBy, setGroupBy] = useState<"severity" | "url" | "rule">("severity");

  const filtered = useMemo(() => {
    let result = findings;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (f) =>
          f.ruleTitle.toLowerCase().includes(q) ||
          f.url.toLowerCase().includes(q) ||
          f.recommendation?.toLowerCase().includes(q)
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
    if (groupBy === "severity") {
      return SEVERITY_ORDER.reduce((acc, sev) => {
        const items = filtered.filter((f) => f.severity === sev);
        if (items.length > 0) acc[sev] = items;
        return acc;
      }, {} as Record<string, Finding[]>);
    }
    // flat for url/rule grouping (simplified)
    return { all: filtered };
  }, [filtered, groupBy]);

  const totalChecked = findings.filter((f) => f.checked).length;
  const pct = findings.length > 0 ? Math.round((totalChecked / findings.length) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {totalChecked}/{findings.length} ({pct}%)
        </span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="flex-1 min-w-[200px]">
          <Input
            placeholder="Пошук за URL, правилом, рекомендацією..."
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
      <p className="text-sm text-muted-foreground">
        Показано {filtered.length} з {findings.length} проблем
      </p>

      {/* Groups */}
      {Object.entries(grouped).map(([group, items]) => (
        <FindingGroup
          key={group}
          group={group}
          items={items}
          projectId={projectId}
          auditId={auditId}
        />
      ))}

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Filter className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>Проблем не знайдено</p>
        </div>
      )}
    </div>
  );
}

function FindingGroup({
  group,
  items,
  projectId,
  auditId,
}: {
  group: string;
  items: Finding[];
  projectId: string;
  auditId: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const checkedCount = items.filter((f) => f.checked).length;

  const SEVERITY_LABELS: Record<string, string> = {
    critical: "🔴 Критичні",
    high: "🟠 Високі",
    medium: "🟡 Середні",
    low: "🔵 Низькі",
    info: "⚪ Інфо",
    all: "Всі проблеми",
  };

  const label = SEVERITY_LABELS[group] || group;

  return (
    <div>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 w-full text-left py-2 group"
      >
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        <span className="font-semibold text-sm">{label}</span>
        <span className="text-xs text-muted-foreground">
          ({items.length} проблем, {checkedCount} вирішено)
        </span>
      </button>

      {!collapsed && (
        <div className="space-y-2 ml-2">
          {items.map((finding, i) => (
            <FindingRow
              key={`${finding.ruleId}-${finding.url}-${i}`}
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
