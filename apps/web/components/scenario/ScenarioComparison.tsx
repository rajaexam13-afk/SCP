"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ForecastChart } from "@/components/charts/ForecastChart";
import { X } from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";

interface Props {
  scenarioIds: string[];
  onClose: () => void;
}

const COLORS = ["#0c90e7", "#10b981", "#f59e0b", "#8b5cf6"];

export function ScenarioComparison({ scenarioIds, onClose }: Props) {
  const queries = scenarioIds.map((id) => ({
    queryKey: ["scenario-forecast", id],
    queryFn: () => api.get(`/scenarios/${id}/forecast`).then((r) => r.data),
  }));

  const { data: scenariosData } = useQuery({
    queryKey: ["scenarios-compare", scenarioIds],
    queryFn: () => api.post("/scenarios/compare", { ids: scenarioIds }).then((r) => r.data),
  });

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">Scenario Comparison</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Comparing {scenarioIds.length} scenarios · All deltas merged at query time
          </p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Overlaid Forecast Chart */}
      <div>
        <p className="text-xs font-medium text-gray-500 mb-3">Forecast Overlay</p>
        <ForecastChart data={scenariosData?.chart ?? []} height={240} showBands={false} />
      </div>

      {/* Delta Summary Table */}
      <div>
        <p className="text-xs font-medium text-gray-500 mb-3">Delta Summary by Scenario</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left font-medium text-gray-400 pb-2 pr-4">Metric</th>
                {(scenariosData?.scenarios ?? scenarioIds).map((sc: any, i: number) => (
                  <th key={i} className="text-left font-medium pb-2 px-4" style={{ color: COLORS[i] }}>
                    {sc.name ?? `Scenario ${i + 1}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {[
                { label: "Total forecast units", key: "total_units" },
                { label: "vs Base plan", key: "vs_base_pct" },
                { label: "Override count", key: "delta_count" },
                { label: "Avg MAPE (stat)", key: "avg_mape" },
              ].map((row) => (
                <tr key={row.label}>
                  <td className="py-2.5 pr-4 text-gray-600 font-medium">{row.label}</td>
                  {(scenariosData?.scenarios ?? scenarioIds).map((_: any, i: number) => (
                    <td key={i} className="py-2.5 px-4 text-gray-800">
                      {scenariosData?.scenarios?.[i]?.[row.key] ?? "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
