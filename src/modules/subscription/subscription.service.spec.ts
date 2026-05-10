import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mock, mockDeep } from 'vitest-mock-extended';
import { SubscriptionService } from './subscription.service';
import { ConflictError, NotFoundError } from '@/shared/errors/app.errors';
import type { ISubscriptionRepository } from './subscription.repository.interface';
import type { IGithubClient } from '@/modules/github/github.client.interface';
import type { IMailerService } from '@/modules/mailer/mailer.service.interface';
import type {
  IUnitOfWork,
  UnitOfWorkContext,
} from '@/infrastructure/database/unit-of-work';
import type { SubscribeInput } from './subscription.schemas';
import type {
  Repository,
  Subscription,
} from '@/infrastructure/database/schema';
import type { SubscriptionWithRepo } from './types/subscription-with-repo.type';

vi.mock('@/modules/subscription/subscription.urls', () => ({
  buildConfirmUrl: vi.fn(
    (token: string) => `http://localhost:3000/api/confirm/${token}`,
  ),
}));

vi.mock('@/infrastructure/database/helpers/pg-errors.helper', () => ({
  isUniqueConstraintError: vi.fn(() => false),
}));

import { buildConfirmUrl } from '@/modules/subscription/subscription.urls';
import { isUniqueConstraintError } from '@/infrastructure/database/helpers/pg-errors.helper';

const VALID_INPUT: SubscribeInput = {
  email: 'user@example.com',
  repo: 'acc/testName',
};

