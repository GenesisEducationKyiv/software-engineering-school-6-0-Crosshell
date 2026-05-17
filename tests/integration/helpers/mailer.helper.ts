import nodemailer from 'nodemailer';
import { MailerService } from '@/modules/mailer/mailer.service';
import { NodemailerEmailTransport } from '@/modules/mailer/nodemailer-email-transport';

export function createTestMailer(): MailerService {
  const transporter = nodemailer.createTransport({ jsonTransport: true });
  return new MailerService(new NodemailerEmailTransport(transporter));
}
