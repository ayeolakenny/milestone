import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AchievementUnlockedEvent, EVENTS } from './events.types';
import { BadgesService } from '../../modules/badges/badges.service';
import { AchievementsService } from '../../modules/achievements/achievements.service';

@Injectable()
export class EventListeners {
  constructor(
    private badgesService: BadgesService,
    private achievementsService: AchievementsService,
  ) {}

  @OnEvent(EVENTS.PURCHASE_CREATED)
  async handlePurchaseCreated(payload: { userId: string }) {
    await this.achievementsService.checkAndUnlockForUser(payload.userId);
  }

  @OnEvent(EVENTS.ACHIEVEMENT_UNLOCKED)
  async handle(event: AchievementUnlockedEvent) {
    await this.badgesService.checkAndUnlockForUser(event.user.id);
  }
}
