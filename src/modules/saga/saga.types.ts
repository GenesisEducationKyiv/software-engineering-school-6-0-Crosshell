export type SagaStatus =
  | 'SUBSCRIPTION_CREATED'
  | 'AWAITING_EMAIL'
  | 'COMPLETED'
  | 'COMPENSATING'
  | 'COMPENSATED';

export type SubscribeSagaPayload = {
  subscriptionId: string;
  email: string;
  confirmUrl: string;
  unsubscribeUrl: string;
};

export type CreateSagaInstanceData = {
  correlationId: string;
  type: string;
  status: SagaStatus;
  payload: SubscribeSagaPayload;
};

export type SagaInstance = {
  id: string;
  correlationId: string;
  type: string;
  status: SagaStatus;
  payload: SubscribeSagaPayload;
  createdAt: Date;
  updatedAt: Date;
};
