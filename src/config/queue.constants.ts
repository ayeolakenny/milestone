export const QUEUES = {
  PAYMENT: 'payment',
} as const;

export enum PaymentJobType {
  PAYOUT = 'payout',
}

export const MAX_PAYMENT_RETRIES = 3;
