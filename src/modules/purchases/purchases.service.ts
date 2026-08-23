import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../services/prisma/prisma.service';
import { CreatePurchaseDto } from './purchases.types';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { EVENTS } from '../../services/events/events.types';
import { AchievementsService } from '../achievements/achievements.service';

@Injectable()
export class PurchasesService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
    private achievementsService: AchievementsService,
  ) {}

  async create(userId: string, dto: CreatePurchaseDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const purchase = await this.prisma.purchase.create({
      data: { userId, amount: dto.amount },
    });

    this.eventEmitter.emit(EVENTS.PURCHASE_CREATED, { userId });

    return purchase;
  }

  @OnEvent(EVENTS.PURCHASE_CREATED)
  async handle(payload: { userId: string }) {
    await this.achievementsService.checkAndUnlockForUser(payload.userId);
  }
}
