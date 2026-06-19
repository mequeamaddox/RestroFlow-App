import { sendEmail } from './email';

const FROM = process.env.FROM_EMAIL || 'noreply@restroflowsolutions.com';
const APP_URL = process.env.APP_URL || 'https://restroflowsolutions.com';

// ─── Welcome email (sent on subscription creation) ────────────────────────────

export async function sendWelcomeEmail(email: string, firstName?: string): Promise<void> {
  const name = firstName || 'there';
  await sendEmail({
    to: email,
    from: FROM,
    subject: "Welcome to RestroFlow — you're all set!",
    text: `Hi ${name},\n\nYour RestroFlow account is active. Head to ${APP_URL} to start managing your inventory, recipes, and costs.\n\nThe RestroFlow Team`,
    html: `
<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;margin-top:32px;box-shadow:0 2px 8px rgba(0,0,0,.08);">
  <div style="background:linear-gradient(135deg,#f97316,#dc2626);padding:40px 32px;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:28px;font-weight:700;">Welcome to RestroFlow 🍽️</h1>
    <p style="color:rgba(255,255,255,.9);margin:12px 0 0;font-size:16px;">Your restaurant management platform is ready</p>
  </div>
  <div style="padding:40px 32px;">
    <p style="font-size:16px;color:#374151;margin:0 0 24px;">Hi ${name},</p>
    <p style="font-size:15px;color:#4b5563;line-height:1.6;margin:0 0 24px;">Your RestroFlow subscription is now active. Here's what you can do right away:</p>
    <ul style="padding-left:20px;color:#4b5563;font-size:15px;line-height:2;">
      <li>Add your inventory items and set par levels</li>
      <li>Build recipes and track food cost %</li>
      <li>Connect your POS for automatic sales sync</li>
      <li>Invite your team via HR → Invitations</li>
    </ul>
    <div style="text-align:center;margin:32px 0;">
      <a href="${APP_URL}" style="display:inline-block;background:#f97316;color:#fff;text-decoration:none;padding:14px 32px;border-radius:6px;font-weight:600;font-size:16px;">Go to Dashboard →</a>
    </div>
    <p style="font-size:14px;color:#6b7280;margin:0;">Need help? Reply to this email or visit our support docs.</p>
  </div>
  <div style="background:#f8fafc;padding:24px 32px;text-align:center;border-top:1px solid #e5e7eb;">
    <p style="margin:0;font-size:13px;color:#9ca3af;">RestroFlow · Restaurant Management Made Simple</p>
  </div>
</div>
</body></html>`,
  });
}

// ─── Invoice receipt (sent on invoice.paid) ────────────────────────────────────

interface InvoiceReceiptData {
  invoiceNumber: string;
  amountPaid: number;
  currency: string;
  periodStart: Date;
  periodEnd: Date;
  invoiceUrl?: string;
  plan?: string;
}

