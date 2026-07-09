import type * as grpc from '@grpc/grpc-js';
import {
  SubscriptionServiceService,
  type SubscribeRequest,
  type SubscribeResponse,
  type ConfirmSubscriptionRequest,
  type ConfirmSubscriptionResponse,
  type UnsubscribeRequest,
  type UnsubscribeResponse,
  type GetSubscriptionsRequest,
  type GetSubscriptionsResponse,
} from '@/generated/subscription/v1/subscription';
import type { ISubscriptionService } from './interfaces/subscription.service.interface';
import { toGrpcError } from '@/infrastructure/grpc/grpc-error.mapper';
import {
  subscribeSchema,
  tokenSchema,
  getSubscriptionsQuerySchema,
} from './subscription.schemas';
import { UnauthorizedError } from '@/shared/errors/app.errors';
import type { SubscribeSagaOrchestrator } from '@/modules/saga';

export function getSubscriptionServiceDefinition(): grpc.ServiceDefinition {
  return SubscriptionServiceService as unknown as grpc.ServiceDefinition;
}

function verifyApiKey(metadata: grpc.Metadata, apiKey?: string): void {
  if (!apiKey) {
    return;
  }

  const keys = metadata.get('x-api-key');
  const key = keys.length > 0 ? keys[0].toString() : undefined;

  if (key !== apiKey) {
    throw new UnauthorizedError();
  }
}

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

export function createSubscriptionGrpcHandlers(
  service: ISubscriptionService,
  orchestrator: SubscribeSagaOrchestrator,
  apiKey?: string,
): grpc.UntypedServiceImplementation {
  const subscribe = unaryHandler<SubscribeRequest, SubscribeResponse>(
    async (call) => {
      verifyApiKey(call.metadata, apiKey);
      const input = subscribeSchema.parse(call.request);
      await orchestrator.execute(input);

      return {};
    },
  );

  const confirmSubscription = unaryHandler<
    ConfirmSubscriptionRequest,
    ConfirmSubscriptionResponse
  >(async (call) => {
    verifyApiKey(call.metadata, apiKey);
    const { token } = tokenSchema.parse(call.request);
    await service.confirm(token);

    return {};
  });

  const unsubscribe = unaryHandler<UnsubscribeRequest, UnsubscribeResponse>(
    async (call) => {
      verifyApiKey(call.metadata, apiKey);
      const { token } = tokenSchema.parse(call.request);
      await service.unsubscribe(token);

      return {};
    },
  );

  const getSubscriptions = unaryHandler<
    GetSubscriptionsRequest,
    GetSubscriptionsResponse
  >(async (call) => {
    verifyApiKey(call.metadata, apiKey);
    const { email } = getSubscriptionsQuerySchema.parse(call.request);
    const subscriptions = await service.getSubscriptionsByEmail(email);

    return {
      subscriptions: subscriptions.map((s) => ({
        email: s.email,
        repo: `${s.owner}/${s.repo}`,
        confirmed: s.confirmed,
        lastSeenTag: s.lastSeenTag ?? '',
      })),
    };
  });

  return { subscribe, confirmSubscription, unsubscribe, getSubscriptions };
}
