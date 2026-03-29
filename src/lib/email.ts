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
