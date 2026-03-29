import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AvatarAnalyticsPanel } from "@/src/components/dashboard/AvatarAnalyticsPanel";
import { DashboardShell } from "@/src/components/dashboard/DashboardShell";
import { isSuperAdminAuth, resolveAuthWorkspace, verifyAuthToken } from "@/src/lib/auth";

export default async function AvatarAnalyticsPage() {
  const token = (await cookies()).get("meeting_token")?.value;
  const auth = token ? verifyAuthToken(token) : null;

  if (!auth) {
    redirect("/login");
  }

  const effectiveAuth = await resolveAuthWorkspace(auth);

  return (
    <DashboardShell auth={effectiveAuth} isSuperAdmin={isSuperAdminAuth(effectiveAuth)} activeItemId="avatar-analytics">
      <section className="rounded-3xl border border-[#d7e4f8] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbff_100%)] p-6 shadow-[0_16px_30px_rgba(26,115,232,0.12)]">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#5f6368]">Analytics</p>
          <h1 className="mt-1 text-2xl font-bold text-[#202124]">Avatar Analytics</h1>
          <p className="mt-1 text-sm text-[#5f6368]">
            Track avatar adoption, usage activity, and profile image engagement in your workspace.
          </p>
        </div>
        <AvatarAnalyticsPanel />
      </section>
    </DashboardShell>
  );
}
