import { IsNumber, IsString } from 'class-validator';

export class InitiateTransferDto {
  @IsNumber()
  amount: number;

  @IsString()
  reason: string;

  @IsString()
  recipient: string;

  @IsString()
  reference: string;
}
