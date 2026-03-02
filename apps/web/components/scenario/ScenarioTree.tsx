"use client";

import { useState } from "react";
import { clsx } from "clsx";
import {
  GitBranch, ChevronDown, ChevronRight,
  ShieldCheck, Clock, Eye, CheckCircle, Lock,
  Plus, Trash2, CheckSquare, Square, Zap, Hand, Globe, EyeOff,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Skeleton } from "@/components/ui/Skeleton";

export interface ScenarioNode {
  id: string;
  name: string;
  description: string;
  status: "draft" | "review" | "approved" | "locked";
  created_at: string;
  delta_count: number;
  is_protected: boolean;
  is_public: boolean;
  parent_id: string | null;
  commit_mode: "auto" | "manual";
  depth: number;
  children: ScenarioNode[];
}

const STATUS_META: Record<string, { icon: any; color: string; label: string }> = {
  draft:    { icon: Clock,       color: "text-gray-400",   label: "Draft"    },
  review:   { icon: Eye,         color: "text-yellow-500", label: "Review"   },
  approved: { icon: CheckCircle, color: "text-green-500",  label: "Approved" },
  locked:   { icon: Lock,        color: "text-blue-500",   label: "Locked"   },
};

interface Props {
  tree: ScenarioNode[];
  loading: boolean;
  activeId: string | null;
  compareIds: string[];
  onSelect: (id: string) => void;
  onToggleCompare: (id: string) => void;
  onBranch: (parentId: string) => void;
  onDelete: (id: string, name: string) => void;
  onChangeCommitMode?: (id: string, mode: "auto" | "manual") => void;
  onChangeVisibility?: (id: string, is_public: boolean) => void;
}

