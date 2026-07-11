import type { IMailerService } from '@/modules/mailer';
import type { ILogger } from '@/shared/logger/logger.interface';
import type {
  SagaCommandsQueue,
  SendConfirmationEmailCommand,
} from '@/modules/saga';

export class SagaCommandHandler {
  constructor(
    private readonly mailer: IMailerService,
    private readonly sagaCommandsQueue: SagaCommandsQueue,
    private readonly logger: ILogger,
  ) {}

  start(): void {
    this.sagaCommandsQueue.consumeCommands(async (command) => {
      if (command.type === 'SEND_CONFIRMATION_EMAIL') {
        await this.handleSendConfirmationEmail(command);
      }
    });
  }

  private async handleSendConfirmationEmail(
    command: SendConfirmationEmailCommand,
  ): Promise<void> {
    const { correlationId, payload } = command;
    try {
      await this.mailer.sendConfirmationEmail(
        payload.email,
        payload.confirmUrl,
        payload.unsubscribeUrl,
      );
    } catch (err) {
      this.logger.error(
        { err, correlationId },
        '[Saga] Failed to send confirmation email',
      );
      this.sagaCommandsQueue.publishReply({
        correlationId,
        type: 'SEND_CONFIRMATION_EMAIL_FAILURE',
        error: err instanceof Error ? err.message : String(err),
      });

      return;
    }

    this.sagaCommandsQueue.publishReply({
      correlationId,
      type: 'SEND_CONFIRMATION_EMAIL_SUCCESS',
    });
    this.logger.info({ correlationId }, '[Saga] Confirmation email sent');
  }
}
