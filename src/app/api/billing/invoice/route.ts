import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { verifyAuthToken } from "@/src/lib/auth";
import { getWorkspaceInvoiceSnapshot } from "@/src/lib/billing";
import { getDbPool } from "@/src/lib/db";

async function assertWorkspaceMember(workspaceId: string, userId: string) {
  const pool = getDbPool();
  const result = await pool.query<{ can_access: boolean }>(
    `
    SELECT EXISTS (
      SELECT 1
      FROM workspaces w
      LEFT JOIN workspace_members wm
        ON wm.workspace_id = w.id
       AND wm.user_id = $2
      WHERE w.id = $1
        AND (w.owner_id = $2 OR wm.user_id = $2)
    ) AS can_access
    `,
    [workspaceId, userId],
  );

  return Boolean(result.rows[0]?.can_access);
}

function formatMoneyINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(value: string | null): string {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function invoiceNumber(seed: string): string {
  const compactDate = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const tail = seed.replace(/-/g, "").slice(-6).toUpperCase();
  return `OC-${compactDate}-${tail || "000000"}`;
}

export async function GET() {
  const token = (await cookies()).get("meeting_token")?.value;
  const auth = token ? verifyAuthToken(token) : null;

  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const canAccess = await assertWorkspaceMember(auth.workspaceId, auth.userId);
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const snapshot = await getWorkspaceInvoiceSnapshot(auth.workspaceId);
  const amount = snapshot.planPrice;
  const generatedAt = new Date();
  const invoiceNo = invoiceNumber(snapshot.subscriptionId || snapshot.workspaceId);
  const logoUrl = snapshot.logoUrl || "/logo.png";

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Office Connect Invoice</title>
<style>
  body { font-family: Arial, sans-serif; background:#f4f7fb; margin:0; padding:24px; color:#202124; }
  .invoice { max-width:840px; margin:0 auto; background:#fff; border:1px solid #d7e4f8; border-radius:14px; overflow:hidden; }
  .head { display:flex; justify-content:space-between; align-items:center; padding:20px 24px; background:linear-gradient(180deg,#f7fbff,#eef5ff); border-bottom:1px solid #d7e4f8; }
  .brand { display:flex; align-items:center; gap:12px; }
  .brand img { width:54px; height:54px; border-radius:10px; border:1px solid #d3e3fd; background:#fff; object-fit:contain; padding:4px; }
  .muted { color:#5f6368; font-size:12px; }
  .section { padding:20px 24px; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  .card { border:1px solid #e2ebfb; border-radius:10px; padding:12px; background:#fafcff; }
  table { width:100%; border-collapse:collapse; margin-top:8px; }
  th, td { border-bottom:1px solid #e9eef9; text-align:left; padding:10px 6px; font-size:14px; }
  th { color:#1a73e8; background:#f4f8ff; }
  .total { text-align:right; font-size:18px; font-weight:700; margin-top:10px; }
  .footer { padding:16px 24px; border-top:1px solid #e9eef9; font-size:12px; color:#5f6368; }
  @media print { body { background:#fff; padding:0; } .invoice { border:none; border-radius:0; } }
</style>
</head>
<body>
  <div class="invoice">
    <div class="head">
      <div class="brand">
        <img src="${logoUrl}" alt="Office Connect logo" />
        <div>
          <div style="font-size:20px;font-weight:700;">${snapshot.brandName || "Office Connect"}</div>
          <div class="muted">Standard Subscription Invoice</div>
        </div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:18px;font-weight:700;">INVOICE</div>
        <div class="muted">No: ${invoiceNo}</div>
        <div class="muted">Date: ${generatedAt.toLocaleDateString("en-IN")}</div>
      </div>
    </div>

    <div class="section grid">
      <div class="card">
        <div style="font-weight:700;margin-bottom:6px;">Billed To</div>
        <div>${snapshot.workspaceName}</div>
        <div class="muted">Workspace ID: ${snapshot.workspaceId}</div>
        <div class="muted">Billing user: ${auth.username}</div>
      </div>
      <div class="card">
        <div style="font-weight:700;margin-bottom:6px;">Subscription</div>
        <div>Status: ${snapshot.subscriptionStatus || "active"}</div>
        <div class="muted">Start: ${formatDate(snapshot.subscriptionStartDate)}</div>
        <div class="muted">End: ${formatDate(snapshot.subscriptionEndDate)}</div>
        <div class="muted">Payment Ref: ${snapshot.razorpayPaymentId || "N/A"}</div>
      </div>
    </div>

    <div class="section">
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th>Plan</th>
            <th>Qty</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Office Connect monthly plan</td>
            <td>${snapshot.planName}</td>
            <td>1</td>
            <td>${formatMoneyINR(amount)}</td>
          </tr>
        </tbody>
      </table>
      <div class="total">Total: ${formatMoneyINR(amount)}</div>
    </div>

    <div class="footer">
      This is a system-generated invoice for Office Connect standard billing.
      Use browser Print/Save as PDF for records.
    </div>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
