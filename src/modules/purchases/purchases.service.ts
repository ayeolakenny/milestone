import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../services/prisma/prisma.service';
import { CreatePurchaseDto } from './purchases.types';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EVENTS } from '../../services/events/events.types';
import { bad } from '../../utils/error.utils';

@Injectable()
export class PurchasesService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  async create(userId: string, dto: CreatePurchaseDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) bad('User not found', 404);

    const purchase = await this.prisma.purchase.create({
      data: { userId, amount: dto.amount },
    });

    this.eventEmitter.emit(EVENTS.PURCHASE_CREATED, { userId });

    return purchase;
  }
}
