import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/src/components/dashboard/DashboardShell";
import { isSuperAdminAuth, resolveAuthWorkspace, verifyAuthToken } from "@/src/lib/auth";

export default async function DashboardFeaturesPage() {
  const token = (await cookies()).get("meeting_token")?.value;
  const auth = token ? verifyAuthToken(token) : null;

  if (!auth) {
    redirect("/login");
  }

  const effectiveAuth = await resolveAuthWorkspace(auth);

  return (
    <DashboardShell auth={effectiveAuth} isSuperAdmin={isSuperAdminAuth(effectiveAuth)} activeItemId="features">
      <section className="rounded-3xl border border-[#d7e4f8] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbff_100%)] p-6 shadow-[0_16px_30px_rgba(26,115,232,0.12)]">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#5f6368]">Workspace</p>
          <h1 className="mt-1 text-2xl font-bold text-[#202124]">Feature Controls</h1>
          <p className="mt-1 text-sm text-[#5f6368]">
            Overview of enabled capabilities available in your workspace.
          </p>
        </div>

        <ul className="grid gap-3 text-sm text-[#202124] sm:grid-cols-2">
          <li className="rounded-xl border border-[#d9e5f8] bg-white px-4 py-3">
            Secure messaging and encrypted workspace chat
          </li>
          <li className="rounded-xl border border-[#d9e5f8] bg-white px-4 py-3">
            Secure file transfer with malware webhook checks
          </li>
          <li className="rounded-xl border border-[#d9e5f8] bg-white px-4 py-3">
            AI summary, task extraction, and translation pipeline
          </li>
          <li className="rounded-xl border border-[#d9e5f8] bg-white px-4 py-3">
            Background meeting-end job processing and retries
          </li>
        </ul>
      </section>
    </DashboardShell>
  );
}
