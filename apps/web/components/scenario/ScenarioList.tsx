"use client";

import { clsx } from "clsx";
import { GitBranch, CheckSquare, Square, Clock, Lock, CheckCircle, Eye } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Skeleton } from "@/components/ui/Skeleton";

interface Scenario {
  id: string;
  name: string;
  description: string;
  status: "draft" | "review" | "approved" | "locked";
  created_by: string;
  created_at: string;
  delta_count: number;
}

const STATUS_ICONS = {
  draft:    { icon: Clock,         color: "text-gray-400"   },
  review:   { icon: Eye,           color: "text-yellow-500" },
  approved: { icon: CheckCircle,   color: "text-green-500"  },
  locked:   { icon: Lock,          color: "text-blue-500"   },
};

interface Props {
  scenarios: Scenario[];
  loading: boolean;
  activeId: string | null;
  compareIds: string[];
  onSelect: (id: string) => void;
  onToggleCompare: (id: string) => void;
}

export function ScenarioList({ scenarios, loading, activeId, compareIds, onSelect, onToggleCompare }: Props) {
  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3 h-full">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 flex flex-col h-full overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-50 flex-shrink-0">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Scenarios ({scenarios.length})
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {scenarios.map((sc) => {
          const StatusIcon = STATUS_ICONS[sc.status]?.icon ?? Clock;
          const statusColor = STATUS_ICONS[sc.status]?.color ?? "text-gray-400";
          const isActive = sc.id === activeId;
          const isComparing = compareIds.includes(sc.id);

          return (
            <div
              key={sc.id}
              onClick={() => onSelect(sc.id)}
              className={clsx(
                "p-3 rounded-xl cursor-pointer transition-all group relative",
                isActive ? "bg-brand-50 border border-brand-100" : "hover:bg-gray-50 border border-transparent"
              )}
            >
              <div className="flex items-start gap-2">
                {/* Compare checkbox */}
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleCompare(sc.id); }}
                  className="mt-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  {isComparing
                    ? <CheckSquare className="w-4 h-4 text-brand-600" />
                    : <Square className="w-4 h-4 text-gray-300" />
                  }
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <GitBranch className={clsx("w-3.5 h-3.5 flex-shrink-0", isActive ? "text-brand-500" : "text-gray-300")} />
                    <p className={clsx("text-sm font-medium truncate", isActive ? "text-brand-700" : "text-gray-800")}>
                      {sc.name}
                    </p>
                  </div>
                  <p className="text-xs text-gray-400 truncate">{sc.description}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <StatusIcon className={clsx("w-3 h-3", statusColor)} />
                    <span className="text-xs text-gray-400">
                      {sc.delta_count} changes
                    </span>
                    <span className="text-xs text-gray-300">·</span>
                    <span className="text-xs text-gray-400">
                      {formatDistanceToNow(new Date(sc.created_at), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {scenarios.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-sm">
            No scenarios yet
          </div>
        )}
      </div>
    </div>
  );
}
