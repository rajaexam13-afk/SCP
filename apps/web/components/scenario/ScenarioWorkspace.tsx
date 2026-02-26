"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ForecastChart } from "@/components/charts/ForecastChart";
import { api } from "@/lib/api";
import {
  Save, RotateCcw, Filter, Download, MessageSquare,
  Users, Lock, CheckCircle2, Clock
} from "lucide-react";
import { clsx } from "clsx";

interface Scenario {
  id: string;
  name: string;
  description: string;
  base_plan_id: string;
  status: "draft" | "review" | "approved" | "locked";
  created_by: string;
  created_at: string;
  delta_count: number;
}

interface Delta {
  sku_id: string;
  sku_name: string;
  period: string;
  original_value: number;
  override_value: number;
  change_pct: number;
  author: string;
  comment?: string;
  locked: boolean;
}

const STATUS_CONFIG = {
  draft:    { label: "Draft",    color: "bg-gray-100 text-gray-600"    },
  review:   { label: "In Review", color: "bg-yellow-100 text-yellow-700" },
  approved: { label: "Approved", color: "bg-green-100 text-green-700"  },
  locked:   { label: "Locked",   color: "bg-blue-100 text-blue-700"   },
};

interface Props {
  scenario: Scenario;
}

export function ScenarioWorkspace({ scenario }: Props) {
  const qc = useQueryClient();
  const [selectedCell, setSelectedCell] = useState<{ skuId: string; period: string } | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [editComment, setEditComment] = useState<string>("");
  const [filter, setFilter] = useState("");

  const { data: deltas = [], isLoading } = useQuery<Delta[]>({
    queryKey: ["scenario-deltas", scenario.id],
    queryFn: () => api.get(`/scenarios/${scenario.id}/deltas`).then((r) => r.data),
  });

  const { data: forecastData } = useQuery({
    queryKey: ["scenario-forecast", scenario.id],
    queryFn: () => api.get(`/scenarios/${scenario.id}/forecast`).then((r) => r.data),
  });

  const submitDelta = useMutation({
    mutationFn: (delta: { sku_id: string; period: string; value: number; comment: string }) =>
      api.post(`/scenarios/${scenario.id}/deltas`, delta),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scenario-deltas", scenario.id] });
      qc.invalidateQueries({ queryKey: ["scenario-forecast", scenario.id] });
      setSelectedCell(null);
      setEditValue("");
      setEditComment("");
    },
  });

  const revertDelta = useMutation({
    mutationFn: (deltaId: string) => api.delete(`/scenarios/${scenario.id}/deltas/${deltaId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scenario-deltas", scenario.id] }),
  });

  const handleCellEdit = useCallback((skuId: string, period: string, currentValue: number) => {
    setSelectedCell({ skuId, period });
    setEditValue(String(currentValue));
  }, []);

  const handleSaveDelta = () => {
    if (!selectedCell || !editValue) return;
    submitDelta.mutate({
      sku_id: selectedCell.skuId,
      period: selectedCell.period,
      value: Number(editValue),
      comment: editComment,
    });
  };

  const filtered = deltas.filter(
    (d) => !filter || d.sku_name.toLowerCase().includes(filter.toLowerCase()) || d.sku_id.includes(filter)
  );

  const status = STATUS_CONFIG[scenario.status];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 h-full flex flex-col overflow-hidden">
      {/* Workspace Header */}
      <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div>
          <div className="flex items-center gap-3">
            <h3 className="font-semibold text-gray-900">{scenario.name}</h3>
            <span className={clsx("text-xs font-medium px-2 py-0.5 rounded-full", status.color)}>
              {status.label}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {scenario.delta_count} overrides · Base plan locked
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <Users className="w-3.5 h-3.5" />
            Share
          </button>
          {scenario.status === "draft" && (
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Submit for review
            </button>
          )}
        </div>
      </div>

      {/* Forecast Chart */}
      <div className="px-6 py-4 border-b border-gray-50 flex-shrink-0">
        <p className="text-xs font-medium text-gray-500 mb-3">Scenario Forecast Preview</p>
        <ForecastChart data={forecastData} height={180} showBands={false} />
      </div>

      {/* Delta Table */}
      <div className="flex-1 overflow-hidden flex flex-col">
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
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-50">
              <tr>
                {["SKU", "Product", "Period", "Original", "Override", "Change", "By", "Comment", ""].map((h) => (
                  <th key={h} className="text-left font-medium text-gray-400 px-4 py-2 first:pl-6 last:pr-6 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((delta, i) => (
                <tr key={i} className="hover:bg-gray-50/60 group">
                  <td className="px-4 py-2.5 first:pl-6 font-mono text-gray-500">{delta.sku_id}</td>
                  <td className="px-4 py-2.5 font-medium text-gray-800 max-w-[140px] truncate">{delta.sku_name}</td>
                  <td className="px-4 py-2.5 text-gray-500">{delta.period}</td>
                  <td className="px-4 py-2.5 text-gray-500">{delta.original_value.toLocaleString()}</td>
                  <td className="px-4 py-2.5 font-medium text-gray-900">{delta.override_value.toLocaleString()}</td>
                  <td className={clsx("px-4 py-2.5 font-semibold",
                    delta.change_pct > 0 ? "text-green-600" : "text-red-500"
                  )}>
                    {delta.change_pct > 0 ? "+" : ""}{delta.change_pct.toFixed(1)}%
                  </td>
                  <td className="px-4 py-2.5 text-gray-400">{delta.author}</td>
                  <td className="px-4 py-2.5 text-gray-400 max-w-[160px] truncate">{delta.comment || "—"}</td>
                  <td className="px-4 py-2.5 last:pr-6">
                    {!delta.locked && (
                      <button
                        onClick={() => revertDelta.mutate(`${delta.sku_id}-${delta.period}`)}
                        className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all"
                        title="Revert override"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {delta.locked && <Lock className="w-3 h-3 text-gray-300" />}
                  </td>
                </tr>
              ))}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-gray-400">
                    No overrides yet. Click any cell in the forecast grid to create a delta.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
