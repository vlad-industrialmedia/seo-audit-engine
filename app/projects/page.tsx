"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, FolderOpen, Trash2, Upload, Download, ArrowRight, Globe } from "lucide-react";
import { useProjectStore } from "@/lib/store/project-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { SeverityBadge } from "@/components/audit/SeverityBadge";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import { toast } from "sonner";

export default function ProjectsPage() {
  const { projects, createProject, deleteProject, exportProject, importProject } = useProjectStore();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [description, setDescription] = useState("");

  const handleCreate = () => {
    if (!name || !domain) {
      toast.error("Назва та домен обов'язкові");
      return;
    }
    const project = createProject(name, domain, description || undefined);
    toast.success(`Проєкт "${project.name}" створено`);
    setShowCreate(false);
    setName("");
    setDomain("");
    setDescription("");
  };

  const handleExport = (id: string, projectName: string) => {
    const json = exportProject(id);
    if (!json) return;
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `seo-project-${projectName.replace(/\s+/g, "-")}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Проєкт експортовано");
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      const project = importProject(text);
      if (project) {
        toast.success(`Проєкт "${project.name}" імпортовано`);
      } else {
        toast.error("Не вдалося імпортувати проєкт: невалідний формат");
      }
    };
    input.click();
  };

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Видалити проєкт "${name}"? Це незворотня дія.`)) {
      deleteProject(id);
      toast.success("Проєкт видалено");
    }
  };

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Проєкти</h1>
          <p className="text-muted-foreground mt-1">{projects.length} проєктів</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleImport}>
            <Upload className="h-4 w-4 mr-2" />
            Імпортувати
          </Button>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Новий проєкт
          </Button>
        </div>
      </div>

      {/* Projects grid */}
      {projects.length > 0 ? (
        <div className="grid gap-4">
          {projects.map((project) => {
            const lastAudit = project.audits.at(-1);
            const totalFindings = project.audits.reduce((s, a) => s + a.findings.length, 0);
            const criticalCount = project.audits.reduce(
              (s, a) => s + a.findings.filter((f) => f.severity === "critical" && !f.checked).length,
              0
            );

            return (
              <Card key={project.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <Link href={`/projects/${project.id}`} className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Globe className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <h3 className="font-semibold text-sm truncate">{project.name}</h3>
                        {criticalCount > 0 && (
                          <SeverityBadge severity="critical" showLabel={false} />
                        )}
                      </div>

                      <p className="text-xs text-muted-foreground mb-2 font-mono">{project.domain}</p>

                      {project.description && (
                        <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                          {project.description}
                        </p>
                      )}

                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{project.audits.length} аудитів</span>
                        <span>{totalFindings} проблем</span>
                        {lastAudit && (
                          <span>
                            Останній: {format(new Date(lastAudit.createdAt), "d MMM", { locale: uk })}
                          </span>
                        )}
                      </div>
                    </Link>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleExport(project.id, project.name)}
                        title="Експортувати проєкт"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(project.id, project.name)}
                        title="Видалити проєкт"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <Link href={`/projects/${project.id}`}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center">
            <FolderOpen className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="font-semibold mb-2">Проєктів ще немає</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Створіть перший проєкт або імпортуйте існуючий
            </p>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Створити проєкт
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новий проєкт</DialogTitle>
            <DialogDescription>
              Введіть дані для нового SEO-проєкту
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="project-name">Назва проєкту *</Label>
              <Input
                id="project-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Мій SEO проєкт"
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="project-domain">Домен *</Label>
              <Input
                id="project-domain"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="https://example.com"
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="project-desc">Опис (необов'язково)</Label>
              <Input
                id="project-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Короткий опис проєкту..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Скасувати
            </Button>
            <Button onClick={handleCreate} disabled={!name || !domain}>
              Створити
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