export function ScenarioTree({
  tree,
  loading,
  activeId,
  compareIds,
  onSelect,
  onToggleCompare,
  onBranch,
  onDelete,
  onChangeCommitMode,
  onChangeVisibility,
}: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3 h-full">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    );
  }

  const toggleCollapse = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const renderNode = (node: ScenarioNode) => {
    const isActive    = node.id === activeId;
    const isComparing = compareIds.includes(node.id);
    const isCollapsed = collapsed.has(node.id);
    const hasChildren = node.children.length > 0;
    const StatusMeta  = STATUS_META[node.status] ?? STATUS_META.draft;
    const StatusIcon  = StatusMeta.icon;
    const indentPx    = node.depth * 20;

    return (
      <div key={node.id}>
        {/* Tree connector line */}
        {node.depth > 0 && (
          <div
            className="absolute border-l-2 border-gray-100"
            style={{
              left:   indentPx + 8,
              top:    -12,
              height: 24,
            }}
          />
        )}

        <div
          className={clsx(
            "relative group flex items-start gap-2 p-2.5 rounded-xl cursor-pointer transition-all",
            isActive
              ? "bg-brand-50 border border-brand-100"
              : "hover:bg-gray-50 border border-transparent"
          )}
          style={{ marginLeft: indentPx }}
          onClick={() => onSelect(node.id)}
        >
          {/* Collapse toggle */}
          <button
            onClick={(e) => { e.stopPropagation(); toggleCollapse(node.id); }}
            className="mt-0.5 flex-shrink-0 w-4 h-4 flex items-center justify-center"
          >
            {hasChildren ? (
              isCollapsed
                ? <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                : <ChevronDown  className="w-3.5 h-3.5 text-gray-400" />
            ) : (
              <span className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Branch icon */}
          <GitBranch
            className={clsx(
              "w-3.5 h-3.5 mt-0.5 flex-shrink-0",
              isActive ? "text-brand-500" : "text-gray-300"
            )}
          />

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <p className={clsx(
                "text-sm font-medium truncate",
                isActive ? "text-brand-700" : "text-gray-800"
              )}>
                {node.name}
              </p>
              {node.is_protected && (
                <ShieldCheck className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" title="Protected — cannot be deleted" />
              )}
              {/* Visibility badge */}
              {!node.is_public && (
                <EyeOff className="w-3 h-3 text-gray-400 flex-shrink-0" title="Private — only visible to you" />
              )}
              {node.parent_id && (
                node.commit_mode === "auto"
                  ? <Zap  className="w-3 h-3 text-yellow-500 flex-shrink-0" title="Auto-sync: inherits parent changes automatically" />
                  : <Hand className="w-3 h-3 text-gray-400 flex-shrink-0" title="Manual-sync: review parent changes before applying" />
              )}
            </div>
            {node.description && (
              <p className="text-xs text-gray-400 truncate mb-1">{node.description}</p>
            )}
            <div className="flex items-center gap-2">
              <StatusIcon className={clsx("w-3 h-3", StatusMeta.color)} />
              <span className="text-xs text-gray-400">{node.delta_count} changes</span>
              <span className="text-xs text-gray-300">·</span>
              <span className="text-xs text-gray-400">
                {formatDistanceToNow(new Date(node.created_at), { addSuffix: true })}
              </span>
            </div>
          </div>

          {/* Hover actions */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
            {/* Visibility toggle — only for non-protected scenarios */}
            {!node.is_protected && onChangeVisibility && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onChangeVisibility(node.id, !node.is_public);
                }}
                className="p-1 rounded-lg hover:bg-gray-200 transition-colors"
                title={node.is_public ? "Make private (visible only to you)" : "Make public (visible to all team members)"}
              >
                {node.is_public
                  ? <Globe  className="w-3.5 h-3.5 text-gray-400" />
                  : <EyeOff className="w-3.5 h-3.5 text-gray-400" />
                }
              </button>
            )}

            {/* Commit mode toggle — only for child scenarios */}
            {node.parent_id && onChangeCommitMode && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onChangeCommitMode(node.id, node.commit_mode === "auto" ? "manual" : "auto");
                }}
                className="p-1 rounded-lg hover:bg-yellow-100 transition-colors"
                title={node.commit_mode === "auto"
                  ? "Switch to manual-sync"
                  : "Switch to auto-sync"}
              >
                {node.commit_mode === "auto"
                  ? <Zap  className="w-3.5 h-3.5 text-yellow-500" />
                  : <Hand className="w-3.5 h-3.5 text-gray-400"   />
                }
              </button>
            )}

            {/* Compare toggle */}
            <button
              onClick={(e) => { e.stopPropagation(); onToggleCompare(node.id); }}
              className="p-1 rounded-lg hover:bg-gray-200 transition-colors"
              title="Add to comparison"
            >
              {isComparing
                ? <CheckSquare className="w-3.5 h-3.5 text-brand-600" />
                : <Square      className="w-3.5 h-3.5 text-gray-400"  />
              }
            </button>

            {/* Branch from this scenario */}
            <button
              onClick={(e) => { e.stopPropagation(); onBranch(node.id); }}
              className="p-1 rounded-lg hover:bg-brand-100 transition-colors"
              title="Create child scenario"
            >
              <Plus className="w-3.5 h-3.5 text-brand-500" />
            </button>

            {/* Delete (hidden for protected) */}
            {!node.is_protected && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(node.id, node.name); }}
                className="p-1 rounded-lg hover:bg-red-100 transition-colors"
                title="Delete scenario"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
              </button>
            )}
          </div>
        </div>

        {/* Children */}
        {hasChildren && !isCollapsed && (
          <div className="relative">
            {/* Vertical connector line */}
            <div
              className="absolute border-l-2 border-gray-100"
              style={{ left: indentPx + 28, top: 0, bottom: 8 }}
            />
            {node.children.map(renderNode)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 flex flex-col h-full overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-50 flex-shrink-0">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Scenario Tree
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {tree.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">No scenarios yet</div>
        ) : (
          tree.map(renderNode)
        )}
      </div>
    </div>
  );
}
