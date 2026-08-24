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

@Module({
  imports: [
    UsersModule,
    BadgesModule,
    PrismaModule,
    PurchasesModule,
    AchievementsModule,
    EventEmitterModule.forRoot(),
    EventsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
