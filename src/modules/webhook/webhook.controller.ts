import { Controller, Post, Headers, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { WebhookService } from './webhook.service';
import { PaystackWebhookEvent } from './webhook.types';

@ApiTags('webhook')
@Controller('webhook')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post('paystack')
  @ApiOperation({
    summary: 'Paystack transfer webhook',
    description:
      'Receives transfer.success / transfer.failed / transfer.reversed events. ' +
      'Request is authenticated via the x-paystack-signature header ' +
      '(HMAC-SHA512 of the raw request body, signed with PAYSTACK_SECRET_KEY) ' +
      'rather than by payload shape.',
  })
  @ApiHeader({
    name: 'x-paystack-signature',
    description: 'HMAC-SHA512 signature of the raw request body',
    required: true,
  })
  @ApiBody({
    schema: {
      example: {
        event: 'transfer.success',
        data: {
          reference: 'badge-payout-<userBadgeId>-abcd1234',
          status: 'success',
          transfer_code: 'TRF_xxxxxxxxxxxx',
          amount: 30000,
          reason: 'Cashback for unlocking Starter',
        },
      },
      properties: {
        event: {
          type: 'string',
          enum: ['transfer.success', 'transfer.failed', 'transfer.reversed'],
        },
        data: {
          type: 'object',
          properties: {
            reference: { type: 'string' },
            status: { type: 'string' },
            transfer_code: { type: 'string' },
            amount: { type: 'number' },
            reason: { type: 'string' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Webhook processed' })
  @ApiResponse({ status: 401, description: 'Invalid or missing signature' })
  // @Req() instead of @Body(): signature verification needs the exact raw
  // bytes (rawBody: true in main.ts), not the parsed-then-reserialized object
  // @Body() would give — parsing and reserializing can change whitespace and
  // break the HMAC comparison.
  async paystack(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-paystack-signature') signature?: string,
  ) {
    return this.webhookService.handlePaystackWebhook(
      req.body as PaystackWebhookEvent,
      req.rawBody,
      signature,
    );
  }
}
