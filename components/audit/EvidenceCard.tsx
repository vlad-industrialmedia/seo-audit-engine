"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface EvidenceCardProps {
  evidence: Record<string, unknown>;
}

export function EvidenceCard({ evidence }: EvidenceCardProps) {
  const [expanded, setExpanded] = useState(false);

  if (!evidence || Object.keys(evidence).length === 0) return null;

  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Докази ({Object.keys(evidence).length} полів)
      </button>
      {expanded && (
        <div className="mt-1 rounded-md bg-muted/50 border border-border text-xs overflow-x-auto">
          <pre className="p-3 whitespace-pre-wrap break-words text-[11px] leading-relaxed">
            {JSON.stringify(evidence, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

interface EvidenceFieldProps {
  label: string;
  value: unknown;
  className?: string;
}

export function EvidenceField({ label, value, className }: EvidenceFieldProps) {
  if (value === null || value === undefined) return null;

  const displayValue = typeof value === "object" ? JSON.stringify(value) : String(value);

  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-xs font-mono break-all">{displayValue}</span>
    </div>
  );
}
