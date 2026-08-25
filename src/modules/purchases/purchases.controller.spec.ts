import { Test, TestingModule } from '@nestjs/testing';
import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';

describe('PurchasesController', () => {
  let controller: PurchasesController;
  let service: { create: jest.Mock };

  beforeEach(async () => {
    service = { create: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PurchasesController],
      providers: [{ provide: PurchasesService, useValue: service }],
    }).compile();

    controller = module.get<PurchasesController>(PurchasesController);
  });

  it('delegates create to PurchasesService with the route userId', async () => {
    const dto = { amount: 500000 };
    service.create.mockResolvedValue({ id: 'p1', userId: 'u1', ...dto });

    const result = await controller.create('u1', dto);

    expect(service.create).toHaveBeenCalledWith('u1', dto);
    expect(result).toEqual({ id: 'p1', userId: 'u1', amount: 500000 });
  });
});
