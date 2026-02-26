"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { X, GitBranch, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

const schema = z.object({
  name: z.string().min(2, "Scenario name required"),
  description: z.string().optional(),
  base_plan_id: z.string().min(1, "Select a base plan"),
});

type Form = z.infer<typeof schema>;

interface Props {
  onClose: () => void;
  onCreate: (data: Form) => void;
  loading?: boolean;
}

export function CreateScenarioModal({ onClose, onCreate, loading }: Props) {
  const { data: basePlans } = useQuery({
    queryKey: ["base-plans"],
    queryFn: () => api.get("/forecasts/base-plans").then((r) => r.data),
  });

  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", description: "", base_plan_id: "" },
  });

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-brand-50 rounded-lg flex items-center justify-center">
              <GitBranch className="w-4 h-4 text-brand-600" />
            </div>
            <h2 className="font-semibold text-gray-900">Create scenario</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={form.handleSubmit(onCreate)} className="p-6 space-y-4">
          <div className="p-3 bg-blue-50 rounded-xl text-xs text-blue-700">
            Scenarios store only your changes (deltas), not a full copy of the base plan.
            Create as many as you need — instantly.
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Scenario name *</label>
            <input
              {...form.register("name")}
              placeholder="e.g. Summer Promo +15%, Risk Down 10%"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            {form.formState.errors.name && (
              <p className="mt-1 text-xs text-red-500">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              {...form.register("description")}
              placeholder="What assumptions does this scenario represent?"
              rows={3}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
          </div>

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
            {form.formState.errors.base_plan_id && (
              <p className="mt-1 text-xs text-red-500">{form.formState.errors.base_plan_id.message}</p>
            )}
          </div>

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
              Create scenario
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
