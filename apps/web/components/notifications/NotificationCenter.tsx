"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  X, Bell, AlertTriangle, CheckCircle2, Upload,
  TrendingUp, Settings, CheckCheck, ExternalLink,
} from "lucide-react";
import { useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────

type NType = "exception" | "approval" | "upload" | "forecast" | "system";

interface Notification {
  id: string;
  type: NType;
  title: string;
  message: string;
  link?: string;
  is_read: boolean;
  created_at: string;
  age: string;
}

// ─── Icon + colour helpers ────────────────────────────────────

const TYPE_META: Record<NType, { icon: React.ElementType; bg: string; fg: string; label: string }> = {
  exception: { icon: AlertTriangle, bg: "bg-red-100",    fg: "text-red-600",    label: "Exception" },
  approval:  { icon: CheckCircle2, bg: "bg-purple-100",  fg: "text-purple-600", label: "Approval" },
  upload:    { icon: Upload,       bg: "bg-blue-100",    fg: "text-blue-600",   label: "Upload" },
  forecast:  { icon: TrendingUp,   bg: "bg-green-100",   fg: "text-green-600",  label: "Forecast" },
  system:    { icon: Settings,     bg: "bg-gray-100",    fg: "text-gray-600",   label: "System" },
};

// ─── Notification item ────────────────────────────────────────

function NotifItem({
  n,
  onRead,
}: {
  n: Notification;
  onRead: (id: string) => void;
}) {
  const router = useRouter();
  const meta = TYPE_META[n.type] ?? TYPE_META.system;
  const Icon = meta.icon;

  const handleClick = () => {
    onRead(n.id);
    if (n.link) router.push(n.link);
  };

  return (
    <button
      onClick={handleClick}
      className={[
        "w-full text-left px-4 py-3 flex gap-3 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0",
        !n.is_read ? "bg-blue-50/30" : "",
      ].join(" ")}
    >
      {/* Icon */}
      <div className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${meta.bg}`}>
        <Icon className={`w-4.5 h-4.5 ${meta.fg}`} style={{ width: 18, height: 18 }} />
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-sm leading-snug ${!n.is_read ? "font-semibold text-gray-900" : "text-gray-700"}`}>
            {n.title}
          </p>
          {!n.is_read && (
            <span className="flex-shrink-0 w-2 h-2 mt-1.5 rounded-full bg-blue-500" />
          )}
        </div>
        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
        <div className="flex items-center gap-2 mt-1.5">
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${meta.bg} ${meta.fg} font-medium`}>
            {meta.label}
          </span>
          <span className="text-xs text-gray-400">{n.age}</span>
          {n.link && (
            <ExternalLink className="w-3 h-3 text-gray-300 ml-auto" />
          )}
        </div>
      </div>
    </button>
  );
}

// ─── Notification Center Panel ────────────────────────────────

const TABS: { key: string; label: string }[] = [
  { key: "",          label: "All" },
  { key: "exception", label: "Exceptions" },
  { key: "approval",  label: "Approvals" },
  { key: "system",    label: "System" },
];

export function NotificationCenter({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState("");
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["notifications", tab],
    queryFn: () =>
      api.get("/notifications", { params: tab ? { type: tab } : {} }).then((r) => r.data),
    enabled: open,
    refetchInterval: open ? 30000 : false,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAll = useMutation({
    mutationFn: () => api.post("/notifications/mark-all-read"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const items: Notification[] = data?.items ?? [];
  const unread = data?.unread_count ?? 0;

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/10"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-[420px] bg-white shadow-2xl z-50 flex flex-col border-l border-gray-100">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <Bell className="w-5 h-5 text-gray-700" />
            <h2 className="font-semibold text-gray-900">Notifications</h2>
            {unread > 0 && (
              <span className="text-xs bg-red-500 text-white rounded-full px-2 py-0.5 font-medium">
                {unread}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unread > 0 && (
              <button
                onClick={() => markAll.mutate()}
                className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium"
              >
                <CheckCheck className="w-3.5 h-3.5" /> Mark all read
              </button>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 flex-shrink-0 px-1 pt-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={[
                "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
                tab === t.key
                  ? "border-brand-600 text-brand-600"
                  : "border-transparent text-gray-500 hover:text-gray-700",
              ].join(" ")}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="space-y-0">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="px-4 py-3 flex gap-3 border-b border-gray-50">
                  <div className="w-9 h-9 rounded-xl bg-gray-100 animate-pulse flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 bg-gray-100 rounded animate-pulse w-3/4" />
                    <div className="h-3 bg-gray-100 rounded animate-pulse w-full" />
                    <div className="h-3 bg-gray-100 rounded animate-pulse w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center px-6">
              <Bell className="w-10 h-10 text-gray-200 mb-3" />
              <p className="text-sm font-medium text-gray-500">All caught up!</p>
              <p className="text-xs text-gray-400 mt-1">No notifications to show</p>
            </div>
          ) : (
            <div>
              {items.map((n) => (
                <NotifItem
                  key={n.id}
                  n={n}
                  onRead={(id) => markRead.mutate(id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Bell button with badge (used in Header) ──────────────────

export function NotificationBell({ onClick }: { onClick: () => void }) {
  const { data } = useQuery({
    queryKey: ["notifications-count"],
    queryFn: () => api.get("/notifications", { params: { unread_only: true } }).then((r) => r.data),
    refetchInterval: 60000,
  });

  const unread = data?.unread_count ?? 0;

  return (
    <button
      onClick={onClick}
      className="relative w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
      title="Notifications"
    >
      <Bell className="w-4 h-4" />
      {unread > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold px-0.5">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </button>
  );
}
