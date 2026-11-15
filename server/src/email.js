import nodemailer from 'nodemailer';
import { config } from './config.js';

let transport = null;
if (config.smtp.host) {
  transport = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
}

export const mailer = {
  /**
   * Sends an email. Without SMTP settings (development only — config refuses to start in
   * production without them) the message is printed to the server console instead.
   */
  async send({ to, subject, text }) {
    if (transport) {
      await transport.sendMail({ from: config.smtp.from, to, subject, text });
      return;
    }
    if (config.nodeEnv !== 'test') {
      console.log(`\n[email:dev] To: ${to}\nSubject: ${subject}\n\n${text}\n`);
    }
  },
};

export function verificationEmail(link, hours) {
  return {
    subject: 'Verify your CampusBazaar account',
    text:
      `Welcome to CampusBazaar!\n\n` +
      `Open this link to verify your university email and finish creating your account:\n${link}\n\n` +
      `The link expires in ${hours} hours. If you did not request this, you can ignore this email.`,
  };
}
