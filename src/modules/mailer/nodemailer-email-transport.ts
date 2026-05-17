import type { Transporter } from 'nodemailer';
import type {
  IEmailTransport,
  SendMailOptions,
} from './interfaces/email-transport.interface';

export class NodemailerEmailTransport implements IEmailTransport {
  constructor(private readonly transporter: Transporter) {}

  async sendMail(options: SendMailOptions): Promise<void> {
    await this.transporter.sendMail(options);
  }
}
