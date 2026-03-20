import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { verifyAuthToken } from "@/src/lib/auth";
import { listMeetingHistory } from "@/src/lib/repositories/meetingSummaryRepository";

export default async function MeetingHistoryPage() {
  const token = (await cookies()).get("meeting_token")?.value;
  const auth = token ? verifyAuthToken(token) : null;

  if (!auth) {
    redirect("/login");
  }

  const history = await listMeetingHistory(auth.workspaceId, 100);

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl space-y-4 px-4 py-8">
      <header className="rounded-2xl border border-slate-300 bg-white/90 p-5">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">Meeting History</h1>
          <div className="flex items-center gap-4">
            <Link href="/meeting-history/analytics" className="text-sm font-semibold text-indigo-700 underline">
              Workspace analytics
            </Link>
            <Link href="/" className="text-sm font-semibold text-cyan-700 underline">
              Back to meetings
            </Link>
          </div>
        </div>
        <p className="mt-1 text-sm text-slate-600">AI summaries generated when meetings end.</p>
      </header>

      {history.length === 0 && (
        <section className="rounded-2xl border border-slate-300 bg-white/80 p-4 text-sm text-slate-700">
          No meetings summarized yet.
        </section>
      )}

      <section className="space-y-3">
        {history.map((item) => (
          <article key={`${item.meetingId}-${item.createdAt}`} className="rounded-2xl border border-slate-300 bg-white/90 p-4">
            <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
              <span>Room: {item.roomId}</span>
              <span>{new Date(item.createdAt).toLocaleString()}</span>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
                Transcript lines: {item.transcriptCount}
              </span>
              <span
                className={`rounded-full px-2 py-1 ${
                  item.hasRecording ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                }`}
              >
                {item.hasRecording ? "Recording available" : "No recording"}
              </span>
            </div>

            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-600">Summary</h2>
            <p className="mb-3 text-sm text-slate-900">{item.summary}</p>

            <h3 className="mb-1 text-sm font-semibold text-slate-700">Key Points</h3>
            {item.keyPoints.length === 0 ? (
              <p className="mb-3 text-sm text-slate-500">None</p>
            ) : (
              <ul className="mb-3 list-disc space-y-1 pl-5 text-sm text-slate-800">
                {item.keyPoints.map((point, index) => (
                  <li key={`${point}-${index}`}>{point}</li>
                ))}
              </ul>
            )}

            <h3 className="mb-1 text-sm font-semibold text-slate-700">Action Items</h3>
            {item.actionItems.length === 0 ? (
              <p className="text-sm text-slate-500">None</p>
            ) : (
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-800">
                {item.actionItems.map((itemText, index) => (
                  <li key={`${itemText}-${index}`}>{itemText}</li>
                ))}
              </ul>
            )}

            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              <Link
                href={`/meeting-history/${item.meetingId}`}
                className="rounded-md border border-cyan-200 bg-cyan-50 px-3 py-1.5 font-medium text-cyan-700"
              >
                Open summary details
              </Link>
              <Link
                href={`/meeting-history/${item.meetingId}/analytics`}
                className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 font-medium text-indigo-700"
              >
                Open analytics
              </Link>
              {item.hasRecording && (
                <Link
                  href={`/api/meetings/${item.meetingId}/recording`}
                  className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 font-medium text-emerald-700"
                >
                  Download recording
                </Link>
              )}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
