import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../../services/prisma/prisma.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    user: { findUnique: jest.Mock; create: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('create', () => {
    it('creates a user when the email is not already taken', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'u1',
        email: 'amara@example.com',
        name: 'Amara Okafor',
      });

      const result = await service.create({
        email: 'amara@example.com',
        name: 'Amara Okafor',
      });

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'amara@example.com' },
      });
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: { email: 'amara@example.com', name: 'Amara Okafor' },
      });
      expect(result).toEqual(
        expect.objectContaining({ email: 'amara@example.com' }),
      );
    });

    it('throws ConflictException when the email is already taken', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'existing',
        email: 'amara@example.com',
      });

      await expect(
        service.create({ email: 'amara@example.com', name: 'Amara Okafor' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('throws NotFoundException when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.findById('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('shapes achievements, badges, and payments into flat arrays', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'amara@example.com',
        name: 'Amara Okafor',
        createdAt: new Date('2026-01-01'),
        unlockedAchievements: [
          {
            unlockedAt: new Date('2026-01-02'),
            achievement: { id: 'a1', key: 'first_purchase', name: 'First Purchase' },
          },
        ],
        userBadges: [
          {
            unlockedAt: new Date('2026-01-03'),
            badge: { id: 'b1', key: 'starter', name: 'Starter' },
          },
        ],
        payments: [
          {
            id: 'p1',
            amount: 30000,
            status: 'SUCCESS',
            provider: 'paystack',
            createdAt: new Date('2026-01-03'),
          },
        ],
      });

      const result = await service.findById('u1');

      expect(result).toEqual({
        id: 'u1',
        email: 'amara@example.com',
        name: 'Amara Okafor',
        createdAt: new Date('2026-01-01'),
        achievements: [
          {
            id: 'a1',
            key: 'first_purchase',
            name: 'First Purchase',
            unlockedAt: new Date('2026-01-02'),
          },
        ],
        badges: [
          {
            id: 'b1',
            key: 'starter',
            name: 'Starter',
            unlockedAt: new Date('2026-01-03'),
          },
        ],
        payments: [
          {
            id: 'p1',
            amount: 30000,
            status: 'SUCCESS',
            provider: 'paystack',
            createdAt: new Date('2026-01-03'),
          },
        ],
      });
    });
  });
});
