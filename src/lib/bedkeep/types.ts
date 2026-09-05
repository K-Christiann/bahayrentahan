export type ViewKey =
  | "dashboard"
  | "spaces"
  | "tenants"
  | "payments"
  | "reports"
  | "needs"
  | "admin"
  | "settings"
  | "help"
  | "profile";

export type AccountAccessStatus = "pending" | "active" | "expired" | "suspended";

export interface AccountAccess {
  userId: string;
  status: AccountAccessStatus;
  plan: string;
  activatedAt?: string;
  expiresAt?: string;
  isAdmin: boolean;
}

export interface AdminAccount extends AccountAccess {
  email: string;
  fullName: string;
  propertyName: string;
  amountPaid?: number;
  paymentMethod?: "Cash" | "GCash" | "Bank transfer" | "Complimentary";
  paymentReference?: string;
  notes?: string;
  createdAt: string;
}

export type BedStatus = "occupied" | "vacant" | "due";

export interface Property {
  id: string;
  name: string;
  city: string;
  address: string;
  contactPhone: string;
  currency: "PHP";
  rentDueDay: number;
  timezone: string;
  preferredPaymentMethod: "GCash" | "Cash" | "Bank transfer";
  gcashNumber: string;
  receiptFooter: string;
  notifications: {
    overdue: boolean;
    moveOut: boolean;
    maintenance: boolean;
    weeklyReport: boolean;
  };
}

export interface Room {
  id: string;
  name: string;
  floor: string;
  bedCount: number;
  occupiedCount: number;
}

export interface Bed {
  id: string;
  label: string;
  roomId?: string;
  room: string;
  tenant?: string;
  initials?: string;
  rent: number;
  status: BedStatus;
  dueLabel?: string;
}

export interface Tenant {
  id: string;
  name: string;
  initials: string;
  bed: string;
  phone: string;
  email?: string;
  balance: number;
  status: "current" | "overdue" | "unassigned" | "inactive";
}

export interface BoarderOccupancy {
  id: string;
  boarderId: string;
  bedspace: string;
  monthlyRent: number;
  startDate: string;
  endDate?: string;
  status: "active" | "ended";
}

export interface CreateRoomInput {
  propertyId: string;
  name: string;
  floor: string;
  bedCount: number;
  monthlyRent: number;
}

export interface CreateBedspaceInput {
  propertyId: string;
  roomName: string;
  monthlyRent: number;
}

export interface CreateBoarderInput {
  propertyId: string;
  fullName: string;
  phone: string;
  email?: string;
}

export interface AssignBoarderLeaseInput {
  monthlyRent: number;
  startDate: string;
  rentDueDay: number;
  gracePeriodDays: number;
  securityDepositAmount: number;
  advanceRentAmount: number;
  rentControlCovered: boolean;
}

export interface UpdatePropertyInput {
  name: string;
  city: string;
  address: string;
  contactPhone: string;
  rentDueDay: number;
  timezone: string;
  preferredPaymentMethod: "GCash" | "Cash" | "Bank transfer";
  gcashNumber: string;
  receiptFooter: string;
  notifications: Property["notifications"];
}

export interface Payment {
  id: string;
  boarderId?: string;
  tenant: string;
  initials: string;
  amount: number;
  method: "GCash" | "Cash" | "Bank";
  period: string;
  date: string;
  status: "paid" | "pending" | "void";
  referenceNumber?: string;
  receiptNumber?: string;
  periodStart?: string;
  paidAt?: string;
  allocationLabel?: string;
  allocations?: PaymentAllocation[];
}

export type BillingChargeType = "rent" | "advance_rent" | "security_deposit" | "other";
export type BillingChargeStatus = "open" | "partial" | "paid" | "void";

export interface LeaseTerm {
  id: string;
  propertyId: string;
  boarderId: string;
  occupancyId: string;
  monthlyRent: number;
  rentDueDay: number;
  gracePeriodDays: number;
  securityDepositAmount: number;
  advanceRentAmount: number;
  rentControlCovered: boolean;
  effectiveFrom: string;
  effectiveTo?: string;
  status: "active" | "ended";
}

export interface BillingCharge {
  id: string;
  propertyId: string;
  leaseId: string;
  boarderId: string;
  occupancyId: string;
  type: BillingChargeType;
  description: string;
  periodStart?: string;
  dueDate: string;
  amount: number;
  paidAmount: number;
  reservedAmount: number;
  balance: number;
  status: BillingChargeStatus;
  source: "generated" | "opening" | "migration" | "manual";
}

export interface PaymentAllocation {
  id: string;
  paymentId: string;
  chargeId: string;
  amount: number;
  chargeType?: BillingChargeType;
  description?: string;
  periodStart?: string;
}

export interface PaymentAllocationInput {
  chargeId: string;
  amount: number;
}

export interface CreateBillingChargeInput {
  propertyId: string;
  boarderId: string;
  description: string;
  dueDate: string;
  amount: number;
}

export interface Need {
  id: string;
  boarderId?: string;
  title: string;
  description?: string;
  location: string;
  tenant: string;
  priority: "urgent" | "normal" | "low";
  status: "open" | "in progress" | "resolved";
  reported: string;
}

export interface UpdateRoomInput { name: string; floor: string; }
export interface UpdateBedspaceInput { label: string; monthlyRent: number; }
export interface UpdateBoarderInput { fullName: string; phone: string; email?: string; }
export interface CreatePaymentInput { propertyId: string; boarderId: string; amount: number; method: "GCash" | "Cash" | "Bank"; status: "paid" | "pending"; referenceNumber?: string; allocations: PaymentAllocationInput[]; }
export interface CreateNeedInput { propertyId: string; boarderId?: string; title: string; description?: string; location: string; priority: Need["priority"]; }
