import pino from 'pino';
import { appConfig } from '@/shared/config/app.config';
import type { ILogger } from './logger.interface';

export const logger: ILogger = pino({
  transport:
    appConfig.nodeEnv === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
});
