"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type WorkspaceRole = "owner" | "admin" | "member";

type WorkspaceResponse = {
  workspace: {
    id: string;
    name: string;
    role: WorkspaceRole;
    brandName?: string | null;
    logoUrl?: string | null;
    customDomain?: string | null;
    primaryColor?: string | null;
    secondaryColor?: string | null;
    permissions: {
      canManageMembers: boolean;
      canManageMeetings: boolean;
      canDeleteWorkspace: boolean;
    };
  };
};

type MemberItem = {
  userId: string;
  name: string;
  email: string;
  role: WorkspaceRole;
  joinedAt: string;
};

type MembersResponse = {
  members: MemberItem[];
  currentRole: WorkspaceRole;
  canManageMembers: boolean;
};

type ApiKeyItem = {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
};

export function WorkspaceSettingsClient({ workspaceId }: { workspaceId: string }) {
  const [workspaceName, setWorkspaceName] = useState("");
  const [draftName, setDraftName] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("member");
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [canManageMembers, setCanManageMembers] = useState(false);
  const [canDeleteWorkspace, setCanDeleteWorkspace] = useState(false);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [inviteLink, setInviteLink] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [brandName, setBrandName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [customDomain, setCustomDomain] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#06b6d4");
  const [secondaryColor, setSecondaryColor] = useState("#0f172a");
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [newApiKey, setNewApiKey] = useState("");
  const [newApiKeyName, setNewApiKeyName] = useState("Default SDK Key");
  const [logoFile, setLogoFile] = useState<File | null>(null);

  const canEditWorkspaceName = useMemo(() => role === "owner" || role === "admin", [role]);

  const loadData = async () => {
    setLoading(true);
    setStatus("");

    const [workspaceRes, membersRes, apiKeysRes] = await Promise.all([
      fetch(`/api/workspaces/${workspaceId}`, { cache: "no-store" }),
      fetch(`/api/workspaces/${workspaceId}/members`, { cache: "no-store" }),
      fetch(`/api/workspaces/${workspaceId}/api-keys`, { cache: "no-store" }),
    ]);

    if (!workspaceRes.ok || !membersRes.ok) {
      setStatus("Failed to load workspace settings.");
      setLoading(false);
      return;
    }

    const workspacePayload = (await workspaceRes.json()) as WorkspaceResponse;
    const membersPayload = (await membersRes.json()) as MembersResponse;
    const apiKeysPayload = (await apiKeysRes.json().catch(() => ({ apiKeys: [] }))) as {
      apiKeys?: ApiKeyItem[];
    };

    setWorkspaceName(workspacePayload.workspace.name);
    setDraftName(workspacePayload.workspace.name);
    setBrandName(workspacePayload.workspace.brandName || workspacePayload.workspace.name);
    setLogoUrl(workspacePayload.workspace.logoUrl || "");
    setCustomDomain(workspacePayload.workspace.customDomain || "");
    setPrimaryColor(workspacePayload.workspace.primaryColor || "#06b6d4");
    setSecondaryColor(workspacePayload.workspace.secondaryColor || "#0f172a");
    setRole(workspacePayload.workspace.role);
    setCanDeleteWorkspace(workspacePayload.workspace.permissions.canDeleteWorkspace);
    setMembers(membersPayload.members);
    setCanManageMembers(membersPayload.canManageMembers);
    setApiKeys(apiKeysPayload.apiKeys || []);
    setLoading(false);
  };

  useEffect(() => {
    void loadData();
  }, [workspaceId]);

  const updateWorkspaceName = async () => {
    const trimmed = draftName.trim();
    if (!trimmed) {
      setStatus("Workspace name cannot be empty.");
      return;
    }

    const response = await fetch(`/api/workspaces/${workspaceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: trimmed,
        brandName: brandName.trim(),
        logoUrl: logoUrl.trim() || null,
        customDomain: customDomain.trim() || null,
        primaryColor: primaryColor.trim() || null,
        secondaryColor: secondaryColor.trim() || null,
      }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setStatus(payload.error || "Failed to update workspace name.");
      return;
    }

    setWorkspaceName(trimmed);
    setStatus("Workspace name updated.");
  };

  const generateApiKey = async () => {
    const response = await fetch(`/api/workspaces/${workspaceId}/api-keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newApiKeyName.trim() || "Developer API Key" }),
    });

    const payload = (await response.json().catch(() => ({}))) as { apiKey?: string; error?: string };
    if (!response.ok || !payload.apiKey) {
      setStatus(payload.error || "Failed to create API key.");
      return;
    }

    setNewApiKey(payload.apiKey);
    setStatus("API key generated. Copy it now.");
    void loadData();
  };

  const revokeApiKey = async (keyId: string) => {
    const response = await fetch(`/api/workspaces/${workspaceId}/api-keys`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyId }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setStatus(payload.error || "Failed to revoke API key.");
      return;
    }

    setStatus("API key revoked.");
    void loadData();
  };

  const uploadLogo = async () => {
    if (!logoFile) {
      setStatus("Select an image file first.");
      return;
    }

    const formData = new FormData();
    formData.append("file", logoFile);

    const response = await fetch(`/api/workspaces/${workspaceId}/branding/logo`, {
      method: "POST",
      body: formData,
    });

    const payload = (await response.json().catch(() => ({}))) as {
      logoUrl?: string;
      error?: string;
    };

    if (!response.ok || !payload.logoUrl) {
      setStatus(payload.error || "Failed to upload logo.");
      return;
    }

    setLogoUrl(payload.logoUrl);
    setLogoFile(null);
    setStatus("Logo uploaded.");
  };

  const changeRole = async (userId: string, nextRole: "admin" | "member") => {
    const response = await fetch(`/api/workspaces/${workspaceId}/members/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: nextRole }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setStatus(payload.error || "Failed to update member role.");
      return;
    }

    setStatus("Member role updated.");
    void loadData();
  };

  const removeMember = async (userId: string) => {
    const response = await fetch(`/api/workspaces/${workspaceId}/members/${userId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setStatus(payload.error || "Failed to remove member.");
      return;
    }

    setStatus("Member removed.");
    void loadData();
  };

  const sendInvite = async () => {
    const email = inviteEmail.trim();
    if (!email) {
      setStatus("Invite email is required.");
      return;
    }

    setIsInviting(true);
    const response = await fetch(`/api/workspaces/${workspaceId}/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role: inviteRole }),
    });

    setIsInviting(false);

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setStatus(payload.error || "Failed to send invite.");
      return;
    }

    const payload = (await response.json()) as {
      invite?: {
        inviteLink?: string;
        emailDelivery?: { delivered: boolean; provider: string; error?: string };
      };
    };

    setInviteLink(payload.invite?.inviteLink || "");
    setInviteEmail("");
    if (payload.invite?.emailDelivery?.delivered) {
      setStatus("Invite sent by email.");
      return;
    }

    const fallbackReason = payload.invite?.emailDelivery?.error;
    setStatus(
      fallbackReason
        ? `Invite generated. Email delivery fell back to manual sharing: ${fallbackReason}`
        : "Invite generated. Email provider not configured, use the link manually.",
    );
  };

  const deleteWorkspace = async () => {
    if (!confirm("Delete this workspace? This cannot be undone.")) {
      return;
    }

    const response = await fetch(`/api/workspaces/${workspaceId}`, { method: "DELETE" });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setStatus(payload.error || "Failed to delete workspace.");
      return;
    }

    window.location.href = "/";
  };

  if (loading) {
    return <p className="text-sm text-slate-600">Loading workspace settings...</p>;
  }

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-slate-300 bg-white/80 p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Workspace Settings</p>
        <h1 className="text-2xl font-bold text-slate-900">{workspaceName}</h1>
        <p className="text-sm text-slate-600">Your role: {role}</p>
      </header>

      <section className="rounded-2xl border border-slate-300 bg-white/80 p-4">
        <h2 className="text-lg font-semibold text-slate-900">Update Workspace Name</h2>
        <div className="mt-3 flex gap-2">
          <input
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            disabled={!canEditWorkspaceName}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          />
          <button
            type="button"
            onClick={() => void updateWorkspaceName()}
            disabled={!canEditWorkspaceName}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Save
          </button>
        </div>
        {!canEditWorkspaceName && (
          <p className="mt-2 text-xs text-slate-500">Only owner or admins can update workspace settings.</p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-300 bg-white/80 p-4">
        <h2 className="text-lg font-semibold text-slate-900">White-label Branding</h2>
        <p className="mt-1 text-sm text-slate-600">Customize logo, colors, domain, and brand name in meeting UI.</p>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="text-sm text-slate-700">
            Brand Name
            <input
              value={brandName}
              onChange={(event) => setBrandName(event.target.value)}
              disabled={!canEditWorkspaceName}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm text-slate-700">
            Logo URL
            <input
              value={logoUrl}
              onChange={(event) => setLogoUrl(event.target.value)}
              disabled={!canEditWorkspaceName}
              placeholder="/logo.png"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <div className="text-sm text-slate-700">
            Upload Logo
            <div className="mt-1 flex gap-2">
              <input
                type="file"
                accept="image/*"
                disabled={!canEditWorkspaceName}
                onChange={(event) => setLogoFile(event.target.files?.[0] || null)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => void uploadLogo()}
                disabled={!canEditWorkspaceName || !logoFile}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Upload
              </button>
            </div>
          </div>
          <label className="text-sm text-slate-700">
            Custom Meeting Domain
            <input
              value={customDomain}
              onChange={(event) => setCustomDomain(event.target.value)}
              disabled={!canEditWorkspaceName}
              placeholder="meet.company.com"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm text-slate-700">
              Primary Color
              <input
                type="color"
                value={primaryColor}
                onChange={(event) => setPrimaryColor(event.target.value)}
                disabled={!canEditWorkspaceName}
                className="mt-1 h-10 w-full rounded-xl border border-slate-300"
              />
            </label>
            <label className="text-sm text-slate-700">
              Secondary Color
              <input
                type="color"
                value={secondaryColor}
                onChange={(event) => setSecondaryColor(event.target.value)}
                disabled={!canEditWorkspaceName}
                className="mt-1 h-10 w-full rounded-xl border border-slate-300"
              />
            </label>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Custom meeting URL preview: {customDomain ? `https://${customDomain}/meeting/<meeting-id>` : "(set custom domain)"}
        </p>
      </section>

      <section className="rounded-2xl border border-slate-300 bg-white/80 p-4">
        <h2 className="text-lg font-semibold text-slate-900">Developer API Keys</h2>
        <p className="mt-1 text-sm text-slate-600">Use API keys with x-api-key for POST/GET/DELETE /api/meetings.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={newApiKeyName}
            onChange={(event) => setNewApiKeyName(event.target.value)}
            disabled={!canManageMembers}
            className="min-w-[220px] flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm"
            placeholder="API key name"
          />
          <button
            type="button"
            onClick={() => void generateApiKey()}
            disabled={!canManageMembers}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Generate API Key
          </button>
        </div>
        {newApiKey && (
          <p className="mt-2 break-all rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Copy this key now (shown once): <span className="font-mono">{newApiKey}</span>
          </p>
        )}

        <div className="mt-3 space-y-2">
          {apiKeys.map((key) => (
            <div key={key.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <div>
                <p className="font-medium text-slate-800">{key.name}</p>
                <p className="text-xs text-slate-600">
                  {key.keyPrefix} · Created {new Date(key.createdAt).toLocaleString()}
                  {key.lastUsedAt ? ` · Last used ${new Date(key.lastUsedAt).toLocaleString()}` : ""}
                </p>
              </div>
              {!key.revokedAt && (
                <button
                  type="button"
                  onClick={() => void revokeApiKey(key.id)}
                  disabled={!canManageMembers}
                  className="rounded-lg border border-rose-300 px-2 py-1 text-xs text-rose-700 disabled:opacity-50"
                >
                  Revoke
                </button>
              )}
            </div>
          ))}
          {apiKeys.length === 0 && <p className="text-xs text-slate-500">No API keys yet.</p>}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-300 bg-white/80 p-4">
        <h2 className="text-lg font-semibold text-slate-900">Manage Members</h2>
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-sm font-semibold text-slate-800">Invite Member</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="email"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              disabled={!canManageMembers || isInviting}
              placeholder="teammate@company.com"
              className="min-w-[220px] flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            />
            <select
              value={inviteRole}
              onChange={(event) => setInviteRole(event.target.value as "admin" | "member")}
              disabled={!canManageMembers || isInviting}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <button
              type="button"
              onClick={() => void sendInvite()}
              disabled={!canManageMembers || isInviting}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {isInviting ? "Sending..." : "Send Invite"}
            </button>
          </div>
          {inviteLink && (
            <p className="mt-2 break-all text-xs text-slate-600">
              Invite link: <span className="font-mono">{inviteLink}</span>
            </p>
          )}
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="py-2">Name</th>
                <th className="py-2">Email</th>
                <th className="py-2">Role</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.userId} className="border-b border-slate-100 text-slate-800">
                  <td className="py-2">{member.name}</td>
                  <td className="py-2">{member.email}</td>
                  <td className="py-2">{member.role}</td>
                  <td className="py-2">
                    <div className="flex gap-2">
                      {member.role !== "owner" && (
                        <>
                          <button
                            type="button"
                            disabled={!canManageMembers}
                            onClick={() => void changeRole(member.userId, member.role === "admin" ? "member" : "admin")}
                            className="rounded-lg border border-slate-300 px-2 py-1 text-xs disabled:opacity-50"
                          >
                            Set {member.role === "admin" ? "Member" : "Admin"}
                          </button>
                          <button
                            type="button"
                            disabled={!canManageMembers}
                            onClick={() => void removeMember(member.userId)}
                            className="rounded-lg border border-rose-300 px-2 py-1 text-xs text-rose-700 disabled:opacity-50"
                          >
                            Remove
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!canManageMembers && (
          <p className="mt-2 text-xs text-slate-500">Only owner or admins can manage members.</p>
        )}
      </section>

      <section className="rounded-2xl border border-rose-300 bg-rose-50 p-4">
        <h2 className="text-lg font-semibold text-rose-900">Delete Workspace</h2>
        <p className="mt-1 text-sm text-rose-700">This removes meetings, members, and invites for this workspace.</p>
        <button
          type="button"
          onClick={() => void deleteWorkspace()}
          disabled={!canDeleteWorkspace}
          className="mt-3 rounded-xl bg-rose-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Delete Workspace
        </button>
        {!canDeleteWorkspace && (
          <p className="mt-2 text-xs text-rose-700">Only workspace owner can delete this workspace.</p>
        )}
      </section>

      {status && <p className="text-sm text-slate-700">{status}</p>}

      <Link href="/" className="inline-block text-sm font-semibold text-cyan-700 underline">
        Back to home
      </Link>
    </div>
  );
}
