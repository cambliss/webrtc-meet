import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { DirectChatPanel } from "@/src/components/dashboard/DirectChatPanel";
import { DashboardShell } from "@/src/components/dashboard/DashboardShell";
import { isSuperAdminAuth, resolveAuthWorkspace, verifyAuthToken } from "@/src/lib/auth";

export default async function DashboardFilesPage() {
  const token = (await cookies()).get("meeting_token")?.value;
  const auth = token ? verifyAuthToken(token) : null;

  if (!auth) {
    redirect("/login");
  }

  const effectiveAuth = await resolveAuthWorkspace(auth);

  return (
    <DashboardShell auth={effectiveAuth} isSuperAdmin={isSuperAdminAuth(effectiveAuth)} activeItemId="files">
      <DirectChatPanel
        auth={effectiveAuth}
        workspaceId={effectiveAuth.workspaceId}
        mode="files"
        title="File Transfer"
        subtitle="Share and download direct files with users in your workspace."
      />
    </DashboardShell>
  );
}