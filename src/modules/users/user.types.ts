import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'amara@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Amara Okafor' })
  @IsString()
  @IsNotEmpty()
  name!: string;
}
