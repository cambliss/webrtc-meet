import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { verifyAuthToken } from "@/src/lib/auth";
import { canWorkspaceUseFeature } from "@/src/lib/billing";
import { getWorkspaceAnalyticsOverview } from "@/src/lib/repositories/meetingSummaryRepository";

function formatDuration(seconds: number) {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

export default async function WorkspaceAnalyticsPage() {
  const token = (await cookies()).get("meeting_token")?.value;
  const auth = token ? verifyAuthToken(token) : null;

  if (!auth) {
    redirect("/login");
  }

  const analyticsEnabled = await canWorkspaceUseFeature(auth.workspaceId, "analytics");
  if (!analyticsEnabled) {
    redirect("/pricing");
  }

  const analytics = await getWorkspaceAnalyticsOverview(auth.workspaceId);
  const maxMeetings = Math.max(1, ...analytics.trend.map((row) => row.meetings));

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl space-y-4 px-4 py-8">
      <header className="rounded-2xl border border-slate-300 bg-white/90 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Workspace Analytics</h1>
            <p className="mt-1 text-sm text-slate-600">Overview across meetings in this workspace</p>
          </div>
          <Link href="/meeting-history" className="text-sm font-semibold text-cyan-700 underline">
            Back to history
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-slate-300 bg-white/90 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Total Meetings</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{analytics.totals.meetings}</p>
        </article>
        <article className="rounded-2xl border border-slate-300 bg-white/90 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Total Duration</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{formatDuration(analytics.totals.totalDurationSeconds)}</p>
        </article>
        <article className="rounded-2xl border border-slate-300 bg-white/90 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Avg Participants</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{analytics.totals.averageParticipants}</p>
        </article>
        <article className="rounded-2xl border border-slate-300 bg-white/90 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Avg Chat Messages</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{analytics.totals.averageChatMessages}</p>
        </article>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-slate-300 bg-white/90 p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">
            Meetings Trend (Last 14 Days)
          </h2>
          <div className="space-y-2">
            {analytics.trend.map((row) => (
              <div key={row.date} className="space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>{new Date(row.date).toLocaleDateString()}</span>
                  <span>{row.meetings} meetings · {row.chatMessages} chats</span>
                </div>
                <div className="h-2 rounded-full bg-slate-200">
                  <div
                    className="h-2 rounded-full bg-indigo-600"
                    style={{ width: `${Math.max(3, Math.round((row.meetings / maxMeetings) * 100))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-300 bg-white/90 p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">Top Speakers</h2>
          {analytics.topSpeakers.length === 0 ? (
            <p className="text-sm text-slate-500">No transcript data available yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {analytics.topSpeakers.map((speaker) => (
                <li key={speaker.speakerName} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <span className="font-medium text-slate-800">{speaker.speakerName}</span>
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
                    {speaker.turns} turns
                  </span>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>

      <section className="rounded-2xl border border-slate-300 bg-white/90 p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">Recent Meetings</h2>

        {analytics.recentMeetings.length === 0 ? (
          <p className="text-sm text-slate-500">No meetings found for this workspace.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm text-slate-800">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2">Room</th>
                  <th className="px-2 py-2">Duration</th>
                  <th className="px-2 py-2">Participants</th>
                  <th className="px-2 py-2">Chat Messages</th>
                  <th className="px-2 py-2">Ended</th>
                  <th className="px-2 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {analytics.recentMeetings.map((meeting) => (
                  <tr key={meeting.meetingId} className="border-b border-slate-100">
                    <td className="px-2 py-2 font-medium">{meeting.roomId}</td>
                    <td className="px-2 py-2">{formatDuration(meeting.durationSeconds)}</td>
                    <td className="px-2 py-2">{meeting.participantCount}</td>
                    <td className="px-2 py-2">{meeting.chatMessages}</td>
                    <td className="px-2 py-2">{meeting.endedAt ? new Date(meeting.endedAt).toLocaleString() : "In progress"}</td>
                    <td className="px-2 py-2">
                      <Link
                        href={`/meeting-history/${meeting.meetingId}/analytics`}
                        className="font-semibold text-indigo-700 underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
