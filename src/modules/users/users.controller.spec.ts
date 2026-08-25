import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let controller: UsersController;
  let service: { create: jest.Mock; findById: jest.Mock };

  beforeEach(async () => {
    service = { create: jest.fn(), findById: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: service }],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('delegates create to UsersService', async () => {
    const dto = { email: 'amara@example.com', name: 'Amara Okafor' };
    service.create.mockResolvedValue({ id: 'u1', ...dto });

    const result = await controller.create(dto);

    expect(service.create).toHaveBeenCalledWith(dto);
    expect(result).toEqual({ id: 'u1', ...dto });
  });

  it('delegates findById to UsersService', async () => {
    service.findById.mockResolvedValue({ id: 'u1' });

    const result = await controller.findById('u1');

    expect(service.findById).toHaveBeenCalledWith('u1');
    expect(result).toEqual({ id: 'u1' });
  });
});
