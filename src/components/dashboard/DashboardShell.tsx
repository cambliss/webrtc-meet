"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import type { AuthTokenPayload } from "@/src/lib/auth";
import { dashboardNavItems } from "@/src/components/dashboard/dashboardNavigation";

type DashboardShellProps = {
  auth: AuthTokenPayload;
  isSuperAdmin: boolean;
  children: React.ReactNode;
  activeItemId?: string;
};

function resolveActiveItem(pathname: string, activeHash: string): string {
  if (pathname === "/dashboard") {
    return "overview";
  }

  if (pathname === "/dashboard/chat") {
    return "chat";
  }

  if (pathname === "/dashboard/files") {
    return "files";
  }

  if (pathname === "/dashboard/meeting-history") {
    return "meeting-history";
  }

  if (pathname === "/dashboard/profile") {
    return "profile";
  }

  if (pathname === "/dashboard/subscription") {
    return "subscription";
  }

  if (pathname === "/dashboard/payments") {
    return "payments";
  }

  if (pathname === "/dashboard/meetings") {
    return "meetings";
  }

  if (pathname === "/dashboard/security") {
    return "security";
  }

  if (pathname === "/dashboard/features") {
    return "features";
  }

  if (pathname === "/dashboard/sessions") {
    return "sessions";
  }

  if (pathname === "/dashboard/analytics/avatar") {
    return "avatar-analytics";
  }

  if (pathname === "/dashboard/settings") {
    return "settings";
  }

  return activeHash || "overview";
}

