"use client";

import { usePathname } from "next/navigation";
import { ChevronDown, Circle, Search, Filter, GitBranch, X, ChevronUp } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { useRealtimeStore } from "@/store/realtime";
import { useForecastFilters, TimeKey } from "@/store/forecastFilters";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { NotificationBell, NotificationCenter } from "@/components/notifications/NotificationCenter";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard/overview":  "Overview",
  "/dashboard/forecasts": "Forecasts",
  "/dashboard/scenarios": "Scenario Planning",
  "/dashboard/builder":   "AI Dashboard Builder",
  "/dashboard/data":      "Data Management",
  "/dashboard/settings":  "Settings",
};

const TIME_PRESETS = [
  { key: "past_4w"  as TimeKey, label: "Last 4w"  },
  { key: "next_8w"  as TimeKey, label: "Next 8w"  },
  { key: "next_13w" as TimeKey, label: "Next 13w" },
  { key: "past_26w" as TimeKey, label: "Last 26w" },
];

const STATUS_OPTIONS = [
  { key: "exception",  label: "Exception"  },
  { key: "overridden", label: "Overridden" },
  { key: "normal",     label: "Normal"     },
];

interface ScenarioNode {
  id: string; name: string; depth: number; is_protected: boolean; children: ScenarioNode[];
}

function flattenTree(nodes: ScenarioNode[], depth = 0): Array<{ id: string; name: string; depth: number; is_protected: boolean }> {
  return nodes.flatMap((n) => [
    { id: n.id, name: n.name, depth, is_protected: n.is_protected },
    ...flattenTree(n.children ?? [], depth + 1),
  ]);
}

