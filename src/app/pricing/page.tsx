import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { PricingPlansClient } from "@/src/components/PricingPlansClient";
import { verifyAuthToken } from "@/src/lib/auth";
import { getPlans, getWorkspacePlan } from "@/src/lib/billing";

export default async function PricingPage() {
  const token = (await cookies()).get("meeting_token")?.value;
  const auth = token ? verifyAuthToken(token) : null;

  if (!auth) {
    redirect("/login");
  }

  const [plans, currentPlan] = await Promise.all([
    getPlans(),
    getWorkspacePlan(auth.workspaceId),
  ]);

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl space-y-5 px-4 py-8">
      <header className="rounded-2xl border border-slate-300 bg-white/90 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Pricing Plans</h1>
            <p className="mt-1 text-sm text-slate-600">
              Choose a subscription for workspace {auth.workspaceId}. Current: {currentPlan.name}
            </p>
          </div>
          <Link href="/" className="text-sm font-semibold text-cyan-700 underline">
            Back to meetings
          </Link>
        </div>
      </header>

      <PricingPlansClient
        plans={plans}
        currentPlanId={currentPlan.id}
        workspaceId={auth.workspaceId}
      />
    </main>
  );
}
