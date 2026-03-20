import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { verifyAuthToken } from "@/src/lib/auth";
import { getMeetingHistoryDetail } from "@/src/lib/repositories/meetingSummaryRepository";

type MeetingHistoryDetailPageProps = {
  params: Promise<{
    meetingId: string;
  }>;
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function MeetingHistoryDetailPage({ params }: MeetingHistoryDetailPageProps) {
  const { meetingId } = await params;
  const token = (await cookies()).get("meeting_token")?.value;
  const auth = token ? verifyAuthToken(token) : null;

  if (!auth) {
    notFound();
  }

  const detail = await getMeetingHistoryDetail(auth.workspaceId, meetingId);

  if (!detail) {
    notFound();
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl space-y-4 px-4 py-8">
      <header className="rounded-2xl border border-slate-300 bg-white/90 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Meeting Detail</h1>
            <p className="mt-1 text-sm text-slate-600">Room: {detail.roomId}</p>
          </div>
          <Link href="/meeting-history" className="text-sm font-semibold text-cyan-700 underline">
            Back to history
          </Link>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
            Summary created: {new Date(detail.createdAt).toLocaleString()}
          </span>
          <Link
            href={`/meeting-history/${detail.meetingId}/analytics`}
            className="rounded-full bg-indigo-100 px-3 py-1 font-medium text-indigo-700"
          >
            View analytics
          </Link>
          {detail.endedAt && (
            <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
              Ended: {new Date(detail.endedAt).toLocaleString()}
            </span>
          )}
          {detail.recordingPath && (
            <Link
              href={`/api/meetings/${detail.meetingId}/recording`}
              className="rounded-full bg-emerald-100 px-3 py-1 font-medium text-emerald-700"
            >
              Download recording
            </Link>
          )}
        </div>
      </header>

      <section className="rounded-2xl border border-slate-300 bg-white/90 p-5">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">Summary</h2>
        <p className="text-sm text-slate-900">{detail.summary}</p>
      </section>

      {detail.recordingPath && (
        <section className="rounded-2xl border border-slate-300 bg-white/90 p-5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Recording</h2>
            <Link
              href={`/api/meetings/${detail.meetingId}/recording`}
              className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
            >
              Download
            </Link>
          </div>
          <video
            controls
            preload="metadata"
            className="w-full rounded-xl border border-slate-200 bg-black"
            src={`/api/meetings/${detail.meetingId}/recording`}
          >
            Your browser does not support video playback.
          </video>
          <p className="mt-2 text-xs text-slate-500">
            If playback fails, use Download to save the recording file.
          </p>
        </section>
      )}

      <section className="rounded-2xl border border-slate-300 bg-white/90 p-5">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Key Points</h3>
        {detail.keyPoints.length === 0 ? (
          <p className="text-sm text-slate-500">None</p>
        ) : (
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-800">
            {detail.keyPoints.map((point, index) => (
              <li key={`${point}-${index}`}>{point}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-slate-300 bg-white/90 p-5">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Action Items</h3>
        {detail.actionItems.length === 0 ? (
          <p className="text-sm text-slate-500">None</p>
        ) : (
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-800">
            {detail.actionItems.map((item, index) => (
              <li key={`${item}-${index}`}>{item}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-slate-300 bg-white/90 p-5">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">
          Transcript ({detail.transcripts.length} lines)
        </h3>
        {detail.transcripts.length === 0 ? (
          <p className="text-sm text-slate-500">No transcript captured.</p>
        ) : (
          <div className="max-h-[420px] space-y-2 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
            {detail.transcripts.map((line) => (
              <div key={line.id} className="text-sm leading-relaxed text-slate-800">
                <span className="font-semibold text-slate-900">{line.speakerName}:</span> {line.text}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-300 bg-white/90 p-5">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">
          Chat ({detail.chatMessages.length} messages)
        </h3>
        {detail.chatMessages.length === 0 ? (
          <p className="text-sm text-slate-500">No chat captured.</p>
        ) : (
          <div className="max-h-[360px] space-y-2 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
            {detail.chatMessages.map((message) => (
              <article key={message.id} className="rounded-lg border border-slate-200 bg-white p-2">
                <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">{message.senderName}</span>
                  <span>{new Date(message.sentAt).toLocaleString()}</span>
                </div>
                <p className="text-sm text-slate-800">{message.message}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-300 bg-white/90 p-5">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">
          Shared Files ({detail.sharedFiles.length})
        </h3>
        {detail.sharedFiles.length === 0 ? (
          <p className="text-sm text-slate-500">No files were shared in this meeting.</p>
        ) : (
          <div className="space-y-2">
            {detail.sharedFiles.map((file) => (
              <article
                key={file.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-800">{file.fileName}</p>
                  <p className="text-xs text-slate-500">
                    Shared by {file.senderName} • {formatFileSize(file.fileSize)} • {new Date(file.sharedAt).toLocaleString()}
                  </p>
                </div>
                <a
                  href={`/api/meetings/${encodeURIComponent(detail.meetingId)}/files/${encodeURIComponent(file.id)}`}
                  className="rounded-md border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-700"
                >
                  Download
                </a>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
