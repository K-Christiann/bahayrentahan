import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { BillingCharge, CreateBillingChargeInput, CreatePaymentInput, LeaseTerm, Payment } from "@/lib/bedkeep/types";
import { useSpaces } from "@/features/spaces/application/spaces-provider";
import { createPaymentRepository } from "../data/create-payment-repository";
import { userError } from "@/lib/user-error";
import { zonedMonthKey } from "@/lib/local-date";

interface Value { payments: Payment[]; charges: BillingCharge[]; leaseTerms: LeaseTerm[]; loading: boolean; mutating: boolean; syncing: boolean; error: string; refresh: () => Promise<void>; ensurePeriod: (period: string) => Promise<void>; createCharge: (input: Omit<CreateBillingChargeInput, "propertyId">) => Promise<void>; createPayment: (input: Omit<CreatePaymentInput, "propertyId">) => Promise<void>; confirmPayment: (id: string) => Promise<void>; voidPayment: (id: string) => Promise<void>; }
const Context = createContext<Value | null>(null);
export function PaymentsProvider({ children }: { children: ReactNode }) {
  const { property, refreshCurrent: refreshSpaces } = useSpaces(); const repository = useMemo(createPaymentRepository, []); const [payments, setPayments] = useState<Payment[]>([]); const [charges, setCharges] = useState<BillingCharge[]>([]); const [leaseTerms, setLeaseTerms] = useState<LeaseTerm[]>([]); const [loading, setLoading] = useState(true); const [mutating, setMutating] = useState(false); const [syncing, setSyncing] = useState(false); const [error, setError] = useState("");
  const paymentRequest = useRef(0);
  const refreshData = useCallback(async (ensurePeriod: boolean, showLoading = true) => {
    if (!property?.id) return;
    const request = ++paymentRequest.current;
    if (showLoading) setLoading(true);
    try {
      const snapshot = await repository.load(property.id, `${zonedMonthKey(new Date(), property.timezone)}-01`, { ensurePeriod });
      if (request !== paymentRequest.current) return;
      setPayments(snapshot.payments); setCharges(snapshot.charges); setLeaseTerms(snapshot.leaseTerms); setError("");
    } catch (caught) { if (request === paymentRequest.current) setError(userError(caught, "Payments could not be loaded.")); }
    finally { if (showLoading && request === paymentRequest.current) setLoading(false); }
  }, [property?.id, property?.timezone, repository]);
  const refresh = useCallback(async () => { await refreshData(true); }, [refreshData]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const handleBillingChange = (event: Event) => {
      const requestedPropertyId = (event as CustomEvent<{ propertyId?: string }>).detail?.propertyId;
      if (!requestedPropertyId || requestedPropertyId === property?.id) void refreshData(false, false);
    };
    window.addEventListener("bahayrentahan:billing-changed", handleBillingChange);
    return () => window.removeEventListener("bahayrentahan:billing-changed", handleBillingChange);
  }, [property?.id, refreshData]);
  const syncAfterMutation = useCallback(() => {
    setSyncing(true);
    void Promise.all([refreshData(false, false), refreshSpaces()])
      .catch((caught) => setError(userError(caught, "The change is saved, but the latest totals could not be refreshed.")))
      .finally(() => setSyncing(false));
  }, [refreshData, refreshSpaces]);
  const mutate = useCallback(async (work: () => Promise<void>) => {
    setMutating(true); setError("");
    try { await work(); syncAfterMutation(); }
    catch (caught) { setError(userError(caught, "Payment could not be saved.")); throw caught; }
    finally { setMutating(false); }
  }, [syncAfterMutation]);
  const value = useMemo<Value>(() => ({ payments, charges, leaseTerms, loading, mutating, syncing, error, refresh, async ensurePeriod(period) { if (!property) throw new Error("Property is still loading."); await repository.ensurePeriod(property.id, `${period}-01`); await refreshData(false, false); }, async createCharge(input) { if (!property) throw new Error("Property is still loading."); await mutate(() => repository.createCharge({ ...input, propertyId: property.id })); }, async createPayment(input) { if (!property) throw new Error("Property is still loading."); await mutate(() => repository.create({ ...input, propertyId: property.id })); }, async confirmPayment(id) { await mutate(() => repository.confirm(id)); }, async voidPayment(id) { await mutate(() => repository.void(id)); } }), [charges, error, leaseTerms, loading, mutate, mutating, payments, property, refresh, refreshData, repository, syncing]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function usePayments() { const value = useContext(Context); if (!value) throw new Error("usePayments must be inside PaymentsProvider"); return value; }
