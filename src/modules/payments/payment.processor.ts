import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { randomUUID } from 'crypto';
import { PaystackService } from 'src/services/paystack/paystack.service';
import { PrismaService } from 'src/services/prisma/prisma.service';
import { QUEUES } from 'src/config/queue.constants';

const CASHBACK_AMOUNT_KOBO = Number(process.env.CASHBACK_AMOUNT_KOBO ?? 30000);

@Processor(QUEUES.PAYMENT)
export class PaymentProcessor extends WorkerHost {
  constructor(
    private prisma: PrismaService,
    private paystackService: PaystackService,
  ) {
    super();
  }

  async process(job: Job) {
    const { userId, userBadgeId, badgeName } = job.data;

    let payment = await this.prisma.payment.findUnique({
      where: { userBadgeId },
    });

    if (payment?.status === 'SUCCESS') return; // already paid — nothing to do

    if (!payment) {
      payment = await this.prisma.payment.create({
        data: {
          userId,
          userBadgeId,
          reference: `badge-payout-${userBadgeId}-${randomUUID().slice(0, 8)}`,
          amount: CASHBACK_AMOUNT_KOBO,
          status: 'PENDING',
          provider: 'paystack',
        },
      });
    }

    try {
      const result = await this.paystackService.initiateTransfer({
        amount: CASHBACK_AMOUNT_KOBO,
        reason: `Cashback for unlocking ${badgeName}`,
        recipient: process.env.PAYSTACK_TEST_RECIPIENT_CODE!,
        reference: payment.reference,
      });

      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'SUCCESS', providerRef: result.transfer_code },
      });
    } catch (err) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED' },
      });
      throw err; // re-throw so BullMQ actually retries — swallowing this would silently stop the retry mechanism
    }
  }
}
