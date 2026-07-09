export interface SendConfirmationEmailInput {
  correlationId: string;
  email: string;
  confirmUrl: string;
  unsubscribeUrl: string;
}

export interface IConfirmationEmailSender {
  send(input: SendConfirmationEmailInput): Promise<void>;
}
