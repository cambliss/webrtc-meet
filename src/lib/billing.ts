import { randomUUID, createHmac } from "node:crypto";

import { getDbPool } from "@/src/lib/db";

export type PlanEntitlements = {
  id: string;
  name: string;
  price: number;
  maxParticipants: number | null;
  maxMeetingMinutes: number | null;
  recordingEnabled: boolean;
  aiEnabled: boolean;
  webinarMode: boolean;
  analyticsEnabled: boolean;
  prioritySupport: boolean;
};

function mapPlanRow(row: {
  id: string;
  name: string;
  price: string | number;
  max_participants: number | null;
  max_meeting_minutes: number | null;
  recording_enabled: boolean;
  ai_enabled: boolean;
  webinar_mode: boolean;
  analytics_enabled: boolean;
  priority_support: boolean;
}): PlanEntitlements {
  return {
    id: row.id,
    name: row.name,
    price: Number(row.price || 0),
    maxParticipants: row.max_participants,
    maxMeetingMinutes: row.max_meeting_minutes,
    recordingEnabled: row.recording_enabled,
    aiEnabled: row.ai_enabled,
    webinarMode: row.webinar_mode,
    analyticsEnabled: row.analytics_enabled,
    prioritySupport: row.priority_support,
  };
}

export async function getPlans(): Promise<PlanEntitlements[]> {
  const pool = getDbPool();
  const result = await pool.query<{
    id: string;
    name: string;
    price: string;
    max_participants: number | null;
    max_meeting_minutes: number | null;
    recording_enabled: boolean;
    ai_enabled: boolean;
    webinar_mode: boolean;
    analytics_enabled: boolean;
    priority_support: boolean;
  }>(
    `
    SELECT
      id,
      name,
      price,
      max_participants,
      max_meeting_minutes,
      recording_enabled,
      ai_enabled,
      webinar_mode,
      analytics_enabled,
      priority_support
    FROM plans
    ORDER BY price ASC
    `,
  );

  return result.rows.map(mapPlanRow);
}

export async function getPlanById(planId: string): Promise<PlanEntitlements | null> {
  const pool = getDbPool();
  const result = await pool.query<{
    id: string;
    name: string;
    price: string;
    max_participants: number | null;
    max_meeting_minutes: number | null;
    recording_enabled: boolean;
    ai_enabled: boolean;
    webinar_mode: boolean;
    analytics_enabled: boolean;
    priority_support: boolean;
  }>(
    `
    SELECT
      id,
      name,
      price,
      max_participants,
      max_meeting_minutes,
      recording_enabled,
      ai_enabled,
      webinar_mode,
      analytics_enabled,
      priority_support
    FROM plans
    WHERE id = $1
    LIMIT 1
    `,
    [planId],
  );

  if (!result.rows[0]) {
    return null;
  }

  return mapPlanRow(result.rows[0]);
}

export async function getWorkspacePlan(workspaceId: string): Promise<PlanEntitlements> {
  const pool = getDbPool();
  const result = await pool.query<{
    id: string;
    name: string;
    price: string;
    max_participants: number | null;
    max_meeting_minutes: number | null;
    recording_enabled: boolean;
    ai_enabled: boolean;
    webinar_mode: boolean;
    analytics_enabled: boolean;
    priority_support: boolean;
  }>(
    `
    SELECT
      p.id,
      p.name,
      p.price,
      p.max_participants,
      p.max_meeting_minutes,
      p.recording_enabled,
      p.ai_enabled,
      p.webinar_mode,
      p.analytics_enabled,
      p.priority_support
    FROM subscriptions s
    JOIN plans p ON p.id = s.plan_id
    WHERE s.workspace_id = $1
      AND s.status = 'active'
      AND s.start_date <= NOW()
      AND (s.end_date IS NULL OR s.end_date >= NOW())
    ORDER BY s.start_date DESC
    LIMIT 1
    `,
    [workspaceId],
  );

  if (result.rows[0]) {
    return mapPlanRow(result.rows[0]);
  }

  const free = await getPlanById("free");
  if (!free) {
    throw new Error("Default free plan is missing");
  }

  return free;
}

export async function canWorkspaceUseFeature(
  workspaceId: string,
  feature: "recording" | "ai" | "analytics",
): Promise<boolean> {
  const plan = await getWorkspacePlan(workspaceId);
  if (feature === "recording") return plan.recordingEnabled;
  if (feature === "ai") return plan.aiEnabled;
  return plan.analyticsEnabled;
}

export async function createPendingSubscription(params: {
  workspaceId: string;
  planId: string;
  startDate?: Date;
  endDate?: Date | null;
  status: "pending" | "active" | "canceled" | "expired";
  razorpayOrderId?: string | null;
  razorpayPaymentId?: string | null;
  razorpaySignature?: string | null;
}): Promise<{ id: string }> {
  const pool = getDbPool();
  const id = randomUUID();
  await pool.query(
    `
    INSERT INTO subscriptions (
      id,
      workspace_id,
      plan_id,
      start_date,
      end_date,
      status,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      created_at,
      updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
    `,
    [
      id,
      params.workspaceId,
      params.planId,
      params.startDate || new Date(),
      params.endDate || null,
      params.status,
      params.razorpayOrderId || null,
      params.razorpayPaymentId || null,
      params.razorpaySignature || null,
    ],
  );

  return { id };
}

export async function activateSubscriptionByOrder(params: {
  razorpayOrderId: string;
  razorpayPaymentId?: string | null;
  razorpaySignature?: string | null;
}): Promise<void> {
  const pool = getDbPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const pending = await client.query<{
      id: string;
      workspace_id: string;
    }>(
      `
      SELECT id, workspace_id
      FROM subscriptions
      WHERE razorpay_order_id = $1
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [params.razorpayOrderId],
    );

    const row = pending.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return;
    }

    await client.query(
      `
      UPDATE subscriptions
      SET status = 'expired', updated_at = NOW()
      WHERE workspace_id = $1
        AND status = 'active'
      `,
      [row.workspace_id],
    );

    await client.query(
      `
      UPDATE subscriptions
      SET
        status = 'active',
        start_date = NOW(),
        end_date = NOW() + INTERVAL '30 days',
        razorpay_payment_id = COALESCE($2, razorpay_payment_id),
        razorpay_signature = COALESCE($3, razorpay_signature),
        updated_at = NOW()
      WHERE id = $1
      `,
      [row.id, params.razorpayPaymentId || null, params.razorpaySignature || null],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function activateWorkspacePlan(workspaceId: string, planId: string): Promise<void> {
  const pool = getDbPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `
      UPDATE subscriptions
      SET status = 'expired', updated_at = NOW()
      WHERE workspace_id = $1
        AND status = 'active'
      `,
      [workspaceId],
    );

    await client.query(
      `
      INSERT INTO subscriptions (
        id,
        workspace_id,
        plan_id,
        start_date,
        end_date,
        status,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, NOW(), NULL, 'active', NOW(), NOW())
      `,
      [randomUUID(), workspaceId, planId],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function verifyRazorpayWebhookSignature(payload: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    return false;
  }

  const digest = createHmac("sha256", secret).update(payload).digest("hex");
  return digest === signature;
}

export function verifyRazorpayPaymentSignature(
  razorpayOrderId: string,
  razorpayPaymentId: string,
  razorpaySignature: string,
): boolean {
  const keySecret = process.env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_SECRET;
  if (!keySecret) {
    return false;
  }

  const payload = `${razorpayOrderId}|${razorpayPaymentId}`;
  const digest = createHmac("sha256", keySecret).update(payload).digest("hex");
  return digest === razorpaySignature;
}
