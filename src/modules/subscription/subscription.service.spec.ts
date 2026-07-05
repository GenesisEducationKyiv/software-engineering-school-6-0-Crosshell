import { describe, it, expect, beforeEach } from 'vitest';
import { mock, mockDeep } from 'vitest-mock-extended';
import { SubscriptionService } from './subscription.service';
import { ConflictError, NotFoundError } from '@/shared/errors/app.errors';
import type { ISubscriptionRepository } from './interfaces/subscription.repository.interface';
import type { IRepositorySource } from '@/modules/subscription/interfaces/repository-source.interface';
import type { IMailerService } from '@/modules/mailer/interfaces/mailer.service.interface';
import type {
  IUnitOfWork,
  UnitOfWorkContext,
} from '@/infrastructure/database/unit-of-work';
import type { SubscribeInput } from './subscription.schemas';
import type { Repository } from '@/modules/repository/types/repository.type';
import type { Subscription } from '@/modules/subscription/types/subscription.type';

const VALID_INPUT: SubscribeInput = {
  email: 'user@example.com',
  repo: 'acc/testName',
};

const MOCK_REPOSITORY: Repository = {
  id: 'repo-uuid-1',
  owner: 'acc',
  repo: 'testName',
  lastSeenTag: null,
};

const MOCK_SUBSCRIPTION: Subscription = {
  id: 'sub-uuid-1',
  email: 'user@example.com',
  repositoryId: 'repo-uuid-1',
  confirmed: false,
  confirmToken: 'confirm-token-uuid-1',
  unsubscribeToken: 'unsub-token-uuid-2',
};

describe('SubscriptionService', () => {
  let service: SubscriptionService;
  let uow: ReturnType<typeof mock<IUnitOfWork>>;
  let subscriptionRepository: ReturnType<typeof mock<ISubscriptionRepository>>;
  let repositorySource: ReturnType<typeof mock<IRepositorySource>>;
  let mailer: ReturnType<typeof mock<IMailerService>>;
  let txCtx: ReturnType<typeof mockDeep<UnitOfWorkContext>>;

  beforeEach(() => {
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

    repositorySource = mock<IRepositorySource>();
    repositorySource.getRepository.mockResolvedValue({
      owner: 'acc',
      repo: 'testName',
    });

    mailer = mock<IMailerService>();
    mailer.sendConfirmationEmail.mockResolvedValue(undefined);

    service = new SubscriptionService(
      uow,
      subscriptionRepository,
      repositorySource,
      mailer,
      { appUrl: 'http://localhost:3000' },
    );
  });

  describe('subscribe', () => {
    describe('GitHub validation', () => {
      it('should propagate NotFoundError when the GitHub repository does not exist', async () => {
        repositorySource.getRepository.mockRejectedValue(
          new NotFoundError('Repository acc/testName not found on GitHub'),
        );

        await expect(service.subscribe(VALID_INPUT)).rejects.toThrow(
          NotFoundError,
        );
      });

      it('should not open a transaction when the GitHub repository does not exist', async () => {
        repositorySource.getRepository.mockRejectedValue(
          new NotFoundError('not found'),
        );

        await expect(service.subscribe(VALID_INPUT)).rejects.toThrow();

        expect(uow.run).not.toHaveBeenCalled();
      });

      it('should call the GitHub API with the correct full repo name', async () => {
        await service.subscribe(VALID_INPUT);

        expect(repositorySource.getRepository).toHaveBeenCalledWith(
          'acc/testName',
        );
      });
    });

    describe('transaction handling', () => {
      it('should throw ConflictError when the email is already subscribed to the repository', async () => {
        txCtx.subscriptions.createSubscription.mockRejectedValue(
          new ConflictError('Email is already subscribed to this repository'),
        );

        await expect(service.subscribe(VALID_INPUT)).rejects.toThrow(
          ConflictError,
        );
      });

      it('should rethrow unknown errors that occur inside the transaction', async () => {
        const unknownError = new Error('unexpected DB failure');
        txCtx.subscriptions.createSubscription.mockRejectedValue(unknownError);

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

      it('should use canonical owner/repo from GitHub regardless of input casing', async () => {
        repositorySource.getRepository.mockResolvedValue({
          owner: 'acc',
          repo: 'testName',
        });

        await service.subscribe({
          email: 'user@example.com',
          repo: 'ACC/TestName',
        });

        expect(repositorySource.getRepository).toHaveBeenCalledWith(
          'ACC/TestName',
        );
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

        expect(mailer.sendConfirmationEmail).toHaveBeenCalledWith(
          VALID_INPUT.email,
          `http://localhost:3000/confirm.html?token=${MOCK_SUBSCRIPTION.confirmToken}`,
          expect.any(String),
        );
      });

      it('should build the unsubscribe URL using the subscription unsubscribeToken', async () => {
        await service.subscribe(VALID_INPUT);

        expect(mailer.sendConfirmationEmail).toHaveBeenCalledWith(
          VALID_INPUT.email,
          expect.any(String),
          `http://localhost:3000/unsubscribe.html?token=${MOCK_SUBSCRIPTION.unsubscribeToken}`,
        );
      });

      it('should send a confirmation email to the subscriber with the confirm and unsubscribe URLs', async () => {
        await service.subscribe(VALID_INPUT);

        const expectedConfirmUrl = `http://localhost:3000/confirm.html?token=${MOCK_SUBSCRIPTION.confirmToken}`;
        const expectedUnsubscribeUrl = `http://localhost:3000/unsubscribe.html?token=${MOCK_SUBSCRIPTION.unsubscribeToken}`;
        expect(mailer.sendConfirmationEmail).toHaveBeenCalledWith(
          VALID_INPUT.email,
          expectedConfirmUrl,
          expectedUnsubscribeUrl,
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

      it('should not send a confirmation email when the transaction fails', async () => {
        txCtx.subscriptions.createSubscription.mockRejectedValue(
          new Error('DB write failed'),
        );

        await expect(service.subscribe(VALID_INPUT)).rejects.toThrow();

        expect(mailer.sendConfirmationEmail).not.toHaveBeenCalled();
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

      it('should not delete the subscription when the token does not exist', async () => {
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
