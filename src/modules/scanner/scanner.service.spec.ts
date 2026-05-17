import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { ScannerService } from './scanner.service';
import { RateLimitError } from '@/shared/errors/app.errors';
import type { IRepositoryRepository } from '@/modules/repository/interfaces/repository.repository.interface';
import type { IReleaseFeed } from '@/modules/scanner/interfaces/release-feed.interface';
import type { INotificationPublisher } from '../notification/interfaces/notification-publisher.interface';
import type { IScheduler } from '@/infrastructure/scheduler/scheduler.interface';
import type { Subscriber } from '@/modules/notification/notification.schemas';
import type { Repository } from '@/modules/repository/types/repository.type';
import type { VcsRelease } from '@/shared/types/vcs-release.type';
import type { RepositoryWithSubscribers } from '@/modules/repository/types/repository-with-subscribers.type';

vi.mock('@/shared/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/infrastructure/metrics/metrics.registry', () => ({
  scannerRunsTotal: { inc: vi.fn() },
  scannerNewReleasesTotal: { inc: vi.fn() },
}));

import { logger } from '@/shared/logger';
import {
  scannerRunsTotal,
  scannerNewReleasesTotal,
} from '@/infrastructure/metrics/metrics.registry';

const MOCK_REPOSITORY: Repository = {
  id: 'repo-uuid-1',
  owner: 'acc',
  repo: 'testName',
  lastSeenTag: 'v1.0.0',
};

const MOCK_SUBSCRIBER: Subscriber = {
  email: 'user@example.com',
  unsubscribeToken: '00000000-0000-0000-0000-000000000001',
};

const MOCK_RELEASE: VcsRelease = {
  tagName: 'v2.0.0',
  releaseUrl: 'https://github.com/acc/testName/releases/tag/v2.0.0',
};

function makeEntry(
  repository: Repository,
  subscribers: Subscriber[] = [MOCK_SUBSCRIBER],
): RepositoryWithSubscribers {
  return { repository, subscribers };
}