export async function sendInvoiceReceiptEmail(email: string, data: InvoiceReceiptData): Promise<void> {
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const amount = new Intl.NumberFormat('en-US', { style: 'currency', currency: data.currency.toUpperCase() }).format(data.amountPaid);
  const plan = data.plan ? data.plan.charAt(0).toUpperCase() + data.plan.slice(1) : 'RestroFlow';

  await sendEmail({
    to: email,
    from: FROM,
    subject: `RestroFlow invoice receipt — ${amount}`,
    text: `Payment received\n\nAmount: ${amount}\nPlan: ${plan}\nPeriod: ${fmt(data.periodStart)} – ${fmt(data.periodEnd)}\nInvoice: ${data.invoiceNumber}\n\n${data.invoiceUrl ? `View invoice: ${data.invoiceUrl}\n\n` : ''}Thank you for being a RestroFlow subscriber.\n\nThe RestroFlow Team`,
    html: `
<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
  <div style="background:#0f172a;padding:32px;text-align:center;">
    <h1 style="color:#f97316;margin:0;font-size:22px;font-weight:700;">RestroFlow</h1>
    <p style="color:#94a3b8;margin:8px 0 0;font-size:14px;">Payment receipt</p>
  </div>
  <div style="padding:40px 32px;">
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px 24px;margin-bottom:32px;display:flex;align-items:center;gap:12px;">
      <span style="font-size:24px;">✅</span>
      <div>
        <p style="margin:0;font-weight:600;color:#166534;font-size:15px;">Payment successful</p>
        <p style="margin:4px 0 0;color:#15803d;font-size:24px;font-weight:700;">${amount}</p>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr style="border-bottom:1px solid #f1f5f9;">
        <td style="padding:12px 0;color:#6b7280;">Invoice number</td>
        <td style="padding:12px 0;color:#111827;text-align:right;font-family:monospace;">${data.invoiceNumber}</td>
      </tr>
      <tr style="border-bottom:1px solid #f1f5f9;">
        <td style="padding:12px 0;color:#6b7280;">Plan</td>
        <td style="padding:12px 0;color:#111827;text-align:right;">${plan}</td>
      </tr>
      <tr style="border-bottom:1px solid #f1f5f9;">
        <td style="padding:12px 0;color:#6b7280;">Billing period</td>
        <td style="padding:12px 0;color:#111827;text-align:right;">${fmt(data.periodStart)} – ${fmt(data.periodEnd)}</td>
      </tr>
      <tr>
        <td style="padding:12px 0;color:#6b7280;">Amount charged</td>
        <td style="padding:12px 0;color:#111827;font-weight:600;text-align:right;">${amount}</td>
      </tr>
    </table>
    ${data.invoiceUrl ? `<div style="text-align:center;margin-top:32px;"><a href="${data.invoiceUrl}" style="display:inline-block;background:#f97316;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;font-size:14px;">View / Download Invoice →</a></div>` : ''}
  </div>
  <div style="background:#f8fafc;padding:24px 32px;text-align:center;border-top:1px solid #e5e7eb;">
    <p style="margin:0;font-size:13px;color:#9ca3af;">Questions about this charge? Contact <a href="mailto:support@restroflowsolutions.com" style="color:#f97316;">support@restroflowsolutions.com</a></p>
  </div>
</div>
</body></html>`,
  });
}

// ─── Weekly cost digest ────────────────────────────────────────────────────────

interface WeeklyDigestData {
  locationName: string;
  weekLabel: string; // e.g. "Jun 9 – Jun 15"
  totalInventoryValue: number;
  weeklyRevenue: number;
  weeklyCogs: number;
  weeklyWasteCost: number;
  foodCostPct: number;
  wastePct: number;
  lowStockCount: number;
  topWasteItems: { name: string; cost: number }[];
}

