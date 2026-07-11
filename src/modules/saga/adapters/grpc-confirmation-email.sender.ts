import * as grpc from '@grpc/grpc-js';
import {
  SagaMailServiceClient,
  type SendConfirmationEmailResponse,
} from '@/generated/saga/v1/saga';
import {
  AmbiguousConfirmationEmailError,
  type IConfirmationEmailSender,
  type SendConfirmationEmailInput,
} from '../interfaces/confirmation-email-sender.interface';
import type { Closeable } from '@/shared/lifecycle/graceful-shutdown';

// Codes where the server may have completed the send before the client gave
// up on the response — the request outcome is genuinely unknown, not failed.
const AMBIGUOUS_GRPC_STATUS_CODES: ReadonlySet<grpc.status> = new Set([
  grpc.status.DEADLINE_EXCEEDED,
  grpc.status.CANCELLED,
  grpc.status.UNAVAILABLE,
  grpc.status.UNKNOWN,
]);

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
            if (AMBIGUOUS_GRPC_STATUS_CODES.has(err.code)) {
              return reject(
                new AmbiguousConfirmationEmailError(
                  `Confirmation email outcome unknown (grpc code=${err.code}): ${err.message}`,
                  { cause: err },
                ),
              );
            }

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
