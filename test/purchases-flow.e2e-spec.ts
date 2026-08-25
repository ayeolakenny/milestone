import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { createHmac } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/services/prisma/prisma.service';
import { PaystackService } from '../src/services/paystack/paystack.service';

async function waitFor<T>(
  fn: () => Promise<T | null | undefined>,
  { timeout = 5000, interval = 100 }: { timeout?: number; interval?: number } = {},
): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const result = await fn();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error('waitFor: condition was not met within the timeout');
}

describe('Purchases -> Achievements -> Badges -> Payments (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let userId: string;

  const testEmail = `e2e-${Date.now()}@example.com`;
  const mockInitiateTransfer = jest
    .spyOn(PaystackService.prototype, 'initiateTransfer')
    .mockResolvedValue({ transfer_code: 'TRF_e2e_test' } as any);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (userId) {
      await prisma.payment.deleteMany({ where: { userId } });
      await prisma.userBadge.deleteMany({ where: { userId } });
      await prisma.userAchievement.deleteMany({ where: { userId } });
      await prisma.purchase.deleteMany({ where: { userId } });
      await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    }
    mockInitiateTransfer.mockRestore();
    await app.close();
  });

  it('POST /users creates a user', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/users')
      .send({ email: testEmail, name: 'E2E Test User' })
      .expect(201);

    expect(res.body).toMatchObject({ email: testEmail, name: 'E2E Test User' });
    userId = res.body.id;
  });

  it('POST /users rejects a duplicate email with 409', async () => {
    await request(app.getHttpServer())
      .post('/api/users')
      .send({ email: testEmail, name: 'Someone Else' })
      .expect(409);
  });

  it('POST /users rejects an invalid payload with 400', async () => {
    await request(app.getHttpServer())
      .post('/api/users')
      .send({ email: 'not-an-email', name: '' })
      .expect(400);
  });

  it('POST /users/:userId/purchases 404s for a nonexistent user', async () => {
    await request(app.getHttpServer())
      .post('/api/users/does-not-exist/purchases')
      .send({ amount: 500000 })
      .expect(404);
  });

  it('POST /users/:userId/purchases rejects a non-positive amount with 400', async () => {
    await request(app.getHttpServer())
      .post(`/api/users/${userId}/purchases`)
      .send({ amount: -100 })
      .expect(400);
  });

  it('a purchase unlocks the First Purchase achievement and the Starter badge', async () => {
    await request(app.getHttpServer())
      .post(`/api/users/${userId}/purchases`)
      .send({ amount: 500000 })
      .expect(201);

    // Achievement unlock runs via a fire-and-forget event listener, so poll
    // until it has actually landed instead of asserting immediately.
    const summary = await waitFor(async () => {
      const res = await request(app.getHttpServer()).get(
        `/api/users/${userId}/achievements`,
      );
      return res.body.unlocked_achievements.includes('First Purchase')
        ? res.body
        : null;
    });

    expect(summary.unlocked_achievements).toContain('First Purchase');
    expect(summary.next_available_achievements).toContain('5 Purchases');
    expect(summary.current_badge).toBe('Starter');
  });

  it('GET /users/:id reflects the unlocked achievement, badge, and the queued payment', async () => {
    // The Payment row is created before the (mocked) Paystack call is made,
    // so wait on the call itself rather than on the row merely existing.
    await waitFor(async () =>
      mockInitiateTransfer.mock.calls.length > 0 ? true : null,
    );

    const res = await request(app.getHttpServer()).get(`/api/users/${userId}`);

    expect(res.body.achievements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'First Purchase' }),
      ]),
    );
    expect(res.body.badges).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Starter' })]),
    );
    expect(res.body.payments).toEqual(
      expect.arrayContaining([expect.objectContaining({ amount: 30000 })]),
    );
  });

  it('confirms the payment via a correctly signed Paystack webhook', async () => {
    const payment = await waitFor(() =>
      prisma.payment.findFirst({ where: { userId } }),
    );

    const body = {
      event: 'transfer.success',
      data: {
        reference: payment.reference,
        status: 'success',
        transfer_code: 'TRF_e2e_confirmed',
        amount: 30000,
      },
    };
    const rawBody = Buffer.from(JSON.stringify(body));
    const signature = createHmac('sha512', process.env.PAYSTACK_SECRET_KEY!)
      .update(rawBody)
      .digest('hex');

    await request(app.getHttpServer())
      .post('/api/webhook/paystack')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', signature)
      .send(rawBody.toString('utf8'))
      .expect(201, { received: true });

    const updated = await waitFor(async () => {
      const p = await prisma.payment.findUnique({ where: { id: payment.id } });
      return p?.status === 'SUCCESS' ? p : null;
    });

    expect(updated.status).toBe('SUCCESS');
    expect(updated.providerRef).toBe('TRF_e2e_confirmed');
  });

  it('POST /webhook/paystack rejects a missing signature with 401', async () => {
    await request(app.getHttpServer())
      .post('/api/webhook/paystack')
      .send({
        event: 'transfer.success',
        data: { reference: 'x', status: 'success', transfer_code: 'TRF_x', amount: 1 },
      })
      .expect(401);
  });

  it('POST /webhook/paystack rejects a tampered signature with 401', async () => {
    await request(app.getHttpServer())
      .post('/api/webhook/paystack')
      .set('x-paystack-signature', 'not-a-real-signature')
      .send({
        event: 'transfer.success',
        data: { reference: 'x', status: 'success', transfer_code: 'TRF_x', amount: 1 },
      })
      .expect(401);
  });
});
