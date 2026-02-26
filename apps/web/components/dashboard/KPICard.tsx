"use client";

import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";
import { clsx } from "clsx";
import { Skeleton } from "@/components/ui/Skeleton";

interface Props {
  title: string;
  value: string | number;
  suffix?: string;
  delta?: number;
  deltaInverted?: boolean;
  icon: LucideIcon;
  loading?: boolean;
  trend?: "up" | "down" | "neutral";
}

export function KPICard({ title, value, suffix, delta, deltaInverted, icon: Icon, loading, trend }: Props) {
  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <Skeleton className="h-4 w-24 mb-3" />
        <Skeleton className="h-8 w-16 mb-2" />
        <Skeleton className="h-3 w-20" />
      </div>
    );
  }

  const isPositive = trend === "up";
  const isNegative = trend === "down";

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 hover:border-gray-200 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <p className="text-sm text-gray-500 font-medium">{title}</p>
        <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center">
          <Icon className="w-4 h-4 text-gray-400" />
        </div>
      </div>

      <div className="flex items-baseline gap-1 mb-1">
        <span className="text-3xl font-bold text-gray-900">{value}</span>
        {suffix && <span className="text-lg font-semibold text-gray-400">{suffix}</span>}
      </div>

      {delta !== undefined && (
        <div className={clsx(
          "flex items-center gap-1 text-xs font-medium",
          isPositive && "text-green-600",
          isNegative && "text-red-500",
          !isPositive && !isNegative && "text-gray-400"
        )}>
          {isPositive && <TrendingUp className="w-3.5 h-3.5" />}
          {isNegative && <TrendingDown className="w-3.5 h-3.5" />}
          <span>
            {delta > 0 ? "+" : ""}{delta?.toFixed(1)}{suffix} vs last period
          </span>
        </div>
      )}
    </div>
  );
}
