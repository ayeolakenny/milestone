import { Controller, Get, Param } from '@nestjs/common';
import { AchievementsService } from './achievements.service';
import { ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';

@Controller('users/:userId/achievements')
export class AchievementsController {
  constructor(private readonly achievementsService: AchievementsService) {}

  @Get()
  @ApiOperation({ summary: "Get a user's achievement and badge progress" })
  @ApiParam({ name: 'userId' })
  @ApiResponse({ status: 200, description: 'Achievement and badge summary' })
  @ApiResponse({ status: 404, description: 'User not found' })
  getSummary(@Param('userId') userId: string) {
    return this.achievementsService.getSummaryForUser(userId);
  }
}
