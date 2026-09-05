import type { PaymentRepository } from "./payment-repository";
import { SupabasePaymentRepository } from "./supabase-payment-repository";
export function createPaymentRepository(): PaymentRepository { return new SupabasePaymentRepository(); }
