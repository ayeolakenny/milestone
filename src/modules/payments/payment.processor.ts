import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { randomUUID } from 'crypto';
import { PaystackService } from '../../services/paystack/paystack.service';
import { PrismaService } from '../../services/prisma/prisma.service';
import { QUEUES } from '../../config/queue.constants';

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

    // Paystack rejects a reused reference with "duplicate_transfer_reference",
    // so every attempt (including retries) needs its own fresh reference —
    // the Payment row itself, not the reference, is what dedupes on userBadgeId.
    const reference = `badge-payout-${userBadgeId}-${randomUUID().slice(0, 8)}`;

    if (!payment) {
      payment = await this.prisma.payment.create({
        data: {
          userId,
          userBadgeId,
          reference,
          amount: CASHBACK_AMOUNT_KOBO,
          status: 'PENDING',
          provider: 'paystack',
        },
      });
    } else {
      payment = await this.prisma.payment.update({
        where: { id: payment.id },
        data: { reference },
      });
    }

    try {
      const result = await this.paystackService.initiateTransfer({
        amount: CASHBACK_AMOUNT_KOBO,
        reason: `Cashback for unlocking ${badgeName}`,
        recipient: process.env.PAYSTACK_TEST_RECIPIENT_CODE!,
        reference: payment.reference,
      });

      // Transfer accepted, not yet completed — the Paystack webhook is the
      // source of truth for the final SUCCESS/FAILED status.
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { providerRef: result.transfer_code },
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
