export const QUEUES = {
  PAYMENT: 'payment',
} as const;

export enum PaymentJobType {
  PAYOUT = 'payout',
}

// Caps WebhookService's retries when Paystack reports transfer.failed/reversed
// asynchronously (a different failure mode from BullMQ's own attempts/backoff,
// which only covers the Paystack call itself throwing). Without a cap, a
// permanently bad recipient would retry forever instead of ending in FAILED.
export const MAX_PAYMENT_RETRIES = 3;
