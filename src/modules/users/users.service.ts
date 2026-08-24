import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../services/prisma/prisma.service';
import { CreateUserDto } from './user.types';
import { bad } from '../../utils/error.utils';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) bad('A user with this email already exists', 409);

    return this.prisma.user.create({ data: dto });
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        unlockedAchievements: {
          include: { achievement: true },
          orderBy: { unlockedAt: 'asc' },
        },
        userBadges: {
          include: { badge: true },
          orderBy: { unlockedAt: 'asc' },
        },
        payments: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!user) bad('User not found', 404);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
      achievements: user.unlockedAchievements.map((ua) => ({
        id: ua.achievement.id,
        key: ua.achievement.key,
        name: ua.achievement.name,
        unlockedAt: ua.unlockedAt,
      })),
      badges: user.userBadges.map((ub) => ({
        id: ub.badge.id,
        key: ub.badge.key,
        name: ub.badge.name,
        unlockedAt: ub.unlockedAt,
      })),
      payments: user.payments.map((p) => ({
        id: p.id,
        amount: p.amount,
        status: p.status,
        provider: p.provider,
        createdAt: p.createdAt,
      })),
    };
  }
}
