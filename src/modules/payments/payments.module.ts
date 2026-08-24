import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES } from 'src/config/queue.constants';
import { PaymentsQueueService } from './payments.queue';
import { PaymentProcessor } from './payment.processor';
import { PaystackModule } from 'src/services/paystack/paystack.module';
import { PrismaModule } from 'src/services/prisma/prisma.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: QUEUES.PAYMENT,
    }),
    PaystackModule,
    PrismaModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentsQueueService, PaymentProcessor],
  exports: [PaymentsQueueService],
})
export class PaymentsModule {}
