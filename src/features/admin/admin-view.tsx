import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, Clock3, Search, ShieldCheck, SlidersHorizontal, UserCheck, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Input } from "@/components/ui/input";
import { PaginationControls } from "@/components/ui/pagination";
import { useToast } from "@/components/ui/toast";
import type { AccountAccessStatus, AdminAccount } from "@/lib/bedkeep/types";
import { userError } from "@/lib/user-error";
import { AdminRepository, type AccountAccessEvent } from "./data/admin-repository";

const repository = new AdminRepository();
const pageSize = 8;

function dateInputValue(value?: string) {
  return value ? new Date(value).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }) : "";
}

function nextMonthDate() {
  const date = new Date();
  date.setMonth(date.getMonth() + 1);
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

function expiryTimestamp(value: string) {
  return value ? new Date(`${value}T23:59:59.999+08:00`).toISOString() : undefined;
}

function humanDate(value?: string) {
  return value ? new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" }).format(new Date(value)) : "No expiry";
}

export function AdminView() {
  const { push } = useToast();
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | AccountAccessStatus>("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AdminAccount | null>(null);
  const [history, setHistory] = useState<AccountAccessEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [form, setForm] = useState({ status: "active" as AccountAccessStatus, expiresOn: nextMonthDate(), noExpiry: false, amountPaid: 250, paymentMethod: "GCash" as NonNullable<AdminAccount["paymentMethod"]>, paymentReference: "", notes: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try { setAccounts(await repository.list()); setError(""); }
    catch (caught) { setError(userError(caught, "Customer accounts could not be loaded.")); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [query, status]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return accounts.filter((account) => (status === "all" || account.status === status) && (!needle || `${account.fullName} ${account.email} ${account.propertyName}`.toLowerCase().includes(needle)));
  }, [accounts, query, status]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const counts = accounts.reduce((result, account) => ({ ...result, [account.status]: result[account.status] + 1 }), { pending: 0, active: 0, expired: 0, suspended: 0 });

  function openAccount(account: AdminAccount) {
    setSelected(account);
    setHistory([]);
    setHistoryLoading(true);
    void repository.history(account.userId).then(setHistory).catch((caught) => push({ tone: "error", title: "Access history could not be loaded", description: userError(caught, "Please try again.") })).finally(() => setHistoryLoading(false));
    setForm({
      status: account.status === "expired" ? "active" : account.status,
      expiresOn: account.expiresAt && new Date(account.expiresAt) > new Date() ? dateInputValue(account.expiresAt) : nextMonthDate(),
      noExpiry: !account.expiresAt && account.status === "active",
      amountPaid: account.amountPaid ?? 250,
      paymentMethod: account.paymentMethod || "GCash",
      paymentReference: account.paymentReference || "",
      notes: account.notes || "",
    });
  }

  async function saveAccess() {
    if (!selected || (form.status === "active" && (!Number.isFinite(form.amountPaid) || form.amountPaid < 0 || (!form.noExpiry && !form.expiresOn)))) return;
    setSaving(true);
    try {
      await repository.update({
        userId: selected.userId,
        status: form.status,
        expiresAt: form.status === "active" && !form.noExpiry ? expiryTimestamp(form.expiresOn) : undefined,
        amountPaid: form.status === "active" ? form.amountPaid : undefined,
        paymentMethod: form.status === "active" ? form.paymentMethod : undefined,
        paymentReference: form.paymentReference.trim(),
        notes: form.notes.trim(),
      });
      setSelected(null);
      await load();
      push({ title: "Account access updated", description: `${selected.fullName} is now ${form.status}.` });
    } catch (caught) {
      push({ tone: "error", title: "Access was not updated", description: userError(caught, "Please try again.") });
    } finally { setSaving(false); }
  }

  return (
    <div className="view-stack animate-in-view">
      <div className="section-intro">
        <div><span className="eyebrow">ADMINISTRATOR CONTROL</span><h2>Activate owners with confidence.</h2><p>Review customer accounts, record how access was paid, and control renewal or suspension without handling their property data.</p></div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>Refresh accounts</Button>
      </div>

      <div className="admin-metrics">
        <article><span><UsersRound /></span><div><small>Customer accounts</small><strong>{accounts.length}</strong></div></article>
        <article><span><UserCheck /></span><div><small>Active access</small><strong>{counts.active}</strong></div></article>
        <article><span><Clock3 /></span><div><small>Awaiting activation</small><strong>{counts.pending}</strong></div></article>
        <article><span><CalendarDays /></span><div><small>Expired / suspended</small><strong>{counts.expired + counts.suspended}</strong></div></article>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} retrying={loading} />}

      <section className="admin-panel">
        <div className="admin-toolbar">
          <label className="search-field"><Search /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search owner, email, or property" /></label>
          <label className="admin-filter"><SlidersHorizontal /><span className="sr-only">Filter by access status</span><select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="all">All statuses</option><option value="pending">Pending</option><option value="active">Active</option><option value="expired">Expired</option><option value="suspended">Suspended</option></select></label>
        </div>

        <div className="admin-account-list" aria-busy={loading}>
          {loading && !accounts.length && Array.from({ length: 4 }, (_, index) => <div className="admin-account-row skeleton-row" key={index}><span className="skeleton" /><span className="skeleton" /><span className="skeleton" /></div>)}
          {!loading && !visible.length && <div className="empty-state compact-empty"><UsersRound /><h3>No matching accounts</h3><p>Try another search or access-status filter.</p></div>}
          {visible.map((account) => (
            <article className="admin-account-row" key={account.userId}>
              <span className="admin-owner-avatar">{account.fullName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span>
              <div className="admin-account-identity"><strong>{account.fullName}</strong><small>{account.email}</small></div>
              <div className="admin-property"><small>Property</small><strong>{account.propertyName}</strong></div>
              <div className="admin-expiry"><small>{account.status === "active" ? "Access until" : "Account created"}</small><strong>{account.status === "active" ? humanDate(account.expiresAt) : humanDate(account.createdAt)}</strong></div>
              <span className={`access-badge ${account.status}`}>{account.status}</span>
              <Button variant="outline" size="sm" onClick={() => openAccount(account)}><SlidersHorizontal /> Manage</Button>
            </article>
          ))}
        </div>
        <PaginationControls page={safePage} pageCount={pageCount} from={filtered.length ? (safePage - 1) * pageSize + 1 : 0} to={Math.min(safePage * pageSize, filtered.length)} total={filtered.length} label="accounts" onPageChange={setPage} />
      </section>

      <div className="admin-safety-note"><ShieldCheck /><span><strong>Administrator actions are server-authorized</strong><small>The public browser key cannot grant access. Only a user listed in <code>app_admins</code> can run activation commands.</small></span></div>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open && !saving) setSelected(null); }}>
        <DialogContent className="form-dialog admin-access-dialog">
          <DialogHeader><DialogTitle>Manage account access</DialogTitle><DialogDescription>{selected?.fullName} · {selected?.propertyName}</DialogDescription></DialogHeader>
          <div className="form-grid">
            <label className="form-field"><span>Access status</span><select className="form-select" value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as AccountAccessStatus }))}><option value="active">Active</option><option value="pending">Pending</option><option value="expired">Expired</option><option value="suspended">Suspended</option></select></label>
            {form.status === "active" && <label className="form-field"><span>Paid through</span><Input type="date" min={new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" })} disabled={form.noExpiry} value={form.noExpiry ? "" : form.expiresOn} onChange={(event) => setForm((current) => ({ ...current, expiresOn: event.target.value }))} /></label>}
            {form.status === "active" && <label className="admin-unlimited form-field-wide"><input type="checkbox" checked={form.noExpiry} onChange={(event) => setForm((current) => ({ ...current, noExpiry: event.target.checked }))} /><span><strong>No expiration</strong><small>Use for complimentary or lifetime access only.</small></span></label>}
            {form.status === "active" && <label className="form-field"><span>Payment method</span><select className="form-select" value={form.paymentMethod} onChange={(event) => setForm((current) => ({ ...current, paymentMethod: event.target.value as typeof current.paymentMethod }))}><option>GCash</option><option>Cash</option><option>Bank transfer</option><option>Complimentary</option></select></label>}
            {form.status === "active" && <label className="form-field"><span>Amount received</span><Input type="number" inputMode="decimal" min="0" step="1" value={form.amountPaid} onChange={(event) => setForm((current) => ({ ...current, amountPaid: Number(event.target.value) }))} /></label>}
            {form.status === "active" && <label className="form-field"><span>Reference <small>Optional</small></span><Input maxLength={80} value={form.paymentReference} onChange={(event) => setForm((current) => ({ ...current, paymentReference: event.target.value }))} placeholder="GCash ref. or receipt no." /></label>}
            <label className="form-field form-field-wide"><span>Administrator notes <small>Optional</small></span><textarea className="form-textarea" maxLength={500} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Renewal notes or reason for suspension" /></label>
          </div>
          <section className="access-history"><div><span className="eyebrow">ACCESS HISTORY</span><strong>Recent administrator actions</strong></div>{historyLoading && <small>Loading history…</small>}{!historyLoading && !history.length && <small>No access changes have been recorded yet.</small>}{history.slice(0, 4).map((event) => <article key={event.id}><span className={`access-badge ${event.newStatus}`}>{event.newStatus}</span><div><strong>{event.paymentMethod ? `${event.paymentMethod}${event.amountPaid !== undefined ? ` · ₱${event.amountPaid.toLocaleString()}` : ""}` : "Status change"}</strong><small>{new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }).format(new Date(event.createdAt))}{event.expiresAt ? ` · until ${humanDate(event.expiresAt)}` : ""}</small></div></article>)}</section>
          <DialogFooter><Button variant="outline" onClick={() => setSelected(null)} disabled={saving}>Cancel</Button><Button className="lime-button" onClick={() => void saveAccess()} disabled={saving || (form.status === "active" && (!Number.isFinite(form.amountPaid) || form.amountPaid < 0 || (!form.noExpiry && !form.expiresOn)))}>{saving ? "Saving access…" : <><Check /> Save access</>}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
