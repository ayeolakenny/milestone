import { Test, TestingModule } from '@nestjs/testing';
import { PaymentProcessor } from './payment.processor';
import { PrismaService } from '../../services/prisma/prisma.service';
import { PaystackService } from '../../services/paystack/paystack.service';

jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomUUID: () => 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
}));

describe('PaymentProcessor', () => {
  let processor: PaymentProcessor;
  let prisma: {
    payment: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };
  let paystackService: { initiateTransfer: jest.Mock };

  const job = {
    data: { userId: 'u1', userBadgeId: 'ub1', badgeName: 'Starter' },
  } as any;

  beforeEach(async () => {
    prisma = {
      payment: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    paystackService = { initiateTransfer: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentProcessor,
        { provide: PrismaService, useValue: prisma },
        { provide: PaystackService, useValue: paystackService },
      ],
    }).compile();

    processor = module.get<PaymentProcessor>(PaymentProcessor);
  });

  it('does nothing if the payment already succeeded', async () => {
    prisma.payment.findUnique.mockResolvedValue({ id: 'p1', status: 'SUCCESS' });

    await processor.process(job);

    expect(prisma.payment.create).not.toHaveBeenCalled();
    expect(paystackService.initiateTransfer).not.toHaveBeenCalled();
  });

  it('creates a new Payment row with a fresh reference on first attempt', async () => {
    prisma.payment.findUnique.mockResolvedValue(null);
    prisma.payment.create.mockResolvedValue({
      id: 'p1',
      reference: 'badge-payout-ub1-aaaaaaaa',
      status: 'PENDING',
    });
    paystackService.initiateTransfer.mockResolvedValue({
      transfer_code: 'TRF_123',
    });
    prisma.payment.update.mockResolvedValue({});

    await processor.process(job);

    expect(prisma.payment.create).toHaveBeenCalledWith({
      data: {
        userId: 'u1',
        userBadgeId: 'ub1',
        reference: 'badge-payout-ub1-aaaaaaaa',
        amount: expect.any(Number),
        status: 'PENDING',
        provider: 'paystack',
      },
    });
    expect(paystackService.initiateTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'Cashback for unlocking Starter',
        reference: 'badge-payout-ub1-aaaaaaaa',
      }),
    );
  });

  it('regenerates the reference on a retry attempt instead of reusing the old one', async () => {
    prisma.payment.findUnique.mockResolvedValue({
      id: 'p1',
      reference: 'badge-payout-ub1-oldstale',
      status: 'PENDING',
    });
    prisma.payment.update.mockResolvedValueOnce({
      id: 'p1',
      reference: 'badge-payout-ub1-aaaaaaaa',
      status: 'PENDING',
    });
    paystackService.initiateTransfer.mockResolvedValue({
      transfer_code: 'TRF_123',
    });

    await processor.process(job);

    expect(prisma.payment.create).not.toHaveBeenCalled();
    expect(prisma.payment.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'p1' },
      data: { reference: 'badge-payout-ub1-aaaaaaaa' },
    });
    expect(paystackService.initiateTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ reference: 'badge-payout-ub1-aaaaaaaa' }),
    );
  });

  it('stores the providerRef on a successful transfer without marking SUCCESS', async () => {
    prisma.payment.findUnique.mockResolvedValue(null);
    prisma.payment.create.mockResolvedValue({
      id: 'p1',
      reference: 'badge-payout-ub1-aaaaaaaa',
    });
    paystackService.initiateTransfer.mockResolvedValue({
      transfer_code: 'TRF_123',
    });

    await processor.process(job);

    expect(prisma.payment.update).toHaveBeenLastCalledWith({
      where: { id: 'p1' },
      data: { providerRef: 'TRF_123' },
    });
  });

  it('marks the payment FAILED and rethrows when the Paystack call itself fails', async () => {
    prisma.payment.findUnique.mockResolvedValue(null);
    prisma.payment.create.mockResolvedValue({
      id: 'p1',
      reference: 'badge-payout-ub1-aaaaaaaa',
    });
    const error = new Error('network error');
    paystackService.initiateTransfer.mockRejectedValue(error);

    await expect(processor.process(job)).rejects.toThrow(error);

    expect(prisma.payment.update).toHaveBeenLastCalledWith({
      where: { id: 'p1' },
      data: { status: 'FAILED' },
    });
  });
});
