type SendWorkspaceInviteEmailParams = {
  toEmail: string;
  workspaceName: string;
  inviterName: string;
  inviteLink: string;
};

type InviteEmailDeliveryResult = {
  delivered: boolean;
  provider: "resend" | "log";
  error?: string;
};

function logInviteFallback(params: SendWorkspaceInviteEmailParams, error?: string): InviteEmailDeliveryResult {
  console.info("Workspace invite email (log fallback)", {
    to: params.toEmail,
    workspace: params.workspaceName,
    inviteLink: params.inviteLink,
    inviter: params.inviterName,
    error,
  });

  return {
    delivered: false,
    provider: "log",
    ...(error ? { error } : {}),
  };
}

export async function sendWorkspaceInviteEmail(
  params: SendWorkspaceInviteEmailParams,
): Promise<InviteEmailDeliveryResult> {
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.INVITE_EMAIL_FROM;

  if (!resendApiKey || !fromAddress) {
    return logInviteFallback(params, "Invite email provider not configured.");
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [params.toEmail],
        subject: `${params.inviterName} invited you to ${params.workspaceName}`,
        html: `<p>You were invited to join <strong>${params.workspaceName}</strong>.</p><p><a href="${params.inviteLink}">Accept invite</a></p>`,
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      return logInviteFallback(params, `Failed to send invite email: ${details}`);
    }

    return { delivered: true, provider: "resend" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown invite email error";
    return logInviteFallback(params, message);
  }
}

  // ──────────────────────────────────────────────────────────────────────────────
  // New device login alert
  // ──────────────────────────────────────────────────────────────────────────────

  type NewDeviceLoginEmailParams = {
    toEmail: string;
    username: string;
    ipAddress: string | null;
    browserName: string | null;
    osName: string | null;
    deviceType: string;
    loginTime: Date;
    sessionsUrl: string;
  };

  export async function sendNewDeviceLoginEmail(params: NewDeviceLoginEmailParams): Promise<void> {
    const resendApiKey = process.env.RESEND_API_KEY;
    const fromAddress = process.env.INVITE_EMAIL_FROM;

    const deviceLabel = [params.browserName, params.osName, params.deviceType !== "unknown" ? params.deviceType : null]
      .filter(Boolean)
      .join(" · ") || "Unknown device";

    const body = `
      <h2>New device login detected</h2>
      <p>Hi ${params.username},</p>
      <p>A new login was detected on your account from a device we haven't seen before.</p>
      <table style="border-collapse:collapse;font-size:14px">
        <tr><td style="padding:4px 12px 4px 0;color:#5f6368">Device</td><td><strong>${deviceLabel}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#5f6368">IP Address</td><td><strong>${params.ipAddress ?? "Unknown"}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#5f6368">Time</td><td><strong>${params.loginTime.toUTCString()}</strong></td></tr>
      </table>
      <p>If this was you, no action is needed.</p>
      <p>If you don't recognise this activity, <a href="${params.sessionsUrl}">review and remove active sessions</a> immediately and change your password.</p>
    `;

    if (!resendApiKey || !fromAddress) {
      console.info("[email] new-device login (log fallback)", {
        to: params.toEmail,
        device: deviceLabel,
        ip: params.ipAddress,
      });
      return;
    }

    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [params.toEmail],
          subject: `New login from ${deviceLabel} — secure your account if this wasn't you`,
          html: body,
        }),
      });
    } catch {
      // Non-blocking — never fail a login because of email.
    }
  }
