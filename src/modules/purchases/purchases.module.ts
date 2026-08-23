import { Module } from '@nestjs/common';
import { PurchasesService } from './purchases.service';
import { PurchasesController } from './purchases.controller';
import { AchievementsModule } from '../achievements/achievements.module';
import { PrismaService } from 'src/services/prisma/prisma.service';

@Module({
  imports: [AchievementsModule],
  controllers: [PurchasesController],
  providers: [PurchasesService, PrismaService],
})
export class PurchasesModule {}
