import type * as grpc from '@grpc/grpc-js';
import type { ISubscriptionService } from './interfaces/subscription.service.interface';
import { loadServiceDefinition } from '@/infrastructure/grpc/grpc-server';
import { toGrpcError } from '@/infrastructure/grpc/grpc-error.mapper';
import type {
  GetSubscriptionsQuery,
  SubscribeInput,
  UnsubscribeInput,
} from './subscription.schemas';
import {
  subscribeSchema,
  tokenSchema,
  getSubscriptionsQuerySchema,
} from './subscription.schemas';
import { appConfig } from '@/shared/config';
import { UnauthorizedError } from '@/shared/errors/app.errors';

type SubscribeRequest = SubscribeInput;
type TokenRequest = UnsubscribeInput;
type GetSubscriptionsRequest = GetSubscriptionsQuery;

export function getSubscriptionServiceDefinition(): grpc.ServiceDefinition {
  return loadServiceDefinition(
    'subscription.proto',
    'subscription',
    'SubscriptionService',
  );
}

function verifyApiKey(metadata: grpc.Metadata): void {
  if (!appConfig.apiKey) {
    return;
  }

  const keys = metadata.get('x-api-key');
  const key = keys.length > 0 ? keys[0].toString() : undefined;

  if (key !== appConfig.apiKey) {
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
): grpc.UntypedServiceImplementation {
  const subscribe = unaryHandler<SubscribeRequest, object>(async (call) => {
    verifyApiKey(call.metadata);
    const input = subscribeSchema.parse(call.request);
    await service.subscribe(input);

    return {};
  });

  const confirmSubscription = unaryHandler<TokenRequest, object>(
    async (call) => {
      verifyApiKey(call.metadata);
      const { token } = tokenSchema.parse(call.request);
      await service.confirm(token);

      return {};
    },
  );

  const unsubscribe = unaryHandler<TokenRequest, object>(async (call) => {
    verifyApiKey(call.metadata);
    const { token } = tokenSchema.parse(call.request);
    await service.unsubscribe(token);

    return {};
  });

  const getSubscriptions = unaryHandler<GetSubscriptionsRequest, object>(
    async (call) => {
      verifyApiKey(call.metadata);
      const { email } = getSubscriptionsQuerySchema.parse(call.request);
      const subscriptions = await service.getSubscriptionsByEmail(email);

      return { subscriptions };
    },
  );

  return { subscribe, confirmSubscription, unsubscribe, getSubscriptions };
}
