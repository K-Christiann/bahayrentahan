import { supabase } from "@/lib/supabase/client";
import type { AssignBoarderLeaseInput, Bed, BoarderOccupancy, CreateBedspaceInput, CreateBoarderInput, CreateRoomInput, Property, Room, Tenant, UpdateBedspaceInput, UpdateBoarderInput, UpdatePropertyInput, UpdateRoomInput } from "@/lib/bedkeep/types";
import type { SpaceLoadOptions, SpaceRepository, SpaceSnapshot } from "./space-repository";
import { zonedDateKey, zonedMonthKey } from "@/lib/local-date";

function client() {
  if (!supabase) throw new Error("Service connection is unavailable.");
  return supabase;
}

function initials(name: string) {
  return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function throwSpaceError(error: { code?: string; message?: string }) {
  if (
    error.code === "PGRST202"
    || error.message?.includes("generate_monthly_charges")
    || error.message?.includes("assign_boarder_with_lease")
    || error.message?.includes("billing_charges")
    || error.message?.includes("lease_terms")
  ) {
    throw new Error("Billing setup is incomplete. Run Supabase migration 005, then reload BahayRentahan.");
  }
  throw error;
}

function mapProperty(row: Record<string, unknown>): Property {
  const preferences = row.notification_preferences as Record<string, unknown> | null;
  return {
    id: String(row.id), name: String(row.name), city: String(row.city || ""), address: String(row.address || ""), contactPhone: String(row.contact_phone || ""), currency: "PHP", rentDueDay: Number(row.rent_due_day || 5), timezone: String(row.timezone || "Asia/Manila"),
    preferredPaymentMethod: (row.preferred_payment_method || "GCash") as Property["preferredPaymentMethod"], gcashNumber: String(row.gcash_number || ""), receiptFooter: String(row.receipt_footer || "Thank you for paying on time."),
    notifications: { overdue: Boolean(preferences?.overdue ?? true), moveOut: Boolean(preferences?.moveOut ?? true), maintenance: Boolean(preferences?.maintenance ?? true), weeklyReport: Boolean(preferences?.weeklyReport ?? false) },
  };
}

const propertyColumns = "id,name,city,address,contact_phone,currency,rent_due_day,timezone,preferred_payment_method,gcash_number,receipt_footer,notification_preferences";

export class SupabaseSpaceRepository implements SpaceRepository {
  async listProperties() {
    const { data, error } = await client().from("properties").select(propertyColumns).order("created_at");
    if (error) throw error;
    return (data ?? []).map((row) => mapProperty(row as Record<string, unknown>));
  }

  async load(propertyId?: string, options: SpaceLoadOptions = {}): Promise<SpaceSnapshot> {
    const db = client();
    let query = db.from("properties").select(propertyColumns).order("created_at").limit(1);
    if (propertyId) query = query.eq("id", propertyId);
    const { data: propertyRow, error: propertyError } = await query.maybeSingle();
    if (propertyError) throw propertyError;
    if (!propertyRow) throw new Error("No property workspace was found for this account.");
    const property = mapProperty(propertyRow as Record<string, unknown>);

    const period = zonedMonthKey(new Date(), property.timezone);
    const periodStart = `${period}-01`;
    const today = zonedDateKey(new Date(), property.timezone);
    if (options.ensureCurrentPeriod !== false) {
      const { error: generationError } = await db.rpc("generate_monthly_charges", { p_property_id: property.id, p_period_start: periodStart });
      if (generationError) throwSpaceError(generationError);
    }
    const [{ data: roomRows, error: roomError }, { data: boarderRows, error: boarderError }, { data: chargeRows, error: chargeError }, { data: leaseRows, error: leaseError }] = await Promise.all([
      db.from("rooms").select("id,name,floor,sort_order,archived_at").eq("property_id", property.id).order("sort_order").order("created_at"),
      db.from("boarders").select("id,full_name,phone,email,status").eq("property_id", property.id).order("full_name"),
      db.from("billing_charges").select("id,lease_id,boarder_id,amount,paid_amount,due_date,status,charge_type,period_start").eq("property_id", property.id).eq("period_start", periodStart).in("charge_type", ["rent", "advance_rent"]).neq("status", "void"),
      db.from("lease_terms").select("id,grace_period_days").eq("property_id", property.id),
    ]);
    if (roomError) throw roomError;
    if (boarderError) throw boarderError;
    if (chargeError) throwSpaceError(chargeError);
    if (leaseError) throwSpaceError(leaseError);

    const roomIds = (roomRows ?? []).map((room) => String(room.id));
    const visibleRoomIds = new Set((roomRows ?? []).filter((room) => !room.archived_at).map((room) => String(room.id)));
    const { data: bedRows, error: bedError } = roomIds.length ? await db.from("bedspaces").select("id,room_id,label,monthly_rent,status,sort_order,archived_at").in("room_id", roomIds).order("sort_order").order("created_at") : { data: [], error: null };
    if (bedError) throw bedError;
    const visibleBedRows = (bedRows ?? []).filter((bed) => !bed.archived_at && visibleRoomIds.has(String(bed.room_id)));
    const boarderIds = (boarderRows ?? []).map((boarder) => String(boarder.id));
    const { data: occupancyRows, error: occupancyError } = boarderIds.length ? await db.from("occupancies").select("id,bedspace_id,boarder_id,monthly_rent,start_date,end_date,status,created_at").in("boarder_id", boarderIds).order("start_date", { ascending: false }).order("created_at", { ascending: false }) : { data: [], error: null };
    if (occupancyError) throw occupancyError;

    const roomNames = new Map((roomRows ?? []).map((room) => [String(room.id), String(room.name)]));
    const bedsById = new Map((bedRows ?? []).map((bed) => [String(bed.id), bed]));
    const boardersById = new Map((boarderRows ?? []).map((boarder) => [String(boarder.id), boarder]));
    const activeOccupancies = (occupancyRows ?? []).filter((occupancy) => String(occupancy.status) === "active");
    const occupanciesByBed = new Map(activeOccupancies.map((occupancy) => [String(occupancy.bedspace_id), occupancy]));
    const occupanciesByBoarder = new Map(activeOccupancies.map((occupancy) => [String(occupancy.boarder_id), occupancy]));
    const graceByLease = new Map((leaseRows ?? []).map((lease) => [String(lease.id), Number(lease.grace_period_days || 0)]));
    const balanceByBoarder = new Map<string, number>();
    const overdueByBoarder = new Map<string, boolean>();
    for (const charge of chargeRows ?? []) {
      const boarderId = String(charge.boarder_id);
      const balance = Math.max(0, Number(charge.amount) - Number(charge.paid_amount || 0));
      balanceByBoarder.set(boarderId, (balanceByBoarder.get(boarderId) || 0) + balance);
      const grace = graceByLease.get(String(charge.lease_id)) || 0;
      const overdueDate = new Date(`${String(charge.due_date)}T12:00:00Z`);
      overdueDate.setUTCDate(overdueDate.getUTCDate() + grace);
      if (balance > 0 && today > overdueDate.toISOString().slice(0, 10)) overdueByBoarder.set(boarderId, true);
    }
    const beds: Bed[] = visibleBedRows.map((bed) => {
      const occupancy = occupanciesByBed.get(String(bed.id));
      const boarderId = occupancy ? String(occupancy.boarder_id) : undefined;
      const boarder = boarderId ? boardersById.get(boarderId) : undefined;
      const balance = boarderId ? balanceByBoarder.get(boarderId) || 0 : 0;
      const overdue = Boolean(boarderId && overdueByBoarder.get(boarderId));
      return { id: String(bed.id), roomId: String(bed.room_id), label: String(bed.label), room: roomNames.get(String(bed.room_id)) || "Room", rent: Number(bed.monthly_rent), status: boarder ? overdue ? "due" : "occupied" : "vacant", dueLabel: overdue ? `${new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(balance)} due` : undefined, tenant: boarder ? String(boarder.full_name) : undefined, initials: boarder ? initials(String(boarder.full_name)) : undefined };
    });

    const bedByBoarder = new Map<string, Bed>();
    for (const bed of beds) { const occupancy = occupanciesByBed.get(bed.id); if (occupancy) bedByBoarder.set(String(occupancy.boarder_id), bed); }
    const boarders: Tenant[] = (boarderRows ?? []).map((boarder) => {
      const boarderId = String(boarder.id);
      const bed = bedByBoarder.get(boarderId);
      const occupancy = occupanciesByBoarder.get(boarderId);
      const inactive = String(boarder.status) === "inactive";
      const balance = occupancy ? balanceByBoarder.get(boarderId) || 0 : 0;
      const overdue = Boolean(occupancy && overdueByBoarder.get(boarderId));
      return { id: boarderId, name: String(boarder.full_name), initials: initials(String(boarder.full_name)), bed: bed ? `${bed.room} · ${bed.label}` : inactive ? "Moved out" : "Not assigned", phone: String(boarder.phone || "No phone"), email: boarder.email ? String(boarder.email) : undefined, balance, status: inactive ? "inactive" : bed ? overdue ? "overdue" : "current" : "unassigned" };
    });
    const rooms: Room[] = (roomRows ?? []).filter((room) => !room.archived_at).map((room) => { const roomBeds = beds.filter((bed) => bed.roomId === String(room.id)); return { id: String(room.id), name: String(room.name), floor: String(room.floor || ""), bedCount: roomBeds.length, occupiedCount: roomBeds.filter((bed) => bed.status !== "vacant").length }; });
    const occupancyHistory: BoarderOccupancy[] = (occupancyRows ?? []).map((occupancy) => { const bed = bedsById.get(String(occupancy.bedspace_id)); const roomName = bed ? roomNames.get(String(bed.room_id)) : undefined; return { id: String(occupancy.id), boarderId: String(occupancy.boarder_id), bedspace: bed ? `${roomName || "Archived room"} · ${String(bed.label)}` : "Archived bedspace", monthlyRent: Number(occupancy.monthly_rent), startDate: String(occupancy.start_date), endDate: occupancy.end_date ? String(occupancy.end_date) : undefined, status: String(occupancy.status) === "active" ? "active" : "ended" }; });
    return { property, rooms, beds, boarders, occupancyHistory };
  }

  async createProperty(name: string, city: string) {
    const db = client();
    const { data: auth, error: authError } = await db.auth.getUser();
    if (authError || !auth.user) throw authError ?? new Error("Your session has expired.");
    const { data, error } = await db.from("properties").insert({ owner_id: auth.user.id, name, city, address: city }).select("id").single();
    if (error) throw error;
    return String(data.id);
  }

  async createRoom(input: CreateRoomInput) { const { error } = await client().rpc("create_room_with_beds", { p_property_id: input.propertyId, p_name: input.name, p_floor: input.floor, p_bed_count: input.bedCount, p_monthly_rent: input.monthlyRent }); if (error) throw error; }
  async createBedspace(input: CreateBedspaceInput) { const db = client(); const { data: room, error: roomError } = await db.from("rooms").select("id").eq("property_id", input.propertyId).eq("name", input.roomName).is("archived_at", null).single(); if (roomError) throw roomError; const { count, error: countError } = await db.from("bedspaces").select("id", { count: "exact", head: true }).eq("room_id", room.id); if (countError) throw countError; const next = (count ?? 0) + 1; const { error } = await db.from("bedspaces").insert({ room_id: room.id, label: `Bed ${String(next).padStart(2, "0")}`, monthly_rent: input.monthlyRent, sort_order: next }); if (error) throw error; }
  async updateRoom(roomId: string, input: UpdateRoomInput) { const { error } = await client().from("rooms").update({ name: input.name, floor: input.floor, updated_at: new Date().toISOString() }).eq("id", roomId); if (error) throw error; }
  async deleteRoom(roomId: string) { const { error } = await client().rpc("delete_room_safely", { p_room_id: roomId }); if (error) throw error; }
  async updateBedspace(bedspaceId: string, input: UpdateBedspaceInput) { const { error } = await client().from("bedspaces").update({ label: input.label, monthly_rent: input.monthlyRent, updated_at: new Date().toISOString() }).eq("id", bedspaceId); if (error) throw error; }
  async deleteBedspace(bedspaceId: string) { const { error } = await client().rpc("delete_bedspace_safely", { p_bedspace_id: bedspaceId }); if (error) throw error; }
  async createBoarder(input: CreateBoarderInput) { const { error } = await client().from("boarders").insert({ property_id: input.propertyId, full_name: input.fullName, phone: input.phone, email: input.email || null }); if (error) throw error; }
  async updateBoarder(boarderId: string, input: UpdateBoarderInput) { const { error } = await client().from("boarders").update({ full_name: input.fullName, phone: input.phone, email: input.email || null, updated_at: new Date().toISOString() }).eq("id", boarderId); if (error) throw error; }
  async archiveBoarder(boarderId: string) { const { error } = await client().rpc("archive_boarder", { p_boarder_id: boarderId }); if (error) throw error; }
  async deleteBoarder(boarderId: string) { const { error } = await client().rpc("delete_boarder_safely", { p_boarder_id: boarderId }); if (error) throw error; }
  async assignBoarder(bedspaceId: string, boarderId: string, lease: AssignBoarderLeaseInput) { const { data, error } = await client().rpc("assign_boarder_with_lease", { p_bedspace_id: bedspaceId, p_boarder_id: boarderId, p_monthly_rent: lease.monthlyRent, p_start_date: lease.startDate, p_rent_due_day: lease.rentDueDay, p_grace_period_days: lease.gracePeriodDays, p_security_deposit_amount: lease.securityDepositAmount, p_advance_rent_amount: lease.advanceRentAmount, p_rent_control_covered: lease.rentControlCovered }); if (error) throwSpaceError(error); return String(data); }
  async transferBoarder(boarderId: string, targetBedspaceId: string, monthlyRent: number) { const { error } = await client().rpc("transfer_boarder", { p_boarder_id: boarderId, p_target_bedspace_id: targetBedspaceId, p_monthly_rent: monthlyRent }); if (error) throw error; }
  async moveOutBoarder(boarderId: string, endDate: string) { const { error } = await client().rpc("move_out_boarder", { p_boarder_id: boarderId, p_end_date: endDate }); if (error) throw error; }
  async updateProperty(propertyId: string, input: UpdatePropertyInput) { const { error } = await client().from("properties").update({ name: input.name, city: input.city, address: input.address, contact_phone: input.contactPhone, rent_due_day: input.rentDueDay, timezone: input.timezone, preferred_payment_method: input.preferredPaymentMethod, gcash_number: input.gcashNumber, receipt_footer: input.receiptFooter, notification_preferences: input.notifications, updated_at: new Date().toISOString() }).eq("id", propertyId); if (error) throw error; }
}
