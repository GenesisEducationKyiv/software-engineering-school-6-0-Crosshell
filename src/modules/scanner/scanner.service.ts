import cron from 'node-cron';
import { GithubClient } from '@/modules/github/github.client';
import { RateLimitError } from '@/shared/errors/app.errors';
import { Repository } from '@/infrastructure/database/schema';
import { logger } from '@/shared/logger';
import { appConfig } from '@/shared/config/app.config';
import { RepositoryService } from '@/modules/repository/repository.service';
import { Subscriber } from '@/modules/notification/notification.schemas';
import { publishReleaseNotification } from '@/modules/notification/notification.queue';

export class ScannerService {
  constructor(
    private readonly repositoryService: RepositoryService,
    private readonly github: GithubClient,
  ) {}

  start(): void {
    cron.schedule(appConfig.scannerCron, () => void this.scan());
    logger.info(`[Scanner] Started with schedule: ${appConfig.scannerCron}`);
  }

  async scan(): Promise<void> {
    logger.info('[Scanner] Running release scan...');

    const entries =
      await this.repositoryService.getRepositoriesWithActiveSubscriptions();

    await Promise.allSettled(
      entries.map(({ repository, subscribers }) =>
        this.scanRepository(repository, subscribers),
      ),
    );

    logger.info('[Scanner] Scan complete');
  }

  private async scanRepository(
    repository: Repository,
    subscribers: Subscriber[],
  ): Promise<void> {
    try {
      const release = await this.github.getLatestRelease(
        repository.owner,
        repository.repo,
      );

      if (!release) return;
      if (release.tagName === repository.lastSeenTag) return;

      await this.repositoryService.updateLastSeenTag(
        repository.id,
        release.tagName,
      );

      publishReleaseNotification({
        repositoryOwner: repository.owner,
        repositoryRepo: repository.repo,
        newTag: release.tagName,
        releaseUrl: release.htmlUrl,
        subscribers,
      });

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
