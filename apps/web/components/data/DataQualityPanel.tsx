"use client";

import { CheckCircle2, AlertTriangle, XCircle, RefreshCw } from "lucide-react";
import { clsx } from "clsx";
import { Skeleton } from "@/components/ui/Skeleton";

interface QualityCheck {
  name: string;
  status: "pass" | "warn" | "fail";
  message: string;
  affected_rows?: number;
}

const MOCK_CHECKS: QualityCheck[] = [
  { name: "Missing values",     status: "warn", message: "2.3% of rows have null values in 'location_id'",  affected_rows: 1204 },
  { name: "Date continuity",    status: "pass", message: "No gaps detected in time series",                affected_rows: 0    },
  { name: "Negative sales",     status: "fail", message: "47 rows have negative sales values (returns?)",  affected_rows: 47   },
  { name: "Duplicate records",  status: "pass", message: "No duplicate SKU+Location+Date combinations",    affected_rows: 0    },
  { name: "Outliers (3σ)",      status: "warn", message: "134 data points exceed 3 standard deviations",   affected_rows: 134  },
  { name: "Future dates",       status: "pass", message: "No future-dated actuals detected",               affected_rows: 0    },
  { name: "SKU master coverage",status: "warn", message: "12 SKUs in sales have no product master record", affected_rows: 12   },
];

const STATUS_CONFIG = {
  pass: { icon: CheckCircle2, color: "text-green-500", bg: "bg-green-50",  label: "Pass"    },
  warn: { icon: AlertTriangle, color: "text-yellow-500", bg: "bg-yellow-50", label: "Warning" },
  fail: { icon: XCircle,       color: "text-red-500",    bg: "bg-red-50",    label: "Failed"  },
};

interface Props {
  quality?: { checks: QualityCheck[]; score: number; last_run: string } | null;
}

export function DataQualityPanel({ quality }: Props) {
  const checks = quality?.checks ?? MOCK_CHECKS;
  const score = quality?.score ?? 74;

  const counts = checks.reduce(
    (acc, c) => { acc[c.status]++; return acc; },
    { pass: 0, warn: 0, fail: 0 }
  );

  return (
    <div className="space-y-4">
      {/* Score Banner */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500 mb-1">Data Quality Score</p>
          <div className="flex items-baseline gap-2">
            <span className={clsx(
              "text-5xl font-bold",
              score >= 80 ? "text-green-500" : score >= 60 ? "text-yellow-500" : "text-red-500"
            )}>
              {score}
            </span>
            <span className="text-xl text-gray-400">/100</span>
          </div>
        </div>
        <div className="flex gap-4 text-sm">
          {(["pass", "warn", "fail"] as const).map((s) => {
            const cfg = STATUS_CONFIG[s];
            return (
              <div key={s} className={clsx("px-3 py-2 rounded-xl text-center", cfg.bg)}>
                <p className={clsx("text-2xl font-bold", cfg.color)}>{counts[s]}</p>
                <p className="text-xs text-gray-500">{cfg.label}</p>
              </div>
            );
          })}
        </div>
        <button className="flex items-center gap-2 text-sm text-brand-600 hover:text-brand-700 transition-colors">
          <RefreshCw className="w-4 h-4" />
          Re-run checks
        </button>
      </div>

      {/* Check List */}
      <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
        {checks.map((check) => {
          const cfg = STATUS_CONFIG[check.status];
          return (
            <div key={check.name} className="flex items-center gap-4 px-6 py-4">
              <cfg.icon className={clsx("w-5 h-5 flex-shrink-0", cfg.color)} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800">{check.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{check.message}</p>
              </div>
              {(check.affected_rows ?? 0) > 0 && (
                <span className={clsx("text-xs font-medium px-2 py-1 rounded-full flex-shrink-0", cfg.bg, cfg.color)}>
                  {check.affected_rows} rows
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
