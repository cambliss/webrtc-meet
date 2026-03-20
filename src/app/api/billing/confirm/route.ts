import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { verifyAuthToken } from "@/src/lib/auth";
import {
  activateSubscriptionByOrder,
  verifyRazorpayPaymentSignature,
} from "@/src/lib/billing";
import { getDbPool } from "@/src/lib/db";

type ConfirmPayload = {
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
};

async function assertCanManageWorkspace(workspaceId: string, userId: string) {
  const pool = getDbPool();
  const roleResult = await pool.query<{ role: "owner" | "admin" | "member" }>(
    `
    SELECT
      CASE
        WHEN w.owner_id = $2 THEN 'owner'
        ELSE wm.role
      END AS role
    FROM workspaces w
    LEFT JOIN workspace_members wm
      ON wm.workspace_id = w.id
     AND wm.user_id = $2
    WHERE w.id = $1
      AND (w.owner_id = $2 OR wm.user_id = $2)
    LIMIT 1
    `,
    [workspaceId, userId],
  );

  const workspaceRole = roleResult.rows[0]?.role;
  return workspaceRole === "owner" || workspaceRole === "admin";
}

export async function POST(request: Request) {
  const token = (await cookies()).get("meeting_token")?.value;
  const auth = token ? verifyAuthToken(token) : null;

  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const canManage = await assertCanManageWorkspace(auth.workspaceId, auth.userId);
  if (!canManage) {
    return NextResponse.json({ error: "Only workspace owner/admin can confirm plan" }, { status: 403 });
  }

  const payload = (await request.json().catch(() => ({}))) as ConfirmPayload;
  const razorpayOrderId = payload.razorpayOrderId?.trim() || "";
  const razorpayPaymentId = payload.razorpayPaymentId?.trim() || "";
  const razorpaySignature = payload.razorpaySignature?.trim() || "";

  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    return NextResponse.json({ error: "Missing payment confirmation fields" }, { status: 400 });
  }

  const validSignature = verifyRazorpayPaymentSignature(
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
  );

  if (!validSignature) {
    return NextResponse.json({ error: "Invalid payment signature" }, { status: 401 });
  }

  await activateSubscriptionByOrder({
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
  });

  return NextResponse.json({ confirmed: true });
}
