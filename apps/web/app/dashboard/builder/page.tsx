"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { PromptBuilder } from "@/components/ai-builder/PromptBuilder";
import { GeneratedViz } from "@/components/ai-builder/GeneratedViz";
import { SavedViews } from "@/components/ai-builder/SavedViews";
import { api } from "@/lib/api";
import { Sparkles, BookOpen } from "lucide-react";

export interface VizResult {
  id: string;
  title: string;
  type: "bar" | "line" | "heatmap" | "table" | "kpi" | "waterfall";
  query: string;
  data: any[];
  config: Record<string, any>;
  prompt: string;
}

const EXAMPLE_PROMPTS = [
  "Show top 20 SKUs by forecast error in the last 4 weeks",
  "Compare actuals vs forecast for Category A, broken down by week",
  "Which products have bias > 15% in the East region?",
  "Show me revenue forecast for Q2 by channel",
  "List SKUs where forecast is lower than actuals for 3+ consecutive weeks",
  "Heatmap of MAPE by product category and month",
];

export default function BuilderPage() {
  const [results, setResults] = useState<VizResult[]>([]);
  const [activeTab, setActiveTab] = useState<"builder" | "saved">("builder");

  const generate = useMutation({
    mutationFn: (prompt: string) =>
      api.post("/dashboards/generate", { prompt }).then((r) => r.data),
    onSuccess: (data: VizResult) => {
      setResults((prev) => [data, ...prev]);
    },
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-brand-500" />
            AI Dashboard Builder
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Ask any question about your demand data in plain English
          </p>
        </div>
        <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
          {(["builder", "saved"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
                activeTab === tab
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab === "builder" ? <Sparkles className="w-3.5 h-3.5" /> : <BookOpen className="w-3.5 h-3.5" />}
              {tab === "builder" ? "Builder" : "Saved Views"}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "builder" ? (
        <div className="space-y-6">
          {/* Prompt Input */}
          <PromptBuilder
            onSubmit={(prompt) => generate.mutate(prompt)}
            loading={generate.isPending}
            examplePrompts={EXAMPLE_PROMPTS}
          />

          {/* Results */}
          {results.length === 0 && !generate.isPending && (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
              <div className="w-16 h-16 bg-brand-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-8 h-8 text-brand-500" />
              </div>
              <h3 className="font-semibold text-gray-700 mb-2">Ask anything about your data</h3>
              <p className="text-sm text-gray-400 mb-6 max-w-md mx-auto">
                Type a question above and the AI will generate an interactive chart or table from your demand data.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {EXAMPLE_PROMPTS.slice(0, 4).map((p) => (
                  <button
                    key={p}
                    onClick={() => generate.mutate(p)}
                    className="text-xs px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-full text-gray-600 hover:bg-brand-50 hover:border-brand-200 hover:text-brand-600 transition-colors text-left"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {results.map((result, i) => (
            <GeneratedViz key={result.id ?? i} result={result} />
          ))}
        </div>
      ) : (
        <SavedViews />
      )}
    </div>
  );
}
