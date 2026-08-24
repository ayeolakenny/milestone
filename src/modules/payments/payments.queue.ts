import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PaymentJobType, QUEUES } from 'src/config/queue.constants';
import { PayoutDto } from './payment.types';

@Injectable()
export class PaymentsQueueService {
  constructor(
    @InjectQueue(QUEUES.PAYMENT) private readonly paymentsQueue: Queue,
  ) {}

  async enqueuePayout(data: PayoutDto) {
    await this.paymentsQueue.add(PaymentJobType.PAYOUT, data);
  }
}
