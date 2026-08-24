import { Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../services/prisma/prisma.service';
import { PaystackWebhookEvent } from './webhook.types';
import { bad } from '../../utils/error.utils';
import { PaymentsQueueService } from '../payments/payments.queue';
import { MAX_PAYMENT_RETRIES } from '../../config/queue.constants';

const SUCCESS_EVENTS = new Set(['transfer.success']);
const FAILED_EVENTS = new Set(['transfer.failed', 'transfer.reversed']);

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  private readonly secretKey = process.env.PAYSTACK_SECRET_KEY!;

  constructor(
    private prisma: PrismaService,
    private paymentsQueue: PaymentsQueueService,
  ) {}

  async handlePaystackWebhook(
    event: PaystackWebhookEvent,
    rawBody: Buffer | undefined,
    signature?: string,
  ) {
    if (!rawBody || !signature || !this.isValidSignature(rawBody, signature)) {
      bad('Invalid webhook signature', 401);
    }

    if (SUCCESS_EVENTS.has(event.event)) {
      await this.markSuccess(event.data.reference, event.data.transfer_code);
    } else if (FAILED_EVENTS.has(event.event)) {
      await this.handleFailure(event.data.reference, event.data.transfer_code);
    } else {
      this.logger.verbose(`Ignoring unhandled Paystack event: ${event.event}`);
    }

    return { received: true };
  }

  private isValidSignature(rawBody: Buffer, signature: string): boolean {
    const expected = createHmac('sha512', this.secretKey)
      .update(rawBody)
      .digest('hex');
    const expectedBuf = Buffer.from(expected, 'utf8');
    const signatureBuf = Buffer.from(signature, 'utf8');

    return (
      expectedBuf.length === signatureBuf.length &&
      timingSafeEqual(expectedBuf, signatureBuf)
    );
  }

  private async markSuccess(reference: string, providerRef: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { reference },
    });

    if (!payment) {
      this.logger.warn(`Webhook for unknown payment reference: ${reference}`);
      return;
    }
    if (payment.status === 'SUCCESS') return;

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'SUCCESS', providerRef },
    });
  }

  private async handleFailure(reference: string, providerRef: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { reference },
    });

    if (!payment) {
      this.logger.warn(`Webhook for unknown payment reference: ${reference}`);
      return;
    }
    // Success already recorded (or arrived out of order) — a late failure
    // event for the same transfer shouldn't override it.
    if (payment.status === 'SUCCESS') return;

    if (payment.retryCount >= MAX_PAYMENT_RETRIES) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED', providerRef },
      });
      this.logger.error(
        `Payment ${payment.id} failed after ${payment.retryCount} retries — giving up`,
      );
      return;
    }

    const userBadge = await this.prisma.userBadge.findUnique({
      where: { id: payment.userBadgeId },
      include: { badge: true },
    });

    if (!userBadge) {
      this.logger.warn(
        `No UserBadge found for payment ${payment.id} — cannot retry`,
      );
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED', providerRef },
      });
      return;
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { retryCount: { increment: 1 }, providerRef },
    });

    await this.paymentsQueue.enqueuePayout({
      userId: payment.userId,
      userBadgeId: payment.userBadgeId,
      badgeName: userBadge.badge.name,
    });
  }
}
