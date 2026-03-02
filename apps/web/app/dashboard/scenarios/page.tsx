"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ScenarioTree, ScenarioNode } from "@/components/scenario/ScenarioTree";
import { ScenarioWorkspace } from "@/components/scenario/ScenarioWorkspace";
import { CreateScenarioModal } from "@/components/scenario/CreateScenarioModal";
import { ScenarioComparison } from "@/components/scenario/ScenarioComparison";
import { api } from "@/lib/api";
import { Plus, GitBranch, BarChart2, ShieldCheck } from "lucide-react";

/** Flatten a tree into a list (for dropdowns, active lookup, etc.) */
function flattenTree(nodes: ScenarioNode[]): ScenarioNode[] {
  return nodes.flatMap((n) => [n, ...flattenTree(n.children)]);
}

export default function ScenariosPage() {
  const qc = useQueryClient();
  const [activeScenarioId, setActiveScenarioId]   = useState<string | null>(null);
  const [compareIds, setCompareIds]               = useState<string[]>([]);
  const [showCreate, setShowCreate]               = useState(false);
  const [branchParentId, setBranchParentId]       = useState<string | null>(null);
  const [view, setView]                           = useState<"workspace" | "compare">("workspace");

  // Fetch the full nested tree
  const { data: tree = [], isLoading } = useQuery<ScenarioNode[]>({
    queryKey: ["scenarios-tree"],
    queryFn: () => api.get("/scenarios/tree").then((r) => r.data),
  });

  const flatScenarios = flattenTree(tree);
  const activeScenario = flatScenarios.find((s) => s.id === activeScenarioId);

  const createScenario = useMutation({
    mutationFn: (data: {
      name: string;
      description?: string;
      base_plan_id?: string;
      parent_id?: string;
    }) => api.post("/scenarios", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scenarios-tree"] });
      setShowCreate(false);
      setBranchParentId(null);
    },
  });

  const deleteScenario = useMutation({
    mutationFn: (id: string) => api.delete(`/scenarios/${id}`),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["scenarios-tree"] });
      if (activeScenarioId === id) setActiveScenarioId(null);
    },
  });

  const changeCommitMode = useMutation({
    mutationFn: ({ id, mode }: { id: string; mode: "auto" | "manual" }) =>
      api.patch(`/scenarios/${id}/commit-mode`, { commit_mode: mode }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scenarios-tree"] }),
  });

  const changeVisibility = useMutation({
    mutationFn: ({ id, is_public }: { id: string; is_public: boolean }) =>
      api.patch(`/scenarios/${id}/visibility`, { is_public }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scenarios-tree"] }),
  });

  const handleBranch = useCallback((parentId: string) => {
    setBranchParentId(parentId);
    setShowCreate(true);
  }, []);

  const handleChangeCommitMode = useCallback((id: string, mode: "auto" | "manual") => {
    changeCommitMode.mutate({ id, mode });
  }, [changeCommitMode]);

  const handleChangeVisibility = useCallback((id: string, is_public: boolean) => {
    changeVisibility.mutate({ id, is_public });
  }, [changeVisibility]);

  const handleDelete = useCallback((id: string, name: string) => {
    if (confirm(`Delete scenario "${name}"? This will also delete all its deltas and child scenarios.`)) {
      deleteScenario.mutate(id);
    }
  }, [deleteScenario]);

  const handleCreate = (data: any) => {
    createScenario.mutate({
      ...data,
      parent_id: branchParentId || data.parent_id || undefined,
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Scenario Planning</h1>
          <p className="text-sm text-gray-500 mt-1">
            Nested delta-based scenarios — branch from any scenario, instant creation, unlimited what-ifs
          </p>
        </div>
        <div className="flex items-center gap-3">
          {compareIds.length >= 2 && (
            <button
              onClick={() => setView(view === "compare" ? "workspace" : "compare")}
              className="flex items-center gap-2 px-4 py-2 border border-brand-200 text-brand-600 rounded-lg text-sm hover:bg-brand-50 transition-colors"
            >
              <BarChart2 className="w-4 h-4" />
              Compare ({compareIds.length})
            </button>
          )}
          <button
            onClick={() => { setBranchParentId(null); setShowCreate(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New scenario
          </button>
        </div>
      </div>

      {/* Protected scenario legend */}
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
        <span>Protected scenarios (like <strong>Enterprise</strong>) cannot be deleted. Hover any node to branch or compare.</span>
      </div>

      {view === "compare" && compareIds.length >= 2 ? (
        <ScenarioComparison
          scenarioIds={compareIds}
          onClose={() => { setView("workspace"); setCompareIds([]); }}
        />
      ) : (
        <div className="flex gap-6 h-[calc(100vh-13rem)]">
          {/* Tree Sidebar */}
          <div className="w-72 flex-shrink-0">
            <ScenarioTree
              tree={tree}
              loading={isLoading}
              activeId={activeScenarioId}
              compareIds={compareIds}
              onSelect={setActiveScenarioId}
              onToggleCompare={(id) =>
                setCompareIds((prev) =>
                  prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                )
              }
              onBranch={handleBranch}
              onDelete={handleDelete}
              onChangeCommitMode={handleChangeCommitMode}
              onChangeVisibility={handleChangeVisibility}
            />
          </div>

          {/* Workspace */}
          <div className="flex-1 min-w-0">
            {activeScenario ? (
              <ScenarioWorkspace
                key={activeScenario.id}
                scenario={activeScenario}
                onDelete={() => setActiveScenarioId(null)}
              />
            ) : (
              <div className="h-full bg-white rounded-2xl border border-gray-100 flex flex-col items-center justify-center text-center p-12">
                <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
                  <GitBranch className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="font-semibold text-gray-700 mb-2">Select a scenario</h3>
                <p className="text-sm text-gray-400 max-w-xs">
                  Pick a node from the tree to open its workspace, or hover any scenario to branch from it.
                </p>
                <button
                  onClick={() => { setBranchParentId(null); setShowCreate(true); }}
                  className="mt-6 flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Create first scenario
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showCreate && (
        <CreateScenarioModal
          onClose={() => { setShowCreate(false); setBranchParentId(null); }}
          onCreate={handleCreate}
          loading={createScenario.isPending}
          defaultParentId={branchParentId}
          scenarios={flatScenarios.map((s) => ({
            id: s.id,
            name: s.name,
            is_protected: s.is_protected,
          }))}
        />
      )}
    </div>
  );
}
