export interface IMailerService {
  sendConfirmationEmail(
    to: string,
    confirmUrl: string,
    unsubscribeUrl: string,
  ): Promise<void>;
  sendReleaseNotification(
    to: string,
    repo: string,
    tag: string,
    releaseUrl: string,
    unsubscribeUrl: string,
  ): Promise<void>;
}
