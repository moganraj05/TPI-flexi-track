const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

// Two interchangeable providers, picked by EMAIL_PROVIDER:
//  - "gmail":  sends from a Gmail address over Gmail's SMTP (smtp.gmail.com,
//              port 465), authenticated with a Google App Password. No domain
//              setup needed; the From address is always that Gmail account.
//  - "resend": Resend's HTTPS API (https://resend.com/docs/api-reference/emails/send-email).
//              Needs a domain verified in Resend (DNS records added by IT),
//              and uses port 443 only, which corporate firewalls rarely block.
const SEND_TIMEOUT_MS = 10000;
const RESEND_URL = 'https://api.resend.com/emails';

class EmailNotConfiguredError extends Error {}

const provider = () => (process.env.EMAIL_PROVIDER || 'resend').trim().toLowerCase();

const isConfigured = () => {
  if (provider() === 'gmail') return !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
  return !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM_ADDRESS);
};

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Characters that would break a "Name <address>" header are stripped from
// the display name.
const senderName = () => (process.env.EMAIL_FROM_NAME || 'FlexiTrack').replace(/[<>"\r\n]/g, '').trim();

const withName = (address) => {
  const name = senderName();
  return name ? `${name} <${address}>` : address;
};

// One SMTP transport per process, reused for every email.
let gmailTransport = null;
const getGmailTransport = () => {
  if (!gmailTransport) {
    gmailTransport = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.GMAIL_USER,
        // Google shows App Passwords in groups of four ("abcd efgh ijkl mnop");
        // the spaces aren't part of the password.
        pass: String(process.env.GMAIL_APP_PASSWORD).replace(/\s+/g, ''),
      },
      connectionTimeout: SEND_TIMEOUT_MS,
      greetingTimeout: SEND_TIMEOUT_MS,
      socketTimeout: SEND_TIMEOUT_MS,
    });
  }
  return gmailTransport;
};

async function sendViaGmail({ to, subject, text, html }) {
  // Gmail always sends as the signed-in account, so From is GMAIL_USER.
  await getGmailTransport().sendMail({ from: withName(process.env.GMAIL_USER), to, subject, text, html });
}

async function sendViaResend({ to, subject, text, html }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const response = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ from: withName(process.env.EMAIL_FROM_ADDRESS), to: [to], subject, text, html }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Resend responded ${response.status}: ${detail.slice(0, 300)}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

// Throws on failure so callers can decide whether the email is essential
// (an OTP — the request must fail) or best-effort (an approval notice).
async function sendEmail(message) {
  if (!isConfigured()) {
    // Local development only: without provider credentials the message is
    // written to the server log so the flows can still be tested end to end.
    // Never in production — an OTP in a log file is a credential leak.
    if (process.env.NODE_ENV !== 'production') {
      logger.warn('email.dev_fallback', { to: message.to, subject: message.subject, body: message.text });
      return;
    }
    throw new EmailNotConfiguredError('Email service is not configured');
  }

  if (provider() === 'gmail') await sendViaGmail(message);
  else await sendViaResend(message);
  logger.info('email.sent', { provider: provider(), to: message.to, subject: message.subject });
}

// Shared shell so every FlexiTrack email looks the same: plain, no images,
// no tracking links — nothing for a spam filter to object to.
const layout = (title, bodyHtml) => `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f4f6f9;font-family:Segoe UI,Arial,sans-serif;color:#1f2a44">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:10px;padding:28px;border:1px solid #e3e7ee">
    <div style="font-size:18px;font-weight:700;margin-bottom:4px">FlexiTrack</div>
    <div style="font-size:13px;color:#5b6475;margin-bottom:20px">${escapeHtml(title)}</div>
    ${bodyHtml}
    <div style="font-size:12px;color:#8a93a3;margin-top:28px;border-top:1px solid #eef1f5;padding-top:14px">
      This is an automated message from FlexiTrack. Please do not reply.
    </div>
  </div>
</body></html>`;

const OTP_PURPOSE_TEXT = {
  register: { subject: 'Your FlexiTrack registration code', action: 'complete your FlexiTrack HR registration' },
  reset_password: { subject: 'Your FlexiTrack password reset code', action: 'reset your FlexiTrack password' },
};

function sendOtpEmail({ to, code, purpose, expiresInMinutes }) {
  const { subject, action } = OTP_PURPOSE_TEXT[purpose];
  const text =
    `Your FlexiTrack verification code is ${code}.\n\n` +
    `Use it to ${action}. It expires in ${expiresInMinutes} minutes and can be used once.\n\n` +
    `If you did not request this, you can ignore this email — nobody can use it without access to your inbox.`;
  const html = layout(
    subject,
    `<p style="font-size:14px;margin:0 0 16px">Use this code to ${escapeHtml(action)}:</p>
     <div style="font-size:32px;font-weight:800;letter-spacing:8px;text-align:center;background:#eef2f8;border-radius:8px;padding:16px 0;margin-bottom:16px">${escapeHtml(code)}</div>
     <p style="font-size:13px;color:#5b6475;margin:0">It expires in ${expiresInMinutes} minutes and can be used once.
     If you did not request this, you can safely ignore this email.</p>`
  );
  return sendEmail({ to, subject, text, html });
}

