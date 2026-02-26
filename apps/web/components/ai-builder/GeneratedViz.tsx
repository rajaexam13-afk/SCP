"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell
} from "recharts";
import { Save, Download, RefreshCw, Code2, Maximize2 } from "lucide-react";
import { api } from "@/lib/api";
import { clsx } from "clsx";
import type { VizResult } from "@/app/dashboard/builder/page";

const CHART_COLORS = ["#0c90e7", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#ec4899"];

interface Props {
  result: VizResult;
}

export function GeneratedViz({ result }: Props) {
  const [showQuery, setShowQuery] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => api.post("/dashboards/saved-views", { viz_result: result }),
    onSuccess: (res) => setSavedId(res.data.id),
  });

  const renderChart = () => {
    switch (result.type) {
      case "bar":
        return (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={result.data} margin={{ top: 4, right: 4, left: 0, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey={result.config.xKey ?? "name"} tick={{ fontSize: 11, fill: "#9ca3af" }}
                angle={-35} textAnchor="end" tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
              <Tooltip />
              <Bar dataKey={result.config.yKey ?? "value"} radius={[4, 4, 0, 0]}>
                {result.data.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        );

      case "line":
        return (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={result.data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey={result.config.xKey ?? "period"} tick={{ fontSize: 11, fill: "#9ca3af" }}
                tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
              <Tooltip />
              {(result.config.lines ?? ["value"]).map((key: string, i: number) => (
                <Line key={key} dataKey={key} stroke={CHART_COLORS[i % CHART_COLORS.length]}
                  strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        );

      case "table":
        return (
          <div className="overflow-auto max-h-72">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-50">
                <tr>
                  {Object.keys(result.data[0] ?? {}).map((col) => (
                    <th key={col} className="text-left font-medium text-gray-400 px-4 py-2 whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {result.data.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    {Object.values(row as Record<string, unknown>).map((val, j) => (
                      <td key={j} className="px-4 py-2 text-gray-700">
                        {typeof val === "number" ? val.toLocaleString() : String(val ?? "—")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );

      case "kpi":
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-2">
            {result.data.map((kpi: any, i: number) => (
              <div key={i} className="text-center p-4 bg-gray-50 rounded-xl">
                <p className="text-xs text-gray-400 mb-1">{kpi.label}</p>
                <p className="text-2xl font-bold text-gray-900">{kpi.value}</p>
                {kpi.delta && (
                  <p className={clsx("text-xs font-medium mt-1",
                    kpi.delta > 0 ? "text-green-600" : "text-red-500"
                  )}>
                    {kpi.delta > 0 ? "+" : ""}{kpi.delta}%
                  </p>
                )}
              </div>
            ))}
          </div>
        );

      default:
        return (
          <div className="h-40 flex items-center justify-center text-gray-400 text-sm">
            Unsupported visualization type: {result.type}
          </div>
        );
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50">
        <div>
          <h3 className="font-semibold text-gray-900 text-sm">{result.title}</h3>
          <p className="text-xs text-gray-400 mt-0.5 italic">"{result.prompt}"</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowQuery(!showQuery)}
            className={clsx(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors",
              showQuery ? "bg-gray-100 text-gray-700" : "text-gray-400 hover:bg-gray-50"
            )}
          >
            <Code2 className="w-3.5 h-3.5" />
            SQL
          </button>
          <button className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-gray-400 hover:bg-gray-50 transition-colors">
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
          <button
            onClick={() => save.mutate()}
            disabled={!!savedId || save.isPending}
            className={clsx(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors",
              savedId
                ? "bg-green-50 text-green-600"
                : "text-gray-400 hover:bg-gray-50"
            )}
          >
            <Save className="w-3.5 h-3.5" />
            {savedId ? "Saved" : "Save view"}
          </button>
        </div>
      </div>

      {/* SQL Query (toggle) */}
      {showQuery && (
        <div className="px-6 py-3 bg-gray-900 text-green-400 font-mono text-xs border-b border-gray-800">
          <pre className="whitespace-pre-wrap">{result.query}</pre>
        </div>
      )}

      {/* Visualization */}
      <div className="p-6">
        {renderChart()}
      </div>
    </div>
  );
}
