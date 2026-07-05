import pino from 'pino';
import pinoElastic from 'pino-elasticsearch';
import PinoPretty from 'pino-pretty';
import { ecsFormat } from '@elastic/ecs-pino-format';
import { appConfig } from '@/shared/config/app.config';
import { elasticsearchConfig } from '@/shared/config/elasticsearch.config';
import type { ILogger } from './logger.interface';

const isDev = appConfig.nodeEnv === 'development';

let esStream: ReturnType<typeof pinoElastic> | null = null;

function buildStreams(): pino.StreamEntry[] {
  const streams: pino.StreamEntry[] = [];

  streams.push({
    stream: isDev ? PinoPretty({ colorize: true }) : process.stdout,
  });

  if (elasticsearchConfig.url) {
    esStream = pinoElastic({
      node: elasticsearchConfig.url,
      index: () => `notifier-logs-${new Date().toISOString().slice(0, 10)}`,
      esVersion: 8,
      flushBytes: 1000,
    });

    esStream.on('error', (err) => {
      process.stderr.write(`[pino-elasticsearch] error: ${err.message}\n`);
    });
    esStream.on('insertError', (err) => {
      process.stderr.write(
        `[pino-elasticsearch] insert error: ${err.message}, document: ${JSON.stringify(err.document)}\n`,
      );
    });

    streams.push({ stream: esStream });
  }

  return streams;
}

const pinoOptions: pino.LoggerOptions = {
  level: isDev ? 'debug' : 'info',
};

if (!isDev) {
  Object.assign(pinoOptions, ecsFormat());
}

const pinoLogger = pino(pinoOptions, pino.multistream(buildStreams()));

export const logger: ILogger = pinoLogger;

export function flushLogger(): Promise<void> {
  return new Promise<void>((resolve) => {
    pinoLogger.flush(() => {
      if (!esStream) {
        resolve();
        return;
      }

      esStream.end(() => resolve());
    });
  });
}