describe('ScannerService', () => {
  let service: ScannerService;
  let repositoryRepository: ReturnType<typeof mock<IRepositoryRepository>>;
  let releaseFeed: ReturnType<typeof mock<IReleaseFeed>>;
  let notificationPublisher: ReturnType<typeof mock<INotificationPublisher>>;
  let scheduler: ReturnType<typeof mock<IScheduler>>;

  beforeEach(() => {
    repositoryRepository = mock<IRepositoryRepository>();
    repositoryRepository.getRepositoriesWithActiveSubscriptions.mockResolvedValue(
      [],
    );
    repositoryRepository.updateLastSeenTag.mockResolvedValue(undefined);

    releaseFeed = mock<IReleaseFeed>();
    releaseFeed.getLatestRelease.mockResolvedValue(null);

    notificationPublisher = mock<INotificationPublisher>();
    scheduler = mock<IScheduler>();

    service = new ScannerService(
      repositoryRepository,
      releaseFeed,
      notificationPublisher,
      scheduler,
    );
  });

  describe('start', () => {
    let capturedCallback: () => Promise<void>;

    beforeEach(() => {
      scheduler.start.mockImplementation((cb) => {
        capturedCallback = cb;
      });
    });

    it('should delegate scheduling to the scheduler', () => {
      service.start();

      expect(scheduler.start).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should invoke scan when the scheduler triggers', async () => {
      const scanSpy = vi.spyOn(service, 'scan').mockResolvedValue(undefined);
      service.start();

      await capturedCallback();

      expect(scanSpy).toHaveBeenCalledOnce();
    });

    it('should catch errors thrown by scan and not let the callback reject', async () => {
      vi.spyOn(service, 'scan').mockRejectedValue(
        new Error('unexpected crash'),
      );
      service.start();

      await expect(capturedCallback()).resolves.toBeUndefined();
    });

    it('should log an error when scan throws an unhandled error', async () => {
      const err = new Error('unexpected crash');
      vi.spyOn(service, 'scan').mockRejectedValue(err);
      service.start();

      await capturedCallback();

      expect(logger.error).toHaveBeenCalledWith(
        { err },
        '[Scanner] Unhandled error during scan',
      );
    });
  });

  describe('scan', () => {
    it('should increment the scanner runs counter on every invocation', async () => {
      await service.scan();

      expect(scannerRunsTotal.inc).toHaveBeenCalledOnce();
    });

    it('should fetch all repositories with active subscriptions', async () => {
      await service.scan();

      expect(
        repositoryRepository.getRepositoriesWithActiveSubscriptions,
      ).toHaveBeenCalledOnce();
    });

    it('should call getLatestRelease for every tracked repository', async () => {
      const repoA: Repository = {
        ...MOCK_REPOSITORY,
        id: 'a',
        repo: 'repoA',
      };
      const repoB: Repository = {
        ...MOCK_REPOSITORY,
        id: 'b',
        repo: 'repoB',
      };
      repositoryRepository.getRepositoriesWithActiveSubscriptions.mockResolvedValue(
        [makeEntry(repoA), makeEntry(repoB)],
      );

      await service.scan();

      expect(releaseFeed.getLatestRelease).toHaveBeenCalledWith('acc', 'repoA');
      expect(releaseFeed.getLatestRelease).toHaveBeenCalledWith('acc', 'repoB');
    });

    it('should resolve immediately when there are no tracked repositories', async () => {
      repositoryRepository.getRepositoriesWithActiveSubscriptions.mockResolvedValue(
        [],
      );

      await expect(service.scan()).resolves.toBeUndefined();
      expect(releaseFeed.getLatestRelease).not.toHaveBeenCalled();
    });

    describe('when GitHub returns no release for a repository', () => {
      it('should not publish a notification', async () => {
        repositoryRepository.getRepositoriesWithActiveSubscriptions.mockResolvedValue(
          [makeEntry(MOCK_REPOSITORY)],
        );
        releaseFeed.getLatestRelease.mockResolvedValue(null);

        await service.scan();

        expect(notificationPublisher.publish).not.toHaveBeenCalled();
      });

      it('should not update the last-seen tag', async () => {
        repositoryRepository.getRepositoriesWithActiveSubscriptions.mockResolvedValue(
          [makeEntry(MOCK_REPOSITORY)],
        );
        releaseFeed.getLatestRelease.mockResolvedValue(null);

        await service.scan();

        expect(repositoryRepository.updateLastSeenTag).not.toHaveBeenCalled();
      });
    });

    describe('when the latest release tag matches the last-seen tag', () => {
      it('should not publish a notification', async () => {
        const unchangedRelease: VcsRelease = {
          tagName: MOCK_REPOSITORY.lastSeenTag!,
          releaseUrl: 'https://github.com/acc/testName/releases/tag/v1.0.0',
        };
        repositoryRepository.getRepositoriesWithActiveSubscriptions.mockResolvedValue(
          [makeEntry(MOCK_REPOSITORY)],
        );
        releaseFeed.getLatestRelease.mockResolvedValue(unchangedRelease);

        await service.scan();

        expect(notificationPublisher.publish).not.toHaveBeenCalled();
      });

      it('should not update the last-seen tag', async () => {
        const unchangedRelease: VcsRelease = {
          tagName: MOCK_REPOSITORY.lastSeenTag!,
          releaseUrl: 'https://github.com/acc/testName/releases/tag/v1.0.0',
        };
        repositoryRepository.getRepositoriesWithActiveSubscriptions.mockResolvedValue(
          [makeEntry(MOCK_REPOSITORY)],
        );
        releaseFeed.getLatestRelease.mockResolvedValue(unchangedRelease);

        await service.scan();

        expect(repositoryRepository.updateLastSeenTag).not.toHaveBeenCalled();
      });

      it('should not increment the new releases counter', async () => {
        const unchangedRelease: VcsRelease = {
          tagName: MOCK_REPOSITORY.lastSeenTag!,
          releaseUrl: 'https://github.com/acc/testName/releases/tag/v1.0.0',
        };
        repositoryRepository.getRepositoriesWithActiveSubscriptions.mockResolvedValue(
          [makeEntry(MOCK_REPOSITORY)],
        );
        releaseFeed.getLatestRelease.mockResolvedValue(unchangedRelease);

        await service.scan();

        expect(scannerNewReleasesTotal.inc).not.toHaveBeenCalled();
      });
    });

    describe('when a new release is detected', () => {
      beforeEach(() => {
        repositoryRepository.getRepositoriesWithActiveSubscriptions.mockResolvedValue(
          [makeEntry(MOCK_REPOSITORY)],
        );
        releaseFeed.getLatestRelease.mockResolvedValue(MOCK_RELEASE);
      });

      it('should increment the new releases counter', async () => {
        await service.scan();

        expect(scannerNewReleasesTotal.inc).toHaveBeenCalledOnce();
      });

      it('should publish a notification with the correct payload', async () => {
        await service.scan();

        expect(notificationPublisher.publish).toHaveBeenCalledWith({
          repositoryOwner: MOCK_REPOSITORY.owner,
          repositoryRepo: MOCK_REPOSITORY.repo,
          newTag: MOCK_RELEASE.tagName,
          releaseUrl: MOCK_RELEASE.releaseUrl,
          subscribers: [MOCK_SUBSCRIBER],
        });
      });

      it('should update the last-seen tag to the new release tag', async () => {
        await service.scan();

        expect(repositoryRepository.updateLastSeenTag).toHaveBeenCalledWith(
          MOCK_REPOSITORY.id,
          MOCK_RELEASE.tagName,
        );
      });

      it('should treat a repository with a null last-seen tag as having a new release', async () => {
        const freshRepo: Repository = {
          ...MOCK_REPOSITORY,
          lastSeenTag: null,
        };
        repositoryRepository.getRepositoriesWithActiveSubscriptions.mockResolvedValue(
          [makeEntry(freshRepo)],
        );

        await service.scan();

        expect(notificationPublisher.publish).toHaveBeenCalledOnce();
        expect(repositoryRepository.updateLastSeenTag).toHaveBeenCalledWith(
          freshRepo.id,
          MOCK_RELEASE.tagName,
        );
      });
    });

    describe('error handling per repository', () => {
      it('should log a warning (not error) when a RateLimitError is thrown', async () => {
        repositoryRepository.getRepositoriesWithActiveSubscriptions.mockResolvedValue(
          [makeEntry(MOCK_REPOSITORY)],
        );
        releaseFeed.getLatestRelease.mockRejectedValue(
          new RateLimitError('retry after 60'),
        );

        await service.scan();

        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining(
            `${MOCK_REPOSITORY.owner}/${MOCK_REPOSITORY.repo}`,
          ),
        );
        expect(logger.error).not.toHaveBeenCalled();
      });

      it('should log an error (not warn) when an unexpected error is thrown', async () => {
        const unexpectedError = new Error('DB connection lost');
        repositoryRepository.getRepositoriesWithActiveSubscriptions.mockResolvedValue(
          [makeEntry(MOCK_REPOSITORY)],
        );
        releaseFeed.getLatestRelease.mockRejectedValue(unexpectedError);

        await service.scan();

        expect(logger.error).toHaveBeenCalledWith(
          { err: unexpectedError },
          expect.stringContaining(
            `${MOCK_REPOSITORY.owner}/${MOCK_REPOSITORY.repo}`,
          ),
        );
        expect(logger.warn).not.toHaveBeenCalled();
      });

      it('should continue scanning remaining repositories when one throws a RateLimitError', async () => {
        const failingRepo: Repository = {
          ...MOCK_REPOSITORY,
          id: 'a',
          repo: 'failing',
        };
        const passingRepo: Repository = {
          ...MOCK_REPOSITORY,
          id: 'b',
          repo: 'passing',
        };
        repositoryRepository.getRepositoriesWithActiveSubscriptions.mockResolvedValue(
          [makeEntry(failingRepo), makeEntry(passingRepo)],
        );
        releaseFeed.getLatestRelease.mockImplementation(
          async (_owner, repo) => {
            if (repo === 'failing') throw new RateLimitError('rate limited');
            return MOCK_RELEASE;
          },
        );

        await service.scan();

        expect(repositoryRepository.updateLastSeenTag).toHaveBeenCalledWith(
          passingRepo.id,
          MOCK_RELEASE.tagName,
        );
      });

      it('should continue scanning remaining repositories when one throws an unexpected error', async () => {
        const failingRepo: Repository = {
          ...MOCK_REPOSITORY,
          id: 'a',
          repo: 'failing',
        };
        const passingRepo: Repository = {
          ...MOCK_REPOSITORY,
          id: 'b',
          repo: 'passing',
        };
        repositoryRepository.getRepositoriesWithActiveSubscriptions.mockResolvedValue(
          [makeEntry(failingRepo), makeEntry(passingRepo)],
        );
        releaseFeed.getLatestRelease.mockImplementation(
          async (_owner, repo) => {
            if (repo === 'failing') throw new Error('network error');
            return MOCK_RELEASE;
          },
        );

        await service.scan();

        expect(repositoryRepository.updateLastSeenTag).toHaveBeenCalledWith(
          passingRepo.id,
          MOCK_RELEASE.tagName,
        );
      });

      it('should not publish a notification when a RateLimitError is thrown for that repository', async () => {
        repositoryRepository.getRepositoriesWithActiveSubscriptions.mockResolvedValue(
          [makeEntry(MOCK_REPOSITORY)],
        );
        releaseFeed.getLatestRelease.mockRejectedValue(
          new RateLimitError('rate limited'),
        );

        await service.scan();

        expect(notificationPublisher.publish).not.toHaveBeenCalled();
      });
    });
  });
});
