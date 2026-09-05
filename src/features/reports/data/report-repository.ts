import { supabase } from "@/lib/supabase/client";

export interface MonthlyBoarderRow {
  boarderId: string;
  boarderName: string;
  bedspace: string;
  dueDate: string;
  charged: number;
  paid: number;
  balance: number;
  status: "paid" | "partial" | "open" | "overdue";
}

export interface MonthlyReport {
  period: string;
  billedRent: number;
  rentPaidTowardPeriod: number;
  outstandingRent: number;
  cashReceived: number;
  depositsCollected: number;
  otherCollected: number;
  paidPayments: number;
  occupiedBeds: number;
  boarders: MonthlyBoarderRow[];
}

function client() {
  if (!supabase) throw new Error("Service connection is unavailable.");
  return supabase;
}

function nextMonth(periodStart: string) {
  const date = new Date(`${periodStart}T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 10);
}

function throwReportError(error: { code?: string; message?: string }) {
  if (error.code === "PGRST202" || error.message?.includes("generate_monthly_charges") || error.message?.includes("billing_charges")) {
    throw new Error("Monthly reports need the billing ledger. Run Supabase migrations through 006, then reload BahayRentahan.");
  }
  throw error;
}

function assertQuery(result: { error: { code?: string; message?: string } | null }) {
  if (result.error) throwReportError(result.error);
}

type QueryPage = { data: Record<string, unknown>[] | null; error: { code?: string; message?: string } | null };

async function collectRows(loadPage: (from: number, to: number) => PromiseLike<QueryPage>) {
  const pageSize = 500;
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += pageSize) {
    const result = await loadPage(from, from + pageSize - 1);
    assertQuery(result);
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

async function collectRelatedRows(ids: string[], loadPage: (ids: string[], from: number, to: number) => PromiseLike<QueryPage>) {
  const chunks = Array.from({ length: Math.ceil(ids.length / 100) }, (_, index) => ids.slice(index * 100, index * 100 + 100));
  const rows: Record<string, unknown>[] = [];
  for (const chunk of chunks) rows.push(...await collectRows((from, to) => loadPage(chunk, from, to)));
  return rows;
}

export class ReportRepository {
  async loadMonthly(propertyId: string, period: string): Promise<MonthlyReport> {
    const db = client();
    const periodStart = `${period}-01`;
    const periodEndExclusive = nextMonth(periodStart);
    const { error: generationError } = await db.rpc("generate_monthly_charges", { p_property_id: propertyId, p_period_start: periodStart });
    if (generationError) throwReportError(generationError);

    const [periodChargesResult, paymentsResult, boardersResult, roomsResult] = await Promise.all([
      db.from("billing_charges").select("id,boarder_id,occupancy_id,charge_type,due_date,amount,paid_amount,status").eq("property_id", propertyId).eq("period_start", periodStart).in("charge_type", ["rent", "advance_rent"]).neq("status", "void").order("due_date"),
      db.from("payments").select("id,amount,paid_at,status").eq("property_id", propertyId).eq("status", "paid").gte("paid_at", `${periodStart}T00:00:00+08:00`).lt("paid_at", `${periodEndExclusive}T00:00:00+08:00`),
      db.from("boarders").select("id,full_name").eq("property_id", propertyId),
      db.from("rooms").select("id,name").eq("property_id", propertyId),
    ]);
    [periodChargesResult, paymentsResult, boardersResult, roomsResult].forEach(assertQuery);

    const roomIds = (roomsResult.data ?? []).map((row) => String(row.id));
    const paymentIds = (paymentsResult.data ?? []).map((row) => String(row.id));
    const boarderIds = (boardersResult.data ?? []).map((row) => String(row.id));
    const [bedsResult, allocationsResult, occupanciesResult] = await Promise.all([
      roomIds.length ? db.from("bedspaces").select("id,room_id,label").in("room_id", roomIds) : Promise.resolve({ data: [], error: null }),
      paymentIds.length ? db.from("payment_allocations").select("payment_id,charge_id,amount").in("payment_id", paymentIds) : Promise.resolve({ data: [], error: null }),
      boarderIds.length ? db.from("occupancies").select("id,boarder_id,bedspace_id,start_date,end_date,status").in("boarder_id", boarderIds) : Promise.resolve({ data: [], error: null }),
    ]);
    [bedsResult, allocationsResult, occupanciesResult].forEach(assertQuery);

    const allocatedChargeIds = [...new Set((allocationsResult.data ?? []).map((row) => String(row.charge_id)))];
    const chargeTypesResult = allocatedChargeIds.length ? await db.from("billing_charges").select("id,charge_type").in("id", allocatedChargeIds) : { data: [], error: null };
    assertQuery(chargeTypesResult);

    const names = new Map((boardersResult.data ?? []).map((row) => [String(row.id), String(row.full_name)]));
    const rooms = new Map((roomsResult.data ?? []).map((row) => [String(row.id), String(row.name)]));
    const beds = new Map((bedsResult.data ?? []).map((row) => [String(row.id), { roomId: String(row.room_id), label: String(row.label) }]));
    const propertyOccupancies = occupanciesResult.data ?? [];
    const occupancies = new Map(propertyOccupancies.map((row) => [String(row.id), row]));
    const chargeTypes = new Map((chargeTypesResult.data ?? []).map((row) => [String(row.id), String(row.charge_type)]));
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

    const grouped = new Map<string, MonthlyBoarderRow>();
    for (const charge of periodChargesResult.data ?? []) {
      const boarderId = String(charge.boarder_id);
      const occupancy = occupancies.get(String(charge.occupancy_id));
      const bed = occupancy ? beds.get(String(occupancy.bedspace_id)) : undefined;
      const bedspace = bed ? `${rooms.get(bed.roomId) || "Room"} · ${bed.label}` : "Historical assignment";
      const amount = Number(charge.amount);
      const paid = Number(charge.paid_amount || 0);
      const current: MonthlyBoarderRow = grouped.get(boarderId) || { boarderId, boarderName: names.get(boarderId) || "Boarder", bedspace, dueDate: String(charge.due_date), charged: 0, paid: 0, balance: 0, status: "open" };
      current.charged += amount;
      current.paid += paid;
      current.balance += Math.max(0, amount - paid);
      if (String(charge.due_date) < current.dueDate) current.dueDate = String(charge.due_date);
      current.status = current.balance <= 0 ? "paid" : current.paid > 0 ? "partial" : today > current.dueDate ? "overdue" : "open";
      grouped.set(boarderId, current);
    }

    let depositsCollected = 0;
    let otherCollected = 0;
    for (const allocation of allocationsResult.data ?? []) {
      const type = chargeTypes.get(String(allocation.charge_id));
      if (type === "security_deposit") depositsCollected += Number(allocation.amount);
      if (type === "other") otherCollected += Number(allocation.amount);
    }

    const boarders = [...grouped.values()].sort((a, b) => a.boarderName.localeCompare(b.boarderName));
    const billedRent = boarders.reduce((sum, row) => sum + row.charged, 0);
    const rentPaidTowardPeriod = boarders.reduce((sum, row) => sum + row.paid, 0);
    const occupiedBeds = propertyOccupancies.filter((row) => String(row.start_date) < periodEndExclusive && (!row.end_date || String(row.end_date) >= periodStart)).length;

    return {
      period,
      billedRent,
      rentPaidTowardPeriod,
      outstandingRent: Math.max(0, billedRent - rentPaidTowardPeriod),
      cashReceived: (paymentsResult.data ?? []).reduce((sum, row) => sum + Number(row.amount), 0),
      depositsCollected,
      otherCollected,
      paidPayments: (paymentsResult.data ?? []).length,
      occupiedBeds,
      boarders,
    };
  }

  async createBackup(propertyId: string) {
    const db = client();
    const property = await db.from("properties").select("*").eq("id", propertyId).single();
    assertQuery(property);
    const [rooms, boarders, payments, needs, leases, charges] = await Promise.all([
      collectRows((from, to) => db.from("rooms").select("*").eq("property_id", propertyId).order("created_at").range(from, to)),
      collectRows((from, to) => db.from("boarders").select("*").eq("property_id", propertyId).order("created_at").range(from, to)),
      collectRows((from, to) => db.from("payments").select("*").eq("property_id", propertyId).order("created_at").range(from, to)),
      collectRows((from, to) => db.from("maintenance_requests").select("*").eq("property_id", propertyId).order("created_at").range(from, to)),
      collectRows((from, to) => db.from("lease_terms").select("*").eq("property_id", propertyId).order("created_at").range(from, to)),
      collectRows((from, to) => db.from("billing_charges").select("*").eq("property_id", propertyId).order("created_at").range(from, to)),
    ]);

    const roomIds = rooms.map((row) => String(row.id));
    const boarderIds = boarders.map((row) => String(row.id));
    const paymentIds = payments.map((row) => String(row.id));
    const [bedspaces, occupancies, allocations] = await Promise.all([
      collectRelatedRows(roomIds, (ids, from, to) => db.from("bedspaces").select("*").in("room_id", ids).order("created_at").range(from, to)),
      collectRelatedRows(boarderIds, (ids, from, to) => db.from("occupancies").select("*").in("boarder_id", ids).order("created_at").range(from, to)),
      collectRelatedRows(paymentIds, (ids, from, to) => db.from("payment_allocations").select("*").in("payment_id", ids).order("created_at").range(from, to)),
    ]);

    return {
      format: "BahayRentahan property backup",
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      property: property.data,
      data: {
        rooms,
        bedspaces,
        boarders,
        occupancies,
        leaseTerms: leases,
        billingCharges: charges,
        payments,
        paymentAllocations: allocations,
        maintenanceRequests: needs,
      },
    };
  }
}
