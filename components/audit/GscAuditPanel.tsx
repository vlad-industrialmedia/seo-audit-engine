"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useProjectStore } from "@/lib/store/project-store";
import type {
  GscProperty,
  GscAuditResult,
  Ga4Property,
  Ga4AuditResult,
} from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3,
  Search,
  TrendingUp,
  TrendingDown,
  Globe,
  Smartphone,
  Monitor,
  Tablet,
  AlertCircle,
  CheckCircle2,
  Loader2,
  LogIn,
  LogOut,
  RefreshCw,
  Download,
  ChevronDown,
  ChevronUp,
  Info,
} from "lucide-react";

// ─── Константи ────────────────────────────────────────────────────────────────
// GIS скрипт завантажується один раз для всього додатку
const GIS_SCRIPT_URL = "https://accounts.google.com/gsi/client";

// Скопи доступу: GSC readonly + GA4 readonly + Admin API для списку властивостей
const OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/analytics.manage.users.readonly",
].join(" ");

// ─── Декларація типів для Google Identity Services ────────────────────────────
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (resp: { access_token?: string; error?: string }) => void;
          }) => { requestAccessToken: () => void };
        };
      };
    };
  }
}

// ─── Допоміжні компоненти ─────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  sub,
  trend,
}: {
  label: string;
  value: string | number;
  sub?: string;
  trend?: "up" | "down" | "neutral";
}) {
  return (
    <div className="bg-white border rounded-lg p-4 flex flex-col gap-1">
      <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</div>
      <div className="flex items-end gap-2">
        <div className="text-2xl font-bold text-gray-900">{value}</div>
        {trend === "up" && <TrendingUp className="h-4 w-4 text-green-500 mb-1" />}
        {trend === "down" && <TrendingDown className="h-4 w-4 text-red-500 mb-1" />}
      </div>
      {sub && <div className="text-xs text-gray-400">{sub}</div>}
    </div>
  );
}

function SectionHeader({ title, icon: Icon }: { title: string; icon: React.ElementType }) {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
      <Icon className="h-4 w-4 text-blue-500" />
      {title}
    </div>
  );
}

// Форматування числових значень
function fmt(n: number, decimals = 0): string {
  if (n === 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return decimals > 0 ? n.toFixed(decimals) : Math.round(n).toString();
}

function fmtCtr(ctr: number): string {
  return `${(ctr * 100).toFixed(1)}%`;
}

function fmtPos(pos: number): string {
  return pos.toFixed(1);
}

function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ─── Вибір дати (30 / 90 / 180 днів) ─────────────────────────────────────────
function getDateRange(days: number): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: fmt(start), endDate: fmt(end) };
}

