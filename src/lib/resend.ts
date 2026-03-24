import { Resend } from 'resend'

function getResend() {
  return new Resend(process.env.RESEND_API_KEY!)
}

export async function sendReportReadyEmail({
  to,
  orgName,
  reportMonth,
  downloadUrl,
}: {
  to: string
  orgName: string
  reportMonth: string   // e.g. "January 2024"
  downloadUrl: string
}) {
  return getResend().emails.send({
    from: `CFO Assistant <reports@${process.env.RESEND_DOMAIN}>`,
    to,
    subject: `Your ${reportMonth} management pack is ready`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 16px;color:#1e293b;">
        <h1 style="font-size:1.5rem;font-weight:700;margin-bottom:8px;">Your pack is ready</h1>
        <p style="color:#475569;margin-bottom:24px;">
          Hi ${orgName}, your <strong>${reportMonth}</strong> management pack has been generated.
        </p>
        <a href="${downloadUrl}"
           style="display:inline-block;background:#0f766e;color:#fff;font-weight:600;
                  padding:12px 28px;border-radius:8px;text-decoration:none;">
          Download PDF Pack
        </a>
        <p style="font-size:0.75rem;color:#94a3b8;margin-top:32px;">
          This link expires in 24 hours. If you didn't request this, ignore this email.
        </p>
      </div>
    `,
  })
}

export async function sendPaymentFailedEmail({
  to,
  orgName,
  retryUrl,
}: {
  to: string
  orgName: string
  retryUrl: string
}) {
  return getResend().emails.send({
    from: `CFO Assistant <billing@${process.env.RESEND_DOMAIN}>`,
    to,
    subject: `Action required: payment failed for CFO Assistant`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 16px;color:#1e293b;">
        <h1 style="font-size:1.5rem;font-weight:700;margin-bottom:8px;color:#dc2626;">Payment failed</h1>
        <p style="color:#475569;margin-bottom:8px;">
          Hi ${orgName}, we were unable to process your last payment for CFO Assistant.
        </p>
        <p style="color:#475569;margin-bottom:24px;">
          Please update your payment method to keep access to your account.
        </p>
        <a href="${retryUrl}"
           style="display:inline-block;background:#dc2626;color:#fff;font-weight:600;
                  padding:12px 28px;border-radius:8px;text-decoration:none;">
          Update payment method
        </a>
        <p style="font-size:0.75rem;color:#94a3b8;margin-top:32px;">
          If you have already resolved this, ignore this email.
        </p>
      </div>
    `,
  })
}

export async function sendWelcomeEmail({
  to,
  orgName,
}: {
  to: string
  orgName: string
}) {
  return getResend().emails.send({
    from: `CFO Assistant <hello@${process.env.RESEND_DOMAIN}>`,
    to,
    subject: 'Welcome to CFO Assistant — your first report is on us',
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 16px;color:#1e293b;">
        <h1 style="font-size:1.5rem;font-weight:700;margin-bottom:8px;">Welcome, ${orgName}!</h1>
        <p style="color:#475569;margin-bottom:24px;">
          Upload your first bank statement and P&amp;L and we'll generate your management pack in under 2 minutes.
        </p>
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/upload"
           style="display:inline-block;background:#0f766e;color:#fff;font-weight:600;
                  padding:12px 28px;border-radius:8px;text-decoration:none;">
          Upload your first files
        </a>
      </div>
    `,
  })
}
