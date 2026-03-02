"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ForecastChart } from "@/components/charts/ForecastChart";
import { api } from "@/lib/api";
import {
  RotateCcw, Filter, Download, Plus, X,
  Users, Lock, CheckCircle2, Upload, RefreshCw, Zap, AlertCircle, EyeOff,
} from "lucide-react";
import { clsx } from "clsx";

interface Scenario {
  id: string;
  name: string;
  description: string;
  base_plan_id: string;
  parent_id: string | null;
  commit_mode: "auto" | "manual";
  is_public: boolean;
  status: "draft" | "review" | "approved" | "locked";
  created_by: string;
  created_at: string;
  delta_count: number;
}

interface Delta {
  id: string;
  sku_id: string;
  sku_name?: string;
  period: string;
  original_value: number;
  override_value: number;
  change_pct: number;
  author: string;
  comment?: string;
  locked: boolean;
}

const STATUS_CONFIG = {
  draft:    { label: "Draft",     color: "bg-gray-100 text-gray-600"    },
  review:   { label: "In Review", color: "bg-yellow-100 text-yellow-700" },
  approved: { label: "Approved",  color: "bg-green-100 text-green-700"  },
  locked:   { label: "Locked",    color: "bg-blue-100 text-blue-700"    },
};

const EMPTY_FORM = { sku_id: "", period: "", value: "", comment: "" };

interface Props {
  scenario: Scenario;
}

