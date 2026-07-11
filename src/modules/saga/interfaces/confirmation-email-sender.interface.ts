export interface SendConfirmationEmailInput {
  correlationId: string;
  email: string;
  confirmUrl: string;
  unsubscribeUrl: string;
}

export interface IConfirmationEmailSender {
  send(input: SendConfirmationEmailInput): Promise<void>;
}

export class AmbiguousConfirmationEmailError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AmbiguousConfirmationEmailError';
  }
}
