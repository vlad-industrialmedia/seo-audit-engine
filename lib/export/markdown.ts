import type { Audit, Finding, ExportOptions, Severity } from "@/types";
import { format } from "date-fns";

const SEVERITY_EMOJI: Record<Severity, string> = {
  critical: "🔴",
  high: "🟠",
  medium: "🟡",
  low: "🔵",
  info: "⚪",
};

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Критична",
  high: "Висока",
  medium: "Середня",
  low: "Низька",
  info: "Інфо",
};

export function exportAuditToMarkdown(audit: Audit, options: ExportOptions): string {
  const lines: string[] = [];
  const dateStr = format(new Date(audit.createdAt), "dd.MM.yyyy HH:mm");

  // Header
  lines.push(`# SEO Аудит: ${audit.name}`);
  lines.push(`\n**Дата:** ${dateStr}`);
  lines.push(`**Статус:** ${audit.status === "completed" ? "Завершено" : audit.status}`);
  lines.push(`**Сторінок проаналізовано:** ${audit.pagesAnalyzed}`);
  lines.push("");

  // Summary
  if (options.includeSummary) {
    lines.push("## 📊 Зведення");
    lines.push("");
    lines.push("| Рівень | Кількість | Перевірено |");
    lines.push("|--------|-----------|------------|");

    const s = audit.summary;
    const findings = audit.findings;
    const critical = findings.filter((f) => f.severity === "critical");
    const high = findings.filter((f) => f.severity === "high");
    const medium = findings.filter((f) => f.severity === "medium");
    const low = findings.filter((f) => f.severity === "low");

    lines.push(`| 🔴 Критичні | ${s.critical} | ${critical.filter((f) => f.checked).length}/${s.critical} |`);
    lines.push(`| 🟠 Високі | ${s.high} | ${high.filter((f) => f.checked).length}/${s.high} |`);
    lines.push(`| 🟡 Середні | ${s.medium} | ${medium.filter((f) => f.checked).length}/${s.medium} |`);
    lines.push(`| 🔵 Низькі | ${s.low} | ${low.filter((f) => f.checked).length}/${s.low} |`);
    lines.push(`| **Всього** | **${s.total}** | **${s.checked}/${s.total}** |`);
    lines.push("");

    const completionPct = s.total > 0 ? Math.round((s.checked / s.total) * 100) : 0;
    lines.push(`**Прогрес виправлення:** ${completionPct}% (${s.checked} з ${s.total} проблем позначено як вирішені)`);
    lines.push("");
  }

  // Findings
  if (options.includeFindings) {
    // Filter by severity
    let filtered = audit.findings.filter((f) =>
      options.severityFilter.includes(f.severity)
    );

    // Filter by checked status
    if (options.checkedFilter === "checked") {
      filtered = filtered.filter((f) => f.checked);
    } else if (options.checkedFilter === "unchecked") {
      filtered = filtered.filter((f) => !f.checked);
    }

    // Group by severity
    const bySeverity: Record<Severity, Finding[]> = {
      critical: [], high: [], medium: [], low: [], info: [],
    };
    for (const f of filtered) {
      bySeverity[f.severity].push(f);
    }

    const severityOrder: Severity[] = ["critical", "high", "medium", "low", "info"];

    for (const severity of severityOrder) {
      const group = bySeverity[severity];
      if (group.length === 0) continue;

      lines.push(`## ${SEVERITY_EMOJI[severity]} ${SEVERITY_LABEL[severity]} проблеми (${group.length})`);
      lines.push("");

      for (const finding of group) {
        const checkMark = finding.checked ? "[x]" : "[ ]";
        lines.push(`### ${checkMark} ${finding.ruleTitle}`);
        lines.push("");
        lines.push(`**URL:** \`${finding.url}\``);
        lines.push(`**Тип сторінки:** ${finding.pageType}`);
        if (finding.affectedCount && finding.affectedCount > 1) {
          lines.push(`**Зачіпає сторінок:** ${finding.affectedCount}`);
        }
        lines.push(`**Confidence:** ${Math.round(finding.confidence * 100)}%`);
        lines.push("");

        if (options.includeEvidence && Object.keys(finding.evidence).length > 0) {
          lines.push("**Докази:**");
          lines.push("```json");
          lines.push(JSON.stringify(finding.evidence, null, 2));
          lines.push("```");
          lines.push("");
        }

        if (finding.recommendation) {
          lines.push(`**Рекомендація:** ${finding.recommendation}`);
          lines.push("");
        }

        if (options.includeDeveloperHints && finding.developerHint) {
          lines.push(`**Для розробника:** ${finding.developerHint}`);
          lines.push("");
        }

        if (finding.aiExplanation) {
          lines.push(`**AI-аналіз:** ${finding.aiExplanation}`);
          lines.push("");
        }

        if (finding.notes) {
          lines.push(`**Нотатки:** ${finding.notes}`);
          lines.push("");
        }

        lines.push("---");
        lines.push("");
      }
    }
  }

  // Footer
  lines.push(`\n---\n*Згенеровано SEO Audit Engine · ${dateStr}*`);

  return lines.join("\n");
}

export function downloadMarkdown(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadJson(data: unknown, filename: string): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportAuditToCsv(audit: Audit): string {
  const headers = [
    "URL", "Тип сторінки", "Правило", "Проблема", "Severity",
    "Перевірено", "Рекомендація", "Нотатки"
  ];

  const rows = audit.findings.map((f) => [
    f.url,
    f.pageType,
    f.ruleId,
    f.ruleTitle,
    f.severity,
    f.checked ? "Так" : "Ні",
    f.recommendation || "",
    f.notes || "",
  ]);

  const escape = (val: string) => `"${val.replace(/"/g, '""')}"`;
  const lines = [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))];
  return lines.join("\n");
}
