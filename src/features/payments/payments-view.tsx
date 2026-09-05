import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Download, Eye, FilterX, Landmark, LoaderCircle, Plus, ReceiptText, Search, ShieldCheck, Slash, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ErrorBanner, FieldError } from "@/components/ui/error-banner";
import { Input } from "@/components/ui/input";
import { PaginationControls } from "@/components/ui/pagination";
import { ListSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useSpaces } from "@/features/spaces/application/spaces-provider";
import type { BillingCharge, BillingChargeType, Payment } from "@/lib/bedkeep/types";
import { zonedDateKey, zonedMonthKey } from "@/lib/local-date";
import { usePagination } from "@/lib/use-pagination";
import { useUnsavedChanges } from "@/lib/use-unsaved-changes";
import { userError } from "@/lib/user-error";
import { usePayments } from "./application/payments-provider";

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 });
type StatusFilter = "all" | Payment["status"];
type SortKey = "newest" | "oldest" | "amount-high" | "amount-low";
type FormState = { boarderId: string; method: Payment["method"]; period: string; status: "paid" | "pending"; referenceNumber: string; allocations: Record<string, number> };

function chargeTypeLabel(type: BillingChargeType) {
  if (type === "advance_rent") return "Advance rent";
  if (type === "security_deposit") return "Security deposit";
  if (type === "other") return "Other charge";
  return "Monthly rent";
}

