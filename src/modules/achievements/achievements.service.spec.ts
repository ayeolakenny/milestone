import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AchievementsService } from './achievements.service';
import { PrismaService } from '../../services/prisma/prisma.service';
import { AchievementUnlockedEvent, EVENTS } from '../../services/events/events.types';

describe('AchievementsService', () => {
  let service: AchievementsService;
  let prisma: {
    user: { findUnique: jest.Mock };
    purchase: { count: jest.Mock };
    achievement: { findMany: jest.Mock };
    userAchievement: { create: jest.Mock; findMany: jest.Mock };
    achievementGroup: { findMany: jest.Mock };
    userBadge: { findMany: jest.Mock };
    badge: { findMany: jest.Mock };
  };
  let eventEmitter: { emit: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      purchase: { count: jest.fn() },
      achievement: { findMany: jest.fn() },
      userAchievement: { create: jest.fn(), findMany: jest.fn() },
      achievementGroup: { findMany: jest.fn() },
      userBadge: { findMany: jest.fn() },
      badge: { findMany: jest.fn() },
    };
    eventEmitter = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AchievementsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<AchievementsService>(AchievementsService);
  });

  describe('checkAndUnlockForUser', () => {
    it('does nothing when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await service.checkAndUnlockForUser('missing');

      expect(prisma.purchase.count).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('does nothing when no achievement threshold is met', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'amara@example.com',
        name: 'Amara',
      });
      prisma.purchase.count.mockResolvedValue(1);
      prisma.achievement.findMany.mockResolvedValue([]);

      await service.checkAndUnlockForUser('u1');

      expect(prisma.userAchievement.create).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('unlocks every eligible achievement and emits one event per unlock', async () => {
      const user = { id: 'u1', email: 'amara@example.com', name: 'Amara' };
      prisma.user.findUnique.mockResolvedValue(user);
      prisma.purchase.count.mockResolvedValue(5);
      prisma.achievement.findMany.mockResolvedValue([
        { id: 'a1', name: 'First Purchase', threshold: 1, order: 1 },
        { id: 'a2', name: '5 Purchases', threshold: 5, order: 2 },
      ]);
      prisma.userAchievement.create.mockResolvedValue({});

      await service.checkAndUnlockForUser('u1');

      expect(prisma.userAchievement.create).toHaveBeenCalledTimes(2);
      expect(prisma.userAchievement.create).toHaveBeenNthCalledWith(1, {
        data: { userId: 'u1', achievementId: 'a1' },
      });
      expect(prisma.userAchievement.create).toHaveBeenNthCalledWith(2, {
        data: { userId: 'u1', achievementId: 'a2' },
      });

      expect(eventEmitter.emit).toHaveBeenCalledTimes(2);
      expect(eventEmitter.emit).toHaveBeenNthCalledWith(
        1,
        EVENTS.ACHIEVEMENT_UNLOCKED,
        new AchievementUnlockedEvent('First Purchase', {
          id: 'u1',
          email: 'amara@example.com',
          name: 'Amara',
        }),
      );
      expect(eventEmitter.emit).toHaveBeenNthCalledWith(
        2,
        EVENTS.ACHIEVEMENT_UNLOCKED,
        new AchievementUnlockedEvent('5 Purchases', {
          id: 'u1',
          email: 'amara@example.com',
          name: 'Amara',
        }),
      );
    });

    it('queries achievements scoped to purchases group, threshold met, not yet unlocked', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      prisma.purchase.count.mockResolvedValue(3);
      prisma.achievement.findMany.mockResolvedValue([]);

      await service.checkAndUnlockForUser('u1');

      expect(prisma.achievement.findMany).toHaveBeenCalledWith({
        where: {
          group: { key: 'purchases' },
          threshold: { lte: 3 },
          unlockedBy: { none: { userId: 'u1' } },
        },
        orderBy: { order: 'asc' },
      });
    });
  });

  describe('getSummaryForUser', () => {
    it('throws NotFoundException when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getSummaryForUser('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns unlocked/next achievements and current/next badge progress', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      prisma.userAchievement.findMany.mockResolvedValue([
        { achievementId: 'a1', achievement: { id: 'a1', name: 'First Purchase' } },
      ]);
      prisma.achievementGroup.findMany.mockResolvedValue([
        {
          key: 'purchases',
          achievements: [
            { id: 'a1', name: 'First Purchase', order: 1 },
            { id: 'a2', name: '5 Purchases', order: 2 },
          ],
        },
      ]);
      prisma.userBadge.findMany.mockResolvedValue([
        { badgeId: 'b1', badge: { id: 'b1', name: 'Starter', order: 1 } },
      ]);
      prisma.badge.findMany.mockResolvedValue([
        { id: 'b1', name: 'Starter', order: 1, requiredAchievementCount: 1 },
        { id: 'b2', name: 'Achiever', order: 2, requiredAchievementCount: 3 },
      ]);

      const result = await service.getSummaryForUser('u1');

      expect(result).toEqual({
        unlocked_achievements: ['First Purchase'],
        next_available_achievements: ['5 Purchases'],
        current_badge: 'Starter',
        next_badge: 'Achiever',
        remaining_to_unlock_next_badge: 2,
      });
    });

    it('returns nulls/zero when nothing is unlocked yet', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      prisma.userAchievement.findMany.mockResolvedValue([]);
      prisma.achievementGroup.findMany.mockResolvedValue([]);
      prisma.userBadge.findMany.mockResolvedValue([]);
      prisma.badge.findMany.mockResolvedValue([]);

      const result = await service.getSummaryForUser('u1');

      expect(result).toEqual({
        unlocked_achievements: [],
        next_available_achievements: [],
        current_badge: null,
        next_badge: null,
        remaining_to_unlock_next_badge: 0,
      });
    });
  });
});
