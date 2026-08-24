import { Module } from '@nestjs/common';
import { AxiosModule } from '../axios/axios.module';
import { PaystackService } from './paystack.service';

@Module({
  imports: [AxiosModule],
  providers: [PaystackService],
  exports: [PaystackService],
})
export class PaystackModule {}
