import { Module } from '@nestjs/common';
import { EventListeners } from './events.listeners';
import { AchievementsModule } from '../../modules/achievements/achievements.module';
import { BadgesModule } from '../../modules/badges/badges.module';

@Module({
  imports: [AchievementsModule, BadgesModule],
  providers: [EventListeners],
})
export class EventsModule {}
