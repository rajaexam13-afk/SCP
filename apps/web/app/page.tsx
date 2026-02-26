"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  BarChart3, Brain, Zap, Users, Database, TrendingUp,
  ArrowRight, CheckCircle2, ChevronRight
} from "lucide-react";

const features = [
  {
    icon: Database,
    title: "Flexible Data Layer",
    desc: "Connect any ERP, upload Excel, auto-detect your schema. SAP, Oracle, JDE — or just a spreadsheet.",
  },
  {
    icon: Brain,
    title: "AI Forecast Engine",
    desc: "AutoML picks the best model per SKU. ARIMA, Prophet, LightGBM, LSTM — all behind one interface.",
  },
  {
    icon: BarChart3,
    title: "AI Dashboard Builder",
    desc: 'Type "show top 20 SKUs by forecast error in Q1" and get an interactive chart instantly.',
  },
  {
    icon: Zap,
    title: "Delta Scenario Engine",
    desc: "Create unlimited what-if scenarios in seconds. Store only changes, not full copies. Compare side by side.",
  },
  {
    icon: Users,
    title: "Collaborative Planning",
    desc: "Multi-user workflows with real-time presence, cell-level locking, comment threads and approvals.",
  },
  {
    icon: TrendingUp,
    title: "Full Process Coverage",
    desc: "Statistical → Commercial → Finance → Consensus. Full demand planning cycle with audit trail.",
  },
];

const industries = ["CPG", "FMCG", "Manufacturing", "Retail", "Pharma", "Distribution"];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="border-b border-gray-100 sticky top-0 bg-white/80 backdrop-blur-sm z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl text-gray-900">DemandIQ</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-gray-600">
            <a href="#features" className="hover:text-gray-900 transition-colors">Features</a>
            <a href="#industries" className="hover:text-gray-900 transition-colors">Industries</a>
            <a href="#pricing" className="hover:text-gray-900 transition-colors">Pricing</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
              Sign in
            </Link>
            <Link
              href="/login?signup=true"
              className="text-sm bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700 transition-colors"
            >
              Start free
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-6 pt-24 pb-20 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="inline-flex items-center gap-2 text-sm text-brand-600 bg-brand-50 px-3 py-1 rounded-full mb-6">
            <Zap className="w-3.5 h-3.5" />
            AI-powered demand planning for SMBs
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 leading-tight mb-6">
            Stop forecasting in Excel.
            <br />
            <span className="text-brand-600">Start forecasting with AI.</span>
          </h1>
          <p className="text-xl text-gray-500 max-w-3xl mx-auto mb-10">
            Upload your sales history, connect your ERP, and get AI-powered demand forecasts
            in minutes. Collaborative planning, unlimited scenarios, AI-generated dashboards —
            at a fraction of SAP IBP or Anaplan.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/login?signup=true"
              className="inline-flex items-center gap-2 bg-brand-600 text-white px-8 py-3.5 rounded-lg text-base font-medium hover:bg-brand-700 transition-colors"
            >
              Start free — upload your Excel
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/dashboard/overview"
              className="inline-flex items-center gap-2 border border-gray-200 text-gray-700 px-8 py-3.5 rounded-lg text-base font-medium hover:bg-gray-50 transition-colors"
            >
              View live demo
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          <p className="mt-4 text-sm text-gray-400">
            No credit card required · Up to 500 SKUs free · Setup in under 10 minutes
          </p>
        </motion.div>
      </section>

      {/* Industries */}
      <section id="industries" className="bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-6">
          <p className="text-center text-sm text-gray-500 mb-4">Built for</p>
          <div className="flex flex-wrap justify-center gap-3">
            {industries.map((ind) => (
              <span
                key={ind}
                className="px-4 py-1.5 bg-white border border-gray-200 rounded-full text-sm text-gray-700 font-medium"
              >
                {ind}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-7xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Everything you need. Nothing you don't.
          </h2>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto">
            A complete demand planning platform built specifically for companies that
            have outgrown Excel but can't afford enterprise software.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feat, i) => (
            <motion.div
              key={feat.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              viewport={{ once: true }}
              className="p-6 border border-gray-100 rounded-2xl hover:border-brand-200 hover:shadow-md transition-all group"
            >
              <div className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center mb-4 group-hover:bg-brand-100 transition-colors">
                <feat.icon className="w-5 h-5 text-brand-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">{feat.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{feat.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="bg-gray-50 py-24">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Simple, transparent pricing</h2>
            <p className="text-gray-500">No hidden fees. No per-module charges. Cancel anytime.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { name: "Free", price: "$0", skus: "500 SKUs", users: "1 user", features: ["Excel/CSV upload", "Basic forecasting", "3 fixed dashboards", "12 months history"] },
              { name: "Starter", price: "$299", skus: "10K SKUs", users: "5 users", features: ["Everything in Free", "AI dashboard builder", "Scenario planning", "ERP connectors", "3 years history"], highlight: true },
              { name: "Growth", price: "$799", skus: "100K SKUs", users: "20 users", features: ["Everything in Starter", "Multi-user collaboration", "Approval workflows", "Industry modules", "5 years history"] },
            ].map((plan) => (
              <div
                key={plan.name}
                className={`rounded-2xl p-8 ${
                  plan.highlight
                    ? "bg-brand-600 text-white shadow-xl shadow-brand-200"
                    : "bg-white border border-gray-200"
                }`}
              >
                <div className="mb-6">
                  <p className={`text-sm font-medium mb-1 ${plan.highlight ? "text-brand-200" : "text-gray-500"}`}>
                    {plan.name}
                  </p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold">{plan.price}</span>
                    <span className={`text-sm ${plan.highlight ? "text-brand-200" : "text-gray-400"}`}>/mo</span>
                  </div>
                  <p className={`text-sm mt-1 ${plan.highlight ? "text-brand-200" : "text-gray-500"}`}>
                    {plan.skus} · {plan.users}
                  </p>
                </div>
                <ul className="space-y-2 mb-8">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className={`w-4 h-4 flex-shrink-0 ${plan.highlight ? "text-brand-200" : "text-brand-600"}`} />
                      <span className={plan.highlight ? "text-brand-100" : "text-gray-600"}>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/login?signup=true"
                  className={`block text-center py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    plan.highlight
                      ? "bg-white text-brand-600 hover:bg-brand-50"
                      : "bg-brand-600 text-white hover:bg-brand-700"
                  }`}
                >
                  Get started
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-brand-600 rounded flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-gray-700">DemandIQ</span>
          </div>
          <p className="text-sm text-gray-400">
            © {new Date().getFullYear()} DemandIQ. Intelligent demand planning for the modern SMB.
          </p>
        </div>
      </footer>
    </div>
  );
}
