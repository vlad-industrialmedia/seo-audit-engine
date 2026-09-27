import type { Severity } from "@/types";
import { cn } from "@/lib/utils";

const SEVERITY_CONFIG: Record<Severity, { label: string; emoji: string; className: string }> = {
  critical: { label: "Критична", emoji: "🔴", className: "severity-critical" },
  high: { label: "Висока", emoji: "🟠", className: "severity-high" },
  medium: { label: "Середня", emoji: "🟡", className: "severity-medium" },
  low: { label: "Низька", emoji: "🔵", className: "severity-low" },
  info: { label: "Інфо", emoji: "⚪", className: "severity-info" },
};

interface SeverityBadgeProps {
  severity: Severity;
  showLabel?: boolean;
  className?: string;
}

export function SeverityBadge({ severity, showLabel = true, className }: SeverityBadgeProps) {
  const config = SEVERITY_CONFIG[severity];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold",
        config.className,
        className
      )}
    >
      <span>{config.emoji}</span>
      {showLabel && <span>{config.label}</span>}
    </span>
  );
}

export function SeverityDot({ severity }: { severity: Severity }) {
  const colors: Record<Severity, string> = {
    critical: "bg-red-500",
    high: "bg-orange-500",
    medium: "bg-yellow-500",
    low: "bg-blue-500",
    info: "bg-gray-400",
  };
  return <span className={cn("inline-block h-2 w-2 rounded-full flex-shrink-0", colors[severity])} />;
}
