"use client";

import { useState } from "react";

import type { PlanEntitlements } from "@/src/lib/billing";

type PricingPlansClientProps = {
  plans: PlanEntitlements[];
  currentPlanId: string;
  workspaceId: string;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

export function PricingPlansClient({ plans, currentPlanId, workspaceId }: PricingPlansClientProps) {
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const [error, setError] = useState<string>("");

  const loadRazorpayScript = async () => {
    if (window.Razorpay) {
      return true;
    }

    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load Razorpay script"));
      document.body.appendChild(script);
    });

    return Boolean(window.Razorpay);
  };

  return (
    <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {plans.map((plan) => {
        const isCurrent = plan.id === currentPlanId;
        const isLoading = loadingPlanId === plan.id;

        return (
          <article key={plan.id} className="rounded-2xl border border-slate-300 bg-white/90 p-5">
            <h2 className="text-xl font-bold text-slate-900">{plan.name}</h2>
            <p className="mt-1 text-3xl font-extrabold text-slate-900">
              ₹{plan.price}
              <span className="ml-1 text-sm font-medium text-slate-500">/ month</span>
            </p>

            <ul className="mt-4 space-y-1 text-sm text-slate-700">
              <li>
                {plan.maxMeetingMinutes ? `Max ${plan.maxMeetingMinutes} minute meetings` : "Unlimited meeting duration"}
              </li>
              <li>
                {plan.maxParticipants ? `Up to ${plan.maxParticipants} participants` : "Unlimited participants"}
              </li>
              <li>{plan.recordingEnabled ? "Meeting recordings" : "No recordings"}</li>
              <li>{plan.aiEnabled ? "AI summaries" : "No AI summaries"}</li>
              <li>{plan.webinarMode ? "Webinar mode" : "No webinar mode"}</li>
              <li>{plan.analyticsEnabled ? "Analytics dashboard" : "No analytics dashboard"}</li>
              <li>{plan.prioritySupport ? "Priority support" : "Standard support"}</li>
            </ul>

            <button
              type="button"
              disabled={isCurrent || isLoading}
              className={`mt-5 w-full rounded-xl px-4 py-2 text-sm font-semibold ${
                isCurrent
                  ? "cursor-not-allowed border border-slate-300 bg-slate-100 text-slate-500"
                  : "border border-cyan-700 bg-cyan-600 text-white"
              }`}
              onClick={async () => {
                try {
                  setError("");
                  setLoadingPlanId(plan.id);

                  const res = await fetch("/api/billing/checkout", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ planId: plan.id }),
                  });

                  const data = (await res.json()) as {
                    error?: string;
                    checkoutRequired?: boolean;
                    razorpayKeyId?: string;
                    orderId?: string;
                    amount?: number;
                    currency?: string;
                    planName?: string;
                  };

                  if (!res.ok) {
                    throw new Error(data.error || "Checkout failed");
                  }

                  if (!data.checkoutRequired) {
                    window.location.reload();
                    return;
                  }

                  const hasScript = await loadRazorpayScript();
                  if (!hasScript || !window.Razorpay || !data.razorpayKeyId || !data.orderId) {
                    throw new Error("Razorpay is not available");
                  }

                  const checkout = new window.Razorpay({
                    key: data.razorpayKeyId,
                    amount: data.amount,
                    currency: data.currency,
                    name: "MeetFlow",
                    description: `Upgrade to ${data.planName}`,
                    order_id: data.orderId,
                    notes: {
                      workspace_id: workspaceId,
                      plan_id: plan.id,
                    },
                    theme: { color: "#0891b2" },
                    handler: async (paymentResponse: {
                      razorpay_order_id?: string;
                      razorpay_payment_id?: string;
                      razorpay_signature?: string;
                    }) => {
                      try {
                        const confirmRes = await fetch("/api/billing/confirm", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            razorpayOrderId: paymentResponse.razorpay_order_id,
                            razorpayPaymentId: paymentResponse.razorpay_payment_id,
                            razorpaySignature: paymentResponse.razorpay_signature,
                          }),
                        });

                        if (!confirmRes.ok) {
                          const payload = (await confirmRes.json().catch(() => ({}))) as {
                            error?: string;
                          };
                          setError(payload.error || "Plan activation confirmation failed");
                          return;
                        }

                        window.location.reload();
                      } catch (confirmError) {
                        setError(
                          confirmError instanceof Error
                            ? confirmError.message
                            : "Plan activation confirmation failed",
                        );
                      }
                    },
                  });

                  checkout.open();
                } catch (checkoutError) {
                  setError(
                    checkoutError instanceof Error ? checkoutError.message : "Something went wrong",
                  );
                } finally {
                  setLoadingPlanId(null);
                }
              }}
            >
              {isCurrent ? "Current Plan" : isLoading ? "Processing..." : "Upgrade"}
            </button>
          </article>
        );
      })}

      {error && (
        <p className="md:col-span-3 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">
          {error}
        </p>
      )}
    </section>
  );
}
