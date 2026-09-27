"use client";

import { useState } from "react";
import { Download, FileText, FileJson, Table } from "lucide-react";
import type { Audit, ExportOptions, Severity } from "@/types";
import { exportAuditToMarkdown, downloadMarkdown, downloadJson, exportAuditToCsv } from "@/lib/export/markdown";
import { format } from "date-fns";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

interface ExportModalProps {
  audit: Audit;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ALL_SEVERITIES: Severity[] = ["critical", "high", "medium", "low", "info"];

export function ExportModal({ audit, open, onOpenChange }: ExportModalProps) {
  const [options, setOptions] = useState<ExportOptions>({
    format: "md",
    includeSummary: true,
    includeFindings: true,
    includeEvidence: false,
    includeDeveloperHints: true,
    severityFilter: ["critical", "high", "medium"],
    checkedFilter: "all",
  });

  const toggleSeverity = (sev: Severity) => {
    setOptions((prev) => ({
      ...prev,
      severityFilter: prev.severityFilter.includes(sev)
        ? prev.severityFilter.filter((s) => s !== sev)
        : [...prev.severityFilter, sev],
    }));
  };

  const handleExportMd = () => {
    const content = exportAuditToMarkdown(audit, options);
    const dateStr = format(new Date(), "yyyy-MM-dd");
    downloadMarkdown(content, `seo-audit-${audit.name.replace(/\s+/g, "-")}-${dateStr}.md`);
  };

  const handleExportJson = () => {
    downloadJson(audit, `seo-audit-${audit.name.replace(/\s+/g, "-")}.json`);
  };

  const handleExportCsv = () => {
    const csv = exportAuditToCsv(audit);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `seo-audit-${audit.name.replace(/\s+/g, "-")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const SEVERITY_LABELS: Record<Severity, string> = {
    critical: "🔴 Критичні",
    high: "🟠 Високі",
    medium: "🟡 Середні",
    low: "🔵 Низькі",
    info: "⚪ Інфо",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Експорт аудиту</DialogTitle>
          <DialogDescription>
            Налаштуйте параметри та оберіть формат експорту
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Severity filter */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Рівні важливості</Label>
            <div className="flex flex-wrap gap-2">
              {ALL_SEVERITIES.map((sev) => (
                <button
                  key={sev}
                  onClick={() => toggleSeverity(sev)}
                  className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                    options.severityFilter.includes(sev)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:bg-accent"
                  }`}
                >
                  {SEVERITY_LABELS[sev]}
                </button>
              ))}
            </div>
          </div>

          {/* Checked filter */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Статус проблем</Label>
            <div className="flex gap-2">
              {(["all", "checked", "unchecked"] as const).map((val) => (
                <button
                  key={val}
                  onClick={() => setOptions((p) => ({ ...p, checkedFilter: val }))}
                  className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                    options.checkedFilter === val
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:bg-accent"
                  }`}
                >
                  {val === "all" ? "Всі" : val === "checked" ? "✓ Вирішені" : "○ Активні"}
                </button>
              ))}
            </div>
          </div>

          <Separator />

          {/* Include options */}
          <div className="space-y-2">
            <Label className="text-sm font-medium block">Включити в звіт</Label>
            {[
              { key: "includeSummary", label: "Зведення" },
              { key: "includeFindings", label: "Список проблем" },
              { key: "includeEvidence", label: "Докази (JSON)" },
              { key: "includeDeveloperHints", label: "Підказки розробнику" },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={options[key as keyof ExportOptions] as boolean}
                  onChange={(e) =>
                    setOptions((p) => ({ ...p, [key]: e.target.checked }))
                  }
                  className="rounded"
                />
                <span className="text-sm">{label}</span>
              </label>
            ))}
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button onClick={handleExportMd} className="flex-1 gap-2">
            <FileText className="h-4 w-4" />
            Markdown
          </Button>
          <Button onClick={handleExportCsv} variant="outline" className="flex-1 gap-2">
            <Table className="h-4 w-4" />
            CSV
          </Button>
          <Button onClick={handleExportJson} variant="outline" className="flex-1 gap-2">
            <FileJson className="h-4 w-4" />
            JSON
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
