"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Trash2, ExternalLink, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatDistanceToNow } from "date-fns";

export function SavedViews() {
  const qc = useQueryClient();

  const { data: views, isLoading } = useQuery({
    queryKey: ["saved-views"],
    queryFn: () => api.get("/dashboards/saved-views").then((r) => r.data),
  });

  const deleteView = useMutation({
    mutationFn: (id: string) => api.delete(`/dashboards/saved-views/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saved-views"] }),
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
      </div>
    );
  }

  if (!views?.length) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
        <Sparkles className="w-8 h-8 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 text-sm">No saved views yet.</p>
        <p className="text-gray-400 text-xs mt-1">Save visualizations from the Builder tab.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {views.map((view: any) => (
        <div key={view.id} className="bg-white rounded-2xl border border-gray-100 p-5 group hover:border-gray-200 transition-all">
          <div className="flex items-start justify-between mb-2">
            <h3 className="font-semibold text-gray-800 text-sm line-clamp-2">{view.title}</h3>
            <button
              onClick={() => deleteView.mutate(view.id)}
              className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all ml-2 flex-shrink-0"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-gray-400 italic mb-3 line-clamp-2">"{view.prompt}"</p>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">
              {formatDistanceToNow(new Date(view.created_at), { addSuffix: true })}
            </span>
            <span className="text-xs px-2 py-0.5 bg-brand-50 text-brand-600 rounded-full font-medium capitalize">
              {view.type}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
