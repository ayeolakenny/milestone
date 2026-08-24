import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './services/prisma/prisma.module';
import { PurchasesModule } from './modules/purchases/purchases.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AchievementsModule } from './modules/achievements/achievements.module';
import { UsersModule } from './modules/users/users.module';
import { BadgesModule } from './modules/badges/badges.module';
import { EventsModule } from './services/events/events.module';
import { BullModule } from '@nestjs/bullmq';
import { PaystackModule } from './services/paystack/paystack.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { WebhookModule } from './modules/webhook/webhook.module';

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        url: process.env.REDIS_URL,
      },
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 3000,
        },
      },
    }),
    EventEmitterModule.forRoot(),
    UsersModule,
    BadgesModule,
    PrismaModule,
    EventsModule,
    PaystackModule,
    PaymentsModule,
    PurchasesModule,
    AchievementsModule,
    WebhookModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
