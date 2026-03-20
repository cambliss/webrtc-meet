"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import type { AuthTokenPayload } from "@/src/lib/auth";
import { DashboardShell } from "@/src/components/dashboard/DashboardShell";

type DashboardPlan = {
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

type DashboardSubscriptionClientProps = {
  auth: AuthTokenPayload;
  isSuperAdmin: boolean;
  plans: DashboardPlan[];
  currentPlanId: string;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

export function DashboardSubscriptionClient({ auth, isSuperAdmin, plans, currentPlanId }: DashboardSubscriptionClientProps) {
  const [currency, setCurrency] = useState<"INR" | "USD">("INR");
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState("");

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

  const formatPrice = (priceInInr: number) => {
    if (currency === "USD") {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(priceInInr / 83);
    }

    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(priceInInr);
  };

  return (
    <DashboardShell auth={auth} isSuperAdmin={isSuperAdmin} activeItemId="subscription">
        <section className="rounded-3xl border border-[#d7e4f8] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbff_100%)] p-6 shadow-[0_16px_30px_rgba(26,115,232,0.12)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-[#202124]">Subscription</h2>
              <p className="mt-1 text-sm text-[#5f6368]">Dedicated subscription page with same dashboard navigation.</p>
            </div>
            <div className="inline-flex rounded-xl border border-[#c8daf8] bg-[#eef4ff] p-1">
              <button
                type="button"
                onClick={() => setCurrency("INR")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${currency === "INR" ? "bg-[#1a73e8] text-white" : "text-[#1a73e8]"}`}
              >
                INR
              </button>
              <button
                type="button"
                onClick={() => setCurrency("USD")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${currency === "USD" ? "bg-[#1a73e8] text-white" : "text-[#1a73e8]"}`}
              >
                USD
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {plans.map((plan) => {
              const isCurrent = plan.id === currentPlanId;
              const isLoading = loadingPlanId === plan.id;
              const isFree = plan.id === "free";

              return (
                <article
                  key={plan.id}
                  className={`rounded-2xl border p-5 shadow-[0_10px_24px_rgba(26,115,232,0.1)] ${
                    isCurrent
                      ? "border-[#1a73e8] bg-[linear-gradient(180deg,#f2f8ff_0%,#e9f2ff_100%)] shadow-[0_18px_30px_rgba(26,115,232,0.2)]"
                      : "border-[#d9e5f8] bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)]"
                  }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#1a73e8]">{plan.name}</p>
                  <p className="mt-2 text-3xl font-bold text-[#202124]">{formatPrice(plan.price)}</p>
                  <p className="mt-1 text-xs text-[#5f6368]">/ month</p>

                  <ul className="mt-4 space-y-1 text-xs text-[#5f6368]">
                    <li>{plan.maxMeetingMinutes ? `Up to ${plan.maxMeetingMinutes} min meetings` : "Unlimited meeting duration"}</li>
                    <li>{plan.maxParticipants ? `Up to ${plan.maxParticipants} participants` : "Unlimited participants"}</li>
                    <li>{plan.recordingEnabled ? "Recording enabled" : "Recording disabled"}</li>
                    <li>{plan.aiEnabled ? "AI summary enabled" : "AI summary disabled"}</li>
                  </ul>

                  <button
                    type="button"
                    disabled={isCurrent || isLoading}
                    className={`mt-5 w-full rounded-xl px-4 py-2 text-sm font-semibold transition ${
                      isCurrent
                        ? "cursor-not-allowed border border-[#d7dfe9] bg-[#eef2f7] text-[#7a8796]"
                        : "border border-[#1a73e8] bg-[linear-gradient(180deg,#2d83ec_0%,#1a73e8_100%)] text-white shadow-[0_10px_18px_rgba(26,115,232,0.28)]"
                    }`}
                    onClick={async () => {
                      try {
                        setCheckoutError("");
                        setLoadingPlanId(plan.id);

                        const res = await fetch("/api/billing/checkout", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ planId: plan.id, currency }),
                        });

                        const data = (await res.json().catch(() => ({}))) as {
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

                        if (!data.checkoutRequired || isFree) {
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
                          name: "Brand",
                          description: `Upgrade to ${data.planName || plan.name}`,
                          order_id: data.orderId,
                          notes: {
                            workspace_id: auth.workspaceId,
                            plan_id: plan.id,
                          },
                          theme: { color: "#1a73e8" },
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
                                setCheckoutError(payload.error || "Plan activation confirmation failed");
                                return;
                              }

                              window.location.reload();
                            } catch (confirmError) {
                              setCheckoutError(
                                confirmError instanceof Error
                                  ? confirmError.message
                                  : "Plan activation confirmation failed",
                              );
                            }
                          },
                        });

                        checkout.open();
                      } catch (error) {
                        setCheckoutError(error instanceof Error ? error.message : "Subscription checkout failed");
                      } finally {
                        setLoadingPlanId(null);
                      }
                    }}
                  >
                    {isCurrent
                      ? "Current plan"
                      : isLoading
                        ? "Processing..."
                        : isFree
                          ? "Switch to Free"
                          : "Checkout with Razorpay"}
                  </button>
                </article>
              );
            })}
          </div>

          {checkoutError && (
            <p className="mt-3 rounded-xl border border-[#f5b4af] bg-[#fde8e6] px-3 py-2 text-sm text-[#b42318]">
              {checkoutError}
            </p>
          )}
        </section>

        <footer className="mt-6 flex justify-center rounded-2xl border border-[#d8e5fa] bg-[linear-gradient(180deg,rgba(255,255,255,0.94)_0%,rgba(245,250,255,0.92)_100%)] p-4 shadow-[0_12px_20px_rgba(26,115,232,0.1)]">
          <Image
            src="/logo.png"
            alt="Brand logo"
            width={72}
            height={72}
            className="rounded-2xl border border-[#d3e3fd] bg-white object-contain p-1"
          />
        </footer>
    </DashboardShell>
  );
}
