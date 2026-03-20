import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { verifyAuthToken } from "@/src/lib/auth";
import {
  getNextApiServiceAudience,
  resolveScopedServiceWorkspaceId,
  verifyServiceTokenFromRequest,
} from "@/src/lib/serviceIdentity";
import {
  listMeetingTasks,
  updateMeetingTask,
  type MeetingTaskStatus,
} from "@/src/lib/repositories/meetingSummaryRepository";

type MeetingRouteParams = {
  params: Promise<{
    meetingId: string;
  }>;
};

type PatchPayload = {
  taskId?: string;
  title?: string;
  assigneeName?: string | null;
  dueDate?: string | null;
  status?: MeetingTaskStatus;
};

const ALLOWED_STATUS: MeetingTaskStatus[] = ["open", "in_progress", "done", "canceled"];

async function resolveWorkspaceScope(request: Request, requiredScopes: string[]): Promise<{ workspaceId: string } | null> {
  const token = (await cookies()).get("meeting_token")?.value;
  const auth = token ? verifyAuthToken(token) : null;
  if (auth) {
    return { workspaceId: auth.workspaceId };
  }

  try {
    const serviceIdentity = verifyServiceTokenFromRequest({
      request,
      audience: getNextApiServiceAudience(),
      requiredScopes,
    });

    return {
      workspaceId: resolveScopedServiceWorkspaceId({
        identity: serviceIdentity,
        headerWorkspaceId: request.headers.get("x-workspace-id"),
      }),
    };
  } catch {
    return null;
  }
}

export async function GET(request: Request, { params }: MeetingRouteParams) {
  const auth = await resolveWorkspaceScope(request, ["meetings:read"]);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { meetingId } = await params;
  const tasks = await listMeetingTasks(auth.workspaceId, meetingId);

  return NextResponse.json({ tasks });
}

export async function PATCH(request: Request, { params }: MeetingRouteParams) {
  const auth = await resolveWorkspaceScope(request, ["meetings:write"]);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { meetingId } = await params;
  const payload = (await request.json().catch(() => ({}))) as PatchPayload;

  const taskId = payload.taskId?.trim() || "";
  if (!taskId) {
    return NextResponse.json({ error: "taskId is required" }, { status: 400 });
  }

  if (payload.status && !ALLOWED_STATUS.includes(payload.status)) {
    return NextResponse.json({ error: "Invalid task status" }, { status: 400 });
  }

  if (payload.dueDate) {
    const isoDateMatch = payload.dueDate.match(/^\d{4}-\d{2}-\d{2}$/);
    if (!isoDateMatch) {
      return NextResponse.json({ error: "dueDate must be YYYY-MM-DD" }, { status: 400 });
    }
  }

  const updated = await updateMeetingTask({
    workspaceId: auth.workspaceId,
    meetingIdOrRoomId: meetingId,
    taskId,
    patch: {
      title: typeof payload.title === "string" ? payload.title : undefined,
      assigneeName: payload.assigneeName,
      dueDate: payload.dueDate,
      status: payload.status,
    },
  });

  if (!updated) {
    return NextResponse.json({ error: "Task not found or no fields to update" }, { status: 404 });
  }

  return NextResponse.json({ updated: true, task: updated });
}
