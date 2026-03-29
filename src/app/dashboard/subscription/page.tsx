import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { DashboardSubscriptionClient } from "@/src/components/dashboard/DashboardSubscriptionClient";
import { isSuperAdminAuth, resolveAuthWorkspace, verifyAuthToken } from "@/src/lib/auth";
import { getPlans, getWorkspacePlan } from "@/src/lib/billing";

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

const FALLBACK_PLANS: DashboardPlan[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    maxParticipants: 5,
    maxMeetingMinutes: 40,
    recordingEnabled: false,
    aiEnabled: false,
    webinarMode: false,
    analyticsEnabled: false,
    prioritySupport: false,
  },
  {
    id: "pro",
    name: "Pro",
    price: 1999,
    maxParticipants: 50,
    maxMeetingMinutes: null,
    recordingEnabled: true,
    aiEnabled: true,
    webinarMode: false,
    analyticsEnabled: false,
    prioritySupport: false,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: 1,
    maxParticipants: null,
    maxMeetingMinutes: null,
    recordingEnabled: true,
    aiEnabled: true,
    webinarMode: true,
    analyticsEnabled: true,
    prioritySupport: true,
  },
];

export default async function DashboardSubscriptionPage() {
  const token = (await cookies()).get("meeting_token")?.value;
  const auth = token ? verifyAuthToken(token) : null;

  if (!auth) {
    redirect("/login");
  }

  const effectiveAuth = await resolveAuthWorkspace(auth);

  let plans: DashboardPlan[] = FALLBACK_PLANS;
  let currentPlanId = "free";

  try {
    const [dbPlans, currentPlan] = await Promise.all([
      getPlans(),
      getWorkspacePlan(effectiveAuth.workspaceId),
    ]);

    if (dbPlans.length > 0) {
      plans = dbPlans;
    }

    currentPlanId = currentPlan.id;
  } catch {
    // Keep fallback plans in no-DB mode.
  }

  return (
    <DashboardSubscriptionClient
      auth={effectiveAuth}
      isSuperAdmin={isSuperAdminAuth(effectiveAuth)}
      plans={plans}
      currentPlanId={currentPlanId}
    />
  );
}
