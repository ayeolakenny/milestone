import { IsString } from 'class-validator';

export class PayoutDto {
  @IsString()
  userId: string;

  @IsString()
  userBadgeId: string;

  @IsString()
  badgeName: string;
}
