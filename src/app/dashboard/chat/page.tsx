import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { DirectChatPanel } from "@/src/components/dashboard/DirectChatPanel";
import { DashboardShell } from "@/src/components/dashboard/DashboardShell";
import { isSuperAdminAuth, resolveAuthWorkspace, verifyAuthToken } from "@/src/lib/auth";

export default async function DashboardChatPage() {
  const token = (await cookies()).get("meeting_token")?.value;
  const auth = token ? verifyAuthToken(token) : null;

  if (!auth) {
    redirect("/login");
  }

  const effectiveAuth = await resolveAuthWorkspace(auth);

  return (
    <DashboardShell auth={effectiveAuth} isSuperAdmin={isSuperAdminAuth(effectiveAuth)} activeItemId="chat">
      <DirectChatPanel
        auth={effectiveAuth}
        workspaceId={effectiveAuth.workspaceId}
        mode="chat"
        title="Workspace Chat"
        subtitle="Open one-to-one conversations with registered Office Connect users."
      />
    </DashboardShell>
  );
}