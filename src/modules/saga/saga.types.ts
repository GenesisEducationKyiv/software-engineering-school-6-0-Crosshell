export type SagaStatus =
  | 'SUBSCRIPTION_CREATED'
  | 'AWAITING_EMAIL'
  | 'COMPLETED'
  | 'COMPENSATING'
  | 'COMPENSATED';

export type SendConfirmationEmailCommand = {
  type: 'SEND_CONFIRMATION_EMAIL';
  correlationId: string;
  payload: {
    email: string;
    confirmUrl: string;
    unsubscribeUrl: string;
  };
};

export type SagaCommand = SendConfirmationEmailCommand;

export type SagaReply =
  | { correlationId: string; type: 'SEND_CONFIRMATION_EMAIL_SUCCESS' }
  | {
      correlationId: string;
      type: 'SEND_CONFIRMATION_EMAIL_FAILURE';
      error: string;
    };

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