const MOCK_REPOSITORY: Repository = {
  id: 'repo-uuid-1',
  owner: 'acc',
  repo: 'testName',
  lastSeenTag: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const MOCK_SUBSCRIPTION: Subscription = {
  id: 'sub-uuid-1',
  email: 'user@example.com',
  repositoryId: 'repo-uuid-1',
  confirmed: false,
  confirmToken: 'confirm-token-uuid-1',
  unsubscribeToken: 'unsub-token-uuid-2',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('SubscriptionService', () => {
  let service: SubscriptionService;
  let uow: ReturnType<typeof mock<IUnitOfWork>>;
  let subscriptionRepository: ReturnType<typeof mock<ISubscriptionRepository>>;
  let github: ReturnType<typeof mock<IGithubClient>>;
  let mailer: ReturnType<typeof mock<IMailerService>>;
  let txCtx: ReturnType<typeof mockDeep<UnitOfWorkContext>>;

  beforeEach(() => {
    vi.mocked(isUniqueConstraintError).mockReturnValue(false);

    txCtx = mockDeep<UnitOfWorkContext>();
    txCtx.repositories.findOrCreate.mockResolvedValue(MOCK_REPOSITORY);
    txCtx.subscriptions.createSubscription.mockResolvedValue(MOCK_SUBSCRIPTION);

    uow = mock<IUnitOfWork>();
    uow.run.mockImplementation((fn) => fn(txCtx));

    subscriptionRepository = mock<ISubscriptionRepository>();
    subscriptionRepository.findByConfirmToken.mockResolvedValue(null);
    subscriptionRepository.findByUnsubscribeToken.mockResolvedValue(null);
    subscriptionRepository.confirm.mockResolvedValue(undefined);
    subscriptionRepository.deleteById.mockResolvedValue(undefined);
    subscriptionRepository.findConfirmedByEmail.mockResolvedValue([]);

    github = mock<IGithubClient>();
    github.getRepository.mockResolvedValue({
      id: 1,
      fullName: 'acc/testName',
      htmlUrl: '',
    });

    mailer = mock<IMailerService>();
    mailer.sendConfirmationEmail.mockResolvedValue(undefined);

    service = new SubscriptionService(
      uow,
      subscriptionRepository,
      github,
      mailer,
    );
  });

  describe('subscribe', () => {
    describe('GitHub validation', () => {
      it('should propagate NotFoundError when the GitHub repository does not exist', async () => {
        github.getRepository.mockRejectedValue(
          new NotFoundError('Repository acc/testName not found on GitHub'),
        );

        await expect(service.subscribe(VALID_INPUT)).rejects.toThrow(
          NotFoundError,
        );
      });

      it('should not open a transaction when the GitHub repository does not exist', async () => {
        github.getRepository.mockRejectedValue(new NotFoundError('not found'));

        await expect(service.subscribe(VALID_INPUT)).rejects.toThrow();

        expect(uow.run).not.toHaveBeenCalled();
      });

      it('should call the GitHub API with the correct owner and repo', async () => {
        await service.subscribe(VALID_INPUT);

        expect(github.getRepository).toHaveBeenCalledWith('acc', 'testName');
      });
    });

    describe('transaction handling', () => {
      it('should throw ConflictError when a unique-constraint DB error occurs inside the transaction', async () => {
        txCtx.subscriptions.createSubscription.mockRejectedValue({
          code: '23505',
          message: 'duplicate key',
        });
        vi.mocked(isUniqueConstraintError).mockReturnValue(true);

        await expect(service.subscribe(VALID_INPUT)).rejects.toThrow(
          new ConflictError('Email is already subscribed to this repository'),
        );
      });

      it('should rethrow unknown errors that occur inside the transaction', async () => {
        const unknownError = new Error('unexpected DB failure');
        txCtx.subscriptions.createSubscription.mockRejectedValue(unknownError);
        vi.mocked(isUniqueConstraintError).mockReturnValue(false);

        await expect(service.subscribe(VALID_INPUT)).rejects.toThrow(
          unknownError,
        );
      });

      it('should call repositories.findOrCreate with the correct owner and repo', async () => {
        await service.subscribe(VALID_INPUT);

        expect(txCtx.repositories.findOrCreate).toHaveBeenCalledWith(
          'acc',
          'testName',
        );
      });

      it('should use canonical owner/repo from GitHub fullName regardless of input casing', async () => {
        github.getRepository.mockResolvedValue({
          id: 1,
          fullName: 'acc/testName',
          htmlUrl: '',
        });

        await service.subscribe({
          email: 'user@example.com',
          repo: 'ACC/TestName',
        });

        expect(txCtx.repositories.findOrCreate).toHaveBeenCalledWith(
          'acc',
          'testName',
        );
      });

      it('should create the subscription with the email and resolved repositoryId', async () => {
        await service.subscribe(VALID_INPUT);

        expect(txCtx.subscriptions.createSubscription).toHaveBeenCalledWith({
          email: VALID_INPUT.email,
          repositoryId: MOCK_REPOSITORY.id,
        });
      });
    });

    describe('confirmation email', () => {
      it('should build the confirmation URL using the subscription confirmToken', async () => {
        await service.subscribe(VALID_INPUT);

        expect(buildConfirmUrl).toHaveBeenCalledWith(
          MOCK_SUBSCRIPTION.confirmToken,
        );
      });

      it('should send a confirmation email to the subscriber with the built URL', async () => {
        await service.subscribe(VALID_INPUT);

        const expectedUrl = `http://localhost:3000/api/confirm/${MOCK_SUBSCRIPTION.confirmToken}`;
        expect(mailer.sendConfirmationEmail).toHaveBeenCalledWith(
          VALID_INPUT.email,
          expectedUrl,
        );
      });

      it('should propagate errors thrown by the mailer', async () => {
        mailer.sendConfirmationEmail.mockRejectedValue(
          new Error('SMTP connection refused'),
        );

        await expect(service.subscribe(VALID_INPUT)).rejects.toThrow(
          'SMTP connection refused',
        );
      });
    });

    describe('happy path', () => {
      it('should resolve without a return value when all steps succeed', async () => {
        const result = await service.subscribe(VALID_INPUT);

        expect(result).toBeUndefined();
      });

      it('should execute steps in the correct order: GitHub - transaction - email', async () => {
        const callOrder: string[] = [];

        github.getRepository.mockImplementation(() => {
          callOrder.push('getRepository');
          return Promise.resolve({
            id: 1,
            fullName: 'acc/testName',
            htmlUrl: '',
          });
        });
        uow.run.mockImplementation(async (fn) => {
          callOrder.push('uow.run');
          return fn(txCtx);
        });
        mailer.sendConfirmationEmail.mockImplementation(() => {
          callOrder.push('sendConfirmationEmail');
          return Promise.resolve();
        });

        await service.subscribe(VALID_INPUT);

        expect(callOrder).toEqual([
          'getRepository',
          'uow.run',
          'sendConfirmationEmail',
        ]);
      });
    });
  });

  describe('confirm', () => {
    const VALID_TOKEN = 'valid-confirm-token';

    describe('token not found', () => {
      it('should throw NotFoundError when the confirmation token does not exist', async () => {
        subscriptionRepository.findByConfirmToken.mockResolvedValue(null);

        await expect(service.confirm(VALID_TOKEN)).rejects.toThrow(
          new NotFoundError('Confirmation token not found'),
        );
      });

      it('should not call confirm when the token does not exist', async () => {
        subscriptionRepository.findByConfirmToken.mockResolvedValue(null);

        await expect(service.confirm(VALID_TOKEN)).rejects.toThrow(
          NotFoundError,
        );

        expect(subscriptionRepository.confirm).not.toHaveBeenCalled();
      });
    });

    describe('token found', () => {
      it('should look up the subscription by token before confirming', async () => {
        subscriptionRepository.findByConfirmToken.mockResolvedValue(
          MOCK_SUBSCRIPTION,
        );

        await service.confirm(VALID_TOKEN);

        expect(subscriptionRepository.findByConfirmToken).toHaveBeenCalledWith(
          VALID_TOKEN,
        );
      });

      it('should call confirm with the correct subscription id', async () => {
        subscriptionRepository.findByConfirmToken.mockResolvedValue(
          MOCK_SUBSCRIPTION,
        );

        await service.confirm(VALID_TOKEN);

        expect(subscriptionRepository.confirm).toHaveBeenCalledWith(
          MOCK_SUBSCRIPTION.id,
        );
      });

      it('should resolve without a return value on success', async () => {
        subscriptionRepository.findByConfirmToken.mockResolvedValue(
          MOCK_SUBSCRIPTION,
        );

        const result = await service.confirm(VALID_TOKEN);

        expect(result).toBeUndefined();
      });
    });
  });

  describe('unsubscribe', () => {
    const VALID_TOKEN = 'valid-unsubscribe-token';

    describe('token not found', () => {
      it('should throw NotFoundError when the unsubscribe token does not exist', async () => {
        subscriptionRepository.findByUnsubscribeToken.mockResolvedValue(null);

        await expect(service.unsubscribe(VALID_TOKEN)).rejects.toThrow(
          new NotFoundError('Unsubscribe token not found'),
        );
      });

      it('should not call deleteById when the token does not exist', async () => {
        subscriptionRepository.findByUnsubscribeToken.mockResolvedValue(null);

        await expect(service.unsubscribe(VALID_TOKEN)).rejects.toThrow(
          NotFoundError,
        );

        expect(subscriptionRepository.deleteById).not.toHaveBeenCalled();
      });
    });

    describe('token found', () => {
      it('should look up the subscription by token before deleting', async () => {
        subscriptionRepository.findByUnsubscribeToken.mockResolvedValue(
          MOCK_SUBSCRIPTION,
        );

        await service.unsubscribe(VALID_TOKEN);

        expect(
          subscriptionRepository.findByUnsubscribeToken,
        ).toHaveBeenCalledWith(VALID_TOKEN);
      });

      it('should call deleteById with the correct subscription id', async () => {
        subscriptionRepository.findByUnsubscribeToken.mockResolvedValue(
          MOCK_SUBSCRIPTION,
        );

        await service.unsubscribe(VALID_TOKEN);

        expect(subscriptionRepository.deleteById).toHaveBeenCalledWith(
          MOCK_SUBSCRIPTION.id,
        );
      });

      it('should resolve without a return value on success', async () => {
        subscriptionRepository.findByUnsubscribeToken.mockResolvedValue(
          MOCK_SUBSCRIPTION,
        );

        const result = await service.unsubscribe(VALID_TOKEN);

        expect(result).toBeUndefined();
      });
    });
  });

  describe('getSubscriptionsByEmail', () => {
    it('should return an empty array when the email has no confirmed subscriptions', async () => {
      subscriptionRepository.findConfirmedByEmail.mockResolvedValue([]);

      const result = await service.getSubscriptionsByEmail('user@example.com');

      expect(result).toEqual([]);
    });

    it('should return all confirmed subscriptions for the given email', async () => {
      const subscriptions: SubscriptionWithRepo[] = [
        {
          email: 'user@example.com',
          repo: 'acc/testName',
          confirmed: true,
          lastSeenTag: 'v1.0.0',
        },
        {
          email: 'user@example.com',
          repo: 'facebook/react',
          confirmed: true,
          lastSeenTag: null,
        },
      ];
      subscriptionRepository.findConfirmedByEmail.mockResolvedValue(
        subscriptions,
      );

      const result = await service.getSubscriptionsByEmail('user@example.com');

      expect(result).toEqual(subscriptions);
    });

    it('should query the repository with the exact email provided', async () => {
      const email = 'specific@user.com';

      await service.getSubscriptionsByEmail(email);

      expect(subscriptionRepository.findConfirmedByEmail).toHaveBeenCalledWith(
        email,
      );
    });

    it('should propagate errors thrown by the repository', async () => {
      subscriptionRepository.findConfirmedByEmail.mockRejectedValue(
        new Error('connection timeout'),
      );

      await expect(
        service.getSubscriptionsByEmail('user@example.com'),
      ).rejects.toThrow('connection timeout');
    });
  });
});
