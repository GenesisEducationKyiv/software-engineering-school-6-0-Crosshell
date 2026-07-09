import { describe, it, expect, beforeEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { SubscriptionService } from './subscription.service';
import { NotFoundError } from '@/shared/errors/app.errors';
import type { ISubscriptionRepository } from './interfaces/subscription.repository.interface';
import type { Subscription } from './types/subscription.type';

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
  let subscriptionRepository: ReturnType<typeof mock<ISubscriptionRepository>>;

  beforeEach(() => {
    subscriptionRepository = mock<ISubscriptionRepository>();
    subscriptionRepository.findByConfirmToken.mockResolvedValue(null);
    subscriptionRepository.findByUnsubscribeToken.mockResolvedValue(null);
    subscriptionRepository.confirm.mockResolvedValue(undefined);
    subscriptionRepository.deleteById.mockResolvedValue(undefined);
    subscriptionRepository.findConfirmedByEmail.mockResolvedValue([]);

    service = new SubscriptionService(subscriptionRepository);
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
