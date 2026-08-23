import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './services/prisma/prisma.module';
import { PurchasesModule } from './modules/purchases/purchases.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AchievementsModule } from './modules/achievements/achievements.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    UsersModule,
    PrismaModule,
    PurchasesModule,
    AchievementsModule,
    EventEmitterModule.forRoot(),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
