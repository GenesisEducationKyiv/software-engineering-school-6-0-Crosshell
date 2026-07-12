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
