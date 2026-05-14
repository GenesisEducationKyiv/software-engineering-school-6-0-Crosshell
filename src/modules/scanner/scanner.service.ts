import cron from 'node-cron';
import type { IGithubClient } from '@/modules/github/github.client.interface';
import { RateLimitError } from '@/shared/errors/app.errors';
import { logger } from '@/shared/logger';
import { scannerConfig } from '@/shared/config';
import type { IRepositoryRepository } from '@/modules/repository/repository.repository.interface';
import type { TrackedRepository } from './types/tracked-repository.type';
import type { Subscriber } from '@/modules/notification/notification.schemas';
import type { INotificationPublisher } from '../notification/notification-publisher.interface';
import {
  scannerRunsTotal,
  scannerNewReleasesTotal,
} from '@/infrastructure/metrics/metrics.registry';

export class ScannerService {
  constructor(
    private readonly repositoryRepository: IRepositoryRepository,
    private readonly github: IGithubClient,
    private readonly notificationPublisher: INotificationPublisher,
  ) {}

  start(): void {
    cron.schedule(scannerConfig.scannerCron, async () => {
      try {
        await this.scan();
      } catch (err) {
        logger.error({ err }, '[Scanner] Unhandled error during scan');
      }
    });
    logger.info(
      `[Scanner] Started with schedule: ${scannerConfig.scannerCron}`,
    );
  }

  async scan(): Promise<void> {
    scannerRunsTotal.inc();
    logger.info('[Scanner] Running release scan...');

    const entries =
      await this.repositoryRepository.getRepositoriesWithActiveSubscriptions();

    await Promise.allSettled(
      entries.map(({ repository, subscribers }) =>
        this.scanRepository(repository, subscribers),
      ),
    );

    logger.info('[Scanner] Scan complete');
  }

  private async scanRepository(
    repository: TrackedRepository,
    subscribers: Subscriber[],
  ): Promise<void> {
    try {
      const release = await this.github.getLatestRelease(
        repository.owner,
        repository.repo,
      );

      if (!release) return;
      if (release.tagName === repository.lastSeenTag) return;

      scannerNewReleasesTotal.inc();

      this.notificationPublisher.publish({
        repositoryOwner: repository.owner,
        repositoryRepo: repository.repo,
        newTag: release.tagName,
        releaseUrl: release.htmlUrl,
        subscribers,
      });

      await this.repositoryRepository.updateLastSeenTag(
        repository.id,
        release.tagName,
      );

      logger.info(
        `[Scanner] New release ${release.tagName} for ${repository.owner}/${repository.repo}`,
      );
    } catch (err) {
      if (err instanceof RateLimitError) {
        logger.warn(
          `[Scanner] Rate limit hit for ${repository.owner}/${repository.repo}`,
        );
      } else {
        logger.error(
          { err },
          `[Scanner] Error checking ${repository.owner}/${repository.repo}`,
        );
      }
    }
  }
}
