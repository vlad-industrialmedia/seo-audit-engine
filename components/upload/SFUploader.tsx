"use client";

import { useState, useCallback } from "react";
import { Upload, FileSpreadsheet, X, CheckCircle, AlertCircle, Loader2, PlusCircle, RefreshCw } from "lucide-react";
import { importSFFiles } from "@/lib/sf-parser";
import type { SFImportResult } from "@/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SFUploaderProps {
  onImport: (result: SFImportResult) => void;
  disabled?: boolean;
  currentResult?: SFImportResult | null;
}

type FileStatus = "idle" | "loading" | "success" | "error";

interface FileEntry {
  file: File;
  status: FileStatus;
  rowCount?: number;
  error?: string;
}

// Merge two SFImportResults, deduplicating rows by address (URL)
function mergeResults(base: SFImportResult | null, next: SFImportResult): SFImportResult {
  if (!base) return next;
  const seen = new Set(base.rows.map((r) => r.address));
  const newRows = next.rows.filter((r) => !seen.has(r.address));
  const merged = [...base.rows, ...newRows];

  // Re-aggregate page types
  const detectedPageTypes = { ...base.detectedPageTypes };
  for (const [type, count] of Object.entries(next.detectedPageTypes)) {
    const k = type as keyof typeof detectedPageTypes;
    detectedPageTypes[k] = (detectedPageTypes[k] || 0) + count;
  }

  const seenSources = new Set(base.redirects.map((r) => r.source));

  return {
    rows: merged,
    redirects: [...base.redirects, ...next.redirects.filter((r) => !seenSources.has(r.source))],
    images: [...(base.images ?? []), ...(next.images ?? [])],
    detectedPageTypes,
    fileNames: [...base.fileNames, ...next.fileNames.filter((n) => !base.fileNames.includes(n))],
    totalUrls: merged.length,
    errors: [...(base.errors ?? []), ...(next.errors ?? [])],
  };
}

