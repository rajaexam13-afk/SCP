"use client";

import { usePathname } from "next/navigation";
import { ChevronDown, Circle } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { useRealtimeStore } from "@/store/realtime";
import { useState } from "react";
import { NotificationBell, NotificationCenter } from "@/components/notifications/NotificationCenter";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard/overview":  "Overview",
  "/dashboard/forecasts": "Forecasts",
  "/dashboard/scenarios": "Scenario Planning",
  "/dashboard/builder":   "AI Dashboard Builder",
  "/dashboard/data":      "Data Management",
  "/dashboard/settings":  "Settings",
};

export function Header() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const { connected, presence } = useRealtimeStore();
  const [showUserMenu, setShowUserMenu]       = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const title = Object.entries(PAGE_TITLES).find(([k]) => pathname.startsWith(k))?.[1] ?? "DemandIQ";

  return (
    <>
    <NotificationCenter
      open={showNotifications}
      onClose={() => setShowNotifications(false)}
    />
    <header className="h-16 bg-white border-b border-gray-100 px-6 flex items-center justify-between flex-shrink-0">
      <h2 className="font-semibold text-gray-900">{title}</h2>

      <div className="flex items-center gap-4">
        {/* Active users */}
        {presence.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <div className="flex -space-x-1">
              {presence.slice(0, 4).map((p: any) => (
                <div
                  key={p.userId}
                  className="w-6 h-6 rounded-full bg-brand-500 border-2 border-white flex items-center justify-center text-white text-xs font-medium"
                  title={p.name}
                >
                  {p.name?.[0]?.toUpperCase()}
                </div>
              ))}
            </div>
            {presence.length > 4 && <span>+{presence.length - 4} online</span>}
          </div>
        )}

        {/* Connection status */}
        <div className="flex items-center gap-1.5 text-xs">
          <Circle
            className={`w-2 h-2 fill-current ${connected ? "text-green-500" : "text-yellow-500"}`}
          />
          <span className="text-gray-400">{connected ? "Live" : "Reconnecting..."}</span>
        </div>

        {/* Notifications */}
        <NotificationBell onClick={() => setShowNotifications(true)} />

        {/* User Menu */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 hover:bg-gray-50 rounded-lg px-2 py-1.5 transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center text-white text-xs font-semibold">
              {user?.name?.[0]?.toUpperCase() ?? "U"}
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-sm font-medium text-gray-700 leading-none">{user?.name ?? "User"}</p>
              <p className="text-xs text-gray-400 mt-0.5">{user?.tenant_name ?? "Workspace"}</p>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
          </button>

          {showUserMenu && (
            <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl border border-gray-100 shadow-lg py-1 z-50">
              <button
                onClick={logout}
                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
    </>
  );
}
