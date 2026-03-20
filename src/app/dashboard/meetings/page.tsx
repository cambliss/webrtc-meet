import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { DashboardMeetingsClient } from "@/src/components/dashboard/DashboardMeetingsClient";
import { isSuperAdminAuth, verifyAuthToken } from "@/src/lib/auth";

export default async function DashboardMeetingsPage() {
  const token = (await cookies()).get("meeting_token")?.value;
  const auth = token ? verifyAuthToken(token) : null;

  if (!auth) {
    redirect("/login");
  }

  return <DashboardMeetingsClient auth={auth} isSuperAdmin={isSuperAdminAuth(auth)} />;
}
