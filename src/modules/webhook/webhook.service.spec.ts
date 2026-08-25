import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { WebhookService } from './webhook.service';
import { PrismaService } from '../../services/prisma/prisma.service';
import { PaymentsQueueService } from '../payments/payments.queue';
import { MAX_PAYMENT_RETRIES } from '../../config/queue.constants';

const SECRET = 'test-paystack-secret';

function sign(body: object): { rawBody: Buffer; signature: string } {
  const rawBody = Buffer.from(JSON.stringify(body));
  const signature = createHmac('sha512', SECRET).update(rawBody).digest('hex');
  return { rawBody, signature };
}

describe('WebhookService', () => {
  let service: WebhookService;
  let prisma: {
    payment: { findUnique: jest.Mock; update: jest.Mock };
    userBadge: { findUnique: jest.Mock };
  };
  let paymentsQueue: { enqueuePayout: jest.Mock };

  beforeEach(async () => {
    process.env.PAYSTACK_SECRET_KEY = SECRET;

    prisma = {
      payment: { findUnique: jest.fn(), update: jest.fn() },
      userBadge: { findUnique: jest.fn() },
    };
    paymentsQueue = { enqueuePayout: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        { provide: PrismaService, useValue: prisma },
        { provide: PaymentsQueueService, useValue: paymentsQueue },
      ],
    }).compile();

    service = module.get<WebhookService>(WebhookService);
  });

  describe('signature verification', () => {
    const event = {
      event: 'transfer.success',
      data: { reference: 'ref-1', status: 'success', transfer_code: 'TRF_1', amount: 30000 },
    };

    it('rejects a missing signature', async () => {
      const { rawBody } = sign(event);
      await expect(
        service.handlePaystackWebhook(event, rawBody, undefined),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a missing raw body', async () => {
      const { signature } = sign(event);
      await expect(
        service.handlePaystackWebhook(event, undefined, signature),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a signature that does not match the body', async () => {
      const { rawBody } = sign(event);
      const wrongSignature = createHmac('sha512', 'wrong-secret')
        .update(rawBody)
        .digest('hex');

      await expect(
        service.handlePaystackWebhook(event, rawBody, wrongSignature),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('accepts a correctly signed payload', async () => {
      const { rawBody, signature } = sign(event);
      prisma.payment.findUnique.mockResolvedValue(null);

      const result = await service.handlePaystackWebhook(event, rawBody, signature);

      expect(result).toEqual({ received: true });
    });
  });

  describe('transfer.success', () => {
    it('logs and no-ops for an unknown payment reference', async () => {
      const event = {
        event: 'transfer.success',
        data: { reference: 'unknown-ref', status: 'success', transfer_code: 'TRF_1', amount: 30000 },
      };
      const { rawBody, signature } = sign(event);
      prisma.payment.findUnique.mockResolvedValue(null);

      await service.handlePaystackWebhook(event, rawBody, signature);

      expect(prisma.payment.update).not.toHaveBeenCalled();
    });

    it('marks a pending payment as SUCCESS with the provider reference', async () => {
      const event = {
        event: 'transfer.success',
        data: { reference: 'ref-1', status: 'success', transfer_code: 'TRF_1', amount: 30000 },
      };
      const { rawBody, signature } = sign(event);
      prisma.payment.findUnique.mockResolvedValue({
        id: 'p1',
        status: 'PENDING',
        retryCount: 0,
      });

      await service.handlePaystackWebhook(event, rawBody, signature);

      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { status: 'SUCCESS', providerRef: 'TRF_1' },
      });
    });

    it('is idempotent — does nothing if already SUCCESS', async () => {
      const event = {
        event: 'transfer.success',
        data: { reference: 'ref-1', status: 'success', transfer_code: 'TRF_1', amount: 30000 },
      };
      const { rawBody, signature } = sign(event);
      prisma.payment.findUnique.mockResolvedValue({ id: 'p1', status: 'SUCCESS' });

      await service.handlePaystackWebhook(event, rawBody, signature);

      expect(prisma.payment.update).not.toHaveBeenCalled();
    });
  });

  describe('transfer.failed / transfer.reversed', () => {
    const buildEvent = (eventName: string) => ({
      event: eventName,
      data: { reference: 'ref-1', status: 'failed', transfer_code: 'TRF_1', amount: 30000 },
    });

    it('ignores a late failure for an already-SUCCESS payment', async () => {
      const event = buildEvent('transfer.failed');
      const { rawBody, signature } = sign(event);
      prisma.payment.findUnique.mockResolvedValue({ id: 'p1', status: 'SUCCESS' });

      await service.handlePaystackWebhook(event, rawBody, signature);

      expect(prisma.payment.update).not.toHaveBeenCalled();
      expect(paymentsQueue.enqueuePayout).not.toHaveBeenCalled();
    });

    it('retries (increments retryCount and re-enqueues) when under the limit', async () => {
      const event = buildEvent('transfer.reversed');
      const { rawBody, signature } = sign(event);
      prisma.payment.findUnique.mockResolvedValue({
        id: 'p1',
        userId: 'u1',
        userBadgeId: 'ub1',
        status: 'PENDING',
        retryCount: 0,
      });
      prisma.userBadge.findUnique.mockResolvedValue({
        id: 'ub1',
        badge: { name: 'Starter' },
      });

      await service.handlePaystackWebhook(event, rawBody, signature);

      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { retryCount: { increment: 1 }, providerRef: 'TRF_1' },
      });
      expect(paymentsQueue.enqueuePayout).toHaveBeenCalledWith({
        userId: 'u1',
        userBadgeId: 'ub1',
        badgeName: 'Starter',
      });
    });

    it('gives up (marks FAILED, does not retry) once MAX_PAYMENT_RETRIES is reached', async () => {
      const event = buildEvent('transfer.failed');
      const { rawBody, signature } = sign(event);
      prisma.payment.findUnique.mockResolvedValue({
        id: 'p1',
        userId: 'u1',
        userBadgeId: 'ub1',
        status: 'PENDING',
        retryCount: MAX_PAYMENT_RETRIES,
      });

      await service.handlePaystackWebhook(event, rawBody, signature);

      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { status: 'FAILED', providerRef: 'TRF_1' },
      });
      expect(paymentsQueue.enqueuePayout).not.toHaveBeenCalled();
    });

    it('marks FAILED without retrying if the UserBadge no longer exists', async () => {
      const event = buildEvent('transfer.failed');
      const { rawBody, signature } = sign(event);
      prisma.payment.findUnique.mockResolvedValue({
        id: 'p1',
        userId: 'u1',
        userBadgeId: 'ub1',
        status: 'PENDING',
        retryCount: 0,
      });
      prisma.userBadge.findUnique.mockResolvedValue(null);

      await service.handlePaystackWebhook(event, rawBody, signature);

      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { status: 'FAILED', providerRef: 'TRF_1' },
      });
      expect(paymentsQueue.enqueuePayout).not.toHaveBeenCalled();
    });
  });

  it('ignores webhook events it does not recognize', async () => {
    const event = {
      event: 'transfer.pending',
      data: { reference: 'ref-1', status: 'pending', transfer_code: 'TRF_1', amount: 30000 },
    };
    const { rawBody, signature } = sign(event);

    const result = await service.handlePaystackWebhook(event, rawBody, signature);

    expect(prisma.payment.findUnique).not.toHaveBeenCalled();
    expect(result).toEqual({ received: true });
  });
});
