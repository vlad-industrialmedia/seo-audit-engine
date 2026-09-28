"use client";

import { useState, useEffect } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus, Play, Trash2, Download, Upload, ChevronLeft, Loader2,
  FileText, AlertTriangle, CheckSquare, BarChart2, ShieldCheck, Cpu,
} from "lucide-react";
import { useProjectStore } from "@/lib/store/project-store";
import { importSFFiles } from "@/lib/sf-parser";
import { runAllRules, sfRowToPagePassportAsync, aggregateFindings, buildAuditSummary } from "@/lib/rule-engine/engine";
import type { Audit, SFImportResult, PageType, AIProvider } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { FindingsTable } from "@/components/audit/FindingsTable";
import { AuditSummaryCard } from "@/components/audit/AuditSummaryCard";
import { SFUploader } from "@/components/upload/SFUploader";
import { ExportModal } from "@/components/audit/ExportModal";
import TechAuditPanel from "@/components/audit/TechAuditPanel";
import AiAnalysisPanel from "@/components/audit/AiAnalysisPanel";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import { toast } from "sonner";

// ─── Auto-verification: sample URLs and confirm findings via HEAD requests ────
async function autoVerifyFindings(
  findings: ReturnType<typeof aggregateFindings>
): Promise<ReturnType<typeof aggregateFindings>> {
  const RULES_WITH_META = new Set([
    "meta.title.missing", "meta.title.duplicate", "meta.title.too_long", "meta.title.too_short",
    "meta.description.missing", "meta.description.too_long", "meta.description.too_short",
    "heading.h1.missing", "heading.h1.multiple",
    "canonical.missing", "canonical.self_referencing",
    "http.redirect_chain", "http.slow_response",
    "indexability.noindex_important",
  ]);

  const verified = await Promise.all(
    findings.map(async (finding) => {
      if (!RULES_WITH_META.has(finding.ruleId)) return finding;
      const sample = (finding.affectedUrls ?? []).slice(0, 2);
      if (sample.length === 0) return finding;

      try {
        const results = await Promise.all(
          sample.map((url) =>
            fetch(`/api/verify-finding`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url, ruleId: finding.ruleId }),
            })
              .then((r) => r.json())
              .catch(() => ({ confirmed: true }))
          )
        );
        const confirmedCount = results.filter((r) => r.confirmed).length;
        return {
          ...finding,
          verificationStatus: confirmedCount > 0 ? ("verified" as const) : ("false_positive" as const),
          verificationNote:
            confirmedCount > 0
              ? `Підтверджено на ${confirmedCount} з ${sample.length} перевірених сторінок`
              : "Не підтверджено на вибірці сторінок — можливо хибне спрацювання",
        };
      } catch {
        return finding;
      }
    })
  );
  // Filter out false positives
  return verified.filter((f) => f.verificationStatus !== "false_positive");
}

