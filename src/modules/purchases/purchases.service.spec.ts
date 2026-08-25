import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PurchasesService } from './purchases.service';
import { PrismaService } from '../../services/prisma/prisma.service';
import { EVENTS } from '../../services/events/events.types';

describe('PurchasesService', () => {
  let service: PurchasesService;
  let prisma: {
    user: { findUnique: jest.Mock };
    purchase: { create: jest.Mock };
  };
  let eventEmitter: { emit: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      purchase: { create: jest.fn() },
    };
    eventEmitter = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchasesService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<PurchasesService>(PurchasesService);
  });

  it('throws NotFoundException when the user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.create('missing-user', { amount: 500000 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.purchase.create).not.toHaveBeenCalled();
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('records the purchase and emits purchase.created', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
    prisma.purchase.create.mockResolvedValue({
      id: 'p1',
      userId: 'u1',
      amount: 500000,
    });

    const result = await service.create('u1', { amount: 500000 });

    expect(prisma.purchase.create).toHaveBeenCalledWith({
      data: { userId: 'u1', amount: 500000 },
    });
    expect(eventEmitter.emit).toHaveBeenCalledWith(EVENTS.PURCHASE_CREATED, {
      userId: 'u1',
    });
    expect(result).toEqual({ id: 'p1', userId: 'u1', amount: 500000 });
  });
});
