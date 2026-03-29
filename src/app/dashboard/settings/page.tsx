import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/src/components/dashboard/DashboardShell";
import { isSuperAdminAuth, resolveAuthWorkspace, verifyAuthToken } from "@/src/lib/auth";

export default async function DashboardSettingsPage() {
  const token = (await cookies()).get("meeting_token")?.value;
  const auth = token ? verifyAuthToken(token) : null;

  if (!auth) {
    redirect("/login");
  }

  const effectiveAuth = await resolveAuthWorkspace(auth);

  return (
    <DashboardShell auth={effectiveAuth} isSuperAdmin={isSuperAdminAuth(effectiveAuth)} activeItemId="settings">
      <section className="rounded-3xl border border-[#d7e4f8] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbff_100%)] p-6 shadow-[0_16px_30px_rgba(26,115,232,0.12)]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#5f6368]">Configuration</p>
            <h1 className="mt-1 text-2xl font-bold text-[#202124]">Workspace Settings</h1>
            <p className="mt-1 text-sm text-[#5f6368]">
              Manage branding, invite policy, API keys, and security controls for this workspace.
            </p>
          </div>
          <Link
            href={`/workspaces/${effectiveAuth.workspaceId}/settings`}
            className="rounded-xl border border-[#1a73e8] bg-[linear-gradient(180deg,#2d83ec_0%,#1a73e8_100%)] px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_18px_rgba(26,115,232,0.28)]"
          >
            Open Advanced Settings
          </Link>
        </div>

        <div className="space-y-3">
          <article className="rounded-xl border border-[#d9e5f8] bg-white px-4 py-3">
            <h2 className="text-sm font-semibold text-[#202124]">Workspace Identity</h2>
            <p className="mt-1 text-sm text-[#5f6368]">Configure name, logo, and branding preferences.</p>
          </article>
          <article className="rounded-xl border border-[#d9e5f8] bg-white px-4 py-3">
            <h2 className="text-sm font-semibold text-[#202124]">Access and Invitations</h2>
            <p className="mt-1 text-sm text-[#5f6368]">Set who can join, invite, or manage workspace members.</p>
          </article>
          <article className="rounded-xl border border-[#d9e5f8] bg-white px-4 py-3">
            <h2 className="text-sm font-semibold text-[#202124]">API and Integrations</h2>
            <p className="mt-1 text-sm text-[#5f6368]">Manage API keys, webhooks, and third-party integrations.</p>
          </article>
          <article className="rounded-xl border border-[#d9e5f8] bg-white px-4 py-3">
            <h2 className="text-sm font-semibold text-[#202124]">Security Controls</h2>
            <p className="mt-1 text-sm text-[#5f6368]">Review compliance options, logs, and policy enforcement.</p>
          </article>
        </div>
      </section>
    </DashboardShell>
  );
}
