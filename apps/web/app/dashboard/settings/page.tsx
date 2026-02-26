"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import {
  Users, Building2, Layers, Plug2,
  Send, Loader2, Trash2, Shield,
  Check, Sparkles,
  BarChart3, Settings2, Wifi,
} from "lucide-react";

// ─── Tab definition ───────────────────────────────────────────

const TABS = [
  { key: "team",   label: "Team",         icon: Users },
  { key: "org",    label: "Organization", icon: Building2 },
  { key: "modules",label: "Modules",      icon: Layers },
  { key: "integrations", label: "Integrations", icon: Plug2 },
] as const;

type TabKey = (typeof TABS)[number]["key"];

// ─── Role badge ───────────────────────────────────────────────

const ROLE_STYLE: Record<string, string> = {
  admin:   "bg-purple-100 text-purple-700",
  planner: "bg-blue-100 text-blue-700",
  analyst: "bg-green-100 text-green-700",
  viewer:  "bg-gray-100 text-gray-600",
};

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${ROLE_STYLE[role] ?? ROLE_STYLE.viewer}`}>
      {role}
    </span>
  );
}

// ─── AI Chat message ──────────────────────────────────────────

interface ChatMsg {
  from: "user" | "ai";
  text: string;
  action?: string;
  user?: { name: string; email: string; role: string };
  temp_password?: string;
}

// ─── Team Tab ─────────────────────────────────────────────────

function TeamTab() {
  const { user: me } = useAuthStore();
  const qc = useQueryClient();
  const [prompt, setPrompt] = useState("");
  const [chat, setChat] = useState<ChatMsg[]>([
    {
      from: "ai",
      text: "Hi! I'm your AI team manager. Tell me what you'd like to do — invite someone, change a role, or remove a member. Just type naturally.",
    },
  ]);

  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ["team-users"],
    queryFn: () => api.get("/tenants/users").then((r) => r.data),
  });

  const aiManage = useMutation({
    mutationFn: (p: string) =>
      api.post("/tenants/users/ai-manage", { prompt: p }).then((r) => r.data),
    onSuccess: (data) => {
      let text = data.message ?? "Done!";
      if (data.action === "invite" && data.temp_password) {
        text += `\n\nTemp password: **${data.temp_password}** — share this with them securely.`;
      }
      setChat((c) => [
        ...c,
        { from: "ai", text, action: data.action, user: data.user, temp_password: data.temp_password },
      ]);
      qc.invalidateQueries({ queryKey: ["team-users"] });
    },
    onError: () => {
      setChat((c) => [
        ...c,
        { from: "ai", text: "Something went wrong. Please try again or use the manual form below." },
      ]);
    },
  });

  const updateRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      api.put(`/tenants/users/${userId}/role`, { role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team-users"] }),
  });

  const deactivate = useMutation({
    mutationFn: (userId: string) => api.delete(`/tenants/users/${userId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team-users"] }),
  });

  const handleSend = () => {
    if (!prompt.trim()) return;
    setChat((c) => [...c, { from: "user", text: prompt }]);
    aiManage.mutate(prompt);
    setPrompt("");
  };

  const EXAMPLES = [
    "Add alice@company.com as an analyst",
    "Make Bob an admin",
    "Remove carol from the team",
    "Who has admin access?",
    "List all planners",
  ];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {/* AI Command panel */}
      <div className="bg-white rounded-2xl border border-gray-100 flex flex-col" style={{ height: 500 }}>
        <div className="px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-500 to-purple-500 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 text-sm">AI Team Manager</h3>
              <p className="text-xs text-gray-400">Manage your team with natural language</p>
            </div>
          </div>
        </div>

        {/* Chat messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {chat.map((msg, i) => (
            <div key={i} className={`flex ${msg.from === "user" ? "justify-end" : "justify-start"}`}>
              {msg.from === "ai" && (
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-brand-500 to-purple-500 flex items-center justify-center mr-2 flex-shrink-0 mt-1">
                  <Sparkles className="w-3 h-3 text-white" />
                </div>
              )}
              <div
                className={[
                  "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
                  msg.from === "user"
                    ? "bg-brand-600 text-white rounded-tr-sm"
                    : "bg-gray-100 text-gray-800 rounded-tl-sm",
                ].join(" ")}
              >
                {msg.text.split("\n").map((line, j) => (
                  <span key={j}>
                    {line.split(/\*\*(.*?)\*\*/).map((part, k) =>
                      k % 2 === 1 ? <strong key={k}>{part}</strong> : part
                    )}
                    {j < msg.text.split("\n").length - 1 && <br />}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {aiManage.isPending && (
            <div className="flex justify-start">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-brand-500 to-purple-500 flex items-center justify-center mr-2 flex-shrink-0">
                <Sparkles className="w-3 h-3 text-white" />
              </div>
              <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-2.5 flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin" />
                <span className="text-sm text-gray-500">Thinking…</span>
              </div>
            </div>
          )}
        </div>

        {/* Example prompts */}
        {chat.length <= 1 && (
          <div className="px-4 pb-2 flex-shrink-0">
            <p className="text-xs text-gray-400 mb-2">Try:</p>
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => setPrompt(ex)}
                  className="text-xs border border-gray-200 rounded-full px-3 py-1 hover:bg-gray-50 text-gray-600"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="px-4 pb-4 flex-shrink-0">
          <div className="flex gap-2 mt-2">
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
              placeholder="Type a team management command…"
              disabled={aiManage.isPending}
              className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60"
            />
            <button
              onClick={handleSend}
              disabled={aiManage.isPending || !prompt.trim()}
              className="w-10 h-10 bg-brand-600 text-white rounded-xl flex items-center justify-center hover:bg-brand-700 disabled:opacity-50 flex-shrink-0"
            >
              {aiManage.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Current team table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden" style={{ height: 500, display: "flex", flexDirection: "column" }}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <h3 className="font-semibold text-gray-900 text-sm">Current Team</h3>
          <span className="text-xs text-gray-400">
            {Array.isArray(users) ? users.length : 0} members
          </span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {usersLoading ? (
            <div className="space-y-0">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="px-5 py-3.5 flex items-center gap-3 border-b border-gray-50">
                  <div className="w-9 h-9 rounded-full bg-gray-100 animate-pulse" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 bg-gray-100 rounded animate-pulse w-1/2" />
                    <div className="h-3 bg-gray-100 rounded animate-pulse w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            (Array.isArray(users) ? users : []).map((u: any) => (
              <div
                key={u.id}
                className="px-5 py-3.5 flex items-center gap-3 border-b border-gray-50 hover:bg-gray-50/70"
              >
                <div className="w-9 h-9 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-semibold text-sm flex-shrink-0">
                  {u.name?.[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-900 truncate">{u.name}</p>
                    {u.id === me?.id && (
                      <span className="text-xs text-gray-400">(you)</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 truncate">{u.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    defaultValue={u.role}
                    disabled={u.id === me?.id || me?.role !== "admin"}
                    onChange={(e) => updateRole.mutate({ userId: u.id, role: e.target.value })}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50 bg-white"
                  >
                    <option value="admin">Admin</option>
                    <option value="planner">Planner</option>
                    <option value="analyst">Analyst</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  {u.id !== me?.id && me?.role === "admin" && (
                    <button
                      onClick={() => {
                        if (confirm(`Remove ${u.name} from the team?`))
                          deactivate.mutate(u.id);
                      }}
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Organisation Tab ─────────────────────────────────────────

const INDUSTRIES = [
  "Consumer Packaged Goods (CPG)", "Retail", "Manufacturing", "Distribution & Logistics",
  "Pharma & Healthcare", "Agriculture", "Automotive", "Electronics", "Other",
];
const TIMEZONES = [
  "UTC", "America/New_York", "America/Chicago", "America/Los_Angeles",
  "Europe/London", "Europe/Paris", "Europe/Berlin", "Asia/Singapore",
  "Asia/Tokyo", "Asia/Mumbai", "Australia/Sydney",
];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function OrgTab() {
  const qc = useQueryClient();
  const { data: tenant, isLoading } = useQuery({
    queryKey: ["tenant"],
    queryFn: () => api.get("/tenants/me").then((r) => r.data),
  });

  const [name, setName]     = useState("");
  const [industry, setInd]  = useState("");
  const [tz, setTz]         = useState("");
  const [fyStart, setFy]    = useState<number>(1);
  const [saved, setSaved]   = useState(false);

  const update = useMutation({
    mutationFn: () =>
      api.put("/tenants/me", {
        name:              name || tenant?.name,
        industry:          industry || tenant?.industry,
        timezone:          tz || "UTC",
        fiscal_year_start: fyStart,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  const displayName     = name     || tenant?.name     || "";
  const displayIndustry = industry || tenant?.industry || "";

  const PLAN_COLORS: Record<string, string> = {
    free:    "bg-gray-100 text-gray-600",
    starter: "bg-blue-100 text-blue-700",
    growth:  "bg-purple-100 text-purple-700",
    scale:   "bg-amber-100 text-amber-700",
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Company Details</h3>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${PLAN_COLORS[tenant?.plan_tier ?? "free"] ?? PLAN_COLORS.free}`}>
            {tenant?.plan_tier ?? "free"} plan
          </span>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Company name</label>
            <input
              value={displayName}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Industry</label>
            <select
              value={displayIndustry}
              onChange={(e) => setInd(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
            >
              <option value="">Select industry…</option>
              {INDUSTRIES.map((ind) => <option key={ind}>{ind}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Timezone</label>
              <select
                value={tz}
                onChange={(e) => setTz(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
              >
                {TIMEZONES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Fiscal year start</label>
              <select
                value={fyStart}
                onChange={(e) => setFy(Number(e.target.value))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
              >
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
          </div>
        </div>

        <button
          onClick={() => update.mutate()}
          disabled={update.isPending}
          className="flex items-center gap-2 bg-brand-600 text-white text-sm rounded-xl px-5 py-2.5 hover:bg-brand-700 disabled:opacity-60"
        >
          {update.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : saved ? (
            <Check className="w-4 h-4" />
          ) : null}
          {saved ? "Saved!" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

// ─── Modules Tab ──────────────────────────────────────────────

const MODULE_LIST = [
  {
    key: "retail",
    label: "Retail Planning",
    description: "Store-level demand sensing, promotion lift, seasonal profiles",
    icon: BarChart3,
    default: true,
  },
  {
    key: "cpg",
    label: "Consumer Packaged Goods",
    description: "Shopper analytics, trade promotion optimization, category management",
    icon: Layers,
    default: false,
  },
  {
    key: "manufacturing",
    label: "Manufacturing",
    description: "Rough-cut capacity planning, production scheduling, MRP signals",
    icon: Settings2,
    default: false,
  },
  {
    key: "logistics",
    label: "Distribution & Logistics",
    description: "Safety stock optimization, DC replenishment, lead-time variability",
    icon: Wifi,
    default: false,
  },
  {
    key: "pharma",
    label: "Pharma & Healthcare",
    description: "Serialization, cold-chain, regulatory compliance demand signals",
    icon: Shield,
    default: false,
  },
  {
    key: "analytics",
    label: "Advanced Analytics",
    description: "Custom ML models, causal AI, external data enrichment",
    icon: Sparkles,
    default: true,
  },
];

function ModulesTab() {
  const qc = useQueryClient();
  const [modules, setModules] = useState<Record<string, boolean>>(
    Object.fromEntries(MODULE_LIST.map((m) => [m.key, m.default]))
  );
  const [saved, setSaved] = useState(false);

  const update = useMutation({
    mutationFn: () => api.put("/tenants/me", { modules }),
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-sm text-gray-500">
        Enable or disable industry-specific modules for your workspace.
        Changes take effect immediately for all users in your tenant.
      </p>

      <div className="space-y-3">
        {MODULE_LIST.map((mod) => {
          const Icon = mod.icon;
          const enabled = modules[mod.key] ?? mod.default;
          return (
            <div
              key={mod.key}
              className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-4"
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${enabled ? "bg-brand-100" : "bg-gray-100"}`}>
                <Icon className={`w-5 h-5 ${enabled ? "text-brand-600" : "text-gray-400"}`} />
              </div>
              <div className="flex-1">
                <p className={`text-sm font-semibold ${enabled ? "text-gray-900" : "text-gray-400"}`}>
                  {mod.label}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{mod.description}</p>
              </div>
              {/* Toggle */}
              <button
                onClick={() => setModules((m) => ({ ...m, [mod.key]: !enabled }))}
                className={[
                  "relative w-11 h-6 rounded-full transition-colors flex-shrink-0",
                  enabled ? "bg-brand-600" : "bg-gray-200",
                ].join(" ")}
              >
                <span
                  className={[
                    "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform",
                    enabled ? "translate-x-5" : "translate-x-0",
                  ].join(" ")}
                />
              </button>
            </div>
          );
        })}
      </div>

      <button
        onClick={() => update.mutate()}
        disabled={update.isPending}
        className="flex items-center gap-2 bg-brand-600 text-white text-sm rounded-xl px-5 py-2.5 hover:bg-brand-700 disabled:opacity-60"
      >
        {update.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : null}
        {saved ? "Saved!" : "Save Module Settings"}
      </button>
    </div>
  );
}

// ─── Integrations Tab ─────────────────────────────────────────

const INTEGRATIONS = [
  { key: "sap",       name: "SAP S/4HANA",        logo: "🏭", status: "connected", since: "Jan 2024" },
  { key: "oracle",    name: "Oracle NetSuite",     logo: "🔶", status: "disconnected" },
  { key: "salesforce",name: "Salesforce",          logo: "☁️", status: "disconnected" },
  { key: "dynamics",  name: "Microsoft Dynamics",  logo: "🪟", status: "disconnected" },
  { key: "sheets",    name: "Google Sheets",       logo: "📊", status: "connected", since: "Mar 2024" },
  { key: "snowflake", name: "Snowflake",           logo: "❄️", status: "disconnected" },
];

function IntegrationsTab() {
  return (
    <div className="max-w-2xl space-y-3">
      {INTEGRATIONS.map((intg) => (
        <div key={intg.key} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-xl flex-shrink-0">
            {intg.logo}
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-900">{intg.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {intg.status === "connected"
                ? `Connected · Since ${intg.since}`
                : "Not connected"}
            </p>
          </div>
          {intg.status === "connected" ? (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                Active
              </span>
              <button className="text-xs text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50">
                Configure
              </button>
            </div>
          ) : (
            <button className="text-xs text-brand-600 border border-brand-200 rounded-lg px-3 py-1.5 hover:bg-brand-50 font-medium">
              Connect
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("team");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage your workspace, team, and integrations</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={[
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
              activeTab === key
                ? "border-brand-600 text-brand-600"
                : "border-transparent text-gray-500 hover:text-gray-700",
            ].join(" ")}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "team"         && <TeamTab />}
        {activeTab === "org"          && <OrgTab />}
        {activeTab === "modules"      && <ModulesTab />}
        {activeTab === "integrations" && <IntegrationsTab />}
      </div>
    </div>
  );
}
