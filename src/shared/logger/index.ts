import pino from 'pino';
import { appConfig } from '@/shared/config/app.config';

export const logger = pino({
  transport:
    appConfig.nodeEnv === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
});
