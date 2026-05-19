import type { Channel, ChannelModel } from 'amqplib';
import amqplib from 'amqplib';
import { logger } from '@/shared/logger';
import { queueConfig } from '@/shared/config';

const RECONNECT_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 30_000];

export class QueueManager {
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  private reconnectHandler: (() => Promise<void>) | null = null;
  private closing: boolean = false;
  private isReconnecting: boolean = false;

  async connect(): Promise<void> {
    this.connection = await amqplib.connect(queueConfig.url);
    this.channel = await this.connection.createChannel();

    this.connection.on('error', (err: Error) => {
      logger.error({ err }, '[Queue] Connection error');
    });

    this.connection.on('close', () => {
      if (this.closing) {
        return;
      }
      logger.warn(
        '[Queue] Connection closed unexpectedly. Scheduling reconnect',
      );
      this.scheduleReconnect(0);
    });

    this.channel.on('error', (err: Error) => {
      logger.error({ err }, '[Queue] Channel error');
    });

    this.channel.on('close', () => {
      if (this.closing) {
        return;
      }
      logger.warn('[Queue] Channel closed unexpectedly');
      this.connection?.close().catch(() => {});
    });

    logger.info('[Queue] Connected to RabbitMQ');
  }

  getChannel(): Channel {
    if (!this.channel) {
      throw new Error(
        '[Queue] Channel not initialised. Call connect() first or wait for reconnect',
      );
    }

    return this.channel;
  }

  setReconnectHandler(fn: () => Promise<void>): void {
    this.reconnectHandler = fn;
  }

  async close(): Promise<void> {
    this.closing = true;
    await this.channel?.close().catch(() => {});
    await this.connection?.close().catch(() => {});
    this.channel = null;
    this.connection = null;
  }

  private scheduleReconnect(attempt: number): void {
    if (this.isReconnecting || this.closing) {
      return;
    }
    this.isReconnecting = true;

    const delay =
      RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)];

    setTimeout(() => {
      void this.performReconnect(attempt);
    }, delay);
  }

  private async performReconnect(attempt: number): Promise<void> {
    try {
      logger.info(`[Queue] Reconnect attempt ${attempt + 1}...`);

      this.channel = null;
      this.connection = null;

      await this.connect();

      if (this.reconnectHandler) {
        await this.reconnectHandler();
      }

      logger.info('[Queue] Reconnected and queues re-initialised');
      this.isReconnecting = false;
    } catch (err) {
      logger.error({ err }, `[Queue] Reconnect attempt ${attempt + 1} failed`);
      this.isReconnecting = false;
      this.scheduleReconnect(attempt + 1);
    }
  }
}
