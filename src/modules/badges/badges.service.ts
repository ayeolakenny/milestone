import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  BadgeUnlockedEvent,
  EVENTS,
} from '../../services/events/events.types';
import { PrismaService } from '../../services/prisma/prisma.service';

@Injectable()
export class BadgesService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  async checkAndUnlockForUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;

    const totalUnlocked = await this.prisma.userAchievement.count({
      where: { userId },
    });

    const eligible = await this.prisma.badge.findMany({
      where: {
        requiredAchievementCount: { lte: totalUnlocked },
        unlockedBy: { none: { userId } },
      },
      orderBy: { order: 'asc' },
    });

    for (const badge of eligible) {
      await this.prisma.userBadge.create({
        data: { userId, badgeId: badge.id },
      });

      this.eventEmitter.emit(
        EVENTS.BADGE_UNLOCKED,
        new BadgeUnlockedEvent(badge.name, {
          id: user.id,
          email: user.email,
          name: user.name,
        }),
      );
    }
  }
}
