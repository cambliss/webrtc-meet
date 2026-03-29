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

export type BillingInvoiceSnapshot = {
  workspaceId: string;
  workspaceName: string;
  brandName: string;
  logoUrl: string | null;
  subscriptionId: string | null;
  subscriptionStatus: "pending" | "active" | "canceled" | "expired" | null;
  subscriptionStartDate: string | null;
  subscriptionEndDate: string | null;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  planId: string;
  planName: string;
  planPrice: number;
};

export async function getWorkspaceInvoiceSnapshot(workspaceId: string): Promise<BillingInvoiceSnapshot> {
  const pool = getDbPool();
  const result = await pool.query<{
    workspace_id: string;
    workspace_name: string;
    brand_name: string | null;
    logo_url: string | null;
    subscription_id: string | null;
    subscription_status: "pending" | "active" | "canceled" | "expired" | null;
    subscription_start_date: Date | null;
    subscription_end_date: Date | null;
    razorpay_order_id: string | null;
    razorpay_payment_id: string | null;
    plan_id: string | null;
    plan_name: string | null;
    plan_price: string | number | null;
  }>(
    `
    SELECT
      w.id AS workspace_id,
      w.name AS workspace_name,
      w.brand_name,
      w.logo_url,
      s.id AS subscription_id,
      s.status AS subscription_status,
      s.start_date AS subscription_start_date,
      s.end_date AS subscription_end_date,
      s.razorpay_order_id,
      s.razorpay_payment_id,
      p.id AS plan_id,
      p.name AS plan_name,
      p.price AS plan_price
    FROM workspaces w
    LEFT JOIN LATERAL (
      SELECT *
      FROM subscriptions s
      WHERE s.workspace_id = w.id
      ORDER BY
        CASE WHEN s.status = 'active' THEN 0 ELSE 1 END,
        s.created_at DESC
      LIMIT 1
    ) s ON TRUE
    LEFT JOIN plans p ON p.id = s.plan_id
    WHERE w.id = $1
    LIMIT 1
    `,
    [workspaceId],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("Workspace not found");
  }

  if (row.plan_id && row.plan_name) {
    return {
      workspaceId: row.workspace_id,
      workspaceName: row.workspace_name,
      brandName: row.brand_name || "Office Connect",
      logoUrl: row.logo_url,
      subscriptionId: row.subscription_id,
      subscriptionStatus: row.subscription_status,
      subscriptionStartDate: row.subscription_start_date ? row.subscription_start_date.toISOString() : null,
      subscriptionEndDate: row.subscription_end_date ? row.subscription_end_date.toISOString() : null,
      razorpayOrderId: row.razorpay_order_id,
      razorpayPaymentId: row.razorpay_payment_id,
      planId: row.plan_id,
      planName: row.plan_name,
      planPrice: Number(row.plan_price || 0),
    };
  }

  const freePlan = await getPlanById("free");
  if (!freePlan) {
    throw new Error("Default free plan is missing");
  }

  return {
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    brandName: row.brand_name || "Office Connect",
    logoUrl: row.logo_url,
    subscriptionId: null,
    subscriptionStatus: null,
    subscriptionStartDate: null,
    subscriptionEndDate: null,
    razorpayOrderId: null,
    razorpayPaymentId: null,
    planId: freePlan.id,
    planName: freePlan.name,
    planPrice: freePlan.price,
  };
}

export type PaymentHistoryRow = {
  subscriptionId: string;
  planId: string;
  planName: string;
  planPrice: number;
  status: "pending" | "active" | "canceled" | "expired";
  startDate: string;
  endDate: string | null;
  razorpayPaymentId: string | null;
  createdAt: string;
};

export async function getWorkspacePaymentHistory(
  workspaceId: string,
  limit = 20,
): Promise<PaymentHistoryRow[]> {
  const pool = getDbPool();
  const result = await pool.query<{
    subscription_id: string;
    plan_id: string;
    plan_name: string;
    plan_price: string | number;
    status: "pending" | "active" | "canceled" | "expired";
    start_date: Date;
    end_date: Date | null;
    razorpay_payment_id: string | null;
    created_at: Date;
  }>(
    `
    SELECT
      s.id AS subscription_id,
      p.id AS plan_id,
      p.name AS plan_name,
      p.price AS plan_price,
      s.status,
      s.start_date,
      s.end_date,
      s.razorpay_payment_id,
      s.created_at
    FROM subscriptions s
    JOIN plans p ON p.id = s.plan_id
    WHERE s.workspace_id = $1
      AND s.status <> 'pending'
    ORDER BY s.created_at DESC
    LIMIT $2
    `,
    [workspaceId, limit],
  );

  return result.rows.map((r) => ({
    subscriptionId: r.subscription_id,
    planId: r.plan_id,
    planName: r.plan_name,
    planPrice: Number(r.plan_price || 0),
    status: r.status,
    startDate: r.start_date.toISOString(),
    endDate: r.end_date ? r.end_date.toISOString() : null,
    razorpayPaymentId: r.razorpay_payment_id,
    createdAt: r.created_at.toISOString(),
  }));
}
