import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/src/components/dashboard/DashboardShell";
import { verifyAuthToken } from "@/src/lib/auth";
import { listMeetingHistory } from "@/src/lib/repositories/meetingSummaryRepository";
import { MeetingHistorySearch } from "@/src/components/MeetingHistorySearch";
import { isSuperAdminAuth, resolveAuthWorkspace } from "@/src/lib/auth";

export default async function MeetingHistoryPage() {
  const token = (await cookies()).get("meeting_token")?.value;
  const auth = token ? verifyAuthToken(token) : null;

  if (!auth) {
    redirect("/login");
  }

  const effectiveAuth = await resolveAuthWorkspace(auth);
  const history = await listMeetingHistory(effectiveAuth.workspaceId, 100);

  return (
    <DashboardShell auth={effectiveAuth} isSuperAdmin={isSuperAdminAuth(effectiveAuth)} activeItemId="meeting-history">
      <section className="rounded-3xl border border-[#d7e4f8] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbff_100%)] p-6 shadow-[0_16px_30px_rgba(26,115,232,0.12)]">
        <header className="mb-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-[#202124]">Meeting History</h1>
            <div className="flex items-center gap-4">
              <Link href="/meeting-history/analytics" className="text-sm font-semibold text-[#1a73e8] underline">
                Workspace analytics
              </Link>
              <Link href="/dashboard" className="text-sm font-semibold text-[#1a73e8] underline">
                Back to dashboard
              </Link>
            </div>
          </div>
          <p className="mt-1 text-sm text-[#5f6368]">
            AI summaries generated when meetings end. Search to find meetings by content.
          </p>
        </header>

        <MeetingHistorySearch history={history} />
      </section>
    </DashboardShell>
  );
}
