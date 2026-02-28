"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  SortingState,
} from "@tanstack/react-table";
import { api } from "@/lib/api";
import {
  Search, Download, Play, ChevronUp, ChevronDown,
  ChevronsUpDown, AlertTriangle, CheckCircle2, Edit3, X, Check,
  RefreshCw, GitBranch, Filter,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────

interface SKURow {
  sku_id: string;
  name: string;
  category: string;
  location: string;
  mape: number;
  bias: number;
  status: "normal" | "exception" | "overridden";
  actuals: number[];
  forecast: number[];
  override: number | null;
}

interface OverrideCell {
  skuId: string;
  weekIdx: number;
  currentValue: number;
  skuName: string;
}

interface ScenarioNode {
  id: string;
  name: string;
  depth: number;
  is_protected: boolean;
  children: ScenarioNode[];
}

// ─── Time presets ─────────────────────────────────────────────

const TIME_PRESETS = [
  { key: "past_4w",  label: "Last 4w",  hist: 4,  fct: 0  },
  { key: "next_8w",  label: "Next 8w",  hist: 4,  fct: 8  },
  { key: "next_13w", label: "Next 13w", hist: 4,  fct: 13 },
  { key: "past_26w", label: "Last 26w", hist: 26, fct: 0  },
] as const;

type TimeKey = typeof TIME_PRESETS[number]["key"];

const STATUS_OPTIONS = [
  { key: "exception", label: "Exception" },
  { key: "overridden", label: "Overridden" },
  { key: "normal", label: "Normal" },
];

// ─── Helpers ──────────────────────────────────────────────────

function flattenTree(
  nodes: ScenarioNode[],
  depth = 0
): Array<{ id: string; name: string; depth: number; is_protected: boolean }> {
  return nodes.flatMap((n) => [
    { id: n.id, name: n.name, depth, is_protected: n.is_protected },
    ...flattenTree(n.children ?? [], depth + 1),
  ]);
}

function fmtNum(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function weekLabel(offset: number) {
  const now = new Date();
  const d = new Date(now);
  d.setDate(now.getDate() + offset * 7);
  return `W${getISOWeek(d)}`;
}

function getISOWeek(d: Date) {
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const diff = d.getTime() - jan4.getTime();
  return Math.ceil((diff / 86400000 + jan4.getDay() + 1) / 7);
}

function statusBadge(status: string) {
  if (status === "exception")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700">
        <AlertTriangle className="w-3 h-3" /> Exception
      </span>
    );
  if (status === "overridden")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
        <Edit3 className="w-3 h-3" /> Overridden
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">
      <CheckCircle2 className="w-3 h-3" /> Normal
    </span>
  );
}

function mapeColor(mape: number) {
  if (mape > 15) return "text-red-600 font-semibold";
  if (mape > 8) return "text-yellow-600";
  return "text-green-600";
}

// ─── Override Popover ─────────────────────────────────────────

