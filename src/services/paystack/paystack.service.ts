import { Injectable } from '@nestjs/common';
import { AxiosService } from '../axios/axios.service';
import { InitiateTransferDto } from './paystack.types';

@Injectable()
export class PaystackService {
  constructor(private readonly axiosService: AxiosService) {}

  private baseUrl = process.env.PAYSTACK_BASE_URL;
  private secretKey = process.env.PAYSTACK_SECRET_KEY;

  async initiateTransfer(input: InitiateTransferDto) {
    const config = {
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
    };
    const body = {
      ...input,
      source: 'balance',
    };
    const response = await this.axiosService.post(
      `${this.baseUrl}/transfer`,
      body,
      config,
    );
    return response.data;
  }
}
