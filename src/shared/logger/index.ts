import pino from 'pino';
import pinoElastic from 'pino-elasticsearch';
import PinoPretty from 'pino-pretty';
import { ecsFormat } from '@elastic/ecs-pino-format';
import { appConfig } from '@/shared/config/app.config';
import { elasticsearchConfig } from '@/shared/config/elasticsearch.config';
import type { ILogger } from './logger.interface';

const isDev = appConfig.nodeEnv === 'development';

function buildStreams(): pino.StreamEntry[] {
  const streams: pino.StreamEntry[] = [];

  if (isDev) {
    streams.push({ stream: PinoPretty({ colorize: true }) });
  }

  if (elasticsearchConfig.url) {
    const esStream = pinoElastic({
      node: elasticsearchConfig.url,
      index: 'notifier-logs',
      esVersion: 8,
      flushBytes: 1000,
    });

    esStream.on('error', (err) => {
      process.stderr.write(`[pino-elasticsearch] error: ${err.message}\n`);
    });
    esStream.on('insertError', (err) => {
      process.stderr.write(
        `[pino-elasticsearch] insert error: ${err.message}\n`,
      );
    });

    streams.push({ stream: esStream });
  }

  if (streams.length === 0) {
    streams.push({ stream: process.stdout });
  }

  return streams;
}

const pinoOptions: pino.LoggerOptions = {
  level: isDev ? 'debug' : 'info',
};

if (!isDev) {
  Object.assign(pinoOptions, ecsFormat());
}

export const logger: ILogger = pino(
  pinoOptions,
  pino.multistream(buildStreams()),
);
