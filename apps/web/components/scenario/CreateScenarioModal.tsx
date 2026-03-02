"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { X, GitBranch, Loader2, Zap, Hand, Globe, EyeOff } from "lucide-react";
import { api } from "@/lib/api";

const schema = z.object({
  name:         z.string().min(2, "Scenario name required"),
  description:  z.string().optional(),
  base_plan_id: z.string().optional(),
  parent_id:    z.string().optional(),
  commit_mode:  z.enum(["auto", "manual"]).default("manual"),
  is_public:    z.boolean().default(true),
});

type Form = z.infer<typeof schema>;

interface Props {
  onClose: () => void;
  onCreate: (data: Form) => void;
  loading?: boolean;
  /** Pre-fill parent when branching from a specific scenario */
  defaultParentId?: string | null;
  /** All scenarios flat list (for the parent dropdown) */
  scenarios?: Array<{ id: string; name: string; is_protected?: boolean }>;
}

export function CreateScenarioModal({
  onClose,
  onCreate,
  loading,
  defaultParentId,
  scenarios = [],
}: Props) {
  const { data: basePlans } = useQuery({
    queryKey: ["base-plans"],
    queryFn: () => api.get("/forecasts/base-plans").then((r) => r.data),
  });

  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      name:         "",
      description:  "",
      base_plan_id: "",
      parent_id:    defaultParentId ?? "",
      commit_mode:  "manual" as const,
      is_public:    true,
    },
  });

  // Keep parent_id in sync if the prop changes (e.g. user clicks Branch on a different node)
  useEffect(() => {
    form.setValue("parent_id", defaultParentId ?? "");
  }, [defaultParentId, form]);

  const parentId    = form.watch("parent_id");
  const commitMode  = form.watch("commit_mode");
  const isPublic    = form.watch("is_public");
  const hasParent   = !!parentId;
  const parentName  = scenarios.find((s) => s.id === parentId)?.name;

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-brand-50 rounded-lg flex items-center justify-center">
              <GitBranch className="w-4 h-4 text-brand-600" />
            </div>
            <h2 className="font-semibold text-gray-900">
              {hasParent ? `Branch from "${parentName}"` : "Create root scenario"}
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={form.handleSubmit(onCreate)} className="p-6 space-y-4">
          {/* Info banner */}
          <div className={`p-3 rounded-xl text-xs ${hasParent ? "bg-purple-50 text-purple-700" : "bg-blue-50 text-blue-700"}`}>
            {hasParent
              ? `This scenario will branch from "${parentName}". It inherits the same base plan and can layer additional overrides on top.`
              : "Root scenario — starts from a statistical base plan. Changes (deltas) are stored separately, not as a full copy."}
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Scenario name *</label>
            <input
              {...form.register("name")}
              placeholder={hasParent ? `e.g. Promo +20% on ${parentName}` : "e.g. Summer Promo +15%"}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            {form.formState.errors.name && (
              <p className="mt-1 text-xs text-red-500">{form.formState.errors.name.message}</p>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              {...form.register("description")}
              placeholder="What assumptions does this scenario represent?"
              rows={2}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
          </div>

          {/* Parent scenario selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Branch from scenario
              <span className="ml-1 text-xs text-gray-400 font-normal">(optional — leave blank for root)</span>
            </label>
            <select
              {...form.register("parent_id")}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">— None (root scenario) —</option>
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.is_protected ? "🛡 " : ""}{s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Commit mode — only for child scenarios */}
          {hasParent && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Sync mode
                <span className="ml-1 text-xs text-gray-400 font-normal">how this scenario tracks parent changes</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => form.setValue("commit_mode", "manual")}
                  className={`flex items-start gap-2.5 p-3 rounded-xl border-2 text-left transition-colors ${
                    commitMode === "manual"
                      ? "border-brand-400 bg-brand-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <Hand className={`w-4 h-4 mt-0.5 flex-shrink-0 ${commitMode === "manual" ? "text-brand-600" : "text-gray-400"}`} />
                  <div>
                    <p className={`text-xs font-semibold ${commitMode === "manual" ? "text-brand-700" : "text-gray-700"}`}>Manual</p>
                    <p className="text-xs text-gray-400 mt-0.5">Review &amp; apply parent changes yourself</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => form.setValue("commit_mode", "auto")}
                  className={`flex items-start gap-2.5 p-3 rounded-xl border-2 text-left transition-colors ${
                    commitMode === "auto"
                      ? "border-yellow-400 bg-yellow-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <Zap className={`w-4 h-4 mt-0.5 flex-shrink-0 ${commitMode === "auto" ? "text-yellow-600" : "text-gray-400"}`} />
                  <div>
                    <p className={`text-xs font-semibold ${commitMode === "auto" ? "text-yellow-700" : "text-gray-700"}`}>Auto</p>
                    <p className="text-xs text-gray-400 mt-0.5">Parent changes apply here automatically</p>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Base plan selector — only for root scenarios */}
          {!hasParent && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Base plan *</label>
              <select
                {...form.register("base_plan_id")}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">Select base plan...</option>
                {(basePlans ?? []).map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.period}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Visibility */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Visibility
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => form.setValue("is_public", true)}
                className={`flex items-start gap-2.5 p-3 rounded-xl border-2 text-left transition-colors ${
                  isPublic
                    ? "border-brand-400 bg-brand-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <Globe className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isPublic ? "text-brand-600" : "text-gray-400"}`} />
                <div>
                  <p className={`text-xs font-semibold ${isPublic ? "text-brand-700" : "text-gray-700"}`}>Public</p>
                  <p className="text-xs text-gray-400 mt-0.5">Visible to all team members</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => form.setValue("is_public", false)}
                className={`flex items-start gap-2.5 p-3 rounded-xl border-2 text-left transition-colors ${
                  !isPublic
                    ? "border-gray-500 bg-gray-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <EyeOff className={`w-4 h-4 mt-0.5 flex-shrink-0 ${!isPublic ? "text-gray-700" : "text-gray-400"}`} />
                <div>
                  <p className={`text-xs font-semibold ${!isPublic ? "text-gray-700" : "text-gray-700"}`}>Private</p>
                  <p className="text-xs text-gray-400 mt-0.5">Only visible to you</p>
                </div>
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {hasParent ? "Create branch" : "Create scenario"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