export function SFUploader({ onImport, disabled, currentResult }: SFUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [addMode, setAddMode] = useState(false); // "add more files" mode when result already exists

  const addFiles = useCallback((newFiles: File[]) => {
    const valid = newFiles.filter((f) => {
      const ext = f.name.split(".").pop()?.toLowerCase();
      return ["csv", "xlsx", "xls"].includes(ext || "");
    });
    if (valid.length === 0) return;
    const existing = pendingFiles.map((e) => e.file.name);
    const unique = valid.filter((f) => !existing.includes(f.name));
    if (unique.length === 0) return;
    setPendingFiles((prev) => [...prev, ...unique.map((f) => ({ file: f, status: "idle" as FileStatus }))]);
  }, [pendingFiles]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      addFiles(Array.from(e.dataTransfer.files));
    },
    [addFiles]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(Array.from(e.target.files));
      e.target.value = "";
    }
  };

  const removeFile = (idx: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const runImport = async () => {
    if (pendingFiles.length === 0) return;
    setLoading(true);
    setPendingFiles((prev) => prev.map((f) => ({ ...f, status: "loading" })));

    try {
      const fileList = pendingFiles.map((f) => f.file);
      const importResult = await importSFFiles(fileList);

      // Merge with existing if in add-more mode
      const merged = addMode && currentResult
        ? mergeResults(currentResult, importResult)
        : importResult;

      setPendingFiles((prev) =>
        prev.map((f, i) => ({
          ...f,
          status: "success",
          // Approximate: distribute rows proportionally
          rowCount: Math.round((importResult.rows.length / fileList.length)),
        }))
      );
      setAddMode(false);
      onImport(merged);
    } catch (err) {
      setPendingFiles((prev) =>
        prev.map((f) => ({ ...f, status: "error", error: (err as Error).message }))
      );
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setPendingFiles([]);
    setAddMode(false);
  };

  const startAddMore = () => {
    setPendingFiles([]);
    setAddMode(true);
  };

  // ── Loaded state: show current result + add more option ──────────────────────
  if (currentResult && !addMode) {
    return (
      <div className="space-y-3">
        {/* Current dataset summary */}
        <div className="rounded-xl border border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-800 dark:text-green-300">
                  Завантажено {currentResult.rows.length.toLocaleString("uk")} URL
                </p>
                <p className="text-xs text-green-600 dark:text-green-500">
                  {currentResult.fileNames.join(", ")}
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <Button variant="outline" size="sm" onClick={startAddMore} disabled={disabled}>
                <PlusCircle className="h-3.5 w-3.5 mr-1.5" />
                Додати файли
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { reset(); onImport(null as unknown as SFImportResult); }} disabled={disabled}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {Object.entries(currentResult.detectedPageTypes)
              .filter(([, c]) => c > 0)
              .sort(([, a], [, b]) => b - a)
              .map(([type, count]) => (
                <span key={type} className="text-xs bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 rounded-full px-2 py-0.5">
                  {type}: {count}
                </span>
              ))}
          </div>
          {(currentResult.redirects?.length ?? 0) > 0 && (
            <p className="text-xs text-green-600 dark:text-green-500 mt-2">
              + {currentResult.redirects.length} редиректів
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Upload / Add-more state ───────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {addMode && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Додаємо файли до вже завантажених {currentResult?.rows.length.toLocaleString("uk")} URL</span>
          <button onClick={() => setAddMode(false)} className="text-xs underline hover:text-foreground">
            Скасувати
          </button>
        </div>
      )}

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-accent/30",
          (disabled || loading) && "opacity-50 pointer-events-none"
        )}
      >
        <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
        <p className="font-medium text-sm">
          {addMode ? "Додайте ще файли Screaming Frog" : "Перетягніть файли Screaming Frog сюди"}
        </p>
        <p className="text-xs text-muted-foreground mt-1 mb-3">
          CSV, XLSX, XLS · Internal, Inlinks, Response Codes, Sitemaps — будь-яка комбінація
        </p>
        <label className="cursor-pointer">
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            multiple
            className="sr-only"
            onChange={handleInputChange}
            disabled={disabled || loading}
          />
          <span className="inline-flex items-center justify-center gap-2 rounded-md border border-input bg-background px-3 h-8 text-xs font-medium shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors">
            Вибрати файли
          </span>
        </label>
      </div>

      {/* Pending file list */}
      {pendingFiles.length > 0 && (
        <div className="space-y-1.5">
          {pendingFiles.map((entry, idx) => (
            <div
              key={`${entry.file.name}-${idx}`}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-3 py-2 text-sm",
                entry.status === "success" && "border-green-200 bg-green-50/30 dark:border-green-900 dark:bg-green-950/20",
                entry.status === "error" && "border-red-200 bg-red-50/30 dark:border-red-900 dark:bg-red-950/20"
              )}
            >
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{entry.file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(entry.file.size / 1024).toFixed(0)} KB
                  {entry.rowCount ? ` · ${entry.rowCount.toLocaleString("uk")} рядків` : ""}
                </p>
                {entry.error && <p className="text-xs text-red-500 mt-0.5">{entry.error}</p>}
              </div>
              {entry.status === "loading" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              {entry.status === "success" && <CheckCircle className="h-4 w-4 text-green-500" />}
              {entry.status === "error" && <AlertCircle className="h-4 w-4 text-red-500" />}
              {entry.status === "idle" && !loading && (
                <button onClick={() => removeFile(idx)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      {pendingFiles.length > 0 && (
        <div className="flex gap-2">
          <Button
            onClick={runImport}
            disabled={loading || disabled}
            className="flex-1"
          >
            {loading ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" />Обробка...</>
            ) : addMode ? (
              <><PlusCircle className="h-4 w-4 mr-2" />Додати {pendingFiles.length} файлів до аудиту</>
            ) : (
              <><Upload className="h-4 w-4 mr-2" />Імпортувати {pendingFiles.length} файлів</>
            )}
          </Button>
          {!loading && (
            <Button variant="outline" onClick={reset}>
              Очистити
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