function dateLabel(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

export function PaymentsView({ initialBoarderId, onInitialBoarderHandled, initialPeriod, onInitialPeriodHandled, onAssignBoarder }: { initialBoarderId?: string | null; onInitialBoarderHandled?: () => void; initialPeriod?: string | null; onInitialPeriodHandled?: () => void; onAssignBoarder?: () => void }) {
  const { payments, charges, loading, mutating, syncing, error, refresh, ensurePeriod, createCharge, createPayment, confirmPayment, voidPayment } = usePayments();
  const { boarders, property } = useSpaces();
  const { push } = useToast();
  const currentMonth = zonedMonthKey(new Date(), property?.timezone);
  const currentMonthLabel = new Intl.DateTimeFormat("en-PH", { month: "long", timeZone: property?.timezone || "Asia/Manila" }).format(new Date());
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [period, setPeriod] = useState("");
  const [method, setMethod] = useState<"all" | Payment["method"]>("all");
  const [boarderFilter, setBoarderFilter] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [recordOpen, setRecordOpen] = useState(false);
  const [chargeOpen, setChargeOpen] = useState(false);
  const [loadingPeriod, setLoadingPeriod] = useState(false);
  const [allocationSeeded, setAllocationSeeded] = useState(false);
  const [receipt, setReceipt] = useState<Payment | null>(null);
  const [voidTarget, setVoidTarget] = useState<Payment | null>(null);
  const [formBaseline, setFormBaseline] = useState("");
  const assignedBoarders = useMemo(() => boarders.filter((item) => ["current", "overdue"].includes(item.status)), [boarders]);
  const billableBoarders = useMemo(() => boarders.filter((item) => ["current", "overdue"].includes(item.status) || charges.some((charge) => charge.boarderId === item.id && ["open", "partial"].includes(charge.status) && charge.balance > 0)), [boarders, charges]);
  const unassignedBoarders = useMemo(() => boarders.filter((item) => item.status === "unassigned" && !charges.some((charge) => charge.boarderId === item.id && ["open", "partial"].includes(charge.status) && charge.balance > 0)), [boarders, charges]);
  const openChargeBoarders = useMemo(() => billableBoarders.map((boarder) => {
    const openCharges = charges
      .filter((charge) => charge.boarderId === boarder.id && ["open", "partial"].includes(charge.status) && charge.balance - charge.reservedAmount > 0)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const availableBalance = openCharges.reduce((sum, charge) => sum + Math.max(0, charge.balance - charge.reservedAmount), 0);
    return {
      boarder,
      availableBalance,
      chargeCount: openCharges.length,
      nextDueDate: openCharges[0]?.dueDate || "",
      period: openCharges.find((charge) => charge.periodStart)?.periodStart?.slice(0, 7) || currentMonth,
    };
  }).filter((item) => item.chargeCount > 0).sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate) || b.availableBalance - a.availableBalance), [billableBoarders, charges, currentMonth]);
  const [form, setForm] = useState<FormState>({ boarderId: "", method: "GCash", period: currentMonth, status: "paid", referenceNumber: "", allocations: {} });
  const [chargeForm, setChargeForm] = useState({ boarderId: "", description: "", dueDate: zonedDateKey(new Date(), property?.timezone), amount: 0 });
  const [chargeBaseline, setChargeBaseline] = useState("");
  const dirty = recordOpen && Boolean(formBaseline) && JSON.stringify(form) !== formBaseline;
  const guardClose = useUnsavedChanges(dirty);
  const chargeDirty = chargeOpen && Boolean(chargeBaseline) && JSON.stringify(chargeForm) !== chargeBaseline;
  const guardChargeClose = useUnsavedChanges(chargeDirty);

  function chargeCandidates(boarderId: string, selectedPeriod: string) {
    return charges.filter((charge) => {
      if (charge.boarderId !== boarderId || charge.status === "paid" || charge.status === "void") return false;
      if (charge.balance - charge.reservedAmount <= 0) return false;
      return charge.type === "security_deposit" || charge.type === "other" || charge.periodStart?.startsWith(selectedPeriod);
    });
  }

  function fullAllocations(boarderId: string, selectedPeriod: string) {
    const candidates = chargeCandidates(boarderId, selectedPeriod);
    const periodRent = candidates.filter((charge) => ["rent", "advance_rent"].includes(charge.type) && charge.periodStart?.startsWith(selectedPeriod));
    const defaults = periodRent.length ? periodRent : candidates.slice(0, 1);
    return Object.fromEntries(defaults.map((charge) => [charge.id, Math.max(0, charge.balance - charge.reservedAmount)]));
  }

  const filtered = useMemo(() => payments.filter((item) => {
    const search = `${item.tenant} ${item.period} ${item.allocationLabel || ""} ${item.referenceNumber || ""} ${item.receiptNumber || ""}`.toLowerCase();
    const matchesPeriod = !period || item.allocations?.some((allocation) => allocation.periodStart?.startsWith(period)) || item.periodStart?.startsWith(period);
    return (status === "all" || item.status === status) && matchesPeriod && (method === "all" || item.method === method) && (!boarderFilter || item.boarderId === boarderFilter) && search.includes(query.trim().toLowerCase());
  }).sort((a, b) => {
    if (sort === "amount-high") return b.amount - a.amount;
    if (sort === "amount-low") return a.amount - b.amount;
    const aDate = new Date(a.paidAt || `${a.periodStart}T00:00:00`).getTime();
    const bDate = new Date(b.paidAt || `${b.periodStart}T00:00:00`).getTime();
    return sort === "oldest" ? aDate - bDate : bDate - aDate;
  }), [boarderFilter, method, payments, period, query, sort, status]);
  const pagination = usePagination(filtered, 8, `${query}|${status}|${period}|${method}|${boarderFilter}|${sort}`);
  const openChargePagination = usePagination(openChargeBoarders, 5, openChargeBoarders.map((item) => `${item.boarder.id}:${item.availableBalance}`).join("|"));
  const currentRentCharges = charges.filter((charge) => ["rent", "advance_rent"].includes(charge.type) && charge.periodStart?.startsWith(currentMonth) && charge.status !== "void");
  const rentCollected = currentRentCharges.reduce((sum, charge) => sum + charge.paidAmount, 0);
  const expected = currentRentCharges.reduce((sum, charge) => sum + charge.amount, 0);
  const outstanding = currentRentCharges.reduce((sum, charge) => sum + charge.balance, 0);
  const rate = expected ? Math.min(100, Math.round(rentCollected / expected * 100)) : 0;
  const depositsHeld = charges.filter((charge) => charge.type === "security_deposit" && charge.status !== "void").reduce((sum, charge) => sum + charge.paidAmount, 0);
  const pendingCount = payments.filter((item) => item.status === "pending").length;
  const hasFilters = Boolean(query || period || boarderFilter || status !== "all" || method !== "all" || sort !== "newest");
  const visibleCharges = chargeCandidates(form.boarderId, form.period);
  const selectedAllocations = Object.entries(form.allocations).filter(([, amount]) => amount > 0);
  const paymentTotal = selectedAllocations.reduce((sum, [, amount]) => sum + amount, 0);
  const invalidAllocation = selectedAllocations.some(([chargeId, amount]) => {
    const charge = charges.find((item) => item.id === chargeId);
    return !charge || amount <= 0 || amount > Math.max(0, charge.balance - charge.reservedAmount);
  });
  const referenceError = form.referenceNumber.trim() && payments.some((item) => item.referenceNumber?.toLowerCase() === form.referenceNumber.trim().toLowerCase()) ? "This reference number is already used." : "";
  const busy = mutating || syncing;

  async function openRecord(boarderId?: string, selectedPeriod = currentMonth) {
    setLoadingPeriod(true);
    try {
      const requestedBoarder = billableBoarders.find((item) => item.id === boarderId);
      const unsettledPeriod = requestedBoarder && !["current", "overdue"].includes(requestedBoarder.status)
        ? charges.find((charge) => charge.boarderId === requestedBoarder.id && ["open", "partial"].includes(charge.status) && charge.periodStart)?.periodStart?.slice(0, 7)
        : undefined;
      const billingPeriod = unsettledPeriod || selectedPeriod;
      await ensurePeriod(billingPeriod);
      const boarder = requestedBoarder || billableBoarders[0];
      const next: FormState = { boarderId: boarder?.id || "", method: property?.preferredPaymentMethod === "Bank transfer" ? "Bank" : property?.preferredPaymentMethod || "GCash", period: billingPeriod, status: "paid", referenceNumber: "", allocations: {} };
      setAllocationSeeded(false);
      setForm(next); setFormBaseline(JSON.stringify(next)); setRecordOpen(true);
    } catch (caught) {
      push({ tone: "error", title: "Billing period could not be prepared", description: userError(caught, "Please retry.") });
    } finally { setLoadingPeriod(false); }
  }

  useEffect(() => {
    if (!recordOpen || !form.boarderId || allocationSeeded) return;
    const allocations = fullAllocations(form.boarderId, form.period);
    setForm((value) => ({ ...value, allocations }));
    setAllocationSeeded(true);
  }, [allocationSeeded, charges, form.boarderId, form.period, recordOpen]);

  function closeRecord() { guardClose(() => setRecordOpen(false)); }
  function openCharge() { const next = { boarderId: assignedBoarders[0]?.id || "", description: "", dueDate: zonedDateKey(new Date(), property?.timezone), amount: 0 }; setChargeForm(next); setChargeBaseline(JSON.stringify(next)); setChargeOpen(true); }
  function closeCharge() { guardChargeClose(() => setChargeOpen(false)); }
  function clearFilters() { setQuery(""); setStatus("all"); setPeriod(""); setMethod("all"); setBoarderFilter(""); setSort("newest"); }
  function chooseBoarder(boarderId: string) { setAllocationSeeded(true); setForm((value) => ({ ...value, boarderId, allocations: fullAllocations(boarderId, value.period) })); }
  async function choosePeriod(nextPeriod: string) {
    if (!nextPeriod) return;
    setLoadingPeriod(true);
    try { await ensurePeriod(nextPeriod); setAllocationSeeded(false); setForm((value) => ({ ...value, period: nextPeriod, allocations: {} })); }
    catch (caught) { push({ tone: "error", title: "Billing period could not be prepared", description: userError(caught, "Please retry.") }); }
    finally { setLoadingPeriod(false); }
  }
  function toggleCharge(charge: BillingCharge, checked: boolean) {
    setForm((value) => {
      const allocations = { ...value.allocations };
      if (checked) allocations[charge.id] = Math.max(0, charge.balance - charge.reservedAmount);
      else delete allocations[charge.id];
      return { ...value, allocations };
    });
  }

  useEffect(() => { if (!initialBoarderId || !billableBoarders.some((item) => item.id === initialBoarderId)) return; void openRecord(initialBoarderId); onInitialBoarderHandled?.(); }, [billableBoarders, initialBoarderId, onInitialBoarderHandled]);
  useEffect(() => { if (!initialPeriod) return; setPeriod(initialPeriod); setStatus("paid"); onInitialPeriodHandled?.(); }, [initialPeriod, onInitialPeriodHandled]);

  async function save() {
    if (!form.boarderId || paymentTotal <= 0 || invalidAllocation || referenceError) return;
    try {
      await createPayment({ boarderId: form.boarderId, amount: paymentTotal, method: form.method, status: form.status, referenceNumber: form.referenceNumber.trim(), allocations: selectedAllocations.map(([chargeId, amount]) => ({ chargeId, amount })) });
      setFormBaseline(JSON.stringify(form)); setRecordOpen(false);
      push({ title: form.status === "paid" ? "Payment allocated" : "Payment awaiting confirmation", description: form.status === "paid" ? `${peso.format(paymentTotal)} was applied to ${selectedAllocations.length} charge${selectedAllocations.length === 1 ? "" : "s"}.` : "The selected balances are reserved until this payment is confirmed or voided." });
    } catch (caught) { push({ tone: "error", title: "Payment could not be recorded", description: userError(caught, "Please retry the payment.") }); }
  }

  async function saveCharge() {
    const description = chargeForm.description.trim();
    if (!chargeForm.boarderId || !description || description.length > 120 || !chargeForm.dueDate || chargeForm.amount <= 0) return;
    try {
      await createCharge({ boarderId: chargeForm.boarderId, description, dueDate: chargeForm.dueDate, amount: chargeForm.amount });
      setChargeBaseline(JSON.stringify({ ...chargeForm, description }));
      setChargeOpen(false);
      push({ title: "Charge added", description: `${peso.format(chargeForm.amount)} is ready for payment allocation.` });
    } catch (caught) { push({ tone: "error", title: "Charge could not be added", description: userError(caught, "Please retry the charge.") }); }
  }

  async function confirm(id: string) { try { await confirmPayment(id); push({ title: "Payment confirmed", description: "Charge balances and the receipt are now updated." }); } catch (caught) { push({ tone: "error", title: "Confirmation failed", description: userError(caught, "Please retry the confirmation.") }); } }
  async function voidRecord() { if (!voidTarget) return; try { await voidPayment(voidTarget.id); setVoidTarget(null); push({ title: "Payment voided", description: "Its allocations were released while the audit record remained." }); } catch (caught) { push({ tone: "error", title: "Payment could not be voided", description: userError(caught, "Please retry this action.") }); } }
  function exportCsv() { const header = ["Receipt", "Boarder", "Applied to", "Method", "Date", "Amount", "Status", "Reference"]; const rows = filtered.map((item) => [item.receiptNumber || "", item.tenant, item.allocationLabel || item.period, item.method, item.date, item.amount, item.status, item.referenceNumber || ""]); const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n"); const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); const link = document.createElement("a"); link.href = url; link.download = `bahayrentahan-payments-${currentMonth}.csv`; link.click(); URL.revokeObjectURL(url); push({ title: "Ledger exported", description: `${filtered.length} filtered record${filtered.length === 1 ? "" : "s"} included.` }); }

  return <div className="view-stack animate-in-view">
    <div className="section-intro payments-intro"><div><span className="eyebrow">BILLING LEDGER</span><h2>Every peso, assigned a purpose.</h2><p>Record rent, advance rent, security deposits, and other charges without mixing deposits into monthly revenue.</p></div><div className="header-actions"><Button variant="outline" disabled={!filtered.length} onClick={exportCsv}><Download /> Export CSV</Button><Button variant="outline" disabled={!assignedBoarders.length || busy} onClick={openCharge}><Landmark /> Add charge</Button><Button className="lime-button" disabled={loadingPeriod || busy} onClick={() => void openRecord()}><Plus /> {loadingPeriod ? "Preparing…" : "Record payment"}</Button></div></div>
    {error && <ErrorBanner message={error} onRetry={refresh} retrying={loading} />}
    {syncing && <div className="payment-sync" role="status"><LoaderCircle /><span><strong>Payment saved</strong><small>Refreshing balances and receipts in the background…</small></span></div>}
    <section className="payment-hero billing-hero"><div><span>{currentMonthLabel} rent collected</span><strong>{peso.format(rentCollected)}</strong><small>of {peso.format(expected)} expected</small></div><div className="payment-hero-stat"><strong>{rate}%</strong><span>collection rate</span></div><div className="payment-hero-stat"><strong>{peso.format(outstanding)}</strong><span>rent outstanding</span></div><div className="payment-hero-stat"><strong>{peso.format(depositsHeld)}</strong><span>deposits held</span></div><div className="payment-hero-stat"><strong>{pendingCount}</strong><span>pending</span></div></section>
    {openChargeBoarders.length > 0 && <section className="open-charge-panel" aria-label="Boarders awaiting payment"><div className="open-charge-heading"><div><span className="eyebrow">OPEN BALANCES</span><h3>Awaiting payment</h3><p>Boarders appear here as soon as their lease creates an unpaid charge.</p></div><strong>{openChargeBoarders.length} boarder{openChargeBoarders.length === 1 ? "" : "s"}</strong></div><div className="open-charge-list">{openChargePagination.visible.map((item) => <article className="open-charge-row" key={item.boarder.id}><span className="ledger-person"><i className="avatar-sm">{item.boarder.initials}</i><span><strong>{item.boarder.name}</strong><small>{item.boarder.bed}</small></span></span><span className="open-charge-detail"><small>Next due</small><strong>{dateLabel(item.nextDueDate)}</strong></span><span className="open-charge-detail"><small>Open charges</small><strong>{item.chargeCount}</strong></span><span className="open-charge-amount"><small>Amount due</small><strong>{peso.format(item.availableBalance)}</strong></span><Button className="lime-button" size="sm" disabled={busy || loadingPeriod} onClick={() => void openRecord(item.boarder.id, item.period)}>Record payment</Button></article>)}</div><PaginationControls {...openChargePagination} total={openChargeBoarders.length} label="boarders awaiting payment" onPageChange={openChargePagination.setPage} /></section>}
    <div className="ledger-filter-panel"><div className="ledger-controls"><label className="search-field"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search boarder, receipt, or allocation" aria-label="Search payments" /></label><div className="filter-tabs" role="group" aria-label="Payment status">{(["all", "paid", "pending", "void"] as const).map((item) => <button key={item} className={status === item ? "active" : ""} aria-pressed={status === item} onClick={() => setStatus(item)}>{item}</button>)}</div></div><div className="advanced-filters"><label><span>Billing period</span><Input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} /></label><label><span>Method</span><select value={method} onChange={(event) => setMethod(event.target.value as typeof method)}><option value="all">All methods</option><option>GCash</option><option>Cash</option><option>Bank</option></select></label><label><span>Boarder</span><select value={boarderFilter} onChange={(event) => setBoarderFilter(event.target.value)}><option value="">All boarders</option>{boarders.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span>Sort</span><select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="amount-high">Highest amount</option><option value="amount-low">Lowest amount</option></select></label>{hasFilters && <Button variant="outline" className="clear-filters" onClick={clearFilters}><FilterX /> Clear</Button>}</div></div>
    <div className="ledger-section-heading"><div><span className="eyebrow">TRANSACTIONS</span><h3>Payment history</h3></div><span>{filtered.length} record{filtered.length === 1 ? "" : "s"}</span></div>
    {loading && !payments.length ? <ListSkeleton rows={6} /> : <><div className="ledger-table"><div className="ledger-head"><span>Boarder</span><span>Applied to</span><span>Method</span><span>Date</span><span>Amount</span><span>Actions</span></div>{pagination.visible.map((payment) => <div className={`ledger-row ${payment.status === "void" ? "void" : ""}`} key={payment.id}><span className="ledger-person"><i className="avatar-sm">{payment.initials}</i><strong>{payment.tenant}</strong></span><span className="ledger-allocation"><strong>{payment.allocationLabel || payment.period}</strong><small>{payment.allocations?.length || 1} allocation{(payment.allocations?.length || 1) === 1 ? "" : "s"}</small></span><span>{payment.method}</span><span>{payment.date}</span><strong>{peso.format(payment.amount)}</strong><span className="ledger-actions">{payment.status === "pending" && <Button size="sm" className="confirm-button" disabled={busy} onClick={() => void confirm(payment.id)}>Confirm</Button>}{payment.status === "paid" && <button onClick={() => setReceipt(payment)} title="View receipt" aria-label={`View receipt for ${payment.tenant}`}><Eye /></button>}{payment.status !== "void" && <button disabled={busy} onClick={() => setVoidTarget(payment)} title="Void payment" aria-label={`Void payment from ${payment.tenant}`}><Slash /></button>}{payment.status === "void" && <span className="status-chip inactive">void</span>}</span></div>)}{!filtered.length && <div className="list-empty"><ReceiptText /><strong>{hasFilters ? "No payments match these filters" : "No payment records yet"}</strong><span>{hasFilters ? "Clear a filter or choose another billing period." : "Record a payment and allocate it to an open charge."}</span>{hasFilters && <Button variant="outline" onClick={clearFilters}>Clear filters</Button>}</div>}</div><div className="payment-mobile-list">{pagination.visible.map((payment) => <PaymentMobileCard key={payment.id} payment={payment} mutating={busy} onConfirm={() => void confirm(payment.id)} onReceipt={() => setReceipt(payment)} onVoid={() => setVoidTarget(payment)} />)}{!filtered.length && <div className="list-empty"><ReceiptText /><strong>No matching payments</strong><span>Adjust or clear the filters above.</span>{hasFilters && <Button variant="outline" onClick={clearFilters}>Clear filters</Button>}</div>}</div></>}
    <PaginationControls {...pagination} total={filtered.length} label="payments" onPageChange={pagination.setPage} />

    <Dialog open={recordOpen} onOpenChange={(open) => !open && closeRecord()}><DialogContent className="assign-dialog form-dialog payment-form-dialog allocation-dialog"><DialogHeader><DialogTitle>Record and allocate payment</DialogTitle><DialogDescription>Select what the money pays for. The selected period's rent is prepared first; add deposits or other charges only when they are part of this receipt.</DialogDescription></DialogHeader>{billableBoarders.length ? <><div className="form-grid"><label className="form-field form-field-wide"><span>Boarder</span><select className="form-select" value={form.boarderId} onChange={(event) => chooseBoarder(event.target.value)}>{billableBoarders.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.bed}</option>)}</select></label><label className="form-field"><span>Billing period</span><Input type="month" value={form.period} disabled={loadingPeriod} onChange={(event) => void choosePeriod(event.target.value)} /><small className="field-hint">Choose a future month to prepare advance rent.</small></label><label className="form-field"><span>Method</span><select className="form-select" value={form.method} onChange={(event) => setForm((value) => ({ ...value, method: event.target.value as Payment["method"] }))}><option>GCash</option><option>Cash</option><option>Bank</option></select></label></div>{unassignedBoarders.length > 0 && <div className="payment-boarder-notice" role="status"><span><strong>{unassignedBoarders.length} boarder{unassignedBoarders.length === 1 ? " is" : "s are"} not ready for billing</strong><small>Create a lease by assigning a bedspace first.</small></span>{onAssignBoarder && <Button variant="outline" size="sm" onClick={() => { setRecordOpen(false); onAssignBoarder(); }}>Assign now</Button>}</div>}<section className="allocation-section"><div className="allocation-heading"><div><span className="eyebrow">OPEN CHARGES</span><h3>Payment allocation</h3></div><span>{selectedAllocations.length} selected</span></div>{visibleCharges.length ? <div className="allocation-list">{visibleCharges.map((charge) => { const available = Math.max(0, charge.balance - charge.reservedAmount); const selected = charge.id in form.allocations; const allocation = form.allocations[charge.id] || 0; return <article className={selected ? "selected" : ""} key={charge.id}><label className="allocation-check"><input type="checkbox" checked={selected} onChange={(event) => toggleCharge(charge, event.target.checked)} /><span className={`charge-type-icon ${charge.type}`}>{charge.type === "security_deposit" ? <ShieldCheck /> : charge.type === "other" ? <Landmark /> : <CalendarDays />}</span><span><strong>{charge.description}</strong><small>{chargeTypeLabel(charge.type)} · Due {dateLabel(charge.dueDate)}</small></span></label><div className="charge-balance"><small>{charge.reservedAmount ? `${peso.format(charge.reservedAmount)} pending · ` : ""}{peso.format(available)} available</small>{selected && <Input type="number" inputMode="decimal" min="0.01" max={available} step="0.01" value={allocation || ""} aria-label={`Amount allocated to ${charge.description}`} onChange={(event) => setForm((value) => ({ ...value, allocations: { ...value.allocations, [charge.id]: Number(event.target.value) } }))} />}</div></article>; })}</div> : <div className="allocation-empty"><CheckCircle2 /><strong>No open charges for this period</strong><span>This boarder may already be fully paid. Choose another month to prepare its rent charge.</span></div>}</section><div className="payment-total-card"><span><small>Payment total</small><strong>{peso.format(paymentTotal)}</strong></span><small>{selectedAllocations.length ? `Allocated across ${selectedAllocations.length} charge${selectedAllocations.length === 1 ? "" : "s"}` : "Select at least one open charge"}</small></div><div className="form-grid"><label className="form-field"><span>Status</span><select className="form-select" value={form.status} onChange={(event) => setForm((value) => ({ ...value, status: event.target.value as "paid" | "pending" }))}><option value="paid">Received and confirmed</option><option value="pending">Pending verification</option></select></label><label className="form-field"><span>Reference number <small>Optional</small></span><Input aria-invalid={Boolean(referenceError)} aria-describedby="payment-reference-error" value={form.referenceNumber} maxLength={60} onChange={(event) => setForm((value) => ({ ...value, referenceNumber: event.target.value }))} /><FieldError id="payment-reference-error">{referenceError}</FieldError></label></div>{invalidAllocation && <div className="form-message error">An allocation is greater than its available balance. Adjust the amount before saving.</div>}</> : <div className="payment-empty-state"><Users /><strong>No boarder is ready for billing</strong><p>Add a boarder and assign a bedspace to create lease terms and opening charges.</p>{onAssignBoarder && <Button className="lime-button" onClick={() => { setRecordOpen(false); onAssignBoarder(); }}>Go to bedspaces</Button>}</div>}<DialogFooter><Button variant="outline" onClick={closeRecord}>Cancel</Button><Button className="lime-button" disabled={mutating || loadingPeriod || !form.boarderId || paymentTotal <= 0 || invalidAllocation || Boolean(referenceError)} onClick={save}>{mutating ? "Saving…" : `Record ${peso.format(paymentTotal)}`}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={chargeOpen} onOpenChange={(open) => !open && closeCharge()}><DialogContent className="assign-dialog form-dialog manual-charge-dialog"><DialogHeader><DialogTitle>Add another charge</DialogTitle><DialogDescription>Create a specific obligation such as utilities or documented damage. It remains separate from rent and the security deposit.</DialogDescription></DialogHeader><div className="form-grid"><label className="form-field form-field-wide"><span>Boarder</span><select className="form-select" value={chargeForm.boarderId} onChange={(event) => setChargeForm((value) => ({ ...value, boarderId: event.target.value }))}>{assignedBoarders.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.bed}</option>)}</select></label><label className="form-field form-field-wide"><span>Charge description</span><Input maxLength={120} placeholder="e.g. September electricity share" aria-invalid={Boolean(!chargeForm.description.trim())} value={chargeForm.description} onChange={(event) => setChargeForm((value) => ({ ...value, description: event.target.value }))} /><FieldError>{!chargeForm.description.trim() ? "Describe what the boarder owes." : ""}</FieldError></label><label className="form-field"><span>Due date</span><Input type="date" value={chargeForm.dueDate} onChange={(event) => setChargeForm((value) => ({ ...value, dueDate: event.target.value }))} /></label><label className="form-field"><span>Amount</span><Input type="number" inputMode="decimal" min="0.01" step="0.01" aria-invalid={chargeForm.amount <= 0} value={chargeForm.amount || ""} onChange={(event) => setChargeForm((value) => ({ ...value, amount: Number(event.target.value) }))} /><FieldError>{chargeForm.amount <= 0 ? "Enter an amount greater than zero." : ""}</FieldError></label></div><div className="manual-charge-note"><Landmark /><span><strong>Recorded as another charge</strong><small>This amount is not included in monthly rent revenue or deposits held.</small></span></div><DialogFooter><Button variant="outline" onClick={closeCharge}>Cancel</Button><Button className="lime-button" disabled={mutating || !chargeForm.boarderId || !chargeForm.description.trim() || !chargeForm.dueDate || chargeForm.amount <= 0} onClick={saveCharge}>{mutating ? "Saving…" : "Add charge"}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={Boolean(receipt)} onOpenChange={(open) => !open && setReceipt(null)}><DialogContent className="receipt-dialog"><div className="receipt-brand"><ReceiptText /><span><strong>BahayRentahan receipt</strong><small>{property?.name}</small></span></div><div className="receipt-number"><span>Receipt number</span><strong>{receipt?.receiptNumber || "Pending"}</strong></div><div className="receipt-grid"><span><small>Received from</small><strong>{receipt?.tenant}</strong></span><span><small>Amount</small><strong>{peso.format(receipt?.amount || 0)}</strong></span><span><small>Applied to</small><strong>{receipt?.allocationLabel || receipt?.period}</strong></span><span><small>Payment method</small><strong>{receipt?.method}</strong></span><span><small>Date recorded</small><strong>{receipt?.date}</strong></span><span><small>Reference</small><strong>{receipt?.referenceNumber || "—"}</strong></span></div>{Boolean(receipt?.allocations?.length) && <div className="receipt-allocation-list">{receipt?.allocations?.map((allocation) => <span key={allocation.id}><small>{allocation.description}</small><strong>{peso.format(allocation.amount)}</strong></span>)}</div>}<p>{property?.receiptFooter}</p><small className="receipt-audit">Recorded and allocated in BahayRentahan by the property owner.</small><DialogFooter><Button variant="outline" onClick={() => setReceipt(null)}>Close</Button><Button className="lime-button" onClick={() => window.print()}><Download /> Print / Save PDF</Button></DialogFooter></DialogContent></Dialog>
    <ConfirmDialog open={Boolean(voidTarget)} onOpenChange={(open) => !open && setVoidTarget(null)} destructive busy={busy} title="Void this payment?" description="The audit record remains visible, but its paid or reserved allocations are released from every connected charge." confirmLabel="Void payment" onConfirm={voidRecord} />
  </div>;
}

