import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

import { DashboardShell } from "@/src/components/dashboard/DashboardShell";
import { resolveAuthWorkspace, verifyAuthToken } from "@/src/lib/auth";
import { getDbPool } from "@/src/lib/db";
import { AvatarUploader } from "@/src/components/AvatarUploader";
import { isSuperAdminAuth } from "@/src/lib/auth";

export default async function ProfilePage() {
  const token = (await cookies()).get("meeting_token")?.value;
  const auth = token ? verifyAuthToken(token) : null;

  if (!auth) {
    redirect("/login");
  }

  const effectiveAuth = await resolveAuthWorkspace(auth);

  const pool = getDbPool();
  const result = await pool.query<{
    id: string;
    name: string;
    email: string;
    username: string | null;
    display_name: string | null;
    avatar_path: string | null;
    created_at: string;
  }>(
    "SELECT id, name, email, username, display_name, avatar_path, created_at FROM users WHERE id = $1",
    [effectiveAuth.userId],
  );

  const user = result.rows[0];
  if (!user) {
    notFound();
  }

  const isSuperAdmin = isSuperAdminAuth(effectiveAuth);

  return (
    <DashboardShell auth={effectiveAuth} isSuperAdmin={isSuperAdmin} activeItemId="profile">
      <section className="mx-auto max-w-4xl rounded-3xl border border-[#d7e4f8] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbff_100%)] p-6 shadow-[0_16px_30px_rgba(26,115,232,0.12)]">
        <header className="mb-6 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#5f6368]">Account</p>
            <h1 className="mt-1 text-2xl font-bold text-[#202124]">Profile Settings</h1>
          </div>
          <Link href="/dashboard" className="rounded-xl border border-[#c8daf8] bg-[#eef4ff] px-3 py-1.5 text-xs font-semibold text-[#1a73e8]">
            Back to dashboard
          </Link>
        </header>

        <div className="space-y-6">
          <div className="rounded-2xl border border-[#d9e5f8] bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold text-[#202124]">Profile Picture</h2>

            <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
              <div className="flex flex-col items-center gap-3">
                {user.avatar_path ? (
                  <div className="relative h-32 w-32 overflow-hidden rounded-full border-4 border-[#d9e5f8] bg-[#f8fbff]">
                    <Image
                      src={`/api/auth/avatar/${encodeURIComponent(user.id)}`}
                      alt={user.name}
                      fill
                      className="object-cover"
                      unoptimized
                      priority
                    />
                  </div>
                ) : (
                  <div className="flex h-32 w-32 items-center justify-center rounded-full border-4 border-[#d9e5f8] bg-gradient-to-br from-[#1a73e8] to-[#34a853]">
                    <span className="text-4xl font-bold text-white">
                      {user.name
                        .split(/\s+/)
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((part) => part[0]?.toUpperCase() ?? "")
                        .join("")}
                    </span>
                  </div>
                )}
                <p className="text-sm font-medium text-[#5f6368]">{user.name}</p>
              </div>

              <div className="flex-1">
                <AvatarUploader currentAvatarPath={user.avatar_path} userId={user.id} />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#d9e5f8] bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold text-[#202124]">Account Information</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#5f6368]">Full Name</label>
                <p className="mt-1 text-sm text-[#202124]">{user.name}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#5f6368]">Email</label>
                <p className="mt-1 text-sm text-[#202124]">{user.email}</p>
              </div>

              {user.display_name && (
                <div>
                  <label className="block text-sm font-medium text-[#5f6368]">Display Name</label>
                  <p className="mt-1 text-sm text-[#202124]">{user.display_name}</p>
                </div>
              )}

              {user.username && (
                <div>
                  <label className="block text-sm font-medium text-[#5f6368]">Username</label>
                  <p className="mt-1 text-sm text-[#202124]">{user.username}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-[#5f6368]">Member Since</label>
                <p className="mt-1 text-sm text-[#202124]">
                  {new Date(user.created_at).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#d9e5f8] bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold text-[#202124]">Security</h2>
            <p className="mb-4 text-sm text-[#5f6368]">Manage your account security and privacy settings.</p>
            <Link
              href="/dashboard/security"
              className="inline-block rounded-xl border border-[#c8daf8] bg-[#eef4ff] px-4 py-2 text-sm font-semibold text-[#1a73e8]"
            >
              View Security Settings
            </Link>
          </div>
        </div>
      </section>
    </DashboardShell>
  );
}
