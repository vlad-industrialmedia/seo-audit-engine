"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { v4 as uuidv4 } from "uuid";
import type { Project, Audit, Finding, AuditSummary, AppSettings, AIProvider } from "@/types";
import { buildAuditSummary } from "@/lib/rule-engine/engine";

interface ProjectStore {
  projects: Project[];
  currentProjectId: string | null;
  settings: AppSettings;

  // Projects
  createProject: (name: string, domain: string, description?: string) => Project;
  updateProject: (id: string, updates: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  setCurrentProject: (id: string | null) => void;
  getProject: (id: string) => Project | undefined;

  // Audits
  createAudit: (projectId: string, name: string) => Audit;
  updateAudit: (projectId: string, auditId: string, updates: Partial<Audit>) => void;
  deleteAudit: (projectId: string, auditId: string) => void;
  getAudit: (projectId: string, auditId: string) => Audit | undefined;

  // Findings (checklist)
  toggleFindingChecked: (projectId: string, auditId: string, ruleId: string, url: string) => void;
  updateFindingNote: (projectId: string, auditId: string, ruleId: string, url: string, note: string) => void;
  updateFindingAiExplanation: (projectId: string, auditId: string, ruleId: string, url: string, aiExplanation: string) => void;
  updateFindingVerification: (projectId: string, auditId: string, ruleId: string, status: "verified" | "false_positive" | "unverified", note: string) => void;

  // Settings
  updateSettings: (updates: Partial<AppSettings>) => void;
  setApiKey: (provider: AIProvider, apiKey: string) => void;
  setApiKeyValidated: (provider: AIProvider, validated: boolean) => void;
  setDefaultProvider: (provider: AIProvider | undefined) => void;
  setProviderModel: (provider: AIProvider, model: string) => void;

  // Очистка проєкту
  clearProjectAudits: (id: string) => void;

  // Import / Export
  exportProject: (id: string) => string;
  importProject: (json: string) => Project | null;
}

const defaultSettings: AppSettings = {
  aiProviders: {
    anthropic: { provider: "anthropic", apiKey: "", label: "Anthropic (Claude)", description: "", models: [] },
    openrouter: { provider: "openrouter", apiKey: "", label: "OpenRouter", description: "", models: [] },
    gemini: { provider: "gemini", apiKey: "", label: "Google Gemini", description: "", models: [] },
    grok: { provider: "grok", apiKey: "", label: "xAI Grok", description: "", models: [] },
    groq: { provider: "groq", apiKey: "", label: "Groq (LPU)", description: "", models: [] },
    cerebras: { provider: "cerebras", apiKey: "", label: "Cerebras", description: "", models: [] },
  },
  theme: "system",
};

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set, get) => ({
      projects: [],
      currentProjectId: null,
      settings: defaultSettings,

      createProject: (name, domain, description) => {
        const project: Project = {
          id: uuidv4(),
          name,
          domain,
          description,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          audits: [],
          settings: {
            enabledRulePacks: ["seo_core"],
            sampleSize: 3,
            pageTypeWeights: {
              homepage: 2, category: 1.5, product: 1.5, blog: 1,
              service: 1, filter: 0.5, pagination: 0.3, search: 0.3,
              tag: 0.3, "404": 1, other: 0.5,
            },
          },
        };
        set((s) => ({ projects: [...s.projects, project] }));
        return project;
      },

      updateProject: (id, updates) => {
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p
          ),
        }));
      },

      deleteProject: (id) => {
        set((s) => ({
          projects: s.projects.filter((p) => p.id !== id),
          currentProjectId: s.currentProjectId === id ? null : s.currentProjectId,
        }));
      },

      setCurrentProject: (id) => set({ currentProjectId: id }),

      getProject: (id) => get().projects.find((p) => p.id === id),

      createAudit: (projectId, name) => {
        const audit: Audit = {
          id: uuidv4(),
          projectId,
          name,
          createdAt: new Date().toISOString(),
          status: "pending",
          progress: 0,
          pagesAnalyzed: 0,
          pagesTotal: 0,
          summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0, checked: 0 },
          findings: [],
          pages: [],
          sfImportFiles: [],
          rulePacks: ["seo_core"],
        };
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === projectId
              ? { ...p, audits: [...p.audits, audit], updatedAt: new Date().toISOString() }
              : p
          ),
        }));
        return audit;
      },

      updateAudit: (projectId, auditId, updates) => {
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  audits: p.audits.map((a) =>
                    a.id === auditId ? { ...a, ...updates } : a
                  ),
                  updatedAt: new Date().toISOString(),
                }
              : p
          ),
        }));
      },

      deleteAudit: (projectId, auditId) => {
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === projectId
              ? { ...p, audits: p.audits.filter((a) => a.id !== auditId) }
              : p
          ),
        }));
      },

      getAudit: (projectId, auditId) => {
        const project = get().projects.find((p) => p.id === projectId);
        return project?.audits.find((a) => a.id === auditId);
      },

      toggleFindingChecked: (projectId, auditId, ruleId, url) => {
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  audits: p.audits.map((a) => {
                    if (a.id !== auditId) return a;
                    const findings = a.findings.map((f) =>
                      f.ruleId === ruleId && f.url === url
                        ? { ...f, checked: !f.checked }
                        : f
                    );
                    return { ...a, findings, summary: buildAuditSummary(findings) };
                  }),
                }
              : p
          ),
        }));
      },

      updateFindingNote: (projectId, auditId, ruleId, url, note) => {
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  audits: p.audits.map((a) =>
                    a.id === auditId
                      ? {
                          ...a,
                          findings: a.findings.map((f) =>
                            f.ruleId === ruleId && f.url === url ? { ...f, notes: note } : f
                          ),
                        }
                      : a
                  ),
                }
              : p
          ),
        }));
      },

      updateFindingAiExplanation: (projectId, auditId, ruleId, url, aiExplanation) => {
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  audits: p.audits.map((a) =>
                    a.id === auditId
                      ? {
                          ...a,
                          findings: a.findings.map((f) =>
                            f.ruleId === ruleId && f.url === url ? { ...f, aiExplanation } : f
                          ),
                        }
                      : a
                  ),
                }
              : p
          ),
        }));
      },

      updateFindingVerification: (projectId, auditId, ruleId, status, note) => {
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  audits: p.audits.map((a) =>
                    a.id === auditId
                      ? {
                          ...a,
                          findings: a.findings.map((f) =>
                            f.ruleId === ruleId
                              ? { ...f, verificationStatus: status, verificationNote: note }
                              : f
                          ),
                        }
                      : a
                  ),
                }
              : p
          ),
        }));
      },

      updateSettings: (updates) => {
        set((s) => ({ settings: { ...s.settings, ...updates } }));
      },

      setApiKey: (provider, apiKey) => {
        set((s) => ({
          settings: {
            ...s.settings,
            aiProviders: {
              ...s.settings.aiProviders,
              [provider]: {
                ...s.settings.aiProviders[provider],
                apiKey,
                validated: false,
                validatedAt: undefined,
              },
            },
          },
        }));
      },

      setApiKeyValidated: (provider, validated) => {
        set((s) => ({
          settings: {
            ...s.settings,
            aiProviders: {
              ...s.settings.aiProviders,
              [provider]: {
                ...s.settings.aiProviders[provider],
                validated,
                validatedAt: validated ? new Date().toISOString() : undefined,
              },
            },
          },
        }));
      },

      setDefaultProvider: (provider) => {
        set((s) => ({ settings: { ...s.settings, defaultProvider: provider } }));
      },

      setProviderModel: (provider, model) => {
        set((s) => ({
          settings: {
            ...s.settings,
            aiProviders: {
              ...s.settings.aiProviders,
              [provider]: { ...s.settings.aiProviders[provider], model },
            },
          },
        }));
      },

      // Видаляє всі аудити проєкту, скидає до початкового стану
      clearProjectAudits: (id) => {
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id ? { ...p, audits: [], updatedAt: new Date().toISOString() } : p
          ),
        }));
      },

      exportProject: (id) => {
        const project = get().projects.find((p) => p.id === id);
        if (!project) return "";
        return JSON.stringify(project, null, 2);
      },

      importProject: (json) => {
        try {
          const project = JSON.parse(json) as Project;
          // Assign new ID to avoid collision
          const imported = { ...project, id: uuidv4(), name: `${project.name} (імпорт)` };
          set((s) => ({ projects: [...s.projects, imported] }));
          return imported;
        } catch {
          return null;
        }
      },
    }),
    {
      name: "seo-audit-projects",
      // Зберігаємо стан у localStorage; API ключі включаємо (локальний застосунок)
      partialize: (state) => ({
        projects: state.projects,
        currentProjectId: state.currentProjectId,
        settings: {
          ...state.settings,
          aiProviders: Object.fromEntries(
            Object.entries(state.settings.aiProviders).map(([k, v]) => [k, { ...v }])
          ),
        },
      }),
      // Merge дефолтів поверх збереженого стану — щоб нові провайдери з'являлись
      // автоматично після оновлення без необхідності чистити localStorage
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<typeof currentState>;
        const mergedProviders = {
          ...currentState.settings.aiProviders,
          ...(persisted?.settings?.aiProviders ?? {}),
        };
        return {
          ...currentState,
          ...persisted,
          settings: {
            ...currentState.settings,
            ...(persisted?.settings ?? {}),
            aiProviders: mergedProviders,
          },
        };
      },
    }
  )
);
