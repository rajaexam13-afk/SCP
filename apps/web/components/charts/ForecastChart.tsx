"use client";

import {
  ComposedChart, Line, Bar, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from "recharts";
import { Skeleton } from "@/components/ui/Skeleton";

interface ForecastPoint {
  period: string;
  actual: number | null;
  statistical: number;
  consensus: number | null;
  lower_bound: number;
  upper_bound: number;
}

interface Props {
  data?: ForecastPoint[];
  loading?: boolean;
  height?: number;
  showBands?: boolean;
}

const MOCK_DATA: ForecastPoint[] = Array.from({ length: 20 }, (_, i) => {
  const isPast = i < 13;
  const base = 12000 + Math.sin(i * 0.5) * 2000 + i * 80;
  return {
    period: `W${String(i + 1).padStart(2, "0")}`,
    actual: isPast ? Math.round(base + (Math.random() - 0.5) * 1500) : null,
    statistical: Math.round(base * (1 + (Math.random() - 0.5) * 0.05)),
    consensus: isPast ? null : Math.round(base * 1.02),
    lower_bound: Math.round(base * 0.88),
    upper_bound: Math.round(base * 1.12),
  };
});

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg p-3 text-xs">
      <p className="font-semibold text-gray-700 mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center justify-between gap-4 py-0.5">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
            <span className="text-gray-500">{p.name}</span>
          </div>
          <span className="font-medium text-gray-800">
            {p.value != null ? p.value.toLocaleString() : "—"}
          </span>
        </div>
      ))}
    </div>
  );
};

export function ForecastChart({ data = MOCK_DATA, loading, height = 300, showBands = true }: Props) {
  if (loading) return <Skeleton className="w-full rounded-xl" style={{ height }} />;

  const cutoffIndex = data.findIndex((d) => d.actual === null);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#0c90e7" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#0c90e7" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="period" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} width={55}
          tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 16 }} />

        {/* Confidence band */}
        {showBands && (
          <Area
            dataKey="upper_bound"
            stroke="transparent"
            fill="#e0effe"
            fillOpacity={0.6}
            name="Forecast range"
            legendType="none"
          />
        )}
        {showBands && (
          <Area
            dataKey="lower_bound"
            stroke="transparent"
            fill="#ffffff"
            fillOpacity={1}
            legendType="none"
          />
        )}

        {/* Actuals */}
        <Area
          dataKey="actual"
          name="Actual"
          stroke="#0c90e7"
          strokeWidth={2}
          fill="url(#actualGrad)"
          dot={{ r: 3, fill: "#0c90e7", strokeWidth: 0 }}
          activeDot={{ r: 5 }}
          connectNulls={false}
        />

        {/* Statistical forecast */}
        <Line
          dataKey="statistical"
          name="Statistical"
          stroke="#f59e0b"
          strokeWidth={2}
          strokeDasharray="4 3"
          dot={false}
          activeDot={{ r: 4 }}
        />

        {/* Consensus forecast */}
        <Line
          dataKey="consensus"
          name="Consensus"
          stroke="#10b981"
          strokeWidth={2}
          dot={{ r: 3, fill: "#10b981", strokeWidth: 0 }}
          activeDot={{ r: 5 }}
          connectNulls={false}
        />

        {/* Cutoff line */}
        {cutoffIndex >= 0 && (
          <ReferenceLine
            x={data[cutoffIndex]?.period}
            stroke="#e5e7eb"
            strokeDasharray="4 2"
            label={{ value: "Today", position: "top", fontSize: 10, fill: "#9ca3af" }}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
