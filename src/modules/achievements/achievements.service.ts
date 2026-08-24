import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
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

  async getSummaryForUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const unlocked = await this.prisma.userAchievement.findMany({
      where: { userId },
      include: { achievement: true },
    });
    const unlockedIds = new Set(unlocked.map((u) => u.achievementId));
    const unlockedNames = unlocked.map((u) => u.achievement.name);

    // Next available achievement per group — lowest `order` not yet unlocked, per group
    const groups = await this.prisma.achievementGroup.findMany({
      include: { achievements: { orderBy: { order: 'asc' } } },
    });

    const nextAvailable: string[] = [];
    for (const group of groups) {
      const next = group.achievements.find((a) => !unlockedIds.has(a.id));
      if (next) nextAvailable.push(next.name);
    }

    // Badges
    const unlockedBadges = await this.prisma.userBadge.findMany({
      where: { userId },
      include: { badge: true },
      orderBy: { badge: { order: 'desc' } },
    });
    const currentBadge = unlockedBadges[0]?.badge.name ?? null;

    const allBadges = await this.prisma.badge.findMany({
      orderBy: { order: 'asc' },
    });
    const unlockedBadgeIds = new Set(unlockedBadges.map((ub) => ub.badgeId));
    const nextBadgeRow = allBadges.find((b) => !unlockedBadgeIds.has(b.id));

    const totalUnlocked = unlockedNames.length;
    const remainingToUnlockNextBadge = nextBadgeRow
      ? Math.max(0, nextBadgeRow.requiredAchievementCount - totalUnlocked)
      : 0;

    return {
      unlocked_achievements: unlockedNames,
      next_available_achievements: nextAvailable,
      current_badge: currentBadge,
      next_badge: nextBadgeRow?.name ?? null,
      remaining_to_unlock_next_badge: remainingToUnlockNextBadge,
    };
  }
}
