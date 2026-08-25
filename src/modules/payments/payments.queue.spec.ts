import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { PaymentsQueueService } from './payments.queue';
import { PaymentJobType, QUEUES } from '../../config/queue.constants';

describe('PaymentsQueueService', () => {
  let service: PaymentsQueueService;
  let queue: { add: jest.Mock };

  beforeEach(async () => {
    queue = { add: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsQueueService,
        { provide: getQueueToken(QUEUES.PAYMENT), useValue: queue },
      ],
    }).compile();

    service = module.get<PaymentsQueueService>(PaymentsQueueService);
  });

  it('enqueues a payout job with the given payload', async () => {
    const payload = { userId: 'u1', userBadgeId: 'ub1', badgeName: 'Starter' };

    await service.enqueuePayout(payload);

    expect(queue.add).toHaveBeenCalledWith(PaymentJobType.PAYOUT, payload);
  });
});
