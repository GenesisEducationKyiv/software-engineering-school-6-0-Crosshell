export interface SendMailOptions {
  from: string;
  to: string;
  subject: string;
  html: string;
}

export interface IEmailTransport {
  sendMail(options: SendMailOptions): Promise<void>;
}