function sendRegistrationReceivedEmail({ to, name }) {
  const subject = 'FlexiTrack registration received';
  const text =
    `Hi ${name},\n\nYour FlexiTrack HR account has been created and is waiting for admin approval. ` +
    `You will receive another email once it is approved; you can sign in after that.`;
  const html = layout(
    subject,
    `<p style="font-size:14px;margin:0 0 12px">Hi ${escapeHtml(name)},</p>
     <p style="font-size:14px;margin:0">Your FlexiTrack HR account has been created and is <b>waiting for admin approval</b>.
     You will receive another email once it is approved; you can sign in after that.</p>`
  );
  return sendEmail({ to, subject, text, html });
}

function sendNewRegistrationAdminEmail({ to, applicant }) {
  const subject = 'New FlexiTrack HR registration awaiting approval';
  const lines = [
    `Name: ${applicant.name}`,
    `Employee ID: ${applicant.employeeId}`,
    `Email: ${applicant.email}`,
    `Phone: ${applicant.phone || '—'}`,
    `Plant: ${applicant.plant || '—'}`,
  ];
  const text = `A new HR account is waiting for approval.\n\n${lines.join('\n')}\n\nReview it in FlexiTrack under Settings → Manage HR logins.`;
  const html = layout(
    subject,
    `<p style="font-size:14px;margin:0 0 12px">A new HR account is waiting for approval:</p>
     <table style="font-size:13px;border-collapse:collapse">${lines
       .map((l) => {
         const [k, ...v] = l.split(': ');
         return `<tr><td style="padding:3px 12px 3px 0;color:#5b6475">${escapeHtml(k)}</td><td style="padding:3px 0;font-weight:600">${escapeHtml(v.join(': '))}</td></tr>`;
       })
       .join('')}</table>
     <p style="font-size:13px;color:#5b6475;margin:16px 0 0">Review it in FlexiTrack under <b>Settings → Manage HR logins</b>.</p>`
  );
  return sendEmail({ to, subject, text, html });
}

function sendApprovalEmail({ to, name }) {
  const subject = 'Your FlexiTrack account is approved';
  const text = `Hi ${name},\n\nYour FlexiTrack HR account has been approved. You can now sign in with your email and password.`;
  const html = layout(
    subject,
    `<p style="font-size:14px;margin:0 0 12px">Hi ${escapeHtml(name)},</p>
     <p style="font-size:14px;margin:0">Your FlexiTrack HR account has been <b>approved</b>. You can now sign in with your email and password.</p>`
  );
  return sendEmail({ to, subject, text, html });
}

function sendRejectionEmail({ to, name }) {
  const subject = 'Your FlexiTrack registration was not approved';
  const text =
    `Hi ${name},\n\nYour FlexiTrack HR registration was not approved. ` +
    `If you believe this is a mistake, please contact your FlexiTrack administrator.`;
  const html = layout(
    subject,
    `<p style="font-size:14px;margin:0 0 12px">Hi ${escapeHtml(name)},</p>
     <p style="font-size:14px;margin:0">Your FlexiTrack HR registration was <b>not approved</b>.
     If you believe this is a mistake, please contact your FlexiTrack administrator.</p>`
  );
  return sendEmail({ to, subject, text, html });
}

function sendPasswordChangedEmail({ to, name }) {
  const subject = 'Your FlexiTrack password was changed';
  const text =
    `Hi ${name},\n\nThe password for your FlexiTrack account was just reset, and all existing sessions were signed out. ` +
    `If you did not do this, contact your FlexiTrack administrator immediately.`;
  const html = layout(
    subject,
    `<p style="font-size:14px;margin:0 0 12px">Hi ${escapeHtml(name)},</p>
     <p style="font-size:14px;margin:0">The password for your FlexiTrack account was just reset, and all existing sessions were signed out.
     If you did not do this, <b>contact your FlexiTrack administrator immediately</b>.</p>`
  );
  return sendEmail({ to, subject, text, html });
}

module.exports = {
  EmailNotConfiguredError,
  isConfigured,
  sendOtpEmail,
  sendRegistrationReceivedEmail,
  sendNewRegistrationAdminEmail,
  sendApprovalEmail,
  sendRejectionEmail,
  sendPasswordChangedEmail,
};
