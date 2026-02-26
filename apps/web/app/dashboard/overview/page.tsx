"use client";

import { useQuery } from "@tanstack/react-query";
import { KPICard } from "@/components/dashboard/KPICard";
import { ForecastChart } from "@/components/charts/ForecastChart";
import { ExceptionPanel } from "@/components/dashboard/ExceptionPanel";
import { AccuracyHeatmap } from "@/components/charts/AccuracyHeatmap";
import { api } from "@/lib/api";
import { TrendingUp, TrendingDown, Activity, Target, AlertTriangle, CheckCircle2 } from "lucide-react";

export default function OverviewPage() {
  const { data: kpis, isLoading: kpisLoading } = useQuery({
    queryKey: ["kpis"],
    queryFn: () => api.get("/forecasts/kpis").then((r) => r.data),
  });

  const { data: forecastData, isLoading: forecastLoading } = useQuery({
    queryKey: ["forecast-overview"],
    queryFn: () => api.get("/forecasts/overview").then((r) => r.data),
  });

  const { data: exceptions } = useQuery({
    queryKey: ["exceptions"],
    queryFn: () => api.get("/forecasts/exceptions").then((r) => r.data),
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Overview</h1>
        <p className="text-sm text-gray-500 mt-1">
          Demand planning snapshot · Updated {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long" })}
        </p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Forecast Accuracy"
          value={kpis?.accuracy ?? "--"}
          suffix="%"
          delta={kpis?.accuracy_delta}
          icon={Target}
          loading={kpisLoading}
          trend={kpis?.accuracy_delta >= 0 ? "up" : "down"}
        />
        <KPICard
          title="WMAPE"
          value={kpis?.wmape ?? "--"}
          suffix="%"
          delta={kpis?.wmape_delta}
          icon={Activity}
          loading={kpisLoading}
          trend={kpis?.wmape_delta <= 0 ? "up" : "down"}
          deltaInverted
        />
        <KPICard
          title="Forecast Bias"
          value={kpis?.bias ?? "--"}
          suffix="%"
          delta={kpis?.bias_delta}
          icon={TrendingUp}
          loading={kpisLoading}
          trend={Math.abs(kpis?.bias ?? 0) < Math.abs(kpis?.bias_prev ?? 100) ? "up" : "down"}
        />
        <KPICard
          title="Active Exceptions"
          value={kpis?.exceptions ?? "--"}
          delta={kpis?.exceptions_delta}
          icon={AlertTriangle}
          loading={kpisLoading}
          trend={kpis?.exceptions_delta <= 0 ? "up" : "down"}
          deltaInverted
        />
      </div>

      {/* Main Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="font-semibold text-gray-900">Forecast vs Actuals</h2>
              <p className="text-xs text-gray-400 mt-0.5">Last 13 weeks · Statistical forecast</p>
            </div>
            <select className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option>All SKUs</option>
              <option>Top 100</option>
              <option>Exceptions only</option>
            </select>
          </div>
          <ForecastChart data={forecastData} loading={forecastLoading} height={280} />
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Top Exceptions</h2>
          <ExceptionPanel exceptions={exceptions?.slice(0, 8)} />
        </div>
      </div>

      {/* Accuracy Heatmap */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="font-semibold text-gray-900">Accuracy by Category & Week</h2>
            <p className="text-xs text-gray-400 mt-0.5">MAPE heatmap · darker = worse accuracy</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-green-200" /> &lt;5%
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-yellow-200" /> 5-15%
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-red-300" /> &gt;15%
            </div>
          </div>
        </div>
        <AccuracyHeatmap />
      </div>
    </div>
  );
}