// ─── GSC результати ───────────────────────────────────────────────────────────
function GscResults({ data }: { data: GscAuditResult }) {
  const [showPosition4, setShowPosition4] = useState(false);
  const [showLowCtr, setShowLowCtr] = useState(false);

  return (
    <div className="space-y-6">
      {/* Загальні метрики */}
      <div>
        <SectionHeader title="Загальна картина (Search Console)" icon={BarChart3} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard label="Кліки" value={fmt(data.totalClicks)} />
          <MetricCard label="Покази" value={fmt(data.totalImpressions)} />
          <MetricCard
            label="Сер. CTR"
            value={fmtCtr(data.avgCtr)}
            sub={data.avgCtr < 0.03 ? "Низький — треба покращити мета" : undefined}
            trend={data.avgCtr >= 0.05 ? "up" : data.avgCtr < 0.02 ? "down" : "neutral"}
          />
          <MetricCard
            label="Сер. позиція"
            value={fmtPos(data.avgPosition)}
            sub={data.avgPosition <= 10 ? "Перша сторінка 🎉" : "Поза топ-10"}
            trend={data.avgPosition <= 5 ? "up" : data.avgPosition > 20 ? "down" : "neutral"}
          />
        </div>
        <div className="text-xs text-gray-400 mt-2">
          Дані за {data.dateRange.start} — {data.dateRange.end} · Властивість: {data.property}
        </div>
      </div>

      {/* Топ-запити */}
      {data.topQueries.length > 0 && (
        <div>
          <SectionHeader title="Топ-запити (за кліками)" icon={Search} />
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Запит</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Кліки</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Покази</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">CTR</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Позиція</th>
                </tr>
              </thead>
              <tbody>
                {data.topQueries.map((q, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-3 py-1.5 font-mono text-gray-800 max-w-xs truncate">{q.query}</td>
                    <td className="text-right px-3 py-1.5 font-semibold text-gray-700">{fmt(q.clicks)}</td>
                    <td className="text-right px-3 py-1.5 text-gray-500">{fmt(q.impressions)}</td>
                    <td className="text-right px-3 py-1.5">
                      <span className={q.ctr < 0.02 ? "text-red-500" : q.ctr > 0.1 ? "text-green-600" : "text-gray-700"}>
                        {fmtCtr(q.ctr)}
                      </span>
                    </td>
                    <td className="text-right px-3 py-1.5">
                      <span className={q.position <= 3 ? "text-green-600 font-bold" : q.position <= 10 ? "text-blue-600" : "text-gray-400"}>
                        {fmtPos(q.position)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Позиції 4–10: «низько висять» можливості */}
      {data.position4to10.length > 0 && (
        <div>
          <button
            className="flex items-center gap-2 text-sm font-semibold text-amber-700 hover:text-amber-900 mb-2"
            onClick={() => setShowPosition4(!showPosition4)}
          >
            <TrendingUp className="h-4 w-4" />
            Запити на позиціях 4–10 (потенціал росту) — {data.position4to10.length} шт.
            {showPosition4 ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {showPosition4 && (
            <div className="border border-amber-200 rounded-lg overflow-hidden bg-amber-50">
              <table className="w-full text-xs">
                <thead className="bg-amber-100">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-amber-800">Запит</th>
                    <th className="text-right px-3 py-2 font-medium text-amber-800">Покази</th>
                    <th className="text-right px-3 py-2 font-medium text-amber-800">CTR</th>
                    <th className="text-right px-3 py-2 font-medium text-amber-800">Позиція</th>
                  </tr>
                </thead>
                <tbody>
                  {data.position4to10.map((q, i) => (
                    <tr key={i} className="border-t border-amber-100">
                      <td className="px-3 py-1.5 font-mono text-amber-900 max-w-xs truncate">{q.query}</td>
                      <td className="text-right px-3 py-1.5 text-amber-700">{fmt(q.impressions)}</td>
                      <td className="text-right px-3 py-1.5 text-amber-700">{fmtCtr(q.ctr)}</td>
                      <td className="text-right px-3 py-1.5 font-semibold text-amber-800">{fmtPos(q.position)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-3 py-2 text-xs text-amber-600">
                💡 Ці запити вже близько до топ-3. Оптимізація контенту, внутрішні посилання та CTR заголовків можуть підняти позиції.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Сторінки з низьким CTR */}
      {data.lowCtrHighPos.length > 0 && (
        <div>
          <button
            className="flex items-center gap-2 text-sm font-semibold text-red-700 hover:text-red-900 mb-2"
            onClick={() => setShowLowCtr(!showLowCtr)}
          >
            <AlertCircle className="h-4 w-4" />
            Сторінки з низьким CTR при хорошій позиції ({data.lowCtrHighPos.length} шт.)
            {showLowCtr ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {showLowCtr && (
            <div className="border border-red-200 rounded-lg overflow-hidden bg-red-50">
              <table className="w-full text-xs">
                <thead className="bg-red-100">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-red-800">Сторінка</th>
                    <th className="text-right px-3 py-2 font-medium text-red-800">Покази</th>
                    <th className="text-right px-3 py-2 font-medium text-red-800">CTR</th>
                    <th className="text-right px-3 py-2 font-medium text-red-800">Позиція</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lowCtrHighPos.map((p, i) => (
                    <tr key={i} className="border-t border-red-100">
                      <td className="px-3 py-1.5 font-mono text-red-900 max-w-xs truncate">{p.page}</td>
                      <td className="text-right px-3 py-1.5 text-red-700">{fmt(p.impressions)}</td>
                      <td className="text-right px-3 py-1.5 font-bold text-red-600">{fmtCtr(p.ctr)}</td>
                      <td className="text-right px-3 py-1.5 text-red-700">{fmtPos(p.position)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-3 py-2 text-xs text-red-600">
                💡 Ці сторінки показуються в пошуку, але рідко натискаються. Покращте title та meta description.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── GA4 результати ───────────────────────────────────────────────────────────
function Ga4Results({ data }: { data: Ga4AuditResult }) {
  const deviceIcon = (d: string) => {
    if (d === "mobile") return <Smartphone className="h-3 w-3" />;
    if (d === "tablet") return <Tablet className="h-3 w-3" />;
    return <Monitor className="h-3 w-3" />;
  };

  return (
    <div className="space-y-6">
      {/* Загальні метрики GA4 */}
      <div>
        <SectionHeader title="Загальна картина (Google Analytics 4)" icon={BarChart3} />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <MetricCard label="Сесії" value={fmt(data.sessions)} />
          <MetricCard label="Користувачі" value={fmt(data.users)} />
          <MetricCard label="Нові юзери" value={fmt(data.newUsers)} />
          <MetricCard
            label="Відмови"
            value={`${(data.bounceRate * 100).toFixed(1)}%`}
            trend={data.bounceRate > 0.7 ? "down" : data.bounceRate < 0.4 ? "up" : "neutral"}
          />
          <MetricCard
            label="Сес. тривалість"
            value={fmtDuration(data.avgSessionDuration)}
            sub={data.avgSessionDuration < 60 ? "Дуже короткі сесії" : undefined}
          />
        </div>
        <div className="text-xs text-gray-400 mt-2">
          Дані за {data.dateRange.start} — {data.dateRange.end} · {data.property}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Топ-сторінки */}
        {data.topPages.length > 0 && (
          <div className="md:col-span-2">
            <SectionHeader title="Топ-сторінки" icon={Globe} />
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Шлях</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">Сесії</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">Відмови</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topPages.slice(0, 10).map((p, i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="px-3 py-1.5 font-mono text-gray-800 max-w-xs truncate">{p.page}</td>
                      <td className="text-right px-3 py-1.5 font-semibold text-gray-700">{fmt(p.sessions)}</td>
                      <td className="text-right px-3 py-1.5">
                        <span className={p.bounceRate > 0.7 ? "text-red-500" : p.bounceRate < 0.4 ? "text-green-600" : "text-gray-500"}>
                          {(p.bounceRate * 100).toFixed(0)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Пристрої */}
        {data.deviceBreakdown.length > 0 && (
          <div>
            <SectionHeader title="Пристрої" icon={Smartphone} />
            <div className="border rounded-lg p-4 space-y-3">
              {data.deviceBreakdown.map((d, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <div className="flex items-center gap-1.5 text-gray-600 capitalize">
                      {deviceIcon(d.device)}
                      {d.device}
                    </div>
                    <div className="font-semibold text-gray-700">{d.pct.toFixed(1)}%</div>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${d.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Джерела трафіку */}
      {data.topSources.length > 0 && (
        <div>
          <SectionHeader title="Джерела трафіку (топ-10)" icon={TrendingUp} />
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {data.topSources.map((s, i) => (
              <div key={i} className="border rounded-lg p-3 bg-white">
                <div className="text-xs text-gray-500 mb-1">
                  {s.source} / {s.medium}
                </div>
                <div className="font-bold text-gray-800 text-sm">{fmt(s.sessions)}</div>
                <div className="text-xs text-gray-400">сесій</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Головний компонент GscAuditPanel ─────────────────────────────────────────
interface GscAuditPanelProps {
  domain: string;
}

export function GscAuditPanel({ domain }: GscAuditPanelProps) {
  const { settings, updateSettings } = useProjectStore();

  // ─── OAuth стан (не зберігається в localStorage) ──────────────────────────
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [tokenExpiry, setTokenExpiry] = useState<number | null>(null);
  const tokenClientRef = useRef<{ requestAccessToken: () => void } | null>(null);
  const [gisLoaded, setGisLoaded] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  // ─── GSC стан ─────────────────────────────────────────────────────────────
  const [gscProperties, setGscProperties] = useState<GscProperty[]>([]);
  const [selectedGscProperty, setSelectedGscProperty] = useState<string>("");
  const [gscLoading, setGscLoading] = useState(false);
  const [gscResult, setGscResult] = useState<GscAuditResult | null>(null);
  const [gscError, setGscError] = useState<string | null>(null);

  // ─── GA4 стан ─────────────────────────────────────────────────────────────
  const [ga4Properties, setGa4Properties] = useState<Ga4Property[]>([]);
  const [selectedGa4Property, setSelectedGa4Property] = useState<string>("");
  const [ga4Loading, setGa4Loading] = useState(false);
  const [ga4Result, setGa4Result] = useState<Ga4AuditResult | null>(null);
  const [ga4Error, setGa4Error] = useState<string | null>(null);

  // ─── Загальні налаштування ────────────────────────────────────────────────
  const [dateRange, setDateRange] = useState<28 | 90 | 180>(90);
  const [clientIdInput, setClientIdInput] = useState(settings.googleOAuth?.clientId ?? "");
  const [showClientIdHelp, setShowClientIdHelp] = useState(false);
  // Поточний origin для показу у підказці (щоб юзер знав що саме додати в Google Cloud)
  const [currentOrigin, setCurrentOrigin] = useState("http://localhost:3000");

  useEffect(() => {
    // Отримуємо реальний origin в браузері
    if (typeof window !== "undefined") {
      setCurrentOrigin(window.location.origin);
    }
  }, []);

  const clientId = settings.googleOAuth?.clientId ?? "";

  // Перевірка чи токен ще дійсний (GIS видає токени на ~1 годину)
  const isTokenValid = accessToken && tokenExpiry && Date.now() < tokenExpiry;

  // ─── Завантаження GIS скрипта ─────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.google?.accounts) {
      setGisLoaded(true);
      return;
    }
    // Перевіряємо чи скрипт вже підключений
    const existing = document.querySelector(`script[src="${GIS_SCRIPT_URL}"]`);
    if (existing) {
      existing.addEventListener("load", () => setGisLoaded(true));
      return;
    }
    const script = document.createElement("script");
    script.src = GIS_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => setGisLoaded(true);
    document.head.appendChild(script);
  }, []);

  // ─── Ініціалізація GIS token client при зміні clientId або завантаженні ──
  useEffect(() => {
    if (!gisLoaded || !clientId || !window.google?.accounts) return;
    tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: OAUTH_SCOPES,
      callback: (response) => {
        setAuthLoading(false);
        if (response.error || !response.access_token) {
          console.error("GIS OAuth error:", response.error);
          return;
        }
        setAccessToken(response.access_token);
        // GIS токени живуть ~3600 секунд
        setTokenExpiry(Date.now() + 3500 * 1000);
      },
    });
  }, [gisLoaded, clientId]);

  // ─── Автоматичне завантаження властивостей після авторизації ──────────────
  useEffect(() => {
    if (!isTokenValid) return;
    loadProperties();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  // ─── Завантаження GSC та GA4 властивостей ─────────────────────────────────
  const loadProperties = useCallback(async () => {
    if (!accessToken) return;

    // GSC властивості
    const gscRes = await fetch("/api/gsc/properties", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken }),
    });
    if (gscRes.ok) {
      const { properties } = (await gscRes.json()) as { properties: GscProperty[] };
      setGscProperties(properties);
      // Авто-вибір властивості якщо є збіг з доменом проєкту
      const match = properties.find((p) =>
        p.siteUrl.includes(domain.replace(/^https?:\/\//, "").replace(/\/$/, ""))
      );
      if (match) setSelectedGscProperty(match.siteUrl);
      else if (properties.length > 0) setSelectedGscProperty(properties[0].siteUrl);
    }

    // GA4 властивості
    const ga4Res = await fetch("/api/ga4/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken }),
    });
    if (ga4Res.ok) {
      const { properties } = (await ga4Res.json()) as { properties: Ga4Property[] };
      setGa4Properties(properties);
      if (properties.length > 0) setSelectedGa4Property(properties[0].property);
    }
  }, [accessToken, domain]);

  // ─── OAuth: запит токена через GIS ────────────────────────────────────────
  const handleLogin = useCallback(() => {
    if (!tokenClientRef.current) return;
    setAuthLoading(true);
    tokenClientRef.current.requestAccessToken();
  }, []);

  const handleLogout = useCallback(() => {
    setAccessToken(null);
    setTokenExpiry(null);
    setGscProperties([]);
    setGa4Properties([]);
    setGscResult(null);
    setGa4Result(null);
    setSelectedGscProperty("");
    setSelectedGa4Property("");
  }, []);

  // ─── GSC аудит ────────────────────────────────────────────────────────────
  const runGscAudit = useCallback(async () => {
    if (!accessToken || !selectedGscProperty) return;
    setGscLoading(true);
    setGscError(null);
    const { startDate, endDate } = getDateRange(dateRange);
    try {
      const res = await fetch("/api/gsc/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken, siteUrl: selectedGscProperty, startDate, endDate }),
      });
      const data = (await res.json()) as { result?: GscAuditResult; error?: string; detail?: string };
      if (!res.ok || data.error) {
        setGscError(data.detail ?? data.error ?? "Невідома помилка");
      } else if (data.result) {
        setGscResult(data.result);
      }
    } catch (e) {
      setGscError((e as Error).message);
    } finally {
      setGscLoading(false);
    }
  }, [accessToken, selectedGscProperty, dateRange]);

  // ─── GA4 аудит ────────────────────────────────────────────────────────────
  const runGa4Audit = useCallback(async () => {
    if (!accessToken || !selectedGa4Property) return;
    setGa4Loading(true);
    setGa4Error(null);
    const { startDate, endDate } = getDateRange(dateRange);
    try {
      const res = await fetch("/api/ga4/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken, propertyId: selectedGa4Property, startDate, endDate }),
      });
      const data = (await res.json()) as { result?: Ga4AuditResult; error?: string; detail?: string };
      if (!res.ok || data.error) {
        setGa4Error(data.detail ?? data.error ?? "Невідома помилка");
      } else if (data.result) {
        setGa4Result(data.result);
      }
    } catch (e) {
      setGa4Error((e as Error).message);
    } finally {
      setGa4Loading(false);
    }
  }, [accessToken, selectedGa4Property, dateRange]);

  // ─── Збереження Client ID ─────────────────────────────────────────────────
  const saveClientId = useCallback(() => {
    updateSettings({ googleOAuth: { clientId: clientIdInput.trim() } });
  }, [clientIdInput, updateSettings]);

  // ─── Скріншот ─────────────────────────────────────────────────────────────
  const resultsRef = useRef<HTMLDivElement>(null);
  const [screenshotLoading, setScreenshotLoading] = useState(false);

  const handleScreenshot = useCallback(async () => {
    if (!resultsRef.current) return;
    setScreenshotLoading(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(resultsRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      });
      const link = document.createElement("a");
      link.download = `gsc-ga4-audit-${domain}-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (e) {
      console.error("html2canvas помилка:", e);
    } finally {
      setScreenshotLoading(false);
    }
  }, [domain]);

  // ─── Рендер ───────────────────────────────────────────────────────────────

  // Крок 1: немає Client ID
  if (!clientId) {
    return (
      <div className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
          <h3 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
            <LogIn className="h-4 w-4" />
            Підключення Google Search Console та Analytics
          </h3>
          <p className="text-sm text-blue-700 mb-4">
            Щоб підключитись до GSC та GA4, вам потрібен OAuth 2.0 Client ID з вашого Google Cloud Console.
            Це безпечно — ключ використовується лише для авторизації у вашому браузері.
          </p>

          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="Ваш Google OAuth Client ID (1234...apps.googleusercontent.com)"
                value={clientIdInput}
                onChange={(e) => setClientIdInput(e.target.value)}
                className="flex-1 font-mono text-xs"
              />
              <Button
                onClick={saveClientId}
                disabled={!clientIdInput.trim()}
                size="sm"
              >
                Зберегти
              </Button>
            </div>

            <button
              className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800"
              onClick={() => setShowClientIdHelp(!showClientIdHelp)}
            >
              <Info className="h-3 w-3" />
              Як отримати Client ID?
            </button>

            {showClientIdHelp && (
              <div className="bg-white border border-blue-200 rounded-lg p-4 text-xs text-gray-700 space-y-2">
                <div className="font-semibold text-gray-900">Інструкція (займе ~5 хвилин):</div>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Відкрийте <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Google Cloud Console</a></li>
                  <li>Створіть або виберіть проєкт</li>
                  <li>Перейдіть в <strong>APIs &amp; Services → Credentials</strong></li>
                  <li>Натисніть <strong>+ Create Credentials → OAuth 2.0 Client ID</strong></li>
                  <li>Тип: <strong>Web application</strong></li>
                  <li>
                    В &quot;Authorized JavaScript origins&quot; додайте ваш поточний origin:
                    <div className="mt-1 flex items-center gap-2">
                      <code className="bg-amber-50 border border-amber-200 text-amber-800 px-2 py-0.5 rounded font-mono text-xs">
                        {currentOrigin}
                      </code>
                      <button
                        className="text-blue-600 hover:text-blue-800 underline"
                        onClick={() => navigator.clipboard.writeText(currentOrigin)}
                        type="button"
                      >
                        копіювати
                      </button>
                    </div>
                    {currentOrigin !== "http://localhost:3000" && (
                      <div className="mt-1 text-gray-500">
                        Також додайте <code className="bg-gray-100 px-1 rounded">http://localhost:3000</code> для локальної розробки
                      </div>
                    )}
                  </li>
                  <li>Скопіюйте Client ID (вигляд: <code className="bg-gray-100 px-1 rounded">1234...apps.googleusercontent.com</code>)</li>
                  <li>Увімкніть APIs: <strong>Google Search Console API</strong> та <strong>Google Analytics Data API</strong></li>
                </ol>
                <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-amber-800">
                  ⚠️ Якщо Google блокує вхід з помилкою &quot;не відповідає правилам OAuth 2.0&quot; — переконайтесь, що в Credentials додано саме <strong>{currentOrigin}</strong> (без слешу в кінці)
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Крок 2: є Client ID але не авторизовано
  if (!isTokenValid) {
    return (
      <div className="space-y-4">
        <div className="bg-white border rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <LogIn className="h-4 w-4 text-blue-500" />
              Google Search Console + Analytics
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => updateSettings({ googleOAuth: undefined })}
              className="text-xs text-gray-400"
            >
              Змінити Client ID
            </Button>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Client ID налаштовано. Натисніть кнопку нижче, щоб авторизуватись через Google.
            Браузер покаже вікно вибору акаунту Google.
          </p>
          <div className="flex gap-3">
            <Button
              onClick={handleLogin}
              disabled={!gisLoaded || authLoading}
              className="flex items-center gap-2"
            >
              {authLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogIn className="h-4 w-4" />
              )}
              {authLoading ? "Очікування авторизації..." : "Увійти через Google"}
            </Button>
          </div>
          {!gisLoaded && (
            <p className="text-xs text-gray-400 mt-2">
              Завантаження Google Identity Services...
            </p>
          )}
        </div>
      </div>
    );
  }

  // Крок 3: авторизовано — показуємо панель аудиту
  return (
    <div className="space-y-6">
      {/* Шапка: статус авторизації + дія виходу */}
      <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm text-green-800">
          <CheckCircle2 className="h-4 w-4" />
          <span>Google авторизовано</span>
        </div>
        <div className="flex items-center gap-2">
          {(gscResult || ga4Result) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleScreenshot}
              disabled={screenshotLoading}
              className="text-xs text-gray-500 h-7"
            >
              {screenshotLoading ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <Download className="h-3 w-3 mr-1" />
              )}
              PNG
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="text-xs text-gray-500 h-7"
          >
            <LogOut className="h-3 w-3 mr-1" />
            Вийти
          </Button>
        </div>
      </div>

      {/* Налаштування: вибір властивостей та діапазону дат */}
      <div className="bg-white border rounded-xl p-4 space-y-4">
        <div className="font-medium text-sm text-gray-700">Параметри аудиту</div>

        {/* Вибір діапазону дат */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Період:</span>
          {([28, 90, 180] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDateRange(d)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                dateRange === d
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-600 border-gray-200 hover:border-blue-400"
              }`}
            >
              {d} днів
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* GSC властивість */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">GSC властивість</label>
            {gscProperties.length > 0 ? (
              <div className="flex gap-2">
                <select
                  value={selectedGscProperty}
                  onChange={(e) => setSelectedGscProperty(e.target.value)}
                  className="flex-1 border rounded-lg px-3 py-1.5 text-sm text-gray-800 bg-white"
                >
                  {gscProperties.map((p) => (
                    <option key={p.siteUrl} value={p.siteUrl}>
                      {p.siteUrl} ({p.permissionLevel})
                    </option>
                  ))}
                </select>
                <Button
                  onClick={runGscAudit}
                  disabled={gscLoading || !selectedGscProperty}
                  size="sm"
                  className="whitespace-nowrap"
                >
                  {gscLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  {gscLoading ? "" : "Аудит GSC"}
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-gray-400 border rounded-lg px-3 py-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                Завантаження властивостей...
              </div>
            )}
          </div>

          {/* GA4 властивість */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">GA4 властивість</label>
            {ga4Properties.length > 0 ? (
              <div className="flex gap-2">
                <select
                  value={selectedGa4Property}
                  onChange={(e) => setSelectedGa4Property(e.target.value)}
                  className="flex-1 border rounded-lg px-3 py-1.5 text-sm text-gray-800 bg-white"
                >
                  {ga4Properties.map((p) => (
                    <option key={p.property} value={p.property}>
                      {p.displayName} ({p.account})
                    </option>
                  ))}
                </select>
                <Button
                  onClick={runGa4Audit}
                  disabled={ga4Loading || !selectedGa4Property}
                  size="sm"
                  className="whitespace-nowrap"
                >
                  {ga4Loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
                  {ga4Loading ? "" : "Аудит GA4"}
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-gray-400 border rounded-lg px-3 py-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                Завантаження властивостей...
              </div>
            )}
          </div>
        </div>

        {/* Кнопка оновлення властивостей */}
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={loadProperties}
            className="text-xs text-gray-400"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Оновити список властивостей
          </Button>
        </div>
      </div>

      {/* Результати */}
      <div ref={resultsRef} className="space-y-6">
        {/* GSC результати або помилка */}
        {gscError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
            <div className="font-semibold mb-1">Помилка GSC</div>
            <div className="font-mono text-xs">{gscError}</div>
          </div>
        )}
        {gscResult && <GscResults data={gscResult} />}

        {/* Роздільник між GSC та GA4 */}
        {gscResult && ga4Result && (
          <div className="border-t border-gray-200 pt-2" />
        )}

        {/* GA4 результати або помилка */}
        {ga4Error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
            <div className="font-semibold mb-1">Помилка GA4</div>
            <div className="font-mono text-xs">{ga4Error}</div>
          </div>
        )}
        {ga4Result && <Ga4Results data={ga4Result} />}

        {/* Заглушка якщо ще нічого не запускали */}
        {!gscResult && !ga4Result && !gscLoading && !ga4Loading && (
          <div className="text-center py-12 text-gray-400">
            <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <div className="text-sm">
              Виберіть властивість вище та натисніть кнопку аудиту
            </div>
            <div className="text-xs mt-1">
              Або запустіть обидва — GSC і GA4 — одночасно для повної картини
            </div>
            <div className="flex justify-center gap-3 mt-4">
              <Button
                onClick={() => { void runGscAudit(); void runGa4Audit(); }}
                disabled={!selectedGscProperty && !selectedGa4Property}
                size="sm"
                className="text-xs"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Запустити обидва аудити
              </Button>
            </div>
          </div>
        )}

        {/* Індикатор завантаження */}
        {(gscLoading || ga4Loading) && !gscResult && !ga4Result && (
          <div className="flex items-center justify-center gap-3 py-8 text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
            <span className="text-sm">
              {gscLoading && ga4Loading ? "Завантаження GSC та GA4 даних..." :
               gscLoading ? "Завантаження GSC даних..." :
               "Завантаження GA4 даних..."}
            </span>
          </div>
        )}
      </div>

      {/* Нотатка про безпеку */}
      <div className="text-xs text-gray-400 border-t pt-3">
        🔒 Токен доступу зберігається лише в пам&apos;яті браузера та не передається третім особам.
        При перезавантаженні сторінки потрібна повторна авторизація.
      </div>
    </div>
  );
}

export default GscAuditPanel;
