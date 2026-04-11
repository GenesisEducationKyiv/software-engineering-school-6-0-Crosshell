import type * as grpc from '@grpc/grpc-js';
import type { SubscriptionService } from './subscription.service';
import { loadServiceDefinition } from '@/infrastructure/grpc/grpc-server';
import { toGrpcError } from '@/infrastructure/grpc/grpc-error.mapper';
import type {
  GetSubscriptionsQuery,
  SubscribeInput,
  UnsubscribeInput} from './subscription.schemas';
import {
  subscribeSchema,
  tokenSchema,
  getSubscriptionsQuerySchema,
} from './subscription.schemas';

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

export function createSubscriptionGrpcHandlers(
  service: SubscriptionService,
): grpc.UntypedServiceImplementation {
  const subscribe: grpc.handleUnaryCall<SubscribeRequest, object> = async (
    call,
    callback,
  ) => {
    try {
      const input = subscribeSchema.parse(call.request);
      await service.subscribe(input);
      callback(null, {});
    } catch (err) {
      callback(toGrpcError(err));
    }
  };

  const confirmSubscription: grpc.handleUnaryCall<
    TokenRequest,
    object
  > = async (call, callback) => {
    try {
      const { token } = tokenSchema.parse(call.request);
      await service.confirm(token);
      callback(null, {});
    } catch (err) {
      callback(toGrpcError(err));
    }
  };

  const unsubscribe: grpc.handleUnaryCall<TokenRequest, object> = async (
    call,
    callback,
  ) => {
    try {
      const { token } = tokenSchema.parse(call.request);
      await service.unsubscribe(token);
      callback(null, {});
    } catch (err) {
      callback(toGrpcError(err));
    }
  };

  const getSubscriptions: grpc.handleUnaryCall<
    GetSubscriptionsRequest,
    object
  > = async (call, callback) => {
    try {
      const { email } = getSubscriptionsQuerySchema.parse(call.request);
      const subscriptions = await service.getSubscriptionsByEmail(email);
      callback(null, { subscriptions });
    } catch (err) {
      callback(toGrpcError(err));
    }
  };

  return { subscribe, confirmSubscription, unsubscribe, getSubscriptions };
}