export function DashboardShell({ auth, isSuperAdmin, children, activeItemId }: DashboardShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [activeHash, setActiveHash] = useState("overview");
  const pathname = usePathname();

  const sidebarWidthClass = collapsed ? "lg:w-24" : "lg:w-72";
  const contentOffsetClass = collapsed ? "lg:ml-[7.5rem]" : "lg:ml-[19rem]";

  useEffect(() => {
    const syncHash = () => {
      const value = window.location.hash.replace("#", "");
      setActiveHash(value || "overview");
    };

    syncHash();
    window.addEventListener("hashchange", syncHash);

    return () => {
      window.removeEventListener("hashchange", syncHash);
    };
  }, []);

  const visibleItems = useMemo(
    () => dashboardNavItems.filter((item) => !item.superAdminOnly || isSuperAdmin),
    [isSuperAdmin],
  );

  const resolvedActiveItem = activeItemId || resolveActiveItem(pathname, activeHash);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_12%_12%,rgba(26,115,232,0.22)_0%,rgba(26,115,232,0)_34%),radial-gradient(circle_at_85%_0%,rgba(52,168,83,0.16)_0%,rgba(52,168,83,0)_28%),linear-gradient(180deg,#f5f9ff_0%,#ebf2ff_45%,#ffffff_100%)]">
      <aside className={`z-40 border-r border-[#d8e5fa] bg-[linear-gradient(180deg,rgba(255,255,255,0.94)_0%,rgba(245,250,255,0.94)_100%)] shadow-[0_18px_34px_rgba(26,115,232,0.14)] backdrop-blur lg:fixed lg:inset-y-0 lg:left-0 ${sidebarWidthClass}`}>
        <div className="flex h-full flex-col p-3">
          <div className="mb-3 rounded-2xl border border-[#d7e6fb] bg-[linear-gradient(180deg,#fbfdff_0%,#eef5ff_100%)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
            <div className="flex items-center justify-between gap-2">
              <div>
                <Image
                  src="/logo.png"
                  alt="Brand logo"
                  width={collapsed ? 36 : 56}
                  height={collapsed ? 36 : 56}
                  className="rounded-xl border border-[#d3e3fd] bg-white object-contain p-1"
                />
              </div>
              <button
                type="button"
                onClick={() => setCollapsed((value) => !value)}
                className="rounded-lg border border-[#9ec1f7] bg-[linear-gradient(180deg,#f4f8ff_0%,#e6efff_100%)] p-2 text-[#1a73e8] shadow-[0_4px_10px_rgba(26,115,232,0.14)]"
                aria-label={collapsed ? "Expand sidebar menu" : "Collapse sidebar menu"}
                title={collapsed ? "Expand menu" : "Collapse menu"}
              >
                <span className="block h-0.5 w-4 bg-current" />
                <span className="mt-1 block h-0.5 w-4 bg-current" />
                <span className="mt-1 block h-0.5 w-4 bg-current" />
              </button>
            </div>
          </div>

          <nav className="space-y-1 overflow-y-auto pr-1">
            {visibleItems.map((item) => {
              const active = item.id === resolvedActiveItem;

              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                    active
                      ? "bg-[linear-gradient(180deg,#2c82ec_0%,#1a73e8_100%)] text-white shadow-[0_10px_18px_rgba(26,115,232,0.3)]"
                      : "bg-[#eef4ff] text-[#1a73e8] hover:bg-[#dce9ff] hover:translate-x-[2px]"
                  }`}
                  title={item.label}
                >
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-white/35 text-xs font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
                    {item.icon}
                  </span>
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto rounded-2xl border border-[#d3e3fd] bg-[linear-gradient(180deg,#f8fbff_0%,#edf4ff_100%)] p-3 shadow-[0_8px_16px_rgba(26,115,232,0.08)]">
            {!collapsed ? (
              <>
                <p className="text-xs text-[#5f6368]">Signed in as</p>
                <p className="text-sm font-bold text-[#202124]">{auth.username}</p>
                <p className="text-xs text-[#5f6368]">{auth.workspaceId}</p>
              </>
            ) : (
              <p className="text-center text-xs font-bold text-[#1a73e8]">{auth.username.slice(0, 1).toUpperCase()}</p>
            )}
          </div>
        </div>
      </aside>

      <div className={`relative px-4 py-6 ${contentOffsetClass}`}>
        <header className="sticky top-4 z-30 mb-5 rounded-2xl border border-[#d7e3f7] bg-[linear-gradient(180deg,rgba(255,255,255,0.94)_0%,rgba(244,249,255,0.92)_100%)] p-4 shadow-[0_16px_28px_rgba(26,115,232,0.14)] backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setCollapsed((value) => !value)}
                className="inline-flex items-center gap-2 rounded-xl border border-[#c8daf8] bg-[linear-gradient(180deg,#f4f8ff_0%,#eaf1ff_100%)] px-3 py-2 text-sm font-semibold text-[#1a73e8] shadow-[0_6px_14px_rgba(26,115,232,0.14)]"
                aria-label={collapsed ? "Open sidebar menu" : "Collapse sidebar menu"}
              >
                <span className="inline-block">
                  <span className="block h-0.5 w-4 bg-current" />
                  <span className="mt-1 block h-0.5 w-4 bg-current" />
                  <span className="mt-1 block h-0.5 w-4 bg-current" />
                </span>
                <span className="hidden sm:inline">Menu</span>
              </button>
              <Image
                src="/logo.png"
                alt="Brand logo"
                width={64}
                height={64}
                className="rounded-2xl border border-[#d3e3fd] bg-white object-contain p-1"
                priority
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/" className="rounded-xl border border-[#c8daf8] bg-[linear-gradient(180deg,#f4f8ff_0%,#eaf1ff_100%)] px-4 py-2 text-sm font-semibold text-[#1a73e8] shadow-[0_6px_12px_rgba(26,115,232,0.12)]">
                Home
              </Link>
              <Link href="/dashboard/profile" className="rounded-xl border border-[#c8daf8] bg-[linear-gradient(180deg,#f4f8ff_0%,#eaf1ff_100%)] px-4 py-2 text-sm font-semibold text-[#1a73e8] shadow-[0_6px_12px_rgba(26,115,232,0.12)]">
                Profile
              </Link>
              {isSuperAdmin && (
                <Link href="/dashboard/security" className="rounded-xl border border-[#7c3aed] bg-[linear-gradient(180deg,#8b5cf6_0%,#7c3aed_100%)] px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_18px_rgba(124,58,237,0.32)]">
                  Security Logs
                </Link>
              )}
              <Link href="/dashboard/settings" className="rounded-xl border border-[#1a73e8] bg-[linear-gradient(180deg,#2d83ec_0%,#1a73e8_100%)] px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_18px_rgba(26,115,232,0.32)]">
                Settings
              </Link>
              <form action="/api/auth/logout" method="post">
                <button type="submit" className="rounded-xl border border-[#f4cf6f] bg-[linear-gradient(180deg,#fff5d3_0%,#fef2c8_100%)] px-4 py-2 text-sm font-semibold text-[#7c5a00] shadow-[0_8px_14px_rgba(251,188,4,0.16)]">
                  Logout
                </button>
              </form>
            </div>
          </div>
        </header>

        {children}
      </div>
    </main>
  );
}
