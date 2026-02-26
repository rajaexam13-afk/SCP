"use client";

import { useState, useRef } from "react";
import { Sparkles, Send, Loader2 } from "lucide-react";
import { clsx } from "clsx";

interface Props {
  onSubmit: (prompt: string) => void;
  loading?: boolean;
  examplePrompts?: string[];
}

export function PromptBuilder({ onSubmit, loading, examplePrompts = [] }: Props) {
  const [prompt, setPrompt] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || loading) return;
    onSubmit(prompt.trim());
    setPrompt("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleExample = (example: string) => {
    setPrompt(example);
    textareaRef.current?.focus();
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6">
      <form onSubmit={handleSubmit}>
        <div className={clsx(
          "flex items-start gap-3 border-2 rounded-xl px-4 py-3 transition-colors",
          loading ? "border-brand-200 bg-brand-50/30" : "border-gray-200 focus-within:border-brand-400"
        )}>
          <Sparkles className={clsx("w-5 h-5 mt-0.5 flex-shrink-0", loading ? "text-brand-500 animate-pulse" : "text-gray-400")} />
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about your demand data… e.g. 'Show top 20 SKUs by forecast error in Q1 for East region, broken down by week'"
            rows={2}
            disabled={loading}
            className="flex-1 text-sm text-gray-800 placeholder-gray-400 resize-none focus:outline-none bg-transparent"
          />
          <button
            type="submit"
            disabled={!prompt.trim() || loading}
            className="flex-shrink-0 w-9 h-9 flex items-center justify-center bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Send className="w-4 h-4" />
            }
          </button>
        </div>
      </form>

      {examplePrompts.length > 0 && (
        <div className="mt-4">
          <p className="text-xs text-gray-400 mb-2">Try an example:</p>
          <div className="flex flex-wrap gap-2">
            {examplePrompts.map((example) => (
              <button
                key={example}
                onClick={() => handleExample(example)}
                disabled={loading}
                className="text-xs px-3 py-1.5 border border-gray-200 rounded-full text-gray-500 hover:bg-brand-50 hover:border-brand-200 hover:text-brand-600 transition-colors disabled:opacity-40"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
