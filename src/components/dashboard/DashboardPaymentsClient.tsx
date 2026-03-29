"use client";

import Image from "next/image";
import Link from "next/link";

import type { AuthTokenPayload } from "@/src/lib/auth";
import type { PaymentHistoryRow } from "@/src/lib/billing";
import { DashboardShell } from "@/src/components/dashboard/DashboardShell";

type DashboardPaymentsClientProps = {
  auth: AuthTokenPayload;
  isSuperAdmin: boolean;
  history: PaymentHistoryRow[];
};

function StatusBadge({ status }: { status: PaymentHistoryRow["status"] }) {
  const styles: Record<PaymentHistoryRow["status"], string> = {
    active: "bg-[#e6f4ea] text-[#137333] border border-[#b7e3c0]",
    expired: "bg-[#fce8e6] text-[#b42318] border border-[#f1aaa5]",
    canceled: "bg-[#fef3c7] text-[#92400e] border border-[#fcd34d]",
    pending: "bg-[#f1f3f4] text-[#5f6368] border border-[#dadce0]",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles[status]}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function formatDate(iso: string | null) {
  if (!iso) return "Ongoing";
  return new Date(iso).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function formatINR(amount: number) {
  if (amount <= 0) return "Free";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function DashboardPaymentsClient({ auth, isSuperAdmin, history }: DashboardPaymentsClientProps) {
  const activeSubscription = history.find((r) => r.status === "active");

  return (
    <DashboardShell auth={auth} isSuperAdmin={isSuperAdmin} activeItemId="payments">
      {/* Header */}
      <section className="rounded-3xl border border-[#d7e4f8] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbff_100%)] p-6 shadow-[0_16px_30px_rgba(26,115,232,0.12)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#5f6368]">Billing</p>
            <h1 className="mt-1 text-2xl font-bold text-[#202124]">Payments</h1>
            <p className="mt-1 text-sm text-[#5f6368]">
              View your payment history, download invoices, and manage your subscription.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => window.open("/api/billing/invoice", "_blank", "noopener,noreferrer")}
              className="rounded-xl border border-[#c8daf8] bg-[#eef4ff] px-4 py-2 text-sm font-semibold text-[#1a73e8] hover:bg-[#dce9ff] transition"
            >
              Download Invoice
            </button>
            <Link
              href="/dashboard/subscription"
              className="rounded-xl border border-[#1a73e8] bg-[linear-gradient(180deg,#2d83ec_0%,#1a73e8_100%)] px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_16px_rgba(26,115,232,0.28)] hover:opacity-90 transition"
            >
              Manage Subscription
            </Link>
          </div>
        </div>

        {/* Active plan summary */}
        {activeSubscription && (
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-[#b7e3c0] bg-[#effbf2] p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#1b7f35]">Current Plan</p>
              <p className="mt-1 text-xl font-bold text-[#202124]">{activeSubscription.planName}</p>
              <p className="mt-0.5 text-sm text-[#3c4043]">{formatINR(activeSubscription.planPrice)} / month</p>
            </div>
            <div className="rounded-2xl border border-[#d7e4f8] bg-[#f2f8ff] p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#1a73e8]">Valid Until</p>
              <p className="mt-1 text-xl font-bold text-[#202124]">{formatDate(activeSubscription.endDate)}</p>
              <p className="mt-0.5 text-sm text-[#5f6368]">
                Started {formatDate(activeSubscription.startDate)}
              </p>
            </div>
            <div className="rounded-2xl border border-[#d7e4f8] bg-[#f2f8ff] p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#1a73e8]">Last Payment</p>
              <p className="mt-1 text-base font-bold text-[#202124] break-all font-mono">
                {activeSubscription.razorpayPaymentId ?? "—"}
              </p>
              <p className="mt-0.5 text-xs text-[#5f6368]">Razorpay payment ID</p>
            </div>
          </div>
        )}

        {!activeSubscription && (
          <div className="mt-5 rounded-2xl border border-[#d7e4f8] bg-[#f2f8ff] p-4 text-sm text-[#5f6368]">
            No active subscription. &nbsp;
            <Link href="/dashboard/subscription" className="font-semibold text-[#1a73e8] hover:underline">
              Upgrade now →
            </Link>
          </div>
        )}
      </section>

      {/* Payment History */}
      <section className="mt-6 rounded-3xl border border-[#d7e4f8] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbff_100%)] p-6 shadow-[0_16px_30px_rgba(26,115,232,0.08)]">
        <h2 className="text-lg font-bold text-[#202124]">Payment History</h2>
        <p className="mt-0.5 text-xs text-[#5f6368]">
          All completed and active subscription transactions for your workspace.
        </p>

        {history.length === 0 ? (
          <p className="mt-4 rounded-xl border border-[#d7e4f8] bg-[#f1f7ff] px-4 py-6 text-center text-sm text-[#5f6368]">
            No payment records found.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-[#d7e4f8]">
            <table className="min-w-full text-xs">
              <thead className="bg-[#eef4ff] text-[#1a73e8]">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Date</th>
                  <th className="px-4 py-3 text-left font-semibold">Plan</th>
                  <th className="px-4 py-3 text-left font-semibold">Amount</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-left font-semibold">Valid Until</th>
                  <th className="px-4 py-3 text-left font-semibold">Payment Ref</th>
                  <th className="px-4 py-3 text-left font-semibold">Invoice</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8f0fd]">
                {history.map((row) => (
                  <tr key={row.subscriptionId} className="bg-white hover:bg-[#f5f9ff] transition">
                    <td className="px-4 py-3 text-[#3c4043]">{formatDate(row.createdAt)}</td>
                    <td className="px-4 py-3 font-medium text-[#202124]">{row.planName}</td>
                    <td className="px-4 py-3 text-[#202124]">{formatINR(row.planPrice)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-4 py-3 text-[#3c4043]">{formatDate(row.endDate)}</td>
                    <td className="px-4 py-3 font-mono text-[#5f6368]">
                      {row.razorpayPaymentId ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() =>
                          window.open("/api/billing/invoice", "_blank", "noopener,noreferrer")
                        }
                        className="rounded-lg border border-[#c8daf8] bg-[#eef4ff] px-2.5 py-1 text-xs font-semibold text-[#1a73e8] hover:bg-[#dce9ff] transition"
                      >
                        Invoice
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
