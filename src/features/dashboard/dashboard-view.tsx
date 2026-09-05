import { useMemo, useState, type CSSProperties } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, BedDouble, CheckCircle2, CircleAlert, Clock3, PhilippinePeso, ReceiptText, Users, Wrench } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useSpaces } from "@/features/spaces/application/spaces-provider";
import { usePayments } from "@/features/payments/application/payments-provider";
import { useNeeds } from "@/features/needs/application/needs-provider";
import type { Payment, ViewKey } from "@/lib/bedkeep/types";
import { zonedDateKey, zonedMonthKey } from "@/lib/local-date";

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 });
type Range = 1 | 3 | 12;

function buildRevenueSeries(payments: Payment[], count: Range, timeZone: string) {
  const now = new Date();
  const [currentYear, currentMonth] = zonedMonthKey(now, timeZone).split("-").map(Number);
  const months = Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(currentYear, currentMonth - count + index, 15, 12));
    const key = date.toISOString().slice(0, 7);
    const total = payments.filter((payment) => payment.status === "paid" && payment.paidAt && zonedMonthKey(new Date(payment.paidAt), timeZone) === key).reduce((sum, payment) => sum + (payment.allocations?.filter((allocation) => ["rent", "advance_rent"].includes(allocation.chargeType || "")).reduce((allocated, allocation) => allocated + allocation.amount, 0) || 0), 0);
    return { key, shortLabel: new Intl.DateTimeFormat("en-PH", { month: "short", timeZone }).format(date), fullLabel: new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric", timeZone }).format(date), total };
  });
  const maximum = Math.max(...months.map((month) => month.total), 1);
  return months.map((month) => ({ ...month, height: month.total ? Math.max(10, Math.round(month.total / maximum * 100)) : 0 }));
}

function MetricCard({ icon: Icon, label, value, note, positive = true, featured = false }: { icon: typeof Users; label: string; value: string; note: string; positive?: boolean; featured?: boolean }) {
  return <article className={`metric-card ${featured ? "metric-featured" : ""}`}><div className="metric-top"><span className="metric-icon"><Icon /></span><span className="metric-label">{label}</span></div><strong>{value}</strong><div className={`metric-note ${positive ? "positive" : "warning"}`}>{positive ? <ArrowUpRight /> : <ArrowDownRight />} {note}</div></article>;
}

