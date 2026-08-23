import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsPositive } from 'class-validator';

export class CreatePurchaseDto {
  @ApiProperty({
    example: 500000,
    description: 'Purchase amount in kobo (e.g. 500000 = ₦5,000.00)',
  })
  @IsInt()
  @IsPositive()
  amount!: number;
}
