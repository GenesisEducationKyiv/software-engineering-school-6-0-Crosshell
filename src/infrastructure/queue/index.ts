import amqplib, { Channel, ChannelModel } from 'amqplib';
import { logger } from '@/shared/logger';
import { queueConfig } from '@/shared/config/queue.config';

let connection: ChannelModel | null = null;
let channel: Channel | null = null;

export async function connectQueue(): Promise<void> {
  connection = await amqplib.connect(queueConfig.url);
  channel = await connection.createChannel();

  connection.on('error', (err: Error) => {
    logger.error({ err }, '[Queue] Connection error');
  });

  logger.info('[Queue] Connected to RabbitMQ');
}

export function getChannel(): Channel {
  if (!channel)
    throw new Error(
      '[Queue] Channel not initialized. Call connectQueue() first',
    );
  return channel;
}

export async function closeQueue(): Promise<void> {
  await channel?.close();
  await connection?.close();
}