function PaymentMobileCard({ payment, mutating, onConfirm, onReceipt, onVoid }: { payment: Payment; mutating: boolean; onConfirm: () => void; onReceipt: () => void; onVoid: () => void }) {
  return <article className={`payment-mobile-card ${payment.status === "void" ? "void" : ""}`}><div className="payment-mobile-heading"><span className="ledger-person"><i className="avatar-sm">{payment.initials}</i><span><strong>{payment.tenant}</strong><small>{payment.allocationLabel || payment.period}</small></span></span><span className="payment-mobile-amount"><strong>{peso.format(payment.amount)}</strong><small className={`status-chip ${payment.status}`}>{payment.status}</small></span></div><div className="payment-mobile-meta"><span><small>Method</small><strong>{payment.method}</strong></span><span><small>Date</small><strong>{payment.date}</strong></span><span><small>Allocations</small><strong>{payment.allocations?.length || 1}</strong></span></div>{payment.status !== "void" && <div className="payment-mobile-actions">{payment.status === "pending" ? <Button className="lime-button" disabled={mutating} onClick={onConfirm}>Confirm payment</Button> : <Button variant="outline" onClick={onReceipt}><Eye /> View receipt</Button>}<Button variant="outline" className="void-mobile-button" disabled={mutating} onClick={onVoid}><Slash /> Void</Button></div>}</article>;
}
