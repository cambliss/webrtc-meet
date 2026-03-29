import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { verifyAuthToken } from "@/src/lib/auth";
import { listMeetingHistory } from "@/src/lib/repositories/meetingSummaryRepository";
import { MeetingHistorySearch } from "@/src/components/MeetingHistorySearch";

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
        <p className="mt-1 text-sm text-slate-600">AI summaries generated when meetings end. Search to find meetings by content.</p>
      </header>

      <MeetingHistorySearch history={history} />
    </main>
  );
}
