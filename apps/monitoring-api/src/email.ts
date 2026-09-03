import nodemailer from "nodemailer";
import { config, smtpConfigured } from "./config";

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter() {
  if (!smtpConfigured) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    });
  }
  return transporter;
}

export async function sendAlertEmail(subject: string, text: string) {
  const t = getTransporter();
  if (!t) {
    console.warn(`[email] SMTP not configured, skipping alert: ${subject}`);
    return;
  }
  try {
    await t.sendMail({
      from: config.smtp.user,
      to: config.smtp.alertTo,
      subject: `[sarmad.tech] ${subject}`,
      text,
    });
  } catch (err) {
    console.error("[email] failed to send alert", err);
  }
}
