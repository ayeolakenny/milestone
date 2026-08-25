import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BadgesService } from './badges.service';
import { PrismaService } from '../../services/prisma/prisma.service';
import { BadgeUnlockedEvent, EVENTS } from '../../services/events/events.types';

describe('BadgesService', () => {
  let service: BadgesService;
  let prisma: {
    user: { findUnique: jest.Mock };
    userAchievement: { count: jest.Mock };
    badge: { findMany: jest.Mock };
    userBadge: { create: jest.Mock };
  };
  let eventEmitter: { emit: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      userAchievement: { count: jest.fn() },
      badge: { findMany: jest.fn() },
      userBadge: { create: jest.fn() },
    };
    eventEmitter = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BadgesService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<BadgesService>(BadgesService);
  });

  it('does nothing when the user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await service.checkAndUnlockForUser('missing');

    expect(prisma.userAchievement.count).not.toHaveBeenCalled();
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('does nothing when no badge threshold is met', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
    prisma.userAchievement.count.mockResolvedValue(0);
    prisma.badge.findMany.mockResolvedValue([]);

    await service.checkAndUnlockForUser('u1');

    expect(prisma.userBadge.create).not.toHaveBeenCalled();
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('unlocks every eligible badge and emits badge.unlocked with the new UserBadge id', async () => {
    const user = { id: 'u1', email: 'amara@example.com', name: 'Amara' };
    prisma.user.findUnique.mockResolvedValue(user);
    prisma.userAchievement.count.mockResolvedValue(1);
    prisma.badge.findMany.mockResolvedValue([
      { id: 'b1', name: 'Starter', requiredAchievementCount: 1, order: 1 },
    ]);
    prisma.userBadge.create.mockResolvedValue({ id: 'ub1', userId: 'u1', badgeId: 'b1' });

    await service.checkAndUnlockForUser('u1');

    expect(prisma.userBadge.create).toHaveBeenCalledWith({
      data: { userId: 'u1', badgeId: 'b1' },
    });
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      EVENTS.BADGE_UNLOCKED,
      new BadgeUnlockedEvent(
        'Starter',
        { id: 'u1', email: 'amara@example.com', name: 'Amara' },
        'ub1',
      ),
    );
  });

  it('queries badges scoped to threshold met and not yet unlocked by this user', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
    prisma.userAchievement.count.mockResolvedValue(2);
    prisma.badge.findMany.mockResolvedValue([]);

    await service.checkAndUnlockForUser('u1');

    expect(prisma.badge.findMany).toHaveBeenCalledWith({
      where: {
        requiredAchievementCount: { lte: 2 },
        unlockedBy: { none: { userId: 'u1' } },
      },
      orderBy: { order: 'asc' },
    });
  });
});
