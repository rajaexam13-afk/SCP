"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import {
  LayoutDashboard, GitBranch, TrendingUp, Database,
  Sparkles, Settings, TrendingUp as Logo, Users, ChevronLeft, ChevronRight
} from "lucide-react";
import { useState } from "react";

const navItems = [
  { href: "/dashboard/overview",   icon: LayoutDashboard, label: "Overview"    },
  { href: "/dashboard/forecasts",  icon: TrendingUp,      label: "Forecasts"   },
  { href: "/dashboard/scenarios",  icon: GitBranch,       label: "Scenarios"   },
  { href: "/dashboard/builder",    icon: Sparkles,        label: "AI Builder"  },
  { href: "/dashboard/data",       icon: Database,        label: "Data"        },
  { href: "/dashboard/settings",   icon: Settings,        label: "Settings"    },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={clsx(
        "flex flex-col bg-white border-r border-gray-100 transition-all duration-300 h-screen",
        collapsed ? "w-16" : "w-56"
      )}
    >
      {/* Logo */}
      <div className={clsx(
        "h-16 flex items-center border-b border-gray-100 flex-shrink-0",
        collapsed ? "justify-center px-0" : "px-4 gap-2"
      )}>
        <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center flex-shrink-0">
          <Logo className="w-4 h-4 text-white" />
        </div>
        {!collapsed && (
          <span className="font-bold text-gray-900 text-lg">DemandIQ</span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors group",
                active
                  ? "bg-brand-50 text-brand-700"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
                collapsed && "justify-center"
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className={clsx(
                "w-4.5 h-4.5 flex-shrink-0",
                active ? "text-brand-600" : "text-gray-400 group-hover:text-gray-600"
              )} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Collapse Toggle */}
      <div className="p-2 border-t border-gray-100 flex-shrink-0">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={clsx(
            "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors",
            collapsed && "justify-center"
          )}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : (
            <>
              <ChevronLeft className="w-4 h-4" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
