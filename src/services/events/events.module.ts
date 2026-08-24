import { Module } from '@nestjs/common';
import { EventListeners } from './events.listeners';
import { AchievementsModule } from '../../modules/achievements/achievements.module';
import { BadgesModule } from '../../modules/badges/badges.module';
import { PaymentsModule } from '../../modules/payments/payments.module';

@Module({
  imports: [AchievementsModule, BadgesModule, PaymentsModule],
  providers: [EventListeners],
})
export class EventsModule {}
