import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { verifyAuthToken } from "@/src/lib/auth";
import { WorkspaceSettingsClient } from "@/src/app/workspaces/[id]/settings/WorkspaceSettingsClient";

type WorkspaceSettingsPageProps = {
  params: Promise<{ id: string }>;
};

export default async function WorkspaceSettingsPage({ params }: WorkspaceSettingsPageProps) {
  const token = (await cookies()).get("meeting_token")?.value;
  const auth = token ? verifyAuthToken(token) : null;

  if (!auth) {
    redirect("/login");
  }

  const { id } = await params;
  if (!id?.trim()) {
    redirect("/");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-4 py-10">
      <WorkspaceSettingsClient workspaceId={id} />
    </main>
  );
}
