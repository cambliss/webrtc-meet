import { Buffer } from "node:buffer";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { verifyAuthToken } from "@/src/lib/auth";
import { activateWorkspacePlan, createPendingSubscription, getPlanById } from "@/src/lib/billing";
import { getDbPool } from "@/src/lib/db";

type CheckoutPayload = {
  planId?: string;
  currency?: "INR" | "USD" | string;
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
  try {
    const token = (await cookies()).get("meeting_token")?.value;
    const auth = token ? verifyAuthToken(token) : null;

    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const canManage = await assertCanManageWorkspace(auth.workspaceId, auth.userId);
    if (!canManage) {
      return NextResponse.json({ error: "Only workspace owner/admin can change plan" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as CheckoutPayload;
    const planId = body.planId?.trim().toLowerCase();
    const selectedCurrency = (body.currency || "INR").toUpperCase() as "INR" | "USD";

    if (!planId) {
      return NextResponse.json({ error: "planId is required" }, { status: 400 });
    }

    if (selectedCurrency !== "INR" && selectedCurrency !== "USD") {
      return NextResponse.json({ error: "Unsupported currency" }, { status: 400 });
    }

    const plan = await getPlanById(planId);
    if (!plan) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    if (plan.id === "free") {
      try {
        await activateWorkspacePlan(auth.workspaceId, "free");
      } catch (error) {
        console.error("free plan activation failed", error);
        return NextResponse.json({ error: "Failed to activate free plan" }, { status: 500 });
      }

      return NextResponse.json({ subscribed: true, checkoutRequired: false, planId: "free" });
    }

    // Support both current and legacy env variable names.
    const keyId = process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY;
    const keySecret = process.env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_SECRET;
    if (!keyId || !keySecret) {
      return NextResponse.json({ error: "Razorpay keys are not configured" }, { status: 500 });
    }

    const usdRate = Number(process.env.INR_TO_USD_RATE || "0.012");
    const pricedAmount = selectedCurrency === "USD" ? plan.price * usdRate : plan.price;
    const amountSmallestUnit = Math.max(1, Math.round(pricedAmount * 100));
    const workspaceToken = auth.workspaceId.replace(/[^a-zA-Z0-9]/g, "").toLowerCase().slice(-12);
    const timeToken = Date.now().toString(36);
    const randomToken = Math.random().toString(36).slice(2, 8);
    const receipt = `ws${workspaceToken}${timeToken}${randomToken}`.slice(0, 40);

    const encodedAuth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const razorpayResponse = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${encodedAuth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: amountSmallestUnit,
        currency: selectedCurrency,
        receipt,
        notes: {
          workspace_id: auth.workspaceId,
          plan_id: plan.id,
          currency: selectedCurrency,
        },
      }),
    });

    if (!razorpayResponse.ok) {
      const text = await razorpayResponse.text();
      console.error("Razorpay order error", text);
      return NextResponse.json({ error: "Failed to create checkout order" }, { status: 502 });
    }

    const order = (await razorpayResponse.json()) as { id: string; amount: number; currency: string };

    await createPendingSubscription({
      workspaceId: auth.workspaceId,
      planId: plan.id,
      startDate: new Date(),
      endDate: null,
      status: "pending",
      razorpayOrderId: order.id,
    });

    return NextResponse.json({
      checkoutRequired: true,
      razorpayKeyId: keyId,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      planId: plan.id,
      planName: plan.name,
      workspaceId: auth.workspaceId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Checkout error";
    const pgCode =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code ?? "")
        : "";

    if (message.includes("DATABASE_URL is not configured")) {
      return NextResponse.json({ error: "Database is not configured. Set DATABASE_URL first." }, { status: 500 });
    }

    if (pgCode === "28P01") {
      return NextResponse.json(
        {
          error:
            "Database authentication failed. Update DATABASE_URL with the correct PostgreSQL username/password.",
        },
        { status: 500 },
      );
    }

    console.error("checkout route failed", error);
    return NextResponse.json({ error: "Failed to start checkout" }, { status: 500 });
  }
}
