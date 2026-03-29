import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { MeetingHistorySearch } from "@/src/components/MeetingHistorySearch";
import { DashboardShell } from "@/src/components/dashboard/DashboardShell";
import { isSuperAdminAuth, resolveAuthWorkspace, verifyAuthToken } from "@/src/lib/auth";
import { listMeetingHistory } from "@/src/lib/repositories/meetingSummaryRepository";

export default async function DashboardMeetingHistoryPage() {
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
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#5f6368]">Post Meeting</p>
          <h1 className="mt-1 text-2xl font-bold text-[#202124]">Meeting History</h1>
          <p className="mt-1 text-sm text-[#5f6368]">
            Review summaries, recordings, key points, and follow-up actions after meetings end.
          </p>
        </div>
        <MeetingHistorySearch history={history} />
      </section>
    </DashboardShell>
  );
}