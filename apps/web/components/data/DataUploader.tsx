"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileSpreadsheet, X, CheckCircle2, Loader2 } from "lucide-react";
import { clsx } from "clsx";
import { api } from "@/lib/api";

interface Props {
  onUploadComplete: (uploadId: string, file: File) => void;
}

export function DataUploader({ onUploadComplete }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) {
      setFile(accepted[0]);
      setError(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel": [".xls"],
      "text/csv": [".csv"],
    },
    maxSize: 100 * 1024 * 1024,
    multiple: false,
  });

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setProgress(0);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await api.post("/data/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (e) => {
          setProgress(Math.round(((e.loaded ?? 0) / (e.total ?? 1)) * 100));
        },
      });
      onUploadComplete(res.data.upload_id, file);
    } catch (err: any) {
      setError(err.response?.data?.detail ?? "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={clsx(
          "border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all",
          isDragActive ? "border-brand-400 bg-brand-50" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
        )}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-3">
          <div className={clsx(
            "w-16 h-16 rounded-2xl flex items-center justify-center",
            isDragActive ? "bg-brand-100" : "bg-gray-100"
          )}>
            <Upload className={clsx("w-8 h-8", isDragActive ? "text-brand-600" : "text-gray-400")} />
          </div>
          <div>
            <p className="font-semibold text-gray-700">
              {isDragActive ? "Drop your file here" : "Upload your data file"}
            </p>
            <p className="text-sm text-gray-400 mt-1">
              Drag & drop or click to select · Excel (.xlsx, .xls) or CSV · Max 100MB
            </p>
          </div>
        </div>
      </div>

      {file && (
        <div className="bg-white border border-gray-100 rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center flex-shrink-0">
            <FileSpreadsheet className="w-5 h-5 text-green-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">{file.name}</p>
            <p className="text-xs text-gray-400">
              {(file.size / 1024 / 1024).toFixed(2)} MB
            </p>
            {uploading && (
              <div className="mt-2">
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand-500 rounded-full transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">{progress}% uploaded</p>
              </div>
            )}
          </div>
          {!uploading && (
            <button onClick={() => setFile(null)} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">
          {error}
        </div>
      )}

      {file && !uploading && (
        <button
          onClick={handleUpload}
          className="w-full py-3 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 transition-colors flex items-center justify-center gap-2"
        >
          <Upload className="w-4 h-4" />
          Upload and configure schema
        </button>
      )}
    </div>
  );
}
