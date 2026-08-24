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
