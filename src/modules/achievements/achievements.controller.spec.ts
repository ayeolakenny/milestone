import { Test, TestingModule } from '@nestjs/testing';
import { AchievementsController } from './achievements.controller';
import { AchievementsService } from './achievements.service';

describe('AchievementsController', () => {
  let controller: AchievementsController;
  let service: { getSummaryForUser: jest.Mock };

  beforeEach(async () => {
    service = { getSummaryForUser: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AchievementsController],
      providers: [{ provide: AchievementsService, useValue: service }],
    }).compile();

    controller = module.get<AchievementsController>(AchievementsController);
  });

  it('delegates getSummary to AchievementsService with the route userId', async () => {
    const summary = {
      unlocked_achievements: ['First Purchase'],
      next_available_achievements: ['5 Purchases'],
      current_badge: 'Starter',
      next_badge: 'Achiever',
      remaining_to_unlock_next_badge: 2,
    };
    service.getSummaryForUser.mockResolvedValue(summary);

    const result = await controller.getSummary('u1');

    expect(service.getSummaryForUser).toHaveBeenCalledWith('u1');
    expect(result).toEqual(summary);
  });
});
