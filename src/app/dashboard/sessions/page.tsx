import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { isSuperAdminAuth, resolveAuthWorkspace, verifyAuthToken } from "@/src/lib/auth";
import { DashboardShell } from "@/src/components/dashboard/DashboardShell";
import {
  listActiveSessions,
  listLoginHistory,
  listLoginAttempts,
  touchSession,
} from "@/src/lib/sessions";
import { SessionsClient } from "./SessionsClient";

export const dynamic = "force-dynamic";

export default async function SessionsPage() {
  const token = (await cookies()).get("meeting_token")?.value;
  const auth = token ? verifyAuthToken(token) : null;

  if (!auth) {
    redirect("/login");
  }

  const effectiveAuth = await resolveAuthWorkspace(auth);
  const isSuperAdmin = isSuperAdminAuth(effectiveAuth);

  // Refresh the current session's last_active_at on page load.
  if (effectiveAuth.sessionId) {
    void touchSession(effectiveAuth.sessionId);
  }

  const [activeSessions, loginHistory, loginAttempts] = await Promise.all([
    listActiveSessions(effectiveAuth.userId),
    listLoginHistory(effectiveAuth.userId, 30),
    listLoginAttempts(effectiveAuth.userId, 30),
  ]);

  return (
    <DashboardShell auth={effectiveAuth} isSuperAdmin={isSuperAdmin} activeItemId="sessions">
      <section className="mx-auto max-w-4xl rounded-3xl border border-[#d7e3f7] bg-white/95 p-6 shadow-[0_22px_34px_rgba(26,115,232,0.12)]">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#5f6368]">
              Account Security
            </p>
            <h1 className="mt-1 text-2xl font-bold text-[#202124]">Active Sessions</h1>
            <p className="mt-1 text-sm text-[#5f6368]">
              View and manage all devices where you&apos;re currently logged in.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="rounded-xl border border-[#c8daf8] bg-[linear-gradient(180deg,#f4f8ff_0%,#eaf1ff_100%)] px-4 py-2 text-sm font-semibold text-[#1a73e8]"
          >
            ← Back
          </Link>
        </div>

        {/* Security tip */}
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-[#fdefc3] bg-[#fffbf0] p-4 text-sm text-[#b06d00]">
          <span className="text-lg">🔒</span>
          <p>
            If you see a session you don&apos;t recognise, log it out immediately and change your
            password. Each session corresponds to a browser login on a specific device.
          </p>
        </div>

        <SessionsClient
          initialData={{
            currentSessionId: effectiveAuth.sessionId ?? null,
            activeSessions,
            loginHistory,
            loginAttempts,
          }}
        />
      </section>
    </DashboardShell>
  );
}