export function ScenarioWorkspace({ scenario }: Props) {
  const qc = useQueryClient();
  const [filter, setFilter]           = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm]               = useState(EMPTY_FORM);

  // ── Data queries ────────────────────────────────────────────
  const { data: deltas = [], isLoading } = useQuery<Delta[]>({
    queryKey: ["scenario-deltas", scenario.id],
    queryFn:  () => api.get(`/scenarios/${scenario.id}/deltas`).then((r) => r.data),
    staleTime: 0,
  });

  const { data: forecastData } = useQuery({
    queryKey: ["scenario-forecast", scenario.id],
    queryFn:  () => api.get(`/scenarios/${scenario.id}/forecast`).then((r) => r.data),
    staleTime: 0,
  });

  // Enabled for ALL child scenarios regardless of commit_mode — the server no longer
  // auto-propagates deltas, so every child (auto or manual) needs the sync banner.
  const { data: pendingSync = [] } = useQuery<Delta[]>({
    queryKey:       ["pending-sync", scenario.id],
    queryFn:        () => api.get(`/scenarios/${scenario.id}/pending-sync`).then((r) => r.data),
    enabled:        !!scenario.parent_id,
    staleTime:      0,
    refetchInterval: 30_000,
  });

  // ── Mutations ───────────────────────────────────────────────
  const submitDelta = useMutation({
    mutationFn: (delta: { sku_id: string; period: string; value: number; comment: string }) =>
      api.post(`/scenarios/${scenario.id}/deltas`, delta),
    onSuccess: () => {
      // Refresh only this scenario's data — the backend never writes to other scenarios.
      qc.invalidateQueries({ queryKey: ["scenario-deltas", scenario.id] });
      qc.invalidateQueries({ queryKey: ["scenario-forecast", scenario.id] });
      qc.invalidateQueries({ queryKey: ["scenarios-tree"] });
      setShowAddForm(false);
      setForm(EMPTY_FORM);
    },
  });

  const revertDelta = useMutation({
    mutationFn: (deltaId: string) =>
      api.delete(`/scenarios/${scenario.id}/deltas/${deltaId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scenario-deltas", scenario.id] });
      qc.invalidateQueries({ queryKey: ["scenario-forecast", scenario.id] });
      qc.invalidateQueries({ queryKey: ["scenarios-tree"] });
    },
  });

  const promoteDelta = useMutation({
    mutationFn: (deltaId: string) =>
      api.post(`/scenarios/${scenario.id}/deltas/${deltaId}/promote`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scenarios-tree"] });
      qc.invalidateQueries({ queryKey: ["scenario-deltas", scenario.id] });
      if (scenario.parent_id) {
        qc.invalidateQueries({ queryKey: ["scenario-deltas", scenario.parent_id] });
        qc.invalidateQueries({ queryKey: ["scenario-forecast", scenario.parent_id] });
      }
    },
  });

  const syncFromParent = useMutation({
    mutationFn: () => api.post(`/scenarios/${scenario.id}/sync`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scenario-deltas", scenario.id] });
      qc.invalidateQueries({ queryKey: ["scenario-forecast", scenario.id] });
      qc.invalidateQueries({ queryKey: ["pending-sync", scenario.id] });
      qc.invalidateQueries({ queryKey: ["scenarios-tree"] });
    },
  });

  // ── Helpers ─────────────────────────────────────────────────
  const handleFormChange = useCallback(
    (field: keyof typeof EMPTY_FORM, value: string) =>
      setForm((prev) => ({ ...prev, [field]: value })),
    []
  );

  const handleSave = () => {
    if (!form.sku_id.trim() || !form.period.trim() || !form.value) return;
    submitDelta.mutate({
      sku_id:  form.sku_id.trim(),
      period:  form.period.trim(),
      value:   Number(form.value),
      comment: form.comment.trim(),
    });
  };

  const filtered = deltas.filter(
    (d) =>
      !filter ||
      (d.sku_name ?? "").toLowerCase().includes(filter.toLowerCase()) ||
      d.sku_id.toLowerCase().includes(filter.toLowerCase())
  );

  const status    = STATUS_CONFIG[scenario.status] ?? STATUS_CONFIG.draft;
  const isDraft   = scenario.status === "draft";

  return (
    <div className="bg-white rounded-2xl border border-gray-100 h-full flex flex-col overflow-hidden">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div>
          <div className="flex items-center gap-3">
            <h3 className="font-semibold text-gray-900">{scenario.name}</h3>
            <span className={clsx("text-xs font-medium px-2 py-0.5 rounded-full", status.color)}>
              {status.label}
            </span>
            {!scenario.is_public && (
              <span className="flex items-center gap-1 text-xs text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">
                <EyeOff className="w-3 h-3" /> Private
              </span>
            )}
            {scenario.parent_id && scenario.commit_mode === "auto" && (
              <span className="flex items-center gap-1 text-xs text-yellow-600 bg-yellow-50 border border-yellow-200 px-2 py-0.5 rounded-full">
                <Zap className="w-3 h-3" /> Auto-sync
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {deltas.length} overrides · {scenario.description || "No description"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <Download className="w-3.5 h-3.5" /> Export
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <Users className="w-3.5 h-3.5" /> Share
          </button>
          {isDraft && (
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors">
              <CheckCircle2 className="w-3.5 h-3.5" /> Submit for review
            </button>
          )}
        </div>
      </div>

      {/* ── Manual-mode pending sync banner ────────────────── */}
      {scenario.parent_id && pendingSync.length > 0 && (
        <div className="mx-6 mt-3 flex items-center gap-3 px-4 py-2.5 bg-orange-50 border border-orange-200 rounded-xl flex-shrink-0">
          <AlertCircle className="w-4 h-4 text-orange-500 flex-shrink-0" />
          <p className="text-xs text-orange-700 flex-1">
            <span className="font-semibold">
              {pendingSync.length} parent {pendingSync.length === 1 ? "change" : "changes"}
            </span>{" "}
            not yet applied — sync to inherit them in this scenario
          </p>
          <button
            onClick={() => syncFromParent.mutate()}
            disabled={syncFromParent.isPending}
            className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-white bg-orange-500 rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={clsx("w-3.5 h-3.5", syncFromParent.isPending && "animate-spin")} />
            Sync now
          </button>
        </div>
      )}

      {/* ── Forecast chart ─────────────────────────────────── */}
      <div className="px-6 py-4 border-b border-gray-50 flex-shrink-0">
        <p className="text-xs font-medium text-gray-500 mb-3">Scenario Forecast Preview</p>
        <ForecastChart data={forecastData} height={180} showBands={false} />
      </div>

      {/* ── Delta table ────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex flex-col">

        {/* Table toolbar */}
        <div className="px-6 py-3 border-b border-gray-50 flex items-center gap-3 flex-shrink-0">
          <div className="relative flex-1 max-w-xs">
            <Filter className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Filter by SKU..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <p className="text-xs text-gray-400">{filtered.length} overrides</p>
          <div className="flex-1" />
          {isDraft && !showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add Override
            </button>
          )}
        </div>

        {/* ── Add Override inline form ────────────────────── */}
        {showAddForm && isDraft && (
          <div className="mx-6 my-3 p-4 bg-gray-50 border border-gray-200 rounded-xl flex-shrink-0">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-700">New Override</p>
              <button
                onClick={() => { setShowAddForm(false); setForm(EMPTY_FORM); }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {(
                [
                  { field: "sku_id",  label: "SKU ID",         placeholder: "e.g. SKU-001", type: "text"   },
                  { field: "period",  label: "Period",          placeholder: "e.g. W01",     type: "text"   },
                  { field: "value",   label: "Override Value",  placeholder: "e.g. 1500",    type: "number" },
                  { field: "comment", label: "Comment",         placeholder: "Optional",     type: "text"   },
                ] as const
              ).map(({ field, label, placeholder, type }) => (
                <div key={field}>
                  <label className="text-xs text-gray-500 mb-1 block">{label}</label>
                  <input
                    type={type}
                    placeholder={placeholder}
                    value={form[field]}
                    onChange={(e) => handleFormChange(field, e.target.value)}
                    className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => { setShowAddForm(false); setForm(EMPTY_FORM); }}
                className="px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={submitDelta.isPending || !form.sku_id.trim() || !form.period.trim() || !form.value}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50"
              >
                {submitDelta.isPending ? "Saving…" : "Save Override"}
              </button>
            </div>
            {submitDelta.isError && (
              <p className="text-xs text-red-500 mt-2">
                Failed to save override — check SKU ID and period, then try again.
              </p>
            )}
          </div>
        )}

        {/* Rows */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-50">
              <tr>
                {["SKU", "Period", "Original", "Override", "Change %", "By", "Comment", ""].map((h) => (
                  <th
                    key={h}
                    className="text-left font-medium text-gray-400 px-4 py-2 first:pl-6 last:pr-6 whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-gray-400">Loading…</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-gray-400">
                    {filter
                      ? "No overrides match your filter."
                      : isDraft
                      ? 'No overrides yet — click "Add Override" above to create one.'
                      : "No overrides in this scenario."}
                  </td>
                </tr>
              ) : (
                filtered.map((delta) => (
                  <tr key={delta.id} className="hover:bg-gray-50/60 group">
                    <td className="px-4 py-2.5 first:pl-6 font-mono text-gray-500">{delta.sku_id}</td>
                    <td className="px-4 py-2.5 text-gray-500">{delta.period}</td>
                    <td className="px-4 py-2.5 text-gray-500">{delta.original_value.toLocaleString()}</td>
                    <td className="px-4 py-2.5 font-medium text-gray-900">{delta.override_value.toLocaleString()}</td>
                    <td className={clsx(
                      "px-4 py-2.5 font-semibold",
                      delta.change_pct > 0 ? "text-green-600" : "text-red-500"
                    )}>
                      {delta.change_pct > 0 ? "+" : ""}{delta.change_pct.toFixed(1)}%
                    </td>
                    <td className="px-4 py-2.5 text-gray-400">{delta.author || "—"}</td>
                    <td className="px-4 py-2.5 text-gray-400 max-w-[160px] truncate">{delta.comment || "—"}</td>
                    <td className="px-4 py-2.5 last:pr-6">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        {scenario.parent_id && !delta.locked && (
                          <button
                            onClick={() => promoteDelta.mutate(delta.id)}
                            disabled={promoteDelta.isPending}
                            className="text-gray-400 hover:text-brand-600 transition-colors"
                            title="Promote this override to parent scenario"
                          >
                            <Upload className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {!delta.locked && (
                          <button
                            onClick={() => revertDelta.mutate(delta.id)}
                            disabled={revertDelta.isPending}
                            className="text-gray-400 hover:text-red-500 transition-colors"
                            title="Revert override"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {delta.locked && <Lock className="w-3 h-3 text-gray-300" />}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
