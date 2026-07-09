import nodemailer from 'nodemailer';
import { MailerService, NodemailerEmailTransport } from '@/modules/mailer';

export function createTestMailer(): MailerService {
  const transporter = nodemailer.createTransport({ jsonTransport: true });

  return new MailerService(new NodemailerEmailTransport(transporter), {
    from: 'noreply@example.com',
  });
}
