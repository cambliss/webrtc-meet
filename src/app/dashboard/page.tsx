import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { DashboardClient } from "@/src/components/dashboard/DashboardClient";
import { isSuperAdminAuth, resolveAuthWorkspace, verifyAuthToken } from "@/src/lib/auth";
import { listMeetingHistory } from "@/src/lib/repositories/meetingSummaryRepository";

export default async function DashboardPage() {
  const token = (await cookies()).get("meeting_token")?.value;
  const auth = token ? verifyAuthToken(token) : null;

  if (!auth) {
    redirect("/login");
  }

  const effectiveAuth = await resolveAuthWorkspace(auth);

  let history: Awaited<ReturnType<typeof listMeetingHistory>> = [];
  let dataWarning = "";

  try {
    history = await listMeetingHistory(effectiveAuth.workspaceId, 6);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown dashboard data error";
    if (!message.includes("DATABASE_URL is not configured")) {
      dataWarning = "Some dashboard data is temporarily unavailable.";
    }
  }

  return (
    <DashboardClient
      auth={effectiveAuth}
      isSuperAdmin={isSuperAdminAuth(effectiveAuth)}
      history={history}
      dataWarning={dataWarning}
    />
  );
}
