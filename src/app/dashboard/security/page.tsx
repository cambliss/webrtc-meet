import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/src/components/dashboard/DashboardShell";
import { isSuperAdminAuth, resolveAuthWorkspace, verifyAuthToken } from "@/src/lib/auth";
import { ensureMeetingSecuritySchema, listSecurityEvents } from "@/src/lib/meetingSecurity";

type SecurityEventRow = {
  id: string;
  workspace_id: string;
  meeting_id: string | null;
  room_id: string | null;
  event_type: string;
  severity: "info" | "warning" | "critical";
  participant_display_name: string | null;
  invited_by_name: string | null;
  device_fingerprint: string | null;
  ip_address: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const severityStyle: Record<SecurityEventRow["severity"], string> = {
  info: "border-sky-200 bg-sky-50 text-sky-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  critical: "border-rose-200 bg-rose-50 text-rose-700",
};

export default async function DashboardSecurityPage() {
  const token = (await cookies()).get("meeting_token")?.value;
  const auth = token ? verifyAuthToken(token) : null;

  if (!auth) {
    redirect("/login");
  }

  const effectiveAuth = await resolveAuthWorkspace(auth);

  if (!isSuperAdminAuth(effectiveAuth)) {
    redirect("/dashboard");
  }

  await ensureMeetingSecuritySchema();

  const events = (await listSecurityEvents({ limit: 400 })) as SecurityEventRow[];
  const isSuperAdmin = isSuperAdminAuth(effectiveAuth);

  return (
    <DashboardShell auth={effectiveAuth} isSuperAdmin={isSuperAdmin} activeItemId="security">
      <section className="mx-auto max-w-6xl rounded-3xl border border-[#d7e3f7] bg-white/95 p-6 shadow-[0_22px_34px_rgba(26,115,232,0.12)]">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#5f6368]">Super Admin</p>
            <h1 className="text-2xl font-bold text-[#202124]">Security Event Forensics</h1>
            <p className="mt-1 text-sm text-[#5f6368]">
              Global event stream across all workspaces. Showing latest {events.length} entries.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="rounded-xl border border-[#c8daf8] bg-[linear-gradient(180deg,#f4f8ff_0%,#eaf1ff_100%)] px-4 py-2 text-sm font-semibold text-[#1a73e8]"
          >
            Back to Dashboard
          </Link>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-[#d9e5f8]">
          <table className="min-w-full divide-y divide-[#e5ecf8] text-left text-sm">
            <thead className="bg-[#f7faff] text-xs uppercase tracking-[0.06em] text-[#5f6368]">
              <tr>
                <th className="px-3 py-2 font-semibold">When</th>
                <th className="px-3 py-2 font-semibold">Severity</th>
                <th className="px-3 py-2 font-semibold">Event</th>
                <th className="px-3 py-2 font-semibold">Workspace</th>
                <th className="px-3 py-2 font-semibold">Meeting</th>
                <th className="px-3 py-2 font-semibold">Participant</th>
                <th className="px-3 py-2 font-semibold">Attribution</th>
                <th className="px-3 py-2 font-semibold">Network</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eef3fc] bg-white">
              {events.map((event) => {
                const createdAt = new Date(event.created_at);
                const createdAtLabel = Number.isNaN(createdAt.getTime())
                  ? event.created_at
                  : createdAt.toLocaleString();

                return (
                  <tr key={event.id} className="align-top">
                    <td className="px-3 py-2 text-[#202124]">{createdAtLabel}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${severityStyle[event.severity]}`}>
                        {event.severity}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[#202124]">{event.event_type}</td>
                    <td className="px-3 py-2 text-[#5f6368]">{event.workspace_id}</td>
                    <td className="px-3 py-2 text-[#5f6368]">{event.room_id || event.meeting_id || "-"}</td>
                    <td className="px-3 py-2 text-[#202124]">{event.participant_display_name || "-"}</td>
                    <td className="px-3 py-2 text-[#5f6368]">{event.invited_by_name || "Unknown"}</td>
                    <td className="px-3 py-2 text-[#5f6368]">
                      <div>IP: {event.ip_address || "-"}</div>
                      <div className="max-w-[180px] truncate">FP: {event.device_fingerprint || "-"}</div>
                    </td>
                  </tr>
                );
              })}

              {events.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-[#5f6368]">
                    No security events yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </DashboardShell>
  );
}