export default function ProjectPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = params.id as string;

  const { getProject, createAudit, updateAudit, deleteAudit, updateProject, settings } = useProjectStore();
  const project = getProject(projectId);

  const [activeAuditId, setActiveAuditId] = useState<string | null>(
    searchParams.get("audit")
  );
  const [showNewAudit, setShowNewAudit] = useState(false);
  const [auditName, setAuditName] = useState("");
  const [showExport, setShowExport] = useState(false);
  const [running, setRunning] = useState(false);
  const [runProgress, setRunProgress] = useState(0);
  const [sfResult, setSfResult] = useState<SFImportResult | null>(null);

  useEffect(() => {
    if (project && !activeAuditId && project.audits.length > 0) {
      setActiveAuditId(project.audits.at(-1)!.id);
    }
  }, [project, activeAuditId]);

  if (!project) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Проєкт не знайдено</p>
        <Link href="/projects" className="text-sm text-primary mt-2 inline-block">← До проєктів</Link>
      </div>
    );
  }

  const activeAudit = project.audits.find((a) => a.id === activeAuditId) ?? null;

  const handleCreateAudit = () => {
    if (!auditName) {
      toast.error("Введіть назву аудиту");
      return;
    }
    const audit = createAudit(projectId, auditName);
    setActiveAuditId(audit.id);
    setShowNewAudit(false);
    setAuditName("");
    toast.success(`Аудит "${audit.name}" створено`);
  };

  const handleSFImport = (result: SFImportResult | null) => {
    if (!result) {
      setSfResult(null);
      return;
    }
    setSfResult(result);
    toast.success(`Імпортовано ${result.rows.length} URL зі Screaming Frog`);
  };

  const handleRunAudit = async () => {
    if (!activeAuditId || !sfResult) {
      toast.error("Спочатку завантажте дані зі Screaming Frog");
      return;
    }

    setRunning(true);
    setRunProgress(0);

    try {
      updateAudit(projectId, activeAuditId, { status: "running", progress: 0 });

      const { rows } = sfResult;
      const total = rows.length;
      const allFindings: ReturnType<typeof runAllRules> = [];
      const pages = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const page = await sfRowToPagePassportAsync(row);
        const findings = runAllRules(page, ["seo_core"]);
        allFindings.push(...findings);
        pages.push(page);

        const progress = Math.round(((i + 1) / total) * 100);
        setRunProgress(progress);
        updateAudit(projectId, activeAuditId, { progress });

        // Yield to UI every 10 rows
        if (i % 10 === 0) {
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      const aggregated = aggregateFindings(allFindings);

      // Auto-verify: sample 2 URLs per finding and check via browser fetch
      const verifiedFindings = await autoVerifyFindings(aggregated);

      const summary = buildAuditSummary(verifiedFindings);

      // Build page type stats for AI analysis
      const detectedPageTypes: Record<string, number> = {};
      for (const page of pages) {
        detectedPageTypes[page.pageType] = (detectedPageTypes[page.pageType] || 0) + 1;
      }
      const indexableCount = pages.filter((p) => p.indexability.indexable).length;

      updateAudit(projectId, activeAuditId, {
        status: "completed",
        progress: 100,
        completedAt: new Date().toISOString(),
        pagesAnalyzed: pages.length,
        pagesTotal: pages.length,
        findings: verifiedFindings,
        pages,
        summary,
        sfImportFiles: sfResult.fileNames,
        sfStats: {
          totalUrls: pages.length,
          detectedPageTypes: detectedPageTypes as Record<PageType, number>,
          indexableCount,
          nonIndexableCount: pages.length - indexableCount,
        },
      });

      toast.success(`Аудит завершено: знайдено ${verifiedFindings.length} проблем`);
    } catch (err) {
      updateAudit(projectId, activeAuditId, {
        status: "failed",
        error: (err as Error).message,
      });
      toast.error(`Помилка аудиту: ${(err as Error).message}`);
    } finally {
      setRunning(false);
    }
  };

  const handleDeleteAudit = (auditId: string) => {
    const audit = project.audits.find((a) => a.id === auditId);
    if (!audit) return;
    if (!confirm(`Видалити аудит "${audit.name}"?`)) return;
    deleteAudit(projectId, auditId);
    const remaining = project.audits.filter((a) => a.id !== auditId);
    setActiveAuditId(remaining.at(-1)?.id ?? null);
    toast.success("Аудит видалено");
  };

  return (
    <div className="p-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
        <Link href="/projects" className="hover:text-foreground flex items-center gap-1">
          <ChevronLeft className="h-3.5 w-3.5" />
          Проєкти
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">{project.name}</span>
      </div>

      {/* Project header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">{project.name}</h1>
          <p className="text-muted-foreground text-sm font-mono">{project.domain}</p>
          {project.description && (
            <p className="text-sm text-muted-foreground mt-1">{project.description}</p>
          )}
        </div>
        <Button onClick={() => setShowNewAudit(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Новий аудит
        </Button>
      </div>

      {project.audits.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center">
            <BarChart2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="font-semibold mb-2">Аудитів ще немає</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Створіть перший аудит та завантажте CSV файл зі Screaming Frog
            </p>
            <Button onClick={() => setShowNewAudit(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Створити аудит
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex gap-6">
          {/* Audit sidebar */}
          <div className="w-48 flex-shrink-0 space-y-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground px-2 mb-2">Аудити</p>
            {project.audits.map((audit) => (
              <button
                key={audit.id}
                onClick={() => setActiveAuditId(audit.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors text-sm ${
                  activeAuditId === audit.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:bg-accent"
                }`}
              >
                <p className="font-medium truncate">{audit.name}</p>
                <p className={`text-xs mt-0.5 ${activeAuditId === audit.id ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                  {format(new Date(audit.createdAt), "d MMM yyyy", { locale: uk })}
                </p>
                <p className={`text-xs ${activeAuditId === audit.id ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                  {audit.findings.length} проблем
                </p>
              </button>
            ))}
          </div>

          {/* Main audit view */}
          {activeAudit && (
            <div className="flex-1 min-w-0">
              <AuditView
                audit={activeAudit}
                projectId={projectId}
                domain={project.domain}
                onDelete={() => handleDeleteAudit(activeAudit.id)}
                onExport={() => setShowExport(true)}
                onSFImport={handleSFImport}
                onRunAudit={handleRunAudit}
                running={running}
                runProgress={runProgress}
                sfResult={sfResult}
                aiProvider={(() => {
                  // Use defaultProvider if set and has a key
                  if (settings.defaultProvider && settings.aiProviders[settings.defaultProvider]?.apiKey) {
                    return settings.defaultProvider;
                  }
                  // Fall back to any provider with an apiKey (validated or not)
                  return (Object.keys(settings.aiProviders) as AIProvider[]).find(
                    (p) => settings.aiProviders[p]?.apiKey
                  );
                })()}
                aiApiKey={(() => {
                  const p = settings.defaultProvider && settings.aiProviders[settings.defaultProvider]?.apiKey
                    ? settings.defaultProvider
                    : (Object.keys(settings.aiProviders) as AIProvider[]).find(
                        (p2) => settings.aiProviders[p2]?.apiKey
                      );
                  return p ? (settings.aiProviders[p]?.apiKey ?? "") : "";
                })()}
                aiModel={(() => {
                  const p = settings.defaultProvider && settings.aiProviders[settings.defaultProvider]?.apiKey
                    ? settings.defaultProvider
                    : (Object.keys(settings.aiProviders) as AIProvider[]).find(
                        (p2) => settings.aiProviders[p2]?.apiKey
                      );
                  return p ? (settings.aiProviders[p]?.model ?? "") : "";
                })()}
              />
            </div>
          )}
        </div>
      )}

      {/* Create audit dialog */}
      <Dialog open={showNewAudit} onOpenChange={setShowNewAudit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новий аудит</DialogTitle>
            <DialogDescription>Введіть назву для нового аудиту</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label>Назва аудиту</Label>
            <Input
              value={auditName}
              onChange={(e) => setAuditName(e.target.value)}
              placeholder="Аудит Квітень 2025"
              onKeyDown={(e) => e.key === "Enter" && handleCreateAudit()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewAudit(false)}>Скасувати</Button>
            <Button onClick={handleCreateAudit} disabled={!auditName}>Створити</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export modal */}
      {activeAudit && (
        <ExportModal audit={activeAudit} open={showExport} onOpenChange={setShowExport} />
      )}
    </div>
  );
}

// ─── AuditView ──────────────────────────────────────────────────────────────

function AuditView({
  audit,
  projectId,
  domain,
  onDelete,
  onExport,
  onSFImport,
  onRunAudit,
  running,
  runProgress,
  sfResult,
  aiProvider,
  aiApiKey,
  aiModel,
}: {
  audit: Audit;
  projectId: string;
  domain: string;
  onDelete: () => void;
  onExport: () => void;
  onSFImport: (result: SFImportResult | null) => void;
  onRunAudit: () => void;
  running: boolean;
  runProgress: number;
  sfResult: SFImportResult | null;
  aiProvider?: AIProvider;
  aiApiKey?: string;
  aiModel?: string;
}) {
  return (
    <div className="space-y-4">
      {/* Audit header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{audit.name}</h2>
          <p className="text-xs text-muted-foreground">
            {format(new Date(audit.createdAt), "d MMMM yyyy 'о' HH:mm", { locale: uk })}
            {audit.completedAt && ` · Завершено ${format(new Date(audit.completedAt), "d MMMM yyyy", { locale: uk })}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onExport} disabled={audit.findings.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Експорт
          </Button>
          <Button variant="outline" size="sm" onClick={onDelete} className="text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Tabs defaultValue={audit.status === "completed" ? "findings" : "upload"}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="upload" className="gap-1.5">
            <Upload className="h-3.5 w-3.5" />
            Дані SF
          </TabsTrigger>
          <TabsTrigger value="findings" className="gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Проблеми
            {audit.findings.length > 0 && (
              <span className="ml-1 text-xs bg-primary/10 text-primary rounded-full px-1.5">
                {audit.findings.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="summary" className="gap-1.5">
            <BarChart2 className="h-3.5 w-3.5" />
            Зведення
          </TabsTrigger>
          <TabsTrigger value="tech" className="gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            Технічний
          </TabsTrigger>
          <TabsTrigger value="ai" className="gap-1.5">
            <Cpu className="h-3.5 w-3.5" />
            AI Аналіз
          </TabsTrigger>
        </TabsList>

        {/* Upload tab */}
        <TabsContent value="upload" className="space-y-4 mt-4">
          <SFUploader onImport={onSFImport} disabled={running} currentResult={sfResult} />

          {sfResult && !running && (
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">Запустити аудит</p>
                  <p className="text-xs text-muted-foreground">{sfResult.rows.length.toLocaleString("uk")} URL · {sfResult.fileNames.length} {sfResult.fileNames.length === 1 ? "файл" : "файлів"}</p>
                </div>
                <Button onClick={onRunAudit} disabled={running}>
                  {running ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" />Аналіз...</>
                  ) : (
                    <><Play className="h-4 w-4 mr-2" />Запустити аудит</>
                  )}
                </Button>
              </div>

              {running && (
                <div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>Аналіз сторінок</span>
                    <span>{runProgress}%</span>
                  </div>
                  <Progress value={runProgress} />
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* Findings tab */}
        <TabsContent value="findings" className="mt-4">
          {audit.findings.length > 0 ? (
            <FindingsTable
              findings={audit.findings}
              projectId={projectId}
              auditId={audit.id}
            />
          ) : (
            <Card className="border-dashed">
              <CardContent className="p-10 text-center">
                <CheckSquare className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
                <p className="font-medium">Проблем не знайдено</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {audit.status === "pending"
                    ? "Завантажте дані SF та запустіть аудит"
                    : "Аудит не виявив порушень правил"}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Summary tab */}
        <TabsContent value="summary" className="mt-4">
          {audit.status === "completed" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <AuditSummaryCard summary={audit.summary} />
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Статистика</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Сторінок проаналізовано</span>
                    <span className="font-medium">{audit.pagesAnalyzed}</span>
                  </div>
                  {audit.sfStats && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Індексованих</span>
                        <span className="font-medium text-green-600">{audit.sfStats.indexableCount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Не індексованих</span>
                        <span className="font-medium text-yellow-600">{audit.sfStats.nonIndexableCount}</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Всього проблем</span>
                    <span className="font-medium">{audit.summary.total}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Вирішено</span>
                    <span className="font-medium text-green-600">{audit.summary.checked}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Файли SF</span>
                    <span className="font-medium">{audit.sfImportFiles.length}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="p-10 text-center">
                <BarChart2 className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">Запустіть аудит для перегляду зведення</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Tech audit tab */}
        <TabsContent value="tech" className="mt-4">
          <TechAuditPanel domain={domain} sfResult={sfResult} />
        </TabsContent>

        {/* AI Analysis tab */}
        <TabsContent value="ai" className="mt-4">
          {audit.status === "completed" && audit.sfStats ? (
            <AiAnalysisPanel
              findings={audit.findings}
              sfStats={audit.sfStats}
              domain={domain}
              provider={aiProvider ?? "anthropic"}
              apiKey={aiApiKey ?? ""}
              model={aiModel ?? ""}
            />
          ) : (
            <Card className="border-dashed">
              <CardContent className="p-10 text-center">
                <Cpu className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">Спочатку запустіть аудит</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
