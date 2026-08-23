import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  AchievementUnlockedEvent,
  EVENTS,
} from '../../services/events/events.types';
import { PrismaService } from '../../services/prisma/prisma.service';

@Injectable()
export class AchievementsService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  async checkAndUnlockForUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;

    const purchaseCount = await this.prisma.purchase.count({
      where: { userId },
    });

    // Achievements in the "purchases" group whose threshold is now met,
    // that this user hasn't already unlocked.
    const eligible = await this.prisma.achievement.findMany({
      where: {
        group: { key: 'purchases' },
        threshold: { lte: purchaseCount },
        unlockedBy: { none: { userId } },
      },
      orderBy: { order: 'asc' },
    });

    for (const achievement of eligible) {
      await this.prisma.userAchievement.create({
        data: { userId, achievementId: achievement.id },
      });

      this.eventEmitter.emit(
        EVENTS.ACHIEVEMENT_UNLOCKED,
        new AchievementUnlockedEvent(achievement.name, {
          id: user.id,
          email: user.email,
          name: user.name,
        }),
      );
    }
  }
}
