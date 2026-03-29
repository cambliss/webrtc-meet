import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { verifyAuthToken } from "@/src/lib/auth";
import {
  getNextApiServiceAudience,
  resolveScopedServiceWorkspaceId,
  verifyServiceTokenFromRequest,
} from "@/src/lib/serviceIdentity";
import { listMeetingHighlights } from "@/src/lib/repositories/meetingSummaryRepository";

type MeetingRouteParams = {
  params: Promise<{
    meetingId: string;
  }>;
};

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
  const highlights = await listMeetingHighlights(auth.workspaceId, meetingId);

  return NextResponse.json({ highlights });
}
