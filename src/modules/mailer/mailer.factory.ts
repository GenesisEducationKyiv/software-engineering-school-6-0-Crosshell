import nodemailer from 'nodemailer';
import { mailerConfig } from '@/shared/config/mailer.config';
import { MailerService } from './mailer.service';
import { NodemailerEmailTransport } from './nodemailer-email-transport';

export function createMailerService(): MailerService {
  const transporter = nodemailer.createTransport({
    host: mailerConfig.host,
    port: mailerConfig.port,
    auth: {
      user: mailerConfig.user,
      pass: mailerConfig.pass,
    },
  });

  return new MailerService(new NodemailerEmailTransport(transporter), {
    from: mailerConfig.from,
  });
}
