import Link from "next/link";
import Image from "next/image";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { DashboardShell } from "@/src/components/dashboard/DashboardShell";
import { isSuperAdminAuth, resolveAuthWorkspace, verifyAuthToken } from "@/src/lib/auth";
import { MeetingNotesActions } from "@/src/components/MeetingNotesActions";
import { formatMeetingNotesExport } from "@/src/lib/meetingNotes";
import { getMeetingHistoryDetail } from "@/src/lib/repositories/meetingSummaryRepository";
import { TranscriptViewer } from "@/src/components/TranscriptViewer";

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

  const effectiveAuth = await resolveAuthWorkspace(auth);
  const detail = await getMeetingHistoryDetail(effectiveAuth.workspaceId, meetingId);

  if (!detail) {
    notFound();
  }

  const exportText = formatMeetingNotesExport({
    roomLabel: detail.roomId,
    summary: {
      summary: detail.summary,
      keyPoints: detail.keyPoints,
      actionItems: detail.actionItems,
    },
    smartHighlights: detail.smartHighlights.map((item) => ({
      speakerName: item.speakerName,
      text: item.text,
    })),
  });

  return (
    <DashboardShell auth={effectiveAuth} isSuperAdmin={isSuperAdminAuth(effectiveAuth)} activeItemId="meeting-history">
      <main className="mx-auto w-full max-w-5xl space-y-4">
      <header className="rounded-2xl border border-[#d7e4f8] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbff_100%)] p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#202124]">Meeting Detail</h1>
            <p className="mt-1 text-sm text-[#5f6368]">Room: {detail.roomId}</p>
          </div>
          <Link href="/meeting-history" className="text-sm font-semibold text-[#1a73e8] underline">
            Back to history
          </Link>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
            Summary created: {new Date(detail.createdAt).toLocaleString()}
          </span>
          <MeetingNotesActions exportText={exportText} fileName={`${detail.roomId}-meeting-notes.txt`} />
          <Link
            href={`/meeting-history/${detail.meetingId}/analytics`}
            className="rounded-full bg-[#e8f0fe] px-3 py-1 font-medium text-[#1a73e8]"
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

      <section className="rounded-2xl border border-[#d7e4f8] bg-white/90 p-5">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">Summary</h2>
        <p className="text-sm text-slate-900">{detail.summary}</p>
      </section>

      {detail.recordingPath && (
        <section className="rounded-2xl border border-[#d7e4f8] bg-white/90 p-5">
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

      <section className="rounded-2xl border border-[#d7e4f8] bg-white/90 p-5">
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

      <section className="rounded-2xl border border-[#d7e4f8] bg-white/90 p-5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-700">Action Items</h3>
          {detail.tasks.length > 0 ? (
            <span className="rounded-full bg-indigo-100 px-2 py-1 text-xs font-medium text-indigo-700">
              {detail.tasks.length} structured tasks
            </span>
          ) : null}
        </div>
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

      <section className="rounded-2xl border border-[#d7e4f8] bg-white/90 p-5">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Smart Highlights</h3>
        {detail.smartHighlights.length === 0 ? (
          <p className="text-sm text-slate-500">No semantic highlights detected for this meeting.</p>
        ) : (
          <div className="space-y-2">
            {detail.smartHighlights.map((highlight) => (
              <article key={highlight.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-indigo-700">
                  {highlight.speakerName}
                </p>
                <p className="text-sm text-slate-800">{highlight.text}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-[#d7e4f8] bg-white/90 p-5">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Structured Tasks</h3>
        {detail.tasks.length === 0 ? (
          <p className="text-sm text-slate-500">No structured tasks were extracted.</p>
        ) : (
          <div className="space-y-2">
            {detail.tasks.map((task) => (
              <article key={task.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-semibold text-slate-900">{task.title}</h4>
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-700">
                    {task.status.replace("_", " ")}
                  </span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                    {Math.round(task.confidence * 100)}% confidence
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  Owner: {task.assigneeName || "Unassigned"} • Due: {task.dueDate || "Unscheduled"}
                </p>
                <p className="mt-2 text-sm text-slate-700">{task.sourceText}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-[#d7e4f8] bg-white/90 p-5">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">
          Transcript ({detail.transcripts.length} lines)
        </h3>
        <TranscriptViewer transcripts={detail.transcripts} />
      </section>

      <section className="rounded-2xl border border-[#d7e4f8] bg-white/90 p-5">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">
          Chat ({detail.chatMessages.length} messages)
        </h3>
        {detail.chatMessages.length === 0 ? (
          <p className="text-sm text-slate-500">No chat captured.</p>
        ) : (
          <div className="max-h-[360px] space-y-2 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
            {detail.chatMessages.map((message) => (
              <article key={message.id} className="rounded-lg border border-slate-200 bg-white p-2">
                <div className="mb-1 flex items-start gap-2">
                  {message.senderId && message.avatarPath ? (
                    <div className="relative mt-0.5 h-6 w-6 shrink-0 overflow-hidden rounded-full border border-slate-300">
                      <Image
                        src={`/api/auth/avatar/${encodeURIComponent(message.senderId)}`}
                        alt={message.senderName}
                        fill
                        className="object-cover"
                        unoptimized
                        sizes="24px"
                      />
                    </div>
                  ) : null}
                  <div className="flex-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700">{message.senderName}</span>
                      <span className="text-slate-500">{new Date(message.sentAt).toLocaleString()}</span>
                    </div>
                    <p className="mt-0.5 text-sm text-slate-800">{message.message}</p>
                  </div>
                </div>
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
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
              >
                <div className="flex items-start gap-2">
                  {file.senderId && file.avatarPath ? (
                    <div className="relative mt-1 h-6 w-6 shrink-0 overflow-hidden rounded-full border border-slate-300">
                      <Image
                        src={`/api/auth/avatar/${encodeURIComponent(file.senderId)}`}
                        alt={file.senderName}
                        fill
                        className="object-cover"
                        unoptimized
                        sizes="24px"
                      />
                    </div>
                  ) : null}
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{file.fileName}</p>
                    <p className="text-xs text-slate-500">
                      Shared by {file.senderName} • {formatFileSize(file.fileSize)} • {new Date(file.sharedAt).toLocaleString()}
                    </p>
                  </div>
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
    </DashboardShell>
  );
}
