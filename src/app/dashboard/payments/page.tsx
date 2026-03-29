import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { DashboardPaymentsClient } from "@/src/components/dashboard/DashboardPaymentsClient";
import { isSuperAdminAuth, resolveAuthWorkspace, verifyAuthToken } from "@/src/lib/auth";
import { getWorkspacePaymentHistory } from "@/src/lib/billing";

export default async function DashboardPaymentsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("meeting_token")?.value;
  const auth = token ? verifyAuthToken(token) : null;

  if (!auth) {
    redirect("/login");
  }

  const effectiveAuth = await resolveAuthWorkspace(auth);

  const isSuperAdmin = isSuperAdminAuth(effectiveAuth);

  let history: Awaited<ReturnType<typeof getWorkspacePaymentHistory>> = [];
  try {
    history = await getWorkspacePaymentHistory(effectiveAuth.workspaceId, 50);
  } catch {
    history = [];
  }

  return (
    <DashboardPaymentsClient
      auth={effectiveAuth}
      isSuperAdmin={isSuperAdmin}
      history={history}
    />
  );
}
