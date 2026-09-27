"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, FolderOpen, Settings, Search, Moon, Sun, Github,
} from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useProjectStore } from "@/lib/store/project-store";

const NAV_ITEMS = [
  { href: "/", icon: LayoutDashboard, label: "Дашборд" },
  { href: "/projects", icon: FolderOpen, label: "Проєкти" },
  { href: "/settings", icon: Settings, label: "Налаштування" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { projects } = useProjectStore();

  return (
    <aside className="fixed left-0 top-0 h-screen w-56 border-r bg-card flex flex-col z-10">
      {/* Logo */}
      <div className="p-4 border-b">
        <Link href="/" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
            SE
          </div>
          <div>
            <p className="font-semibold text-sm leading-tight">SEO Audit</p>
            <p className="text-[10px] text-muted-foreground">Engine v1.0</p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {label}
            </Link>
          );
        })}

        {/* Recent projects */}
        {projects.length > 0 && (
          <div className="pt-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-3 mb-1.5">
              Останні проєкти
            </p>
            {projects.slice(0, 5).map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors",
                  pathname === `/projects/${project.id}`
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <div className="h-1.5 w-1.5 rounded-full bg-current flex-shrink-0" />
                <span className="truncate">{project.name}</span>
              </Link>
            ))}
          </div>
        )}
      </nav>

      {/* Bottom actions */}
      <div className="p-3 border-t space-y-2">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Тема</span>
          </Button>

          <a
            href="https://github.com/searchfit-seo/seo-audit-engine"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent transition-colors"
          >
            <Github className="h-4 w-4" />
          </a>

          <div className="flex-1" />
          <span className="text-[10px] text-muted-foreground">{projects.length} проєктів</span>
        </div>
      </div>
    </aside>
  );
}
