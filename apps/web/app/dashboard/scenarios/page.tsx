"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ScenarioList } from "@/components/scenario/ScenarioList";
import { ScenarioWorkspace } from "@/components/scenario/ScenarioWorkspace";
import { CreateScenarioModal } from "@/components/scenario/CreateScenarioModal";
import { ScenarioComparison } from "@/components/scenario/ScenarioComparison";
import { api } from "@/lib/api";
import { Plus, GitBranch, BarChart2 } from "lucide-react";

export default function ScenariosPage() {
  const qc = useQueryClient();
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [view, setView] = useState<"workspace" | "compare">("workspace");

  const { data: scenarios, isLoading } = useQuery({
    queryKey: ["scenarios"],
    queryFn: () => api.get("/scenarios").then((r) => r.data),
  });

  const createScenario = useMutation({
    mutationFn: (data: { name: string; description: string; base_plan_id: string }) =>
      api.post("/scenarios", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scenarios"] });
      setShowCreate(false);
    },
  });

  const activeScenario = scenarios?.find((s: any) => s.id === activeScenarioId);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Scenario Planning</h1>
          <p className="text-sm text-gray-500 mt-1">
            Delta-based scenarios — changes only, instant creation, unlimited what-ifs
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
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New scenario
          </button>
        </div>
      </div>

      {view === "compare" && compareIds.length >= 2 ? (
        <ScenarioComparison
          scenarioIds={compareIds}
          onClose={() => { setView("workspace"); setCompareIds([]); }}
        />
      ) : (
        <div className="flex gap-6 h-[calc(100vh-12rem)]">
          {/* Scenario List Sidebar */}
          <div className="w-72 flex-shrink-0">
            <ScenarioList
              scenarios={scenarios ?? []}
              loading={isLoading}
              activeId={activeScenarioId}
              compareIds={compareIds}
              onSelect={setActiveScenarioId}
              onToggleCompare={(id) =>
                setCompareIds((prev) =>
                  prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                )
              }
            />
          </div>

          {/* Workspace */}
          <div className="flex-1 min-w-0">
            {activeScenario ? (
              <ScenarioWorkspace scenario={activeScenario} />
            ) : (
              <div className="h-full bg-white rounded-2xl border border-gray-100 flex flex-col items-center justify-center text-center p-12">
                <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
                  <GitBranch className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="font-semibold text-gray-700 mb-2">Select a scenario</h3>
                <p className="text-sm text-gray-400 max-w-xs">
                  Choose a scenario from the list to open the workspace, or create a new one.
                </p>
                <button
                  onClick={() => setShowCreate(true)}
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
          onClose={() => setShowCreate(false)}
          onCreate={(data) => createScenario.mutate(data)}
          loading={createScenario.isPending}
        />
      )}
    </div>
  );
}
