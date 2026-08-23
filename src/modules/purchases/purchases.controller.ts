import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { PurchasesService } from './purchases.service';
import { CreatePurchaseDto } from './purchases.types';

@ApiTags('purchases')
@Controller('users/:userId/purchases')
export class PurchasesController {
  constructor(private purchasesService: PurchasesService) {}

  @Post()
  @ApiOperation({ summary: 'Record a purchase for a user' })
  @ApiParam({ name: 'userId', description: 'The user making the purchase' })
  @ApiResponse({ status: 201, description: 'Purchase recorded' })
  @ApiResponse({ status: 404, description: 'User not found' })
  create(@Param('userId') userId: string, @Body() dto: CreatePurchaseDto) {
    return this.purchasesService.create(userId, dto);
  }
}