export function DashboardView({ onNavigate, onOpenPayments }: { onNavigate: (view: "spaces" | "payments" | "needs") => void; onOpenPayments: (period?: string) => void }) {
  const { beds, boarders, occupancyHistory, property } = useSpaces();
  const { payments, charges } = usePayments();
  const { needs } = useNeeds();
  const [range, setRange] = useState<Range>(12);
  const now = new Date();
  const timeZone = property?.timezone || "Asia/Manila";
  const currentMonth = zonedMonthKey(now, timeZone);
  const today = zonedDateKey(now, timeZone);
  const monthName = new Intl.DateTimeFormat("en-PH", { month: "long", timeZone }).format(now);
  const occupied = beds.filter((bed) => bed.status !== "vacant").length;
  const currentRentCharges = charges.filter((charge) => ["rent", "advance_rent"].includes(charge.type) && charge.periodStart?.startsWith(currentMonth) && charge.status !== "void");
  const rentPaid = currentRentCharges.reduce((total, charge) => total + charge.paidAmount, 0);
  const cashCollected = payments.filter((payment) => payment.status === "paid" && payment.paidAt && zonedMonthKey(new Date(payment.paidAt), timeZone) === currentMonth).reduce((total, payment) => total + (payment.allocations?.filter((allocation) => ["rent", "advance_rent"].includes(allocation.chargeType || "")).reduce((allocated, allocation) => allocated + allocation.amount, 0) || 0), 0);
  const expected = currentRentCharges.reduce((total, charge) => total + charge.amount, 0);
  const outstanding = currentRentCharges.reduce((total, charge) => total + charge.balance, 0);
  const collectionRate = expected ? Math.min(100, Math.round(rentPaid / expected * 100)) : 0;
  const revenue = useMemo(() => buildRevenueSeries(payments, range, timeZone), [payments, range, timeZone]);
  const rangeTotal = revenue.reduce((total, month) => total + month.total, 0);
  const comparisonSeries = useMemo(() => buildRevenueSeries(payments, 3, timeZone), [payments, timeZone]);
  const previousPaid = comparisonSeries.at(-2)?.total || 0;
  const change = previousPaid ? Math.round((cashCollected - previousPaid) / previousPaid * 100) : null;
  const overdueBeds = beds.filter((bed) => bed.status === "due").length;
  const pendingPayments = payments.filter((payment) => payment.status === "pending").length;
  const activeNeeds = needs.filter((need) => need.status !== "resolved").sort((a, b) => Number(b.priority === "urgent") - Number(a.priority === "urgent"));
  const urgentNeeds = activeNeeds.filter((need) => need.priority === "urgent").length;
  const activity = [
    ...payments.filter((payment) => payment.status === "paid" && payment.paidAt && zonedDateKey(new Date(payment.paidAt), timeZone) === today).map((payment) => ({ id: `payment-${payment.id}`, icon: ReceiptText, title: `${peso.format(payment.amount)} received from ${payment.tenant}`, detail: `${payment.method} · ${payment.period}`, view: "payments" as ViewKey })),
    ...occupancyHistory.filter((stay) => stay.startDate === today).map((stay) => ({ id: `stay-${stay.id}`, icon: BedDouble, title: `Boarder assigned to ${stay.bedspace}`, detail: `${peso.format(stay.monthlyRent)} monthly rent`, view: "spaces" as ViewKey })),
  ].slice(0, 5);
  const attentionItems = [
    overdueBeds ? { label: `${overdueBeds} ${overdueBeds === 1 ? "bed has" : "beds have"} rent due`, action: "Review bedspaces", icon: BedDouble, view: "spaces" as const } : null,
    pendingPayments ? { label: `${pendingPayments} ${pendingPayments === 1 ? "payment awaits" : "payments await"} confirmation`, action: "Open ledger", icon: ReceiptText, view: "payments" as const } : null,
    urgentNeeds ? { label: `${urgentNeeds} urgent ${urgentNeeds === 1 ? "request needs" : "requests need"} attention`, action: "Review requests", icon: Wrench, view: "needs" as const } : null,
  ].filter(Boolean) as Array<{ label: string; action: string; icon: typeof BedDouble; view: "spaces" | "payments" | "needs" }>;

  return <div className="view-stack animate-in-view">
    <div className="dashboard-context"><span><Clock3 />As of {new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone }).format(now)}</span><button onClick={() => onOpenPayments(currentMonth)}>Open this month’s ledger <ArrowRight /></button></div>
    {attentionItems.length ? <section className="dashboard-attention" aria-label="Items needing attention"><div className="attention-heading"><CircleAlert /><div><strong>Needs your attention</strong><span>Handle these items to keep records current.</span></div></div><div className="attention-actions">{attentionItems.map((item) => <button key={item.view} onClick={() => onNavigate(item.view)}><item.icon /><span><strong>{item.label}</strong><small>{item.action}</small></span><ArrowRight /></button>)}</div></section> : <section className="dashboard-clear"><CheckCircle2 /><div><strong>Everything is up to date</strong><span>No urgent requests, overdue beds, or pending payments.</span></div></section>}
    <section className="metrics-grid" aria-label="Business summary">
      <MetricCard featured icon={BedDouble} label="Occupancy" value={`${beds.length ? Math.round((occupied / beds.length) * 100) : 0}%`} note={`${occupied} of ${beds.length} beds filled`} />
      <MetricCard icon={PhilippinePeso} label="Cash received this month" value={peso.format(cashCollected)} note={change === null ? "No previous-month comparison" : `${Math.abs(change)}% ${change >= 0 ? "above" : "below"} last month`} positive={change === null || change >= 0} />
      <MetricCard icon={CircleAlert} label="Outstanding rent" value={peso.format(outstanding)} note={`${pendingPayments} awaiting confirmation`} positive={outstanding === 0} />
      <MetricCard icon={Users} label="Active boarders" value={String(boarders.filter((boarder) => ["current", "overdue"].includes(boarder.status)).length)} note={`${boarders.length} total records`} />
    </section>

    <section className="dashboard-grid">
      <article className="panel chart-panel">
        <div className="panel-heading"><div><span className="eyebrow">CASH FLOW</span><h2>Revenue pulse</h2></div><div className="range-tabs" role="group" aria-label="Revenue range">{([1,3,12] as Range[]).map((item) => <button key={item} className={range === item ? "active" : ""} aria-pressed={range === item} onClick={() => setRange(item)}>{item === 1 ? "This month" : `${item} months`}</button>)}</div></div>
        <div className="chart-total"><strong>{peso.format(range === 1 ? cashCollected : rangeTotal)}</strong><span>{range === 1 ? `cash received in ${monthName}` : `cash received across the last ${range} months`}</span></div>
        <div className={`bar-chart bar-chart-${range}`} aria-label={`Paid rent collected during the last ${range} month${range === 1 ? "" : "s"}`}>
          {revenue.map((month, index) => <button type="button" key={month.key} aria-label={`${month.fullLabel}: ${peso.format(month.total)}. Open filtered ledger.`} title={`${month.fullLabel}: ${peso.format(month.total)}`} onClick={() => onOpenPayments(month.key)} style={{ "--bar-height": `${month.height}%` } as CSSProperties} className={`${index === revenue.length - 1 ? "active" : ""} ${month.total === 0 ? "empty" : ""}`}><i /><small>{month.shortLabel}</small></button>)}
        </div>
        {!rangeTotal && <button className="chart-empty-link" onClick={() => onOpenPayments()}>No paid transactions in this range. Open the ledger <ArrowRight /></button>}
      </article>

      <article className="panel collection-panel">
        <div className="panel-heading"><div><span className="eyebrow">{monthName.toUpperCase()} RENT</span><h2>Rent collection</h2></div><button className="text-link" onClick={() => onOpenPayments(currentMonth)}>View ledger</button></div>
        <div className="collection-ring" style={{ "--collection": `${collectionRate}%` } as CSSProperties}><span><strong>{collectionRate}%</strong><small>collected</small></span></div>
        <Progress value={collectionRate} aria-label={`${collectionRate} percent of rent collected`} className="collection-progress" />
        <div className="collection-legend"><span><i className="paid-dot" />{peso.format(rentPaid)} paid</span><span><i className="due-dot" />{peso.format(outstanding)} due</span></div>
      </article>
    </section>

    <section className="dashboard-grid dashboard-grid-lower">
      <article className="panel occupancy-snapshot"><div className="panel-heading"><div><span className="eyebrow">LIVE STATUS</span><h2>Bedspace snapshot</h2></div><button className="text-link" onClick={() => onNavigate("spaces")}>Manage beds</button></div><div className="mini-bed-grid">{beds.slice(0, 18).map((bed) => <button key={bed.id} onClick={() => onNavigate("spaces")} className={`mini-bed ${bed.status}`} aria-label={`${bed.room} ${bed.label}: ${bed.status}`}><BedDouble /><span>{bed.label}</span></button>)}</div>{!beds.length && <button className="empty-dashboard-link" onClick={() => onNavigate("spaces")}>Create your first room and bedspaces</button>}<div className="status-legend"><span><i className="occupied-dot" />Occupied</span><span><i className="vacant-dot" />Vacant</span><span><i className="overdue-dot" />Rent due</span></div></article>
      <article className="panel needs-summary"><div className="panel-heading"><div><span className="eyebrow">ATTENTION</span><h2>Open requests</h2></div><button className="text-link" onClick={() => onNavigate("needs")}>View all</button></div><div className="needs-list compact">{activeNeeds.slice(0, 3).map((need) => <div className="need-row" key={need.id}><span className={`priority-marker ${need.priority}`} /><div><strong>{need.title}</strong><span>{need.location} · {need.reported}</span></div><span className={`status-chip ${need.status.replace(" ", "-")}`}>{need.status}</span></div>)}{!activeNeeds.length && <button className="empty-dashboard-link" onClick={() => onNavigate("needs")}><CheckCircle2 /> No open requests</button>}</div></article>
    </section>

    <section className="panel activity-panel"><div className="panel-heading"><div><span className="eyebrow">TODAY</span><h2>Recent activity</h2></div></div>{activity.length ? <div className="activity-list">{activity.map(({ id, icon: Icon, title, detail, view }) => <button key={id} onClick={() => onNavigate(view as "spaces" | "payments" | "needs")}><span><Icon /></span><span><strong>{title}</strong><small>{detail}</small></span><ArrowRight /></button>)}</div> : <div className="activity-empty"><CheckCircle2 /><span><strong>No activity recorded today</strong><small>Payments and new assignments will appear here.</small></span></div>}</section>
  </div>;
}
