import { Test, TestingModule } from '@nestjs/testing';
import { EventListeners } from './events.listeners';
import { AchievementsService } from '../../modules/achievements/achievements.service';
import { BadgesService } from '../../modules/badges/badges.service';
import { PaymentsQueueService } from '../../modules/payments/payments.queue';
import { AchievementUnlockedEvent, BadgeUnlockedEvent } from './events.types';

describe('EventListeners', () => {
  let listeners: EventListeners;
  let achievementsService: { checkAndUnlockForUser: jest.Mock };
  let badgesService: { checkAndUnlockForUser: jest.Mock };
  let paymentsQueue: { enqueuePayout: jest.Mock };

  beforeEach(async () => {
    achievementsService = { checkAndUnlockForUser: jest.fn() };
    badgesService = { checkAndUnlockForUser: jest.fn() };
    paymentsQueue = { enqueuePayout: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventListeners,
        { provide: AchievementsService, useValue: achievementsService },
        { provide: BadgesService, useValue: badgesService },
        { provide: PaymentsQueueService, useValue: paymentsQueue },
      ],
    }).compile();

    listeners = module.get<EventListeners>(EventListeners);
  });

  it('checks achievements for the user on purchase.created', async () => {
    await listeners.handlePurchaseCreated({ userId: 'u1' });

    expect(achievementsService.checkAndUnlockForUser).toHaveBeenCalledWith('u1');
  });

  it('checks badges for the user on achievement.unlocked', async () => {
    const event = new AchievementUnlockedEvent('First Purchase', {
      id: 'u1',
      email: 'amara@example.com',
      name: 'Amara',
    });

    await listeners.handleAchievementUnlocked(event);

    expect(badgesService.checkAndUnlockForUser).toHaveBeenCalledWith('u1');
  });

  it('enqueues a payout on badge.unlocked', async () => {
    const event = new BadgeUnlockedEvent(
      'Starter',
      { id: 'u1', email: 'amara@example.com', name: 'Amara' },
      'ub1',
    );

    await listeners.handleBadgeUnlocked(event);

    expect(paymentsQueue.enqueuePayout).toHaveBeenCalledWith({
      badgeName: 'Starter',
      userBadgeId: 'ub1',
      userId: 'u1',
    });
  });
});
