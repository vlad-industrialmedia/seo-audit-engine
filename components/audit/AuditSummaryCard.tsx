"use client";

import type { AuditSummary } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface AuditSummaryCardProps {
  summary: AuditSummary;
}

const SEVERITY_ROWS = [
  { key: "critical", label: "Критичні", emoji: "🔴", textClass: "text-red-600 dark:text-red-400" },
  { key: "high", label: "Високі", emoji: "🟠", textClass: "text-orange-600 dark:text-orange-400" },
  { key: "medium", label: "Середні", emoji: "🟡", textClass: "text-yellow-600 dark:text-yellow-400" },
  { key: "low", label: "Низькі", emoji: "🔵", textClass: "text-blue-600 dark:text-blue-400" },
] as const;

export function AuditSummaryCard({ summary }: AuditSummaryCardProps) {
  const pct = summary.total > 0 ? Math.round((summary.checked / summary.total) * 100) : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Зведення проблем</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress */}
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-muted-foreground">Прогрес виправлення</span>
            <span className="font-medium">{pct}%</span>
          </div>
          <Progress value={pct} className="h-2" />
          <p className="text-xs text-muted-foreground mt-1">
            {summary.checked} з {summary.total} проблем вирішено
          </p>
        </div>

        {/* Breakdown */}
        <div className="space-y-2">
          {SEVERITY_ROWS.map(({ key, label, emoji, textClass }) => {
            const count = summary[key as keyof AuditSummary] as number;
            if (count === 0) return null;
            return (
              <div key={key} className="flex items-center justify-between">
                <span className="text-sm flex items-center gap-1.5">
                  <span>{emoji}</span>
                  <span>{label}</span>
                </span>
                <span className={`font-semibold text-sm ${textClass}`}>{count}</span>
              </div>
            );
          })}
          <div className="flex items-center justify-between border-t pt-2 mt-2">
            <span className="text-sm font-medium">Всього</span>
            <span className="font-bold">{summary.total}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
