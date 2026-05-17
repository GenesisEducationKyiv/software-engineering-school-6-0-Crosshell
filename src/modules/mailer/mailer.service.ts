import { mailerConfig } from '@/shared/config';
import { confirmationEmailHtml } from '@/modules/mailer/templates/confirmation.template';
import { releaseNotificationHtml } from '@/modules/mailer/templates/release-notification.template';
import type { IMailerService } from './interfaces/mailer.service.interface';
import type { IEmailTransport } from './interfaces/email-transport.interface';

export class MailerService implements IMailerService {
  constructor(private readonly transport: IEmailTransport) {}

  async sendConfirmationEmail(to: string, confirmUrl: string): Promise<void> {
    await this.transport.sendMail({
      from: mailerConfig.from,
      to,
      subject: 'Confirm your subscription',
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
    await this.transport.sendMail({
      from: mailerConfig.from,
      to,
      subject: `New release: ${repo} ${tag}`,
      html: releaseNotificationHtml(repo, tag, releaseUrl, unsubscribeUrl),
    });
  }
}
