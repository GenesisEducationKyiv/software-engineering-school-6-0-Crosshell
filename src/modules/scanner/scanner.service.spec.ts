import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { ScannerService } from './scanner.service';
import { RateLimitError } from '@/shared/errors/app.errors';
import type { IRepositoryRepository } from '@/modules/repository/interfaces/repository.repository.interface';
import type { IGithubClient } from '@/modules/github/interfaces/github.client.interface';
import type { INotificationPublisher } from '../notification/interfaces/notification-publisher.interface';
import type { Subscriber } from '@/modules/notification/notification.schemas';
import type { Repository } from '@/modules/repository/types/repository.type';
import type { GitHubRelease } from '@/modules/github/github.schemas';
import type { RepositoryWithSubscribers } from '@/modules/repository/types/repository-with-subscribers.type';

vi.mock('node-cron', () => ({
  default: { schedule: vi.fn() },
}));

vi.mock('@/shared/config', () => ({
  scannerConfig: { scannerCron: '*/10 * * * *' },
}));

vi.mock('@/shared/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/infrastructure/metrics/metrics.registry', () => ({
  scannerRunsTotal: { inc: vi.fn() },
  scannerNewReleasesTotal: { inc: vi.fn() },
}));

import cron from 'node-cron';
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
  createdAt: new Date(),
  updatedAt: new Date(),
};

const MOCK_SUBSCRIBER: Subscriber = {
  email: 'user@example.com',
  unsubscribeToken: '00000000-0000-0000-0000-000000000001',
};

const MOCK_RELEASE: GitHubRelease = {
  tagName: 'v2.0.0',
  htmlUrl: 'https://github.com/acc/testName/releases/tag/v2.0.0',
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
  let github: ReturnType<typeof mock<IGithubClient>>;
  let notificationPublisher: ReturnType<typeof mock<INotificationPublisher>>;

  beforeEach(() => {
    repositoryRepository = mock<IRepositoryRepository>();
    repositoryRepository.getRepositoriesWithActiveSubscriptions.mockResolvedValue(
      [],
    );
    repositoryRepository.updateLastSeenTag.mockResolvedValue(undefined);

    github = mock<IGithubClient>();
    github.getLatestRelease.mockResolvedValue(null);

    notificationPublisher = mock<INotificationPublisher>();

    service = new ScannerService(
      repositoryRepository,
      github,
      notificationPublisher,
    );
  });

  describe('start', () => {
    let capturedCallback: () => Promise<void>;

    beforeEach(() => {
      vi.mocked(cron.schedule).mockImplementation((_expr, cb) => {
        capturedCallback = cb as () => Promise<void>;
        return {} as ReturnType<typeof cron.schedule>;
      });
    });

    it('should register a cron job with the configured schedule expression', () => {
      service.start();

      expect(cron.schedule).toHaveBeenCalledWith(
        '*/10 * * * *',
        expect.any(Function),
      );
    });

    it('should invoke scan when the cron callback fires', async () => {
      const scanSpy = vi.spyOn(service, 'scan').mockResolvedValue(undefined);
      service.start();

      await capturedCallback();

      expect(scanSpy).toHaveBeenCalledOnce();
    });

    it('should catch errors thrown by scan and not let the cron callback reject', async () => {
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

      expect(github.getLatestRelease).toHaveBeenCalledWith('acc', 'repoA');
      expect(github.getLatestRelease).toHaveBeenCalledWith('acc', 'repoB');
    });

    it('should resolve immediately when there are no tracked repositories', async () => {
      repositoryRepository.getRepositoriesWithActiveSubscriptions.mockResolvedValue(
        [],
      );

      await expect(service.scan()).resolves.toBeUndefined();
      expect(github.getLatestRelease).not.toHaveBeenCalled();
    });

    describe('when GitHub returns no release for a repository', () => {
      it('should not publish a notification', async () => {
        repositoryRepository.getRepositoriesWithActiveSubscriptions.mockResolvedValue(
          [makeEntry(MOCK_REPOSITORY)],
        );
        github.getLatestRelease.mockResolvedValue(null);

        await service.scan();

        expect(notificationPublisher.publish).not.toHaveBeenCalled();
      });

      it('should not update the last-seen tag', async () => {
        repositoryRepository.getRepositoriesWithActiveSubscriptions.mockResolvedValue(
          [makeEntry(MOCK_REPOSITORY)],
        );
        github.getLatestRelease.mockResolvedValue(null);

        await service.scan();

        expect(repositoryRepository.updateLastSeenTag).not.toHaveBeenCalled();
      });
    });

    describe('when the latest release tag matches the last-seen tag', () => {
      it('should not publish a notification', async () => {
        const unchangedRelease: GitHubRelease = {
          tagName: MOCK_REPOSITORY.lastSeenTag!,
          htmlUrl: 'https://github.com/acc/testName/releases/tag/v1.0.0',
        };
        repositoryRepository.getRepositoriesWithActiveSubscriptions.mockResolvedValue(
          [makeEntry(MOCK_REPOSITORY)],
        );
        github.getLatestRelease.mockResolvedValue(unchangedRelease);

        await service.scan();

        expect(notificationPublisher.publish).not.toHaveBeenCalled();
      });

      it('should not update the last-seen tag', async () => {
        const unchangedRelease: GitHubRelease = {
          tagName: MOCK_REPOSITORY.lastSeenTag!,
          htmlUrl: 'https://github.com/acc/testName/releases/tag/v1.0.0',
        };
        repositoryRepository.getRepositoriesWithActiveSubscriptions.mockResolvedValue(
          [makeEntry(MOCK_REPOSITORY)],
        );
        github.getLatestRelease.mockResolvedValue(unchangedRelease);

        await service.scan();

        expect(repositoryRepository.updateLastSeenTag).not.toHaveBeenCalled();
      });

      it('should not increment the new releases counter', async () => {
        const unchangedRelease: GitHubRelease = {
          tagName: MOCK_REPOSITORY.lastSeenTag!,
          htmlUrl: 'https://github.com/acc/testName/releases/tag/v1.0.0',
        };
        repositoryRepository.getRepositoriesWithActiveSubscriptions.mockResolvedValue(
          [makeEntry(MOCK_REPOSITORY)],
        );
        github.getLatestRelease.mockResolvedValue(unchangedRelease);

        await service.scan();

        expect(scannerNewReleasesTotal.inc).not.toHaveBeenCalled();
      });
    });

    describe('when a new release is detected', () => {
      beforeEach(() => {
        repositoryRepository.getRepositoriesWithActiveSubscriptions.mockResolvedValue(
          [makeEntry(MOCK_REPOSITORY)],
        );
        github.getLatestRelease.mockResolvedValue(MOCK_RELEASE);
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
          releaseUrl: MOCK_RELEASE.htmlUrl,
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
        github.getLatestRelease.mockRejectedValue(
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
        github.getLatestRelease.mockRejectedValue(unexpectedError);

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
        github.getLatestRelease.mockImplementation((_owner, repo) => {
          if (repo === 'failing')
            return Promise.reject(new RateLimitError('rate limited'));
          return Promise.resolve(MOCK_RELEASE);
        });

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
        github.getLatestRelease.mockImplementation((_owner, repo) => {
          if (repo === 'failing')
            return Promise.reject(new Error('network error'));
          return Promise.resolve(MOCK_RELEASE);
        });

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
        github.getLatestRelease.mockRejectedValue(
          new RateLimitError('rate limited'),
        );

        await service.scan();

        expect(notificationPublisher.publish).not.toHaveBeenCalled();
      });
    });
  });
});
