import nodemailer, { Transporter } from 'nodemailer';
import { mailerConfig } from '@/shared/config/mailer.config';
import { confirmationEmailHtml } from '@/modules/mailer/templates/confirmation.template';
import { releaseNotificationHtml } from '@/modules/mailer/templates/release-notification.template';

export class MailerService {
  private readonly transporter: Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: mailerConfig.host,
      port: mailerConfig.port,
      auth: {
        user: mailerConfig.user,
        pass: mailerConfig.pass,
      },
    });
  }

  async sendConfirmationEmail(to: string, confirmUrl: string): Promise<void> {
    await this.transporter.sendMail({
      from: mailerConfig.from,
      to,
      subject: 'Confirm your subscription | GitHub Release Notifier',
      html: confirmationEmailHtml(confirmUrl),
    });
  }

  async sendReleaseNotification(
    to: string,
    repo: string,
    tag: string,
    releaseUrl: string,
    unsubscribeUrl: string,
  ): Promise<void> {
    await this.transporter.sendMail({
      from: mailerConfig.from,
      to,
      subject: `New release: ${repo} ${tag}`,
      html: releaseNotificationHtml(repo, tag, releaseUrl, unsubscribeUrl),
    });
  }
}
