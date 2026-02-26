"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ArrowRight, Check, RefreshCw } from "lucide-react";
import { clsx } from "clsx";

const CANONICAL_FIELDS = [
  { key: "product_id",  label: "Product / SKU ID",  required: true,  description: "Unique product identifier" },
  { key: "product_name",label: "Product Name",       required: false, description: "Human-readable product name" },
  { key: "location_id", label: "Location / Plant",   required: false, description: "Store, warehouse, or region" },
  { key: "channel_id",  label: "Channel",            required: false, description: "Sales channel (retail, ecom, etc.)" },
  { key: "time_key",    label: "Date / Period",       required: true,  description: "Date, week, or period column" },
  { key: "value",       label: "Value / Quantity",    required: true,  description: "Sales quantity or revenue" },
  { key: "measure_id",  label: "Measure Type",        required: false, description: "Type of value (sales_qty, revenue...)" },
];

interface Props {
  uploadId: string | null;
  existingSchemas?: any[];
}

export function SchemaWizard({ uploadId, existingSchemas }: Props) {
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const { data: preview, isLoading } = useQuery({
    queryKey: ["upload-preview", uploadId],
    queryFn: () => api.get(`/data/uploads/${uploadId}/preview`).then((r) => r.data),
    enabled: !!uploadId,
  });

  const saveMapping = useMutation({
    mutationFn: () => api.post(`/data/uploads/${uploadId}/schema`, { mappings }),
    onSuccess: () => setSaved(true),
  });

  const detectedColumns: string[] = preview?.columns ?? [];

  if (!uploadId) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400 text-sm">
        Upload a file first to configure its schema mapping.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Column Preview */}
      {preview && (
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <p className="font-semibold text-gray-800 mb-3">Detected columns ({detectedColumns.length})</p>
          <div className="flex flex-wrap gap-2">
            {detectedColumns.map((col: string) => (
              <span key={col} className="px-3 py-1 bg-gray-100 rounded-full text-xs text-gray-700 font-mono">
                {col}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Mapping Table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-50">
          <p className="font-semibold text-gray-800">Map your columns to the canonical model</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Tell us which column in your file corresponds to each demand dimension
          </p>
        </div>
        <div className="divide-y divide-gray-50">
          {CANONICAL_FIELDS.map((field) => (
            <div key={field.key} className="flex items-center gap-4 px-6 py-4">
              <div className="w-48 flex-shrink-0">
                <p className="text-sm font-medium text-gray-800 flex items-center gap-1">
                  {field.label}
                  {field.required && <span className="text-red-400 text-xs">*</span>}
                </p>
                <p className="text-xs text-gray-400">{field.description}</p>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
              <select
                value={mappings[field.key] ?? ""}
                onChange={(e) => setMappings((prev) => ({ ...prev, [field.key]: e.target.value }))}
                className="flex-1 max-w-xs px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 text-gray-700"
              >
                <option value="">— not mapped —</option>
                {detectedColumns.map((col: string) => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
              {mappings[field.key] && (
                <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
              )}
            </div>
          ))}
        </div>
        <div className="px-6 py-4 border-t border-gray-50 flex justify-end">
          <button
            onClick={() => saveMapping.mutate()}
            disabled={saveMapping.isPending || saved}
            className={clsx(
              "flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-colors",
              saved
                ? "bg-green-50 text-green-700 border border-green-100"
                : "bg-brand-600 text-white hover:bg-brand-700"
            )}
          >
            {saveMapping.isPending && <RefreshCw className="w-4 h-4 animate-spin" />}
            {saved ? <><Check className="w-4 h-4" /> Schema saved!</> : "Save schema & ingest"}
          </button>
        </div>
      </div>
    </div>
  );
}
