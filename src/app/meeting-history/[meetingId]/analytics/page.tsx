import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { DashboardShell } from "@/src/components/dashboard/DashboardShell";
import { isSuperAdminAuth, resolveAuthWorkspace, verifyAuthToken } from "@/src/lib/auth";
import { canWorkspaceUseFeature } from "@/src/lib/billing";
import { getMeetingAnalytics } from "@/src/lib/repositories/meetingSummaryRepository";

type MeetingAnalyticsPageProps = {
  params: Promise<{
    meetingId: string;
  }>;
};

function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const hrs = Math.floor(safeSeconds / 3600);
  const mins = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;

  if (hrs > 0) {
    return `${hrs}h ${mins}m ${secs}s`;
  }

  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }

  return `${secs}s`;
}

export default async function MeetingAnalyticsPage({ params }: MeetingAnalyticsPageProps) {
  const { meetingId } = await params;
  const token = (await cookies()).get("meeting_token")?.value;
  const auth = token ? verifyAuthToken(token) : null;

  if (!auth) {
    notFound();
  }

  const effectiveAuth = await resolveAuthWorkspace(auth);

  const analyticsEnabled = await canWorkspaceUseFeature(effectiveAuth.workspaceId, "analytics");
  if (!analyticsEnabled) {
    notFound();
  }

  const analytics = await getMeetingAnalytics(effectiveAuth.workspaceId, meetingId);
  if (!analytics) {
    notFound();
  }

  return (
    <DashboardShell auth={effectiveAuth} isSuperAdmin={isSuperAdminAuth(effectiveAuth)} activeItemId="meeting-history">
      <main className="mx-auto w-full max-w-6xl space-y-4">
      <header className="rounded-2xl border border-[#d7e4f8] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbff_100%)] p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#202124]">Meeting Analytics</h1>
            <p className="mt-1 text-sm text-[#5f6368]">Room: {analytics.roomId}</p>
          </div>
          <div className="flex gap-3 text-sm font-semibold">
            <Link href={`/meeting-history/${meetingId}`} className="text-[#1a73e8] underline">
              Back to detail
            </Link>
            <Link href="/meeting-history" className="text-[#1a73e8] underline">
              Back to history
            </Link>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-[#d7e4f8] bg-white/90 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Meeting Duration</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{formatDuration(analytics.durationSeconds)}</p>
        </article>
        <article className="rounded-2xl border border-[#d7e4f8] bg-white/90 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Participants</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{analytics.participantCount}</p>
        </article>
        <article className="rounded-2xl border border-[#d7e4f8] bg-white/90 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Chat Messages</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{analytics.chatActivity.totalMessages}</p>
        </article>
        <article className="rounded-2xl border border-[#d7e4f8] bg-white/90 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Started</p>
          <p className="mt-2 text-sm font-semibold text-slate-900">{new Date(analytics.startedAt).toLocaleString()}</p>
          {analytics.endedAt && (
            <p className="mt-1 text-xs text-slate-600">Ended: {new Date(analytics.endedAt).toLocaleString()}</p>
          )}
        </article>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-slate-300 bg-white/90 p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">
            Speaking Time Per Participant
          </h2>

          {analytics.speakingTime.length === 0 ? (
            <p className="text-sm text-slate-500">No transcript data available.</p>
          ) : (
            <div className="space-y-3">
              {analytics.speakingTime.map((row) => (
                <div key={row.speakerName} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-800">{row.speakerName}</span>
                    <span className="text-slate-600">
                      {formatDuration(row.seconds)} ({row.percentOfTotal}%)
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200">
                    <div
                      className="h-2 rounded-full bg-cyan-600"
                      style={{ width: `${Math.min(100, Math.max(2, row.percentOfTotal))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="rounded-2xl border border-[#d7e4f8] bg-white/90 p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">
            Chat Activity
          </h2>

          {analytics.chatActivity.messagesPerParticipant.length === 0 ? (
            <p className="text-sm text-slate-500">No chat messages captured.</p>
          ) : (
            <ul className="space-y-2 text-sm text-slate-800">
              {analytics.chatActivity.messagesPerParticipant.map((row) => (
                <li
                  key={row.senderName}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                >
                  <span className="font-medium">{row.senderName}</span>
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
                    {row.count} messages
                  </span>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>
      </main>
    </DashboardShell>
  );
}
