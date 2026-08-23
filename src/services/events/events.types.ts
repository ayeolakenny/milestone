export const EVENTS = {
  PURCHASE_CREATED: 'purchase.created',
  ACHIEVEMENT_UNLOCKED: 'achievement.unlocked',
  BADGE_UNLOCKED: 'badge.unlocked',
} as const;

export class AchievementUnlockedEvent {
  constructor(
    public readonly achievement_name: string,
    public readonly user: { id: string; email: string; name: string },
  ) {}
}
