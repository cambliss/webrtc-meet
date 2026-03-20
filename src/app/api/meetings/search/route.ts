import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { verifyAuthToken } from "@/src/lib/auth";
import { searchMeetingKnowledge } from "@/src/lib/repositories/meetingSummaryRepository";
import {
  getNextApiServiceAudience,
  resolveScopedServiceWorkspaceId,
  verifyServiceTokenFromRequest,
} from "@/src/lib/serviceIdentity";

async function resolveWorkspaceScope(request: Request): Promise<{ workspaceId: string } | null> {
  const token = (await cookies()).get("meeting_token")?.value;
  const auth = token ? verifyAuthToken(token) : null;
  if (auth) {
    return { workspaceId: auth.workspaceId };
  }

  try {
    const serviceIdentity = verifyServiceTokenFromRequest({
      request,
      audience: getNextApiServiceAudience(),
      requiredScopes: ["meetings:read"],
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

export async function GET(request: Request) {
  const auth = await resolveWorkspaceScope(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() || "";
  const limitParam = Number(url.searchParams.get("limit") || "20");
  const limit = Number.isFinite(limitParam) ? limitParam : 20;

  if (!q) {
    return NextResponse.json({ error: "q is required" }, { status: 400 });
  }

  const results = await searchMeetingKnowledge({
    workspaceId: auth.workspaceId,
    query: q,
    limit,
  });

  return NextResponse.json({
    query: q,
    count: results.length,
    results,
  });
}
