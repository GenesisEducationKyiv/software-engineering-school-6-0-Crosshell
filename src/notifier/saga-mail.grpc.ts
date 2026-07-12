import type * as grpc from '@grpc/grpc-js';
import { z } from 'zod';
import {
  SagaMailServiceService,
  type SendConfirmationEmailRequest,
  type SendConfirmationEmailResponse,
} from '@/generated/saga/v1/saga';
import { toGrpcError } from '@/infrastructure/grpc/grpc-error.mapper';
import type { IMailerService } from '@/modules/mailer';
import type { ILogger } from '@/shared/logger/logger.interface';

const sendConfirmationEmailSchema = z.object({
  email: z.email(),
  confirmUrl: z.url(),
  unsubscribeUrl: z.url(),
});

function unaryHandler<Req, Res extends object>(
  fn: (call: grpc.ServerUnaryCall<Req, Res>) => Promise<Res>,
): grpc.handleUnaryCall<Req, Res> {
  return (call, callback) => {
    void fn(call).then(
      (result) => callback(null, result),
      (err: unknown) => callback(toGrpcError(err)),
    );
  };
}

export function getSagaMailServiceDefinition(): grpc.ServiceDefinition {
  return SagaMailServiceService;
}

export function createSagaMailGrpcHandlers(
  mailer: IMailerService,
  logger: ILogger,
): grpc.UntypedServiceImplementation {
  const sendConfirmationEmail = unaryHandler<
    SendConfirmationEmailRequest,
    SendConfirmationEmailResponse
  >(async (call) => {
    const { email, confirmUrl, unsubscribeUrl } =
      sendConfirmationEmailSchema.parse(call.request);

    try {
      await mailer.sendConfirmationEmail(email, confirmUrl, unsubscribeUrl);
    } catch (err) {
      logger.error({ err }, '[SagaMail] Failed to send confirmation email');
      throw err;
    }

    logger.info('[SagaMail] Confirmation email sent');

    return {};
  });

  return { sendConfirmationEmail };
}
