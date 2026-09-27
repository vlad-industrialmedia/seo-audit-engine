"use client";

import Link from "next/link";
import { Plus, FolderOpen, TrendingUp, AlertTriangle, CheckCircle, ArrowRight } from "lucide-react";
import { useProjectStore } from "@/lib/store/project-store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SeverityBadge } from "@/components/audit/SeverityBadge";
import { format } from "date-fns";
import { uk } from "date-fns/locale";

export default function DashboardPage() {
  const { projects } = useProjectStore();

  // Aggregate stats
  const totalAudits = projects.reduce((s, p) => s + p.audits.length, 0);
  const completedAudits = projects.reduce(
    (s, p) => s + p.audits.filter((a) => a.status === "completed").length,
    0
  );
  const totalFindings = projects.reduce(
    (s, p) => s + p.audits.reduce((ss, a) => ss + a.findings.length, 0),
    0
  );
  const criticalFindings = projects.reduce(
    (s, p) =>
      s + p.audits.reduce(
        (ss, a) => ss + a.findings.filter((f) => f.severity === "critical" && !f.checked).length,
        0
      ),
    0
  );

  // Recent audits
  const recentAudits = projects
    .flatMap((p) => p.audits.map((a) => ({ ...a, projectName: p.name, projectId: p.id })))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  return (
    <div className="p-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Дашборд</h1>
          <p className="text-muted-foreground mt-1">SEO Audit Engine — огляд всіх проєктів</p>
        </div>
        <Link href="/projects">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Новий проєкт
          </Button>
        </Link>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={<FolderOpen className="h-5 w-5 text-blue-500" />}
          label="Проєктів"
          value={projects.length}
          href="/projects"
        />
        <StatCard
          icon={<TrendingUp className="h-5 w-5 text-green-500" />}
          label="Аудитів"
          value={`${completedAudits}/${totalAudits}`}
          description="завершено"
        />
        <StatCard
          icon={<AlertTriangle className="h-5 w-5 text-red-500" />}
          label="Критичних"
          value={criticalFindings}
          description="активних проблем"
          highlight={criticalFindings > 0}
        />
        <StatCard
          icon={<CheckCircle className="h-5 w-5 text-gray-500" />}
          label="Всього проблем"
          value={totalFindings}
        />
      </div>

      {/* Recent audits */}
      {recentAudits.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Останні аудити</CardTitle>
            <CardDescription>Нещодавно виконані або незавершені аудити</CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            {recentAudits.map((audit) => (
              <Link
                key={audit.id}
                href={`/projects/${audit.projectId}?audit=${audit.id}`}
                className="flex items-center gap-3 py-3 hover:bg-accent -mx-6 px-6 transition-colors first:pt-0 last:pb-0"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{audit.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {audit.projectName} · {format(new Date(audit.createdAt), "d MMM yyyy", { locale: uk })}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {audit.summary.critical > 0 && (
                    <SeverityBadge severity="critical" showLabel={false} />
                  )}
                  <span className="text-xs text-muted-foreground">
                    {audit.findings.length} проблем
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    audit.status === "completed"
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : audit.status === "running"
                      ? "bg-blue-100 text-blue-700"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {audit.status === "completed" ? "Завершено" : audit.status === "running" ? "Виконується" : "Очікує"}
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      ) : (
        <EmptyState />
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  description,
  href,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  description?: string;
  href?: string;
  highlight?: boolean;
}) {
  const content = (
    <Card className={highlight ? "border-red-200 dark:border-red-900" : ""}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          {icon}
          {href && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
        </div>
        <p className={`text-2xl font-bold ${highlight ? "text-red-600 dark:text-red-400" : ""}`}>{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {label}
          {description && <span className="ml-1">({description})</span>}
        </p>
      </CardContent>
    </Card>
  );

  if (href) return <Link href={href}>{content}</Link>;
  return content;
}

function EmptyState() {
  return (
    <Card className="border-dashed">
      <CardContent className="p-12 text-center">
        <FolderOpen className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
        <h3 className="font-semibold text-lg mb-2">Проєктів ще немає</h3>
        <p className="text-muted-foreground text-sm mb-4">
          Створіть перший проєкт та завантажте дані зі Screaming Frog для початку аудиту
        </p>
        <Link href="/projects">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Створити перший проєкт
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
