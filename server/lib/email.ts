type SendWorkspaceInviteEmailParams = {
  toEmail: string;
  workspaceName: string;
  inviterName: string;
  inviteLink: string;
};

export async function sendWorkspaceInviteEmail(
  params: SendWorkspaceInviteEmailParams,
): Promise<{ delivered: boolean; provider: "resend" | "log" }> {
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.INVITE_EMAIL_FROM;

  if (!resendApiKey || !fromAddress) {
    console.info("Workspace invite email (log fallback)", {
      to: params.toEmail,
      workspace: params.workspaceName,
      inviteLink: params.inviteLink,
      inviter: params.inviterName,
    });

    return { delivered: false, provider: "log" };
  }

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
    throw new Error(`Failed to send invite email: ${details}`);
  }

  return { delivered: true, provider: "resend" };
}
