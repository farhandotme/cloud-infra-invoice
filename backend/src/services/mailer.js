import nodemailer from "nodemailer";

// Minimal SMTP sender (used for the portal authenticator reset code).
// Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and SMTP_FROM in .env.
let transport;
export const mailConfigured = () => Boolean(process.env.SMTP_HOST);

export async function sendMail({ to, subject, text }) {
  transport ||= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure:
      process.env.SMTP_SECURE != null
        ? process.env.SMTP_SECURE === "true"
        : Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || "" }
      : undefined,
    connectionTimeout: 10_000,
    socketTimeout: 15_000,
  });
  await transport.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
  });
}
