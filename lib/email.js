import nodemailer from "nodemailer";

// Outgoing email over SMTP. Works with any SMTP provider, including a free
// Gmail account with an App Password:
//   SMTP_HOST=smtp.gmail.com  SMTP_PORT=465  SMTP_USER=you@gmail.com
//   SMTP_PASS=<16-character app password>  EMAIL_FROM="SmartSell <you@gmail.com>"

export function isEmailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

let transport = null;
function getTransport() {
  if (!transport) {
    const port = Number(process.env.SMTP_PORT || 465);
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465, // 465 = TLS from the start; 587 upgrades with STARTTLS
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      // Never read local files or fetch URLs while building a message.
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  }
  return transport;
}

// Sends one plain message. Throws if sending fails.
export async function sendEmail({ to, subject, text, html }) {
  if (!isEmailConfigured()) throw Object.assign(new Error("Email is not configured"), { code: "EMAIL_NOT_CONFIGURED" });
  await getTransport().sendMail({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
    html,
  });
}
