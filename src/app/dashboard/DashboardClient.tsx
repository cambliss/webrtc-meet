"use client";

import Link from "next/link";
import { useState } from "react";

import type { AuthTokenPayload } from "@/src/lib/auth";
import type { MeetingHistoryItem } from "@/src/lib/repositories/meetingSummaryRepository";

type DashboardClientProps = {
  auth: AuthTokenPayload;
  history: MeetingHistoryItem[];
  dataWarning: string;
};

const sidebarItems = [
  { id: "overview", label: "Dashboard", icon: "🏠" },
  { id: "subscription", label: "Subscription", icon: "💳" },
  { id: "payments", label: "Payment History", icon: "📄" },
  { id: "meetings", label: "Meetings History", icon: "🗂" },
  { id: "chat", label: "Chat", icon: "💬" },
  { id: "files", label: "File Transfer", icon: "📁" },
  { id: "features", label: "All Features", icon: "✨" },
  { id: "profile", label: "Profile", icon: "👤" },
  { id: "settings", label: "Settings", icon: "⚙" },
];

export function DashboardClient({ auth, history, dataWarning }: DashboardClientProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f5f9ff_0%,#eef4ff_45%,#ffffff_100%)] px-4 py-4 lg:py-6">
      <div className="mx-auto w-full max-w-7xl">
        <aside
          className={`mb-4 rounded-3xl border border-[#d7e3f7] bg-white/95 p-3 shadow-[0_14px_30px_rgba(26,115,232,0.12)] lg:fixed lg:left-4 lg:top-4 lg:mb-0 lg:h-[calc(100vh-2rem)] lg:overflow-y-auto ${
            collapsed ? "lg:w-[84px]" : "lg:w-[270px]"
          }`}
        >
          <div className="flex items-center justify-between gap-2 px-1">
            <div className={collapsed ? "hidden" : "block"}>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#1a73e8]">Dashboard</p>
              <h2 className="pt-1 text-lg font-bold text-[#202124]">Control Panel</h2>
            </div>
            <button
              type="button"
              onClick={() => setCollapsed((value) => !value)}
              className="rounded-xl border border-[#c8daf8] bg-[#eef4ff] px-3 py-2 text-sm font-semibold text-[#1a73e8]"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? "»" : "«"}
            </button>
          </div>

          <nav className="mt-4 space-y-1">
            {sidebarItems.map((item, index) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className={`flex items-center ${collapsed ? "justify-center" : "justify-start"} gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  index === 0 ? "bg-[#1a73e8] text-white" : "bg-[#eef4ff] text-[#1a73e8] hover:bg-[#dce9ff]"
                }`}
                title={item.label}
              >
                <span aria-hidden="true">{item.icon}</span>
                {!collapsed && <span>{item.label}</span>}
              </a>
            ))}
          </nav>

          <div className={`mt-4 rounded-2xl border border-[#d3e3fd] bg-[#f6faff] p-3 ${collapsed ? "hidden" : "block"}`}>
            <p className="text-xs text-[#5f6368]">Signed in as</p>
            <p className="text-sm font-bold text-[#202124]">{auth.username}</p>
            <p className="text-xs text-[#5f6368]">{auth.workspaceId}</p>
          </div>
        </aside>

        <div className={`space-y-5 ${collapsed ? "lg:ml-[108px]" : "lg:ml-[290px]"}`}>
          <header className="rounded-3xl border border-[#d7e3f7] bg-white/95 p-5 shadow-[0_12px_28px_rgba(26,115,232,0.12)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#1a73e8]">Dashboard</p>
                <h1 className="mt-1 text-2xl font-bold text-[#202124]">Workspace command center</h1>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link href="/" className="rounded-xl border border-[#c8daf8] bg-[#eef4ff] px-4 py-2 text-sm font-semibold text-[#1a73e8]">
                  Home
                </Link>
                <Link href="/meeting-history" className="rounded-xl border border-[#1a73e8] bg-[#1a73e8] px-4 py-2 text-sm font-semibold text-white">
                  History
                </Link>
                <form action="/api/auth/logout" method="post">
                  <button type="submit" className="rounded-xl border border-[#f4cf6f] bg-[#fef2c8] px-4 py-2 text-sm font-semibold text-[#7c5a00]">
                    Logout
                  </button>
                </form>
              </div>
            </div>
          </header>

          {dataWarning && (
            <section className="rounded-2xl border border-[#f4cf6f] bg-[#fef7e0] px-4 py-3 text-sm font-medium text-[#7c5a00]">
              {dataWarning}
            </section>
          )}

          <section id="overview" className="rounded-3xl border border-[#d7e3f7] bg-white/95 p-6 shadow-[0_16px_35px_rgba(26,115,232,0.14)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#1a73e8]">Dashboard</p>
                <h2 className="mt-1 text-3xl font-bold text-[#202124]">Welcome, {auth.username}</h2>
                <p className="mt-1 text-sm text-[#5f6368]">Workspace: {auth.workspaceId} • Role: {auth.role}</p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <article className="rounded-2xl border border-[#d9e5f8] bg-white p-5 shadow-[0_10px_24px_rgba(26,115,232,0.1)]">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#5f6368]">Meetings summarized</p>
                <p className="mt-2 text-3xl font-bold text-[#1a73e8]">{history.length}</p>
              </article>
              <article className="rounded-2xl border border-[#d9e5f8] bg-white p-5 shadow-[0_10px_24px_rgba(26,115,232,0.1)]">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#5f6368]">AI recap status</p>
                <p className="mt-2 text-3xl font-bold text-[#34a853]">Active</p>
              </article>
              <article className="rounded-2xl border border-[#d9e5f8] bg-white p-5 shadow-[0_10px_24px_rgba(26,115,232,0.1)]">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#5f6368]">Security checks</p>
                <p className="mt-2 text-3xl font-bold text-[#ea4335]">100%</p>
              </article>
              <article className="rounded-2xl border border-[#d9e5f8] bg-white p-5 shadow-[0_10px_24px_rgba(26,115,232,0.1)]">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#5f6368]">Room readiness</p>
                <p className="mt-2 text-3xl font-bold text-[#fbbc04]">Ready</p>
              </article>
            </div>
          </section>

          <section id="subscription" className="rounded-3xl border border-[#d7e4f8] bg-white p-6 shadow-[0_12px_26px_rgba(26,115,232,0.11)]">
            <h2 className="text-xl font-bold text-[#202124]">Subscription</h2>
            <p className="mt-1 text-sm text-[#5f6368]">Current plan and billing controls for your workspace.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <article className="rounded-2xl border border-[#d5e4fb] bg-[#f5f9ff] p-4"><p className="text-xs text-[#5f6368]">Active plan</p><p className="mt-1 text-lg font-bold text-[#1a73e8]">Starter</p></article>
              <article className="rounded-2xl border border-[#d5e4fb] bg-[#f5f9ff] p-4"><p className="text-xs text-[#5f6368]">Renewal date</p><p className="mt-1 text-lg font-bold text-[#202124]">Apr 10, 2026</p></article>
              <article className="rounded-2xl border border-[#d5e4fb] bg-[#f5f9ff] p-4"><p className="text-xs text-[#5f6368]">Billing owner</p><p className="mt-1 text-lg font-bold text-[#202124]">{auth.username}</p></article>
            </div>
          </section>

          <section id="payments" className="rounded-3xl border border-[#d7e4f8] bg-white p-6 shadow-[0_12px_26px_rgba(26,115,232,0.11)]">
            <h2 className="text-xl font-bold text-[#202124]">Payment History</h2>
            <div className="mt-4 overflow-x-auto rounded-2xl border border-[#dfe8f7]">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[#eef4ff] text-[#1a73e8]"><tr><th className="px-4 py-3 font-semibold">Date</th><th className="px-4 py-3 font-semibold">Plan</th><th className="px-4 py-3 font-semibold">Amount</th><th className="px-4 py-3 font-semibold">Status</th></tr></thead>
                <tbody className="divide-y divide-[#e7edf8] bg-white text-[#202124]"><tr><td className="px-4 py-3">Mar 01, 2026</td><td className="px-4 py-3">Starter</td><td className="px-4 py-3">$0.00</td><td className="px-4 py-3 text-[#34a853]">Paid</td></tr><tr><td className="px-4 py-3">Feb 01, 2026</td><td className="px-4 py-3">Starter</td><td className="px-4 py-3">$0.00</td><td className="px-4 py-3 text-[#34a853]">Paid</td></tr></tbody>
              </table>
            </div>
          </section>

          <section id="meetings" className="rounded-3xl border border-[#d7e4f8] bg-white p-6 shadow-[0_12px_26px_rgba(26,115,232,0.11)]">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xl font-bold text-[#202124]">Meetings History</h2>
              <Link href="/meeting-history" className="text-sm font-semibold text-[#1a73e8]">Open full history</Link>
            </div>
            {history.length === 0 ? (
              <p className="mt-3 text-sm text-[#5f6368]">No summaries yet. Start your first meeting to populate this section.</p>
            ) : (
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                {history.map((item) => (
                  <li key={`${item.meetingId}-${item.createdAt}`} className="rounded-xl border border-[#e0e8f5] bg-[#fbfdff] p-3">
                    <p className="text-sm font-semibold text-[#202124]">{item.roomId}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-[#5f6368]">{item.summary}</p>
                    <Link href={`/meeting-history/${item.meetingId}`} className="mt-2 inline-block text-xs font-semibold text-[#1a73e8]">Open details</Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section id="chat" className="rounded-3xl border border-[#d7e4f8] bg-white p-6 shadow-[0_12px_26px_rgba(26,115,232,0.11)]"><h2 className="text-xl font-bold text-[#202124]">Chat</h2><p className="mt-1 text-sm text-[#5f6368]">Real-time in-meeting messaging with searchable history and moderation-ready logs.</p></section>
          <section id="files" className="rounded-3xl border border-[#d7e4f8] bg-white p-6 shadow-[0_12px_26px_rgba(26,115,232,0.11)]"><h2 className="text-xl font-bold text-[#202124]">File Transfer</h2><p className="mt-1 text-sm text-[#5f6368]">Share meeting assets securely with upload tracking and file history.</p></section>
          <section id="features" className="rounded-3xl border border-[#d7e4f8] bg-white p-6 shadow-[0_12px_26px_rgba(26,115,232,0.11)]"><h2 className="text-xl font-bold text-[#202124]">All Platform Features</h2><p className="mt-1 text-sm text-[#5f6368]">HD video, AI summaries, workspace controls, recordings, reactions, and analytics.</p></section>
          <section id="profile" className="rounded-3xl border border-[#d7e4f8] bg-white p-6 shadow-[0_12px_26px_rgba(26,115,232,0.11)]"><h2 className="text-xl font-bold text-[#202124]">Profile</h2><p className="mt-1 text-sm text-[#5f6368]">Username: {auth.username} • Role: {auth.role}</p></section>
          <section id="settings" className="rounded-3xl border border-[#d7e4f8] bg-white p-6 shadow-[0_12px_26px_rgba(26,115,232,0.11)]"><h2 className="text-xl font-bold text-[#202124]">Settings</h2><div className="mt-3 flex flex-wrap gap-2"><Link href={`/workspaces/${auth.workspaceId}/settings`} className="rounded-xl border border-[#1a73e8] bg-[#1a73e8] px-4 py-2 text-sm font-semibold text-white">Workspace settings</Link><Link href="/pricing" className="rounded-xl border border-[#c8daf8] bg-[#eef4ff] px-4 py-2 text-sm font-semibold text-[#1a73e8]">Billing settings</Link></div></section>

          <footer className="rounded-3xl border border-[#d7e4f8] bg-white p-5 text-sm text-[#5f6368] shadow-[0_10px_20px_rgba(26,115,232,0.08)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p>© {new Date().getFullYear()} Dashboard experience.</p>
              <div className="flex items-center gap-2">
                <Link href="/pricing" className="font-semibold text-[#1a73e8]">Pricing</Link>
                <Link href="/meeting-history" className="font-semibold text-[#1a73e8]">History</Link>
                <form action="/api/auth/logout" method="post">
                  <button type="submit" className="font-semibold text-[#1a73e8]">Logout</button>
                </form>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </main>
  );
}
