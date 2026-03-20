import { NextResponse } from "next/server";

import { activateSubscriptionByOrder, verifyRazorpayWebhookSignature } from "@/src/lib/billing";

export async function POST(request: Request) {
  const signature = request.headers.get("x-razorpay-signature") || "";
  const rawBody = await request.text();

  if (!verifyRazorpayWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = payload?.event as string | undefined;
  if (!event) {
    return NextResponse.json({ ok: true });
  }

  // Handle successful payment lifecycle events.
  if (event === "payment.captured" || event === "order.paid") {
    const payment = payload?.payload?.payment?.entity;
    const order = payload?.payload?.order?.entity;

    const orderId = payment?.order_id || order?.id;
    const paymentId = payment?.id || null;

    if (orderId) {
      await activateSubscriptionByOrder({
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: signature || null,
      });
    }
  }

  return NextResponse.json({ ok: true });
}
