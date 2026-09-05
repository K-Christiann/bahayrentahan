import type { BillingCharge, CreateBillingChargeInput, CreatePaymentInput, LeaseTerm, Payment } from "@/lib/bedkeep/types";

export interface PaymentSnapshot {
  payments: Payment[];
  charges: BillingCharge[];
  leaseTerms: LeaseTerm[];
}

export interface PaymentLoadOptions {
  ensurePeriod?: boolean;
}

export interface PaymentRepository {
  load(propertyId: string, periodStart: string, options?: PaymentLoadOptions): Promise<PaymentSnapshot>;
  ensurePeriod(propertyId: string, periodStart: string): Promise<void>;
  createCharge(input: CreateBillingChargeInput): Promise<void>;
  create(input: CreatePaymentInput): Promise<void>;
  confirm(paymentId: string): Promise<void>;
  void(paymentId: string): Promise<void>;
}