function OverridePopover({
  cell,
  onClose,
  onSave,
}: {
  cell: OverrideCell;
  onClose: () => void;
  onSave: (val: number, reason: string) => void;
}) {
  const [val, setVal] = useState(String(cell.currentValue));
  const [reason, setReason] = useState("");

  return (
    <div
      className="absolute z-50 w-72 bg-white rounded-xl border border-gray-200 shadow-xl p-4"
      style={{ top: "100%", left: 0 }}
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">Override Forecast</p>
          <p className="text-xs text-gray-400">{cell.skuName}</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="w-4 h-4" />
        </button>
      </div>

      <label className="block text-xs text-gray-500 mb-1">New value (units)</label>
      <input
        autoFocus
        type="number"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 mb-3"
        placeholder={String(cell.currentValue)}
      />

      <label className="block text-xs text-gray-500 mb-1">Reason (optional)</label>
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 mb-4"
        placeholder="e.g. Promo lift expected"
      />

      <div className="flex gap-2">
        <button
          onClick={() => onSave(Number(val), reason)}
          disabled={!val || isNaN(Number(val))}
          className="flex-1 bg-brand-600 text-white text-sm rounded-lg py-2 hover:bg-brand-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          <Check className="w-3.5 h-3.5" /> Save Override
        </button>
        <button
          onClick={onClose}
          className="px-4 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Forecast Cell ────────────────────────────────────────────

function ForecastCell({
  value, skuId, skuName, weekIdx, isHistorical, onOverrideSaved,
}: {
  value: number;
  skuId: string;
  skuName: string;
  weekIdx: number;
  isHistorical: boolean;
  onOverrideSaved: (skuId: string, weekIdx: number, newVal: number) => void;
}) {
  const [open, setOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: (body: { override_value: number; reason: string }) =>
      api.post("/forecasts/overrides", {
        sku_id: skuId,
        location: "DC-East",
        period: weekLabel(weekIdx + 1),
        override_value: body.override_value,
        reason: body.reason,
      }),
    onSuccess: (_, vars) => {
      onOverrideSaved(skuId, weekIdx, vars.override_value);
      setOpen(false);
    },
  });

  if (isHistorical)
    return <span className="text-gray-400 text-xs font-mono">{fmtNum(value)}</span>;

  return (
    <div className="relative group">
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-mono text-gray-700 group-hover:text-brand-600 hover:underline cursor-pointer"
      >
        {fmtNum(value)}
      </button>
      {open && (
        <OverridePopover
          cell={{ skuId, weekIdx, currentValue: value, skuName }}
          onClose={() => setOpen(false)}
          onSave={(val, reason) => mutation.mutate({ override_value: val, reason })}
        />
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────

const colHelper = createColumnHelper<SKURow>();

export default function ForecastsPage() {
  const [page, setPage]     = useState(1);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState("");
  const [statusF, setStatusF]   = useState("");
  const [scenario, setScenario] = useState("");
  const [timeRange, setTimeRange] = useState<TimeKey>("next_8w");
  const [sorting, setSorting]   = useState<SortingState>([]);
  const [overrides, setOverrides] = useState<Record<string, number>>({});

  const qc = useQueryClient();

  // ── Scenarios ──
  const { data: scenarioTree } = useQuery<ScenarioNode[]>({
    queryKey: ["scenarios-tree"],
    queryFn: () => api.get("/scenarios/tree").then((r) => r.data),
  });

  const flatScenarios = useMemo(
    () => flattenTree(scenarioTree ?? []),
    [scenarioTree]
  );

  const selectedScenarioName = scenario
    ? flatScenarios.find((s) => s.id === scenario)?.name ?? null
    : null;

  // ── Time config ──
  const timeConfig = TIME_PRESETS.find((t) => t.key === timeRange) ?? TIME_PRESETS[1];
  const HIST_WEEKS = timeConfig.hist;
  const FCT_WEEKS  = timeConfig.fct;

  // ── SKU query ──
  const { data, isLoading } = useQuery({
    queryKey: ["sku-grid", page, search, category, location, statusF, scenario, timeRange],
    queryFn: () =>
      api.get("/forecasts/skus", {
        params: {
          page,
          page_size: 50,
          ...(search    && { search }),
          ...(category  && { category }),
          ...(location  && { location }),
          ...(statusF   && { status: statusF }),
          ...(scenario  && { scenario_id: scenario }),
          time_range: timeRange,
        },
      }).then((r) => r.data),
    placeholderData: (prev) => prev,
  });

  const runForecast = useMutation({
    mutationFn: () =>
      api.post("/forecasts/run", { model_type: "auto", horizon_weeks: 13 }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sku-grid"] }),
  });

  const handleOverrideSaved = useCallback(
    (skuId: string, weekIdx: number, newVal: number) =>
      setOverrides((prev) => ({ ...prev, [`${skuId}-${weekIdx}`]: newVal })),
    []
  );

  const hasAnyFilter = !!(search || category || location || statusF || scenario || timeRange !== "next_8w");

  const clearAll = () => {
    setSearch(""); setCategory(""); setLocation(""); setStatusF("");
    setScenario(""); setTimeRange("next_8w"); setPage(1);
  };

  // ── Week labels (driven by time preset) ──
  const histLabels = Array.from({ length: HIST_WEEKS }, (_, i) =>
    weekLabel(-(HIST_WEEKS - i))
  );
  const fctLabels = Array.from({ length: FCT_WEEKS }, (_, i) =>
    weekLabel(i + 1)
  );

  // ── Columns ──
  const columns = useMemo(
    () => [
      colHelper.accessor("sku_id", {
        header: "SKU", size: 90,
        cell: (i) => <span className="font-mono text-xs text-gray-600">{i.getValue()}</span>,
      }),
      colHelper.accessor("name", {
        header: "Product", size: 200,
        cell: (i) => (
          <span className="text-sm text-gray-900 font-medium truncate block max-w-[180px]" title={i.getValue()}>
            {i.getValue()}
          </span>
        ),
      }),
      colHelper.accessor("category", {
        header: "Category", size: 110,
        cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span>,
      }),
      colHelper.accessor("location", {
        header: "Location", size: 100,
        cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span>,
      }),
      ...histLabels.map((label, idx) =>
        colHelper.display({
          id: `hist_${idx}`, header: label, size: 74,
          cell: ({ row }) => (
            <ForecastCell
              value={row.original.actuals[idx]}
              skuId={row.original.sku_id}
              skuName={row.original.name}
              weekIdx={idx}
              isHistorical
              onOverrideSaved={handleOverrideSaved}
            />
          ),
        })
      ),
      ...fctLabels.map((label, idx) =>
        colHelper.display({
          id: `fct_${idx}`, header: label, size: 74,
          cell: ({ row }) => {
            const key = `${row.original.sku_id}-${idx}`;
            const val = overrides[key] ?? row.original.forecast[idx];
            return (
              <ForecastCell
                value={val}
                skuId={row.original.sku_id}
                skuName={row.original.name}
                weekIdx={idx}
                isHistorical={false}
                onOverrideSaved={handleOverrideSaved}
              />
            );
          },
        })
      ),
      colHelper.accessor("mape", {
        header: "MAPE %", size: 80,
        cell: (i) => (
          <span className={`text-xs font-mono ${mapeColor(i.getValue())}`}>
            {i.getValue().toFixed(1)}%
          </span>
        ),
      }),
      colHelper.accessor("status", {
        header: "Status", size: 110,
        cell: (i) => statusBadge(i.getValue()),
      }),
    ],
    [histLabels, fctLabels, overrides, handleOverrideSaved]
  );

  const table = useReactTable({
    data: data?.items ?? [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
    pageCount: data?.pages ?? 1,
  });

  const exportCSV = () => {
    const rows = data?.items ?? [];
    const header = ["SKU", "Product", "Category", "Location", "MAPE%", "Status"];
    const lines = rows.map((r: SKURow) =>
      [r.sku_id, `"${r.name}"`, r.category, r.location, r.mape, r.status].join(",")
    );
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "forecast_grid.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Select shared style ──
  const selCls = "text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 text-gray-600";

  return (
    <div className="space-y-4 h-full flex flex-col">
      {/* ── Combined header + filter bar ── */}
      <div className="flex-shrink-0 bg-white border border-gray-200 rounded-xl px-4 pt-4 pb-3 space-y-3">
        {/* Row 1: title + action buttons */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Forecasts</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              SKU-level grid · Click any forecast cell to override
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportCSV}
              className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50"
            >
              <Download className="w-4 h-4" /> Export CSV
            </button>
            <button
              onClick={() => runForecast.mutate()}
              disabled={runForecast.isPending}
              className="flex items-center gap-1.5 text-sm bg-brand-600 text-white rounded-lg px-4 py-2 hover:bg-brand-700 disabled:opacity-60"
            >
              {runForecast.isPending
                ? <RefreshCw className="w-4 h-4 animate-spin" />
                : <Play className="w-4 h-4" />}
              Run Forecast
            </button>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-gray-100" />

        {/* Row 2: filter controls (auto-wrapping) */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Classic filter icon label */}
          <div className="flex items-center gap-1.5 text-gray-400 flex-shrink-0">
            <Filter className="w-4 h-4" />
            <span className="text-xs font-medium text-gray-500">Filters</span>
          </div>

          <div className="h-5 w-px bg-gray-200 flex-shrink-0" />

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search SKU or product…"
              className="pl-9 pr-4 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white w-52"
            />
          </div>

          <div className="h-5 w-px bg-gray-200 flex-shrink-0" />

          {/* Scenario */}
          <div className="flex items-center gap-1.5">
            <GitBranch className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <select
              value={scenario}
              onChange={(e) => { setScenario(e.target.value); setPage(1); }}
              className={selCls}
            >
              <option value="">All scenarios</option>
              {flatScenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {"\u00a0".repeat(s.depth * 3)}
                  {s.is_protected ? "🔒 " : ""}
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="h-5 w-px bg-gray-200 flex-shrink-0" />

          {/* Time presets */}
          <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
            {TIME_PRESETS.map((t) => (
              <button
                key={t.key}
                onClick={() => { setTimeRange(t.key); setPage(1); }}
                className={[
                  "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                  timeRange === t.key
                    ? "bg-white text-brand-700 shadow-sm"
                    : "text-gray-500 hover:text-gray-700",
                ].join(" ")}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="h-5 w-px bg-gray-200 flex-shrink-0" />

          {/* Category */}
          <select
            value={category}
            onChange={(e) => { setCategory(e.target.value); setPage(1); }}
            className={selCls}
          >
            <option value="">All Categories</option>
            {(data?.categories ?? []).map((c: string) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          {/* Location */}
          <select
            value={location}
            onChange={(e) => { setLocation(e.target.value); setPage(1); }}
            className={selCls}
          >
            <option value="">All Locations</option>
            {(data?.locations ?? []).map((l: string) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>

          {/* Status pills */}
          <div className="flex items-center gap-1">
            {STATUS_OPTIONS.map(({ key, label }) => {
              const active = statusF === key;
              return (
                <button
                  key={key}
                  onClick={() => { setStatusF(active ? "" : key); setPage(1); }}
                  className={[
                    "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                    active
                      ? key === "exception"
                        ? "bg-red-50 text-red-700 border-red-200"
                        : key === "overridden"
                        ? "bg-blue-50 text-blue-700 border-blue-200"
                        : "bg-green-50 text-green-700 border-green-200"
                      : "bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700",
                  ].join(" ")}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Count + Clear */}
          <div className="ml-auto flex items-center gap-3 flex-shrink-0">
            <span className="text-sm text-gray-400 whitespace-nowrap">
              {data?.total ?? 0} SKUs
            </span>
            {hasAnyFilter && (
              <button
                onClick={clearAll}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50"
              >
                <X className="w-3.5 h-3.5" /> Clear all
              </button>
            )}
          </div>
        </div>

        {/* Row 3: Active filter chips */}
        {hasAnyFilter && (
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5 border-t border-gray-100">
            <span className="text-xs text-gray-400">Active:</span>
            {scenario && selectedScenarioName && (
              <span className="inline-flex items-center gap-1 bg-brand-50 text-brand-700 border border-brand-200 rounded-full px-2.5 py-0.5 text-xs font-medium">
                <GitBranch className="w-3 h-3" /> {selectedScenarioName}
                <button onClick={() => { setScenario(""); setPage(1); }}><X className="w-3 h-3" /></button>
              </span>
            )}
            {timeRange !== "next_8w" && (
              <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 border border-gray-200 rounded-full px-2.5 py-0.5 text-xs font-medium">
                {TIME_PRESETS.find((t) => t.key === timeRange)?.label}
                <button onClick={() => { setTimeRange("next_8w"); setPage(1); }}><X className="w-3 h-3" /></button>
              </span>
            )}
            {category && (
              <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 border border-gray-200 rounded-full px-2.5 py-0.5 text-xs font-medium">
                {category}
                <button onClick={() => { setCategory(""); setPage(1); }}><X className="w-3 h-3" /></button>
              </span>
            )}
            {location && (
              <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 border border-gray-200 rounded-full px-2.5 py-0.5 text-xs font-medium">
                {location}
                <button onClick={() => { setLocation(""); setPage(1); }}><X className="w-3 h-3" /></button>
              </span>
            )}
            {statusF && (
              <span className={[
                "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium border",
                statusF === "exception" ? "bg-red-50 text-red-700 border-red-200"
                : statusF === "overridden" ? "bg-blue-50 text-blue-700 border-blue-200"
                : "bg-green-50 text-green-700 border-green-200",
              ].join(" ")}>
                {statusF}
                <button onClick={() => { setStatusF(""); setPage(1); }}><X className="w-3 h-3" /></button>
              </span>
            )}
            {search && (
              <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 border border-gray-200 rounded-full px-2.5 py-0.5 text-xs font-medium">
                "{search}"
                <button onClick={() => { setSearch(""); setPage(1); }}><X className="w-3 h-3" /></button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 bg-white rounded-2xl border border-gray-100 overflow-hidden flex flex-col">
        {/* Legend */}
        <div className="flex items-center gap-4 px-4 py-2 border-b border-gray-100 bg-gray-50 text-xs text-gray-500 flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-gray-100 border border-gray-200" />
            Actuals (past)
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-blue-50 border border-blue-100" />
            Statistical forecast · click to override
          </div>
          {scenario && selectedScenarioName && (
            <div className="ml-auto flex items-center gap-1.5 text-brand-600 font-medium">
              <GitBranch className="w-3.5 h-3.5" />
              Scenario: {selectedScenarioName}
            </div>
          )}
        </div>

        <div className="overflow-auto flex-1">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-50 border-b border-gray-100">
                {table.getFlatHeaders().map((header) => {
                  const isSortable = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  const isHist = header.id.startsWith("hist_");
                  const isFct  = header.id.startsWith("fct_");
                  return (
                    <th
                      key={header.id}
                      style={{ width: header.getSize(), minWidth: header.getSize() }}
                      className={[
                        "px-3 py-2.5 text-left text-xs font-semibold text-gray-500 whitespace-nowrap",
                        isSortable ? "cursor-pointer hover:text-gray-800 select-none" : "",
                        isHist ? "bg-gray-50" : "",
                        isFct  ? "bg-blue-50/40" : "",
                      ].join(" ")}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <div className="flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {isSortable && (
                          sorted === "asc" ? <ChevronUp className="w-3 h-3" />
                          : sorted === "desc" ? <ChevronDown className="w-3 h-3" />
                          : <ChevronsUpDown className="w-3 h-3 text-gray-300" />
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 12 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="px-3 py-2.5">
                          <div className="h-4 bg-gray-100 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                : table.getRowModel().rows.map((row) => {
                    const isException = row.original.status === "exception";
                    return (
                      <tr
                        key={row.id}
                        className={[
                          "border-b border-gray-50 hover:bg-gray-50/70 transition-colors",
                          isException ? "bg-red-50/30" : "",
                        ].join(" ")}
                      >
                        {row.getVisibleCells().map((cell) => {
                          const isHist = cell.column.id.startsWith("hist_");
                          const isFct  = cell.column.id.startsWith("fct_");
                          return (
                            <td
                              key={cell.id}
                              style={{ width: cell.column.getSize(), minWidth: cell.column.getSize() }}
                              className={[
                                "px-3 py-2 relative",
                                isHist ? "bg-gray-50/50" : "",
                                isFct  ? "bg-blue-50/20" : "",
                              ].join(" ")}
                            >
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 flex-shrink-0">
          <span className="text-xs text-gray-500">
            Page {page} of {data?.pages ?? 1} · {data?.total ?? 0} total SKUs
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="text-xs text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 disabled:opacity-40"
            >
              ← Prev
            </button>
            <button
              disabled={page >= (data?.pages ?? 1)}
              onClick={() => setPage((p) => p + 1)}
              className="text-xs text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
