"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DataUploader } from "@/components/data/DataUploader";
import { SchemaWizard } from "@/components/data/SchemaWizard";
import { DataQualityPanel } from "@/components/data/DataQualityPanel";
import { ConnectorList } from "@/components/data/ConnectorList";
import { api } from "@/lib/api";
import { Upload, Plug, Database, ShieldCheck } from "lucide-react";

const tabs = [
  { id: "upload", label: "Upload Files", icon: Upload },
  { id: "connectors", label: "ERP Connectors", icon: Plug },
  { id: "schema", label: "Schema Config", icon: Database },
  { id: "quality", label: "Data Quality", icon: ShieldCheck },
];

export default function DataPage() {
  const [activeTab, setActiveTab] = useState("upload");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadId, setUploadId] = useState<string | null>(null);

  const { data: schemas } = useQuery({
    queryKey: ["schemas"],
    queryFn: () => api.get("/data/schemas").then((r) => r.data),
  });

  const { data: quality } = useQuery({
    queryKey: ["data-quality"],
    queryFn: () => api.get("/data/quality").then((r) => r.data),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Data Management</h1>
        <p className="text-sm text-gray-500 mt-1">
          Connect your data sources, configure your schema, monitor data quality
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "upload" && (
        <DataUploader
          onUploadComplete={(id, file) => {
            setUploadId(id);
            setUploadedFile(file);
            setActiveTab("schema");
          }}
        />
      )}

      {activeTab === "schema" && (
        <SchemaWizard
          uploadId={uploadId}
          existingSchemas={schemas}
        />
      )}

      {activeTab === "connectors" && <ConnectorList />}

      {activeTab === "quality" && (
        <DataQualityPanel quality={quality} />
      )}
    </div>
  );
}