export function Header() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const { connected, presence } = useRealtimeStore();
  const [showUserMenu, setShowUserMenu]           = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showFilters, setShowFilters]             = useState(false);

  const isForecast = pathname?.startsWith("/dashboard/forecasts") ?? false;
  const title = Object.entries(PAGE_TITLES).find(([k]) => pathname?.startsWith(k))?.[1] ?? "DemandIQ";

  const {
    search, scenario, timeRange, category, location, statusF,
    setSearch, setScenario, setTimeRange, setCategory, setLocation, setStatusF, clearAll,
  } = useForecastFilters();

  const { data: scenarioTree } = useQuery<ScenarioNode[]>({
    queryKey: ["scenarios-tree"],
    queryFn: () => api.get("/scenarios/tree").then((r) => r.data),
    enabled: isForecast,
    staleTime: 5 * 60 * 1000,
  });
  const flatScenarios = flattenTree(scenarioTree ?? []);

  const hasAnyFilter = isForecast && !!(search || scenario || category || location || statusF || timeRange !== "next_8w");
  const activeFilterCount = isForecast
    ? [search, scenario, category, location, statusF, timeRange !== "next_8w" ? "1" : ""].filter(Boolean).length
    : 0;

  const selCls = "h-7 text-xs border border-gray-200 rounded-md px-2 bg-white focus:outline-none focus:ring-1 focus:ring-brand-500 text-gray-600";

  return (
    <>
      <NotificationCenter open={showNotifications} onClose={() => setShowNotifications(false)} />

      <header className="bg-white border-b border-gray-100 px-6 flex-shrink-0">

        {/* ── Main row — always a single line ── */}
        <div className="h-14 flex items-center gap-3 min-w-0">

          {/* Page title */}
          <h2 className="font-semibold text-gray-900 flex-shrink-0">{title}</h2>

          {/* Filter toggle button — only on forecast page */}
          {isForecast && (
            <>
              <div className="w-px h-5 bg-gray-200 flex-shrink-0" />
              <button
                onClick={() => setShowFilters((v) => !v)}
                className={[
                  "flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium border transition-colors flex-shrink-0",
                  showFilters || hasAnyFilter
                    ? "bg-brand-50 text-brand-700 border-brand-200"
                    : "bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700",
                ].join(" ")}
              >
                <Filter className="w-3.5 h-3.5" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="ml-0.5 bg-brand-600 text-white rounded-full w-4 h-4 text-[10px] flex items-center justify-center font-semibold leading-none">
                    {activeFilterCount}
                  </span>
                )}
                {showFilters
                  ? <ChevronUp className="w-3 h-3 ml-0.5 opacity-60" />
                  : <ChevronDown className="w-3 h-3 ml-0.5 opacity-60" />
                }
              </button>
            </>
          )}

          {/* Spacer — pushes everything right */}
          <div className="flex-1 min-w-0" />

          {/* Presence avatars */}
          {presence.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400 flex-shrink-0">
              <div className="flex -space-x-1">
                {presence.slice(0, 4).map((p: any) => (
                  <div
                    key={p.userId}
                    className="w-6 h-6 rounded-full bg-brand-500 border-2 border-white flex items-center justify-center text-white text-xs font-medium"
                    title={p.name}
                  >
                    {p.name?.[0]?.toUpperCase()}
                  </div>
                ))}
              </div>
              {presence.length > 4 && <span>+{presence.length - 4} online</span>}
            </div>
          )}

          {/* Connection status */}
          <div className="flex items-center gap-1.5 text-xs flex-shrink-0">
            <Circle className={`w-2 h-2 fill-current ${connected ? "text-green-500" : "text-yellow-500"}`} />
            <span className="text-gray-400">{connected ? "Live" : "Reconnecting..."}</span>
          </div>

          {/* Notification bell */}
          <NotificationBell onClick={() => setShowNotifications(true)} />

          {/* User menu */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 hover:bg-gray-50 rounded-lg px-2 py-1.5 transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center text-white text-xs font-semibold">
                {user?.name?.[0]?.toUpperCase() ?? "U"}
              </div>
              <div className="text-left hidden sm:block">
                <p className="text-sm font-medium text-gray-700 leading-none">{user?.name ?? "User"}</p>
                <p className="text-xs text-gray-400 mt-0.5">{user?.tenant_name ?? "Workspace"}</p>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            </button>
            {showUserMenu && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl border border-gray-100 shadow-lg py-1 z-50">
                <button
                  onClick={logout}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Collapsible filter row ── */}
        {isForecast && showFilters && (
          <div className="flex flex-wrap items-center gap-2 pb-3 pt-1 border-t border-gray-100">

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search SKU / product…"
                className="pl-6 pr-2 h-7 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500 bg-white w-44"
              />
            </div>

            {/* Scenario */}
            <div className="flex items-center gap-1">
              <GitBranch className="w-3 h-3 text-gray-400 flex-shrink-0" />
              <select value={scenario} onChange={(e) => setScenario(e.target.value)} className={`${selCls} max-w-[150px]`}>
                <option value="">All scenarios</option>
                {flatScenarios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {"\u00a0".repeat(s.depth * 2)}{s.is_protected ? "🔒 " : ""}{s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Time presets */}
            <div className="flex items-center gap-0.5 bg-gray-100 rounded-md p-0.5">
              {TIME_PRESETS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTimeRange(t.key)}
                  className={[
                    "px-2 h-6 text-xs font-medium rounded transition-colors whitespace-nowrap",
                    timeRange === t.key
                      ? "bg-white text-brand-700 shadow-sm"
                      : "text-gray-500 hover:text-gray-700",
                  ].join(" ")}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Category */}
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={`${selCls} max-w-[140px]`}>
              <option value="">All Categories</option>
              <option value="Beverages">Beverages</option>
              <option value="Snacks">Snacks</option>
              <option value="Dairy">Dairy</option>
              <option value="Household">Household</option>
              <option value="Personal Care">Personal Care</option>
              <option value="Frozen">Frozen</option>
              <option value="Bakery">Bakery</option>
            </select>

            {/* Location */}
            <select value={location} onChange={(e) => setLocation(e.target.value)} className={`${selCls} max-w-[130px]`}>
              <option value="">All Locations</option>
              <option value="DC-East">DC-East</option>
              <option value="DC-West">DC-West</option>
              <option value="DC-Central">DC-Central</option>
              <option value="DC-South">DC-South</option>
              <option value="DC-North">DC-North</option>
            </select>

            {/* Status pills */}
            <div className="flex items-center gap-1">
              {STATUS_OPTIONS.map(({ key, label }) => {
                const active = statusF === key;
                return (
                  <button
                    key={key}
                    onClick={() => setStatusF(active ? "" : key)}
                    className={[
                      "h-7 px-2.5 rounded-md text-xs font-medium border transition-colors",
                      active
                        ? key === "exception"  ? "bg-red-50 text-red-700 border-red-200"
                        : key === "overridden" ? "bg-blue-50 text-blue-700 border-blue-200"
                        :                        "bg-green-50 text-green-700 border-green-200"
                        : "bg-white text-gray-400 border-gray-200 hover:border-gray-300 hover:text-gray-600",
                    ].join(" ")}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Clear all */}
            {hasAnyFilter && (
              <button
                onClick={clearAll}
                className="flex items-center gap-1 h-7 px-2 text-xs text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-50 border border-transparent hover:border-gray-200 transition-colors"
              >
                <X className="w-3 h-3" /> Clear all
              </button>
            )}
          </div>
        )}

        {/* Active filter chips — visible when filters are collapsed but active */}
        {hasAnyFilter && !showFilters && (
          <div className="flex flex-wrap items-center gap-1.5 pb-2 -mt-1">
            {scenario && flatScenarios.find((s) => s.id === scenario) && (
              <FilterChip
                label={flatScenarios.find((s) => s.id === scenario)!.name}
                onRemove={() => setScenario("")}
                color="brand"
                icon={<GitBranch className="w-3 h-3" />}
              />
            )}
            {timeRange !== "next_8w" && (
              <FilterChip
                label={TIME_PRESETS.find((t) => t.key === timeRange)?.label ?? ""}
                onRemove={() => setTimeRange("next_8w")}
              />
            )}
            {category && <FilterChip label={category}       onRemove={() => setCategory("")} />}
            {location && <FilterChip label={location}       onRemove={() => setLocation("")} />}
            {statusF  && (
              <FilterChip
                label={statusF}
                onRemove={() => setStatusF("")}
                color={statusF === "exception" ? "red" : statusF === "overridden" ? "blue" : "green"}
              />
            )}
            {search   && <FilterChip label={`"${search}"`} onRemove={() => setSearch("")} />}
          </div>
        )}
      </header>
    </>
  );
}

function FilterChip({ label, onRemove, icon, color = "gray" }: {
  label: string; onRemove: () => void; icon?: React.ReactNode;
  color?: "gray" | "brand" | "red" | "blue" | "green";
}) {
  const cls = {
    gray:  "bg-gray-100 text-gray-600 border-gray-200",
    brand: "bg-brand-50 text-brand-700 border-brand-200",
    red:   "bg-red-50 text-red-700 border-red-200",
    blue:  "bg-blue-50 text-blue-700 border-blue-200",
    green: "bg-green-50 text-green-700 border-green-200",
  }[color];
  return (
    <span className={`inline-flex items-center gap-1 border rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {icon}{label}
      <button onClick={onRemove} className="ml-0.5 opacity-60 hover:opacity-100">
        <X className="w-2.5 h-2.5" />
      </button>
    </span>
  );
}
