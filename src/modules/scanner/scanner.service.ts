import type { IReleaseFeed } from './interfaces/release-feed.interface';
import { RateLimitError } from '@/shared/errors/app.errors';
import type { ILogger } from '@/shared/logger/logger.interface';
import type { IRepositoryRepository, Repository } from '@/modules/repository';
import type { INotificationPublisher } from '@/modules/notification';
import type { SubscriberInfo } from '@/shared/types';
import type { IScheduler } from '@/infrastructure/scheduler/scheduler.interface';
import type { IScannerMetrics } from './interfaces/scanner-metrics.interface';

export class ScannerService {
  constructor(
    private readonly repositoryRepository: IRepositoryRepository,
    private readonly releaseFeed: IReleaseFeed,
    private readonly notificationPublisher: INotificationPublisher,
    private readonly scheduler: IScheduler,
    private readonly logger: ILogger,
    private readonly metrics: IScannerMetrics,
  ) {}

  start(): void {
    this.scheduler.start(async () => {
      try {
        await this.scan();
      } catch (err) {
        this.logger.error({ err }, '[Scanner] Unhandled error during scan');
      }
    });
    this.logger.info('[Scanner] Started');
  }

  async scan(): Promise<void> {
    const start = performance.now();
    this.metrics.incRuns();
    this.logger.info('[Scanner] Running release scan...');

    try {
      const entries =
        await this.repositoryRepository.getRepositoriesWithActiveSubscriptions();

      await Promise.allSettled(
        entries.map(({ repository, subscribers }) =>
          this.scanRepository(repository, subscribers),
        ),
      );

      this.logger.info('[Scanner] Scan complete');
    } catch (err) {
      this.metrics.incErrors('db');
      this.logger.error({ err }, '[Scanner] DB error during scan');
      throw err;
    } finally {
      this.metrics.observeDuration((performance.now() - start) / 1000);
    }
  }

  private async scanRepository(
    repository: Repository,
    subscribers: SubscriberInfo[],
  ): Promise<void> {
    try {
      const release = await this.releaseFeed.getLatestRelease(
        repository.owner,
        repository.repo,
      );

      if (!release) {
        return;
      }
      if (release.tagName === repository.lastSeenTag) {
        return;
      }

      this.metrics.incNewReleases();

      for (const subscriber of subscribers) {
        this.notificationPublisher.publish({
          repositoryOwner: repository.owner,
          repositoryRepo: repository.repo,
          newTag: release.tagName,
          releaseUrl: release.releaseUrl,
          subscriber,
        });
      }

      await this.repositoryRepository.updateLastSeenTag(
        repository.id,
        release.tagName,
      );

      this.logger.info(
        `[Scanner] New release ${release.tagName} for ${repository.owner}/${repository.repo}`,
      );
    } catch (err) {
      this.metrics.incErrors('scan');
      if (err instanceof RateLimitError) {
        this.logger.warn(
          `[Scanner] Rate limit hit for ${repository.owner}/${repository.repo}`,
        );
      } else {
        this.logger.error(
          { err },
          `[Scanner] Error checking ${repository.owner}/${repository.repo}`,
        );
      }
    }
  }
}
