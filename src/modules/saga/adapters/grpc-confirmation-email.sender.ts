import * as grpc from '@grpc/grpc-js';
import {
  SagaMailServiceClient,
  type SendConfirmationEmailResponse,
} from '@/generated/saga/v1/saga';
import type {
  IConfirmationEmailSender,
  SendConfirmationEmailInput,
} from '../interfaces/confirmation-email-sender.interface';
import type { Closeable } from '@/shared/lifecycle/graceful-shutdown';

export class GrpcConfirmationEmailSender
  implements IConfirmationEmailSender, Closeable
{
  private readonly client: SagaMailServiceClient;

  constructor(
    address: string,
    private readonly deadlineMs: number,
  ) {
    this.client = new SagaMailServiceClient(
      address,
      grpc.credentials.createInsecure(),
    );
  }

  send(input: SendConfirmationEmailInput): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.sendConfirmationEmail(
        {
          correlationId: input.correlationId,
          email: input.email,
          confirmUrl: input.confirmUrl,
          unsubscribeUrl: input.unsubscribeUrl,
        },
        new grpc.Metadata(),
        { deadline: Date.now() + this.deadlineMs },
        (
          err: grpc.ServiceError | null,
          _response: SendConfirmationEmailResponse,
        ) => {
          if (err) {
            return reject(err);
          }

          resolve();
        },
      );
    });
  }

  close(): Promise<void> {
    this.client.close();

    return Promise.resolve();
  }
}