export async function sendWeeklyCostDigest(email: string, data: WeeklyDigestData): Promise<void> {
  const fmt$ = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
  const fmtPct = (n: number) => `${n.toFixed(1)}%`;

  const wasteRows = data.topWasteItems.slice(0, 5).map(item =>
    `<tr style="border-bottom:1px solid #f1f5f9;">
      <td style="padding:10px 0;color:#374151;font-size:14px;">${item.name}</td>
      <td style="padding:10px 0;color:#dc2626;font-weight:600;font-size:14px;text-align:right;">${fmt$(item.cost)}</td>
    </tr>`
  ).join('');

  const foodCostColor = data.foodCostPct > 35 ? '#dc2626' : data.foodCostPct > 28 ? '#d97706' : '#16a34a';
  const wasteColor = data.wastePct > 5 ? '#dc2626' : data.wastePct > 2 ? '#d97706' : '#16a34a';

  await sendEmail({
    to: email,
    from: FROM,
    subject: `📊 Weekly Cost Digest — ${data.locationName} (${data.weekLabel})`,
    text: `Weekly Cost Digest: ${data.locationName}\n${data.weekLabel}\n\nRevenue: ${fmt$(data.weeklyRevenue)}\nFood Cost: ${fmtPct(data.foodCostPct)} (${fmt$(data.weeklyCogs)})\nWaste: ${fmtPct(data.wastePct)} (${fmt$(data.weeklyWasteCost)})\nInventory Value: ${fmt$(data.totalInventoryValue)}\nLow Stock Items: ${data.lowStockCount}\n\nTop Waste Items:\n${data.topWasteItems.slice(0,5).map(i => `  ${i.name}: ${fmt$(i.cost)}`).join('\n')}\n\nView full report: ${APP_URL}/analytics`,
    html: `
<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
  <div style="background:linear-gradient(135deg,#0f172a,#1e293b);padding:32px;text-align:center;">
    <p style="color:#f97316;margin:0 0 4px;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Weekly Cost Digest</p>
    <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;">${data.locationName}</h1>
    <p style="color:#64748b;margin:8px 0 0;font-size:14px;">${data.weekLabel}</p>
  </div>

  <!-- KPI cards -->
  <div style="padding:32px 32px 0;">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <div style="background:#f8fafc;border-radius:8px;padding:16px;">
        <p style="margin:0;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Revenue</p>
        <p style="margin:6px 0 0;font-size:22px;font-weight:700;color:#111827;">${fmt$(data.weeklyRevenue)}</p>
      </div>
      <div style="background:#f8fafc;border-radius:8px;padding:16px;">
        <p style="margin:0;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Inventory Value</p>
        <p style="margin:6px 0 0;font-size:22px;font-weight:700;color:#111827;">${fmt$(data.totalInventoryValue)}</p>
      </div>
      <div style="background:#f8fafc;border-radius:8px;padding:16px;">
        <p style="margin:0;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Food Cost %</p>
        <p style="margin:6px 0 0;font-size:22px;font-weight:700;color:${foodCostColor};">${fmtPct(data.foodCostPct)}</p>
        <p style="margin:2px 0 0;font-size:12px;color:#6b7280;">${fmt$(data.weeklyCogs)} COGS</p>
      </div>
      <div style="background:#f8fafc;border-radius:8px;padding:16px;">
        <p style="margin:0;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Waste %</p>
        <p style="margin:6px 0 0;font-size:22px;font-weight:700;color:${wasteColor};">${fmtPct(data.wastePct)}</p>
        <p style="margin:2px 0 0;font-size:12px;color:#6b7280;">${fmt$(data.weeklyWasteCost)} lost</p>
      </div>
    </div>
    ${data.lowStockCount > 0 ? `
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px 16px;margin-top:12px;display:flex;align-items:center;gap:10px;">
      <span style="font-size:18px;">⚠️</span>
      <p style="margin:0;color:#dc2626;font-size:14px;font-weight:600;">${data.lowStockCount} item${data.lowStockCount > 1 ? 's' : ''} below par level</p>
      <a href="${APP_URL}/inventory" style="margin-left:auto;color:#dc2626;font-size:13px;font-weight:600;text-decoration:none;">View →</a>
    </div>` : ''}
  </div>

  <!-- Top waste -->
  ${data.topWasteItems.length > 0 ? `
  <div style="padding:24px 32px 0;">
    <h2 style="font-size:15px;font-weight:600;color:#111827;margin:0 0 12px;">Top waste this week</h2>
    <table style="width:100%;border-collapse:collapse;">
      ${wasteRows}
    </table>
  </div>` : ''}

  <!-- CTA -->
  <div style="padding:32px;text-align:center;">
    <a href="${APP_URL}/analytics" style="display:inline-block;background:#f97316;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;font-size:14px;">View Full Analytics Report →</a>
  </div>

  <div style="background:#f8fafc;padding:20px 32px;text-align:center;border-top:1px solid #e5e7eb;">
    <p style="margin:0;font-size:12px;color:#9ca3af;">Sent every Monday · <a href="${APP_URL}/settings" style="color:#f97316;">Manage email preferences</a></p>
  </div>
</div>
</body></html>`,
  });
}
