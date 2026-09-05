import { supabase } from "@/lib/supabase/client";
import type { AccountAccessStatus, AdminAccount } from "@/lib/bedkeep/types";

export interface UpdateAccountAccessInput {
  userId: string;
  status: AccountAccessStatus;
  expiresAt?: string;
  amountPaid?: number;
  paymentMethod?: AdminAccount["paymentMethod"];
  paymentReference?: string;
  notes?: string;
}

export interface AccountAccessEvent {
  id: string;
  previousStatus?: AccountAccessStatus;
  newStatus: AccountAccessStatus;
  expiresAt?: string;
  amountPaid?: number;
  paymentMethod?: AdminAccount["paymentMethod"];
  paymentReference?: string;
  notes?: string;
  createdAt: string;
}

function client() {
  if (!supabase) throw new Error("Service connection is unavailable.");
  return supabase;
}

function throwAdminError(error: { code?: string; message?: string }) {
  if (error.code === "PGRST202" || error.message?.includes("admin_list_accounts") || error.message?.includes("admin_set_account_access")) {
    throw new Error("Administrator tools are unavailable. Run Supabase migration 006, then reload BahayRentahan.");
  }
  throw error;
}

export class AdminRepository {
  async list(): Promise<AdminAccount[]> {
    const { data, error } = await client().rpc("admin_list_accounts");
    if (error) throwAdminError(error);
    return ((data ?? []) as Record<string, unknown>[]).map((row): AdminAccount => ({
      userId: String(row.user_id),
      email: String(row.email || "No email"),
      fullName: String(row.full_name || "Owner"),
      propertyName: String(row.property_name || "No property"),
      status: row.access_status as AccountAccessStatus,
      plan: String(row.plan || "Full access"),
      activatedAt: row.activated_at ? String(row.activated_at) : undefined,
      expiresAt: row.expires_at ? String(row.expires_at) : undefined,
      amountPaid: row.amount_paid === null || row.amount_paid === undefined ? undefined : Number(row.amount_paid),
      paymentMethod: row.payment_method as AdminAccount["paymentMethod"] || undefined,
      paymentReference: row.payment_reference ? String(row.payment_reference) : undefined,
      notes: row.notes ? String(row.notes) : undefined,
      createdAt: String(row.created_at),
      isAdmin: false,
    }));
  }

  async update(input: UpdateAccountAccessInput): Promise<void> {
    const { error } = await client().rpc("admin_set_account_access", {
      p_user_id: input.userId,
      p_status: input.status,
      p_expires_at: input.expiresAt || null,
      p_amount_paid: input.amountPaid ?? null,
      p_payment_method: input.paymentMethod || null,
      p_payment_reference: input.paymentReference || null,
      p_notes: input.notes || null,
    });
    if (error) throwAdminError(error);
  }

  async history(userId: string): Promise<AccountAccessEvent[]> {
    const { data, error } = await client().rpc("admin_list_access_events", { p_user_id: userId });
    if (error) throwAdminError(error);
    return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: String(row.id),
      previousStatus: row.previous_status ? row.previous_status as AccountAccessStatus : undefined,
      newStatus: row.new_status as AccountAccessStatus,
      expiresAt: row.expires_at ? String(row.expires_at) : undefined,
      amountPaid: row.amount_paid === null || row.amount_paid === undefined ? undefined : Number(row.amount_paid),
      paymentMethod: row.payment_method as AdminAccount["paymentMethod"] || undefined,
      paymentReference: row.payment_reference ? String(row.payment_reference) : undefined,
      notes: row.notes ? String(row.notes) : undefined,
      createdAt: String(row.created_at),
    }));
  }
}
