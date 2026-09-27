"use client";

import { useState, useCallback } from "react";
import { Upload, FileSpreadsheet, X, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { importSFFiles } from "@/lib/sf-parser";
import type { SFImportResult } from "@/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SFUploaderProps {
  onImport: (result: SFImportResult) => void;
  disabled?: boolean;
}

type FileStatus = "idle" | "loading" | "success" | "error";

interface FileEntry {
  file: File;
  status: FileStatus;
  error?: string;
}

export function SFUploader({ onImport, disabled }: SFUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [globalStatus, setGlobalStatus] = useState<"idle" | "loading" | "done">("idle");
  const [result, setResult] = useState<SFImportResult | null>(null);

  const handleFiles = useCallback((newFiles: File[]) => {
    const valid = newFiles.filter((f) => {
      const ext = f.name.split(".").pop()?.toLowerCase();
      return ["csv", "xlsx", "xls"].includes(ext || "");
    });
    if (valid.length === 0) return;
    setFiles((prev) => [
      ...prev,
      ...valid.map((f) => ({ file: f, status: "idle" as FileStatus })),
    ]);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const dropped = Array.from(e.dataTransfer.files);
      handleFiles(dropped);
    },
    [handleFiles]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(Array.from(e.target.files));
      e.target.value = "";
    }
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const runImport = async () => {
    if (files.length === 0) return;
    setGlobalStatus("loading");
    setFiles((prev) => prev.map((f) => ({ ...f, status: "loading" })));

    try {
      const fileList = files.map((f) => f.file);
      const importResult = await importSFFiles(fileList);
      setResult(importResult);
      setGlobalStatus("done");
      setFiles((prev) => prev.map((f) => ({ ...f, status: "success" })));
      onImport(importResult);
    } catch (err) {
      setGlobalStatus("idle");
      setFiles((prev) =>
        prev.map((f) => ({ ...f, status: "error", error: (err as Error).message }))
      );
    }
  };

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "border-2 border-dashed rounded-xl p-8 text-center transition-colors",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-accent/30",
          disabled && "opacity-50 pointer-events-none"
        )}
      >
        <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
        <p className="font-medium text-sm">Перетягніть файли Screaming Frog сюди</p>
        <p className="text-xs text-muted-foreground mt-1 mb-3">
          Підтримуються: CSV, XLSX, XLS (Internal / All Inlinks / Response Codes / Sitemaps)
        </p>
        <label className="cursor-pointer">
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            multiple
            className="sr-only"
            onChange={handleInputChange}
            disabled={disabled}
          />
          <Button variant="outline" size="sm" className="pointer-events-none">
            Вибрати файли
          </Button>
        </label>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((entry, idx) => (
            <div
              key={`${entry.file.name}-${idx}`}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-3 py-2",
                entry.status === "success" && "border-green-200 bg-green-50/30 dark:border-green-900 dark:bg-green-950/20",
                entry.status === "error" && "border-red-200 bg-red-50/30 dark:border-red-900 dark:bg-red-950/20"
              )}
            >
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{entry.file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(entry.file.size / 1024).toFixed(0)} KB
                </p>
                {entry.error && (
                  <p className="text-xs text-red-500 mt-0.5">{entry.error}</p>
                )}
              </div>

              {/* Status icon */}
              {entry.status === "loading" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              {entry.status === "success" && <CheckCircle className="h-4 w-4 text-green-500" />}
              {entry.status === "error" && <AlertCircle className="h-4 w-4 text-red-500" />}
              {entry.status === "idle" && (
                <button onClick={() => removeFile(idx)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Import result summary */}
      {result && (
        <div className="rounded-lg border border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/30 p-4">
          <p className="text-sm font-medium text-green-700 dark:text-green-400 flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            Імпорт завершено успішно
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <span>Всього URL: <strong>{result.rows.length}</strong></span>
            <span>Редиректи: <strong>{result.redirects.length}</strong></span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {Object.entries(result.detectedPageTypes).map(([type, count]) => (
              count > 0 && (
                <span key={type} className="text-xs bg-muted rounded px-1.5 py-0.5">
                  {type}: {count}
                </span>
              )
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      {files.length > 0 && globalStatus !== "done" && (
        <div className="flex gap-2">
          <Button
            onClick={runImport}
            disabled={globalStatus === "loading" || disabled}
            className="flex-1"
          >
            {globalStatus === "loading" ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" />Завантаження...</>
            ) : (
              <><Upload className="h-4 w-4 mr-2" />Імпортувати ({files.length} файлів)</>
            )}
          </Button>
          {globalStatus === "idle" && (
            <Button variant="outline" onClick={() => setFiles([])}>
              Очистити
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
