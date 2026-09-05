import { supabase } from "@/lib/supabase/client";
import type { BillingCharge, CreateBillingChargeInput, CreatePaymentInput, LeaseTerm, Payment, PaymentAllocation } from "@/lib/bedkeep/types";
import type { PaymentLoadOptions, PaymentRepository, PaymentSnapshot } from "./payment-repository";

function db() {
  if (!supabase) throw new Error("Service connection is unavailable.");
  return supabase;
}

function initials(name: string) {
  return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function throwPaymentError(error: { code?: string; message?: string }) {
  if (
    error.code === "PGRST202"
    || error.message?.includes("record_billing_payment")
    || error.message?.includes("create_manual_charge")
    || error.message?.includes("generate_monthly_charges")
    || error.message?.includes("confirm_rent_payment")
    || error.message?.includes("void_rent_payment")
    || error.message?.includes("billing_charges")
    || error.message?.includes("lease_terms")
  ) {
    throw new Error("Billing is unavailable because migration 005 has not been applied. Run the lease billing ledger migration in Supabase, then reload BahayRentahan.");
  }
  throw error;
}

function mapLease(row: Record<string, unknown>): LeaseTerm {
  return {
    id: String(row.id),
    propertyId: String(row.property_id),
    boarderId: String(row.boarder_id),
    occupancyId: String(row.occupancy_id),
    monthlyRent: Number(row.monthly_rent),
    rentDueDay: Number(row.rent_due_day),
    gracePeriodDays: Number(row.grace_period_days || 0),
    securityDepositAmount: Number(row.security_deposit_amount || 0),
    advanceRentAmount: Number(row.advance_rent_amount || 0),
    rentControlCovered: Boolean(row.rent_control_covered),
    effectiveFrom: String(row.effective_from),
    effectiveTo: row.effective_to ? String(row.effective_to) : undefined,
    status: String(row.status) === "active" ? "active" : "ended",
  };
}

export class SupabasePaymentRepository implements PaymentRepository {
  async ensurePeriod(propertyId: string, periodStart: string) {
    const { error } = await db().rpc("generate_monthly_charges", {
      p_property_id: propertyId,
      p_period_start: periodStart,
    });
    if (error) throwPaymentError(error);
  }

  async load(propertyId: string, periodStart: string, options: PaymentLoadOptions = {}): Promise<PaymentSnapshot> {
    const client = db();
    if (options.ensurePeriod !== false) await this.ensurePeriod(propertyId, periodStart);

    const [{ data: paymentRows, error: paymentError }, { data: boarderRows, error: boarderError }, { data: chargeRows, error: chargeError }, { data: leaseRows, error: leaseError }] = await Promise.all([
      client.from("payments").select("id,boarder_id,amount,method,period_start,paid_at,status,reference_number,receipt_number,created_at").eq("property_id", propertyId).order("created_at", { ascending: false }),
      client.from("boarders").select("id,full_name").eq("property_id", propertyId),
      client.from("billing_charges").select("id,property_id,lease_id,boarder_id,occupancy_id,charge_type,description,period_start,due_date,amount,paid_amount,status,source").eq("property_id", propertyId).order("due_date", { ascending: true }).order("created_at", { ascending: true }),
      client.from("lease_terms").select("id,property_id,boarder_id,occupancy_id,monthly_rent,rent_due_day,grace_period_days,security_deposit_amount,advance_rent_amount,rent_control_covered,effective_from,effective_to,status").eq("property_id", propertyId).order("effective_from", { ascending: false }),
    ]);

    if (paymentError) throwPaymentError(paymentError);
    if (boarderError) throw boarderError;
    if (chargeError) throwPaymentError(chargeError);
    if (leaseError) throwPaymentError(leaseError);

    const paymentIds = (paymentRows ?? []).map((row) => String(row.id));
    const { data: allocationRows, error: allocationError } = paymentIds.length
      ? await client.from("payment_allocations").select("id,payment_id,charge_id,amount").in("payment_id", paymentIds)
      : { data: [], error: null };
    if (allocationError) throwPaymentError(allocationError);

    const names = new Map((boarderRows ?? []).map((item) => [String(item.id), String(item.full_name)]));
    const paymentStatus = new Map((paymentRows ?? []).map((item) => [String(item.id), String(item.status)]));
    const allocationsByPayment = new Map<string, PaymentAllocation[]>();
    const pendingByCharge = new Map<string, number>();

    for (const row of allocationRows ?? []) {
      const allocation: PaymentAllocation = {
        id: String(row.id),
        paymentId: String(row.payment_id),
        chargeId: String(row.charge_id),
        amount: Number(row.amount),
      };
      allocationsByPayment.set(allocation.paymentId, [...(allocationsByPayment.get(allocation.paymentId) ?? []), allocation]);
      if (paymentStatus.get(allocation.paymentId) === "pending") {
        pendingByCharge.set(allocation.chargeId, (pendingByCharge.get(allocation.chargeId) || 0) + allocation.amount);
      }
    }

    const charges: BillingCharge[] = (chargeRows ?? []).map((row) => {
      const amount = Number(row.amount);
      const paidAmount = Number(row.paid_amount || 0);
      return {
        id: String(row.id),
        propertyId: String(row.property_id),
        leaseId: String(row.lease_id),
        boarderId: String(row.boarder_id),
        occupancyId: String(row.occupancy_id),
        type: row.charge_type as BillingCharge["type"],
        description: String(row.description),
        periodStart: row.period_start ? String(row.period_start) : undefined,
        dueDate: String(row.due_date),
        amount,
        paidAmount,
        reservedAmount: pendingByCharge.get(String(row.id)) || 0,
        balance: Math.max(0, amount - paidAmount),
        status: row.status as BillingCharge["status"],
        source: row.source as BillingCharge["source"],
      };
    });
    const chargeById = new Map(charges.map((charge) => [charge.id, charge]));

    const payments: Payment[] = (paymentRows ?? []).map((row) => {
      const name = names.get(String(row.boarder_id)) || "Boarder";
      const paidAt = row.paid_at ? new Date(String(row.paid_at)) : null;
      const allocations = (allocationsByPayment.get(String(row.id)) ?? []).map((allocation) => {
        const charge = chargeById.get(allocation.chargeId);
        return { ...allocation, chargeType: charge?.type, description: charge?.description, periodStart: charge?.periodStart };
      });
      const allocationLabel = [...new Set(allocations.map((allocation) => allocation.description).filter(Boolean))].join(" + ");
      return {
        id: String(row.id),
        boarderId: String(row.boarder_id),
        tenant: name,
        initials: initials(name),
        amount: Number(row.amount),
        method: row.method === "Bank transfer" ? "Bank" : row.method as Payment["method"],
        period: allocationLabel || new Date(`${row.period_start}T00:00:00`).toLocaleDateString("en-PH", { month: "long", year: "numeric" }),
        periodStart: String(row.period_start),
        paidAt: row.paid_at ? String(row.paid_at) : undefined,
        date: paidAt ? paidAt.toLocaleDateString("en-PH", { month: "short", day: "numeric" }) : "Awaiting confirmation",
        status: row.status as Payment["status"],
        referenceNumber: row.reference_number ? String(row.reference_number) : undefined,
        receiptNumber: row.receipt_number ? String(row.receipt_number) : undefined,
        allocationLabel,
        allocations,
      };
    });

    return { payments, charges, leaseTerms: (leaseRows ?? []).map((row) => mapLease(row as Record<string, unknown>)) };
  }

  async create(input: CreatePaymentInput) {
    const { error } = await db().rpc("record_billing_payment", {
      p_property_id: input.propertyId,
      p_boarder_id: input.boarderId,
      p_amount: input.amount,
      p_method: input.method === "Bank" ? "Bank transfer" : input.method,
      p_status: input.status,
      p_reference_number: input.referenceNumber || null,
      p_allocations: input.allocations.map((allocation) => ({ charge_id: allocation.chargeId, amount: allocation.amount })),
    });
    if (error) throwPaymentError(error);
  }

  async createCharge(input: CreateBillingChargeInput) {
    const { error } = await db().rpc("create_manual_charge", {
      p_property_id: input.propertyId,
      p_boarder_id: input.boarderId,
      p_description: input.description,
      p_due_date: input.dueDate,
      p_amount: input.amount,
    });
    if (error) throwPaymentError(error);
  }

  async confirm(paymentId: string) {
    const { error } = await db().rpc("confirm_rent_payment", { p_payment_id: paymentId });
    if (error) throwPaymentError(error);
  }

  async void(paymentId: string) {
    const { error } = await db().rpc("void_rent_payment", { p_payment_id: paymentId });
    if (error) throwPaymentError(error);
  }
}
