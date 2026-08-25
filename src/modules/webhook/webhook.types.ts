// Deliberately an `interface`, not a `class`. The global ValidationPipe has
// `forbidNonWhitelisted: true`, which throws on any property without a
// class-validator decorator — Paystack's real payloads carry many more fields
// than we use here, and a `class` would get most of them rejected. An
// `interface` has no runtime representation, so Nest's pipe skips it entirely;
// authenticity is enforced by the HMAC signature instead, not payload shape.
export interface PaystackWebhookEvent {
  event: string;
  data: {
    reference: string;
    status: string;
    transfer_code: string;
    amount: number;
    reason?: string;
    [key: string]: unknown;
  };
}
