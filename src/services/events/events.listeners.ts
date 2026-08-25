import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  AchievementUnlockedEvent,
  BadgeUnlockedEvent,
  EVENTS,
} from './events.types';
import { BadgesService } from '../../modules/badges/badges.service';
import { AchievementsService } from '../../modules/achievements/achievements.service';
import { PaymentsQueueService } from '../../modules/payments/payments.queue';

// Single hub for every domain event in the app. Purchases, achievements, and
// badges don't call each other directly — each just emits an event and stays
// ignorant of what happens downstream. Wiring lives here, in one place, so
// adding a new reaction to an existing event never means touching the module
// that emits it.
@Injectable()
export class EventListeners {
  constructor(
    private badgesService: BadgesService,
    private paymentsService: PaymentsQueueService,
    private achievementsService: AchievementsService,
  ) {}

  @OnEvent(EVENTS.PURCHASE_CREATED)
  async handlePurchaseCreated(payload: { userId: string }) {
    await this.achievementsService.checkAndUnlockForUser(payload.userId);
  }

  @OnEvent(EVENTS.ACHIEVEMENT_UNLOCKED)
  async handleAchievementUnlocked(event: AchievementUnlockedEvent) {
    await this.badgesService.checkAndUnlockForUser(event.user.id);
  }

  @OnEvent(EVENTS.BADGE_UNLOCKED)
  async handleBadgeUnlocked(event: BadgeUnlockedEvent) {
    await this.paymentsService.enqueuePayout({
      badgeName: event.badge_name,
      userBadgeId: event.userBadgeId,
      userId: event.user.id,
    });
  }
}
