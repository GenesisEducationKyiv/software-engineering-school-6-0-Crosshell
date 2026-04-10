import { z } from 'zod';
import { registerConfig } from './register-config';

export const mailerConfig = registerConfig(
  z
    .object({
      SMTP_HOST: z.string().optional(),
      SMTP_PORT: z.coerce.number().int().positive().default(587),
      SMTP_USER: z.string().optional(),
      SMTP_PASS: z.string().optional(),
      SMTP_FROM: z
        .string()
        .default('"GitHub Release Notifier" <noreply@releases.app>'),
    })
    .transform((env) => ({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
      from: env.SMTP_FROM,
    })),
);
