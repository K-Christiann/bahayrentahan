import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, Banknote, BedDouble, Download, FileSpreadsheet, Printer, ReceiptText, ShieldCheck, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Input } from "@/components/ui/input";
import { PaginationControls } from "@/components/ui/pagination";
import { useToast } from "@/components/ui/toast";
import { useSpaces } from "@/features/spaces/application/spaces-provider";
import { zonedMonthKey } from "@/lib/local-date";
import { userError } from "@/lib/user-error";
import { ReportRepository, type MonthlyReport } from "./data/report-repository";

const repository = new ReportRepository();
const pageSize = 10;
const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 });

function downloadFile(name: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function csvCell(value: string | number) {
  const normalized = String(value).replace(/"/g, '""');
  return `"${normalized}"`;
}

function fileSafe(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "property";
}

function periodLabel(period: string) {
  return new Date(`${period}-01T12:00:00Z`).toLocaleDateString("en-PH", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function ReportsView() {
  const { property } = useSpaces();
  const { push } = useToast();
  const [period, setPeriod] = useState(() => zonedMonthKey(new Date(), property?.timezone || "Asia/Manila"));
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [backingUp, setBackingUp] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [printing, setPrinting] = useState(false);

  const load = useCallback(async () => {
    if (!property?.id) return;
    setLoading(true);
    try {
      setReport(await repository.loadMonthly(property.id, period));
      setError("");
      window.dispatchEvent(new CustomEvent("bahayrentahan:billing-changed", { detail: { propertyId: property.id } }));
    }
    catch (caught) { setError(userError(caught, "The monthly report could not be prepared.")); }
    finally { setLoading(false); }
  }, [period, property?.id]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [period]);
  useEffect(() => {
    const finishPrinting = () => setPrinting(false);
    window.addEventListener("afterprint", finishPrinting);
    return () => window.removeEventListener("afterprint", finishPrinting);
  }, []);

  const pageCount = Math.max(1, Math.ceil((report?.boarders.length || 0) / pageSize));
  const safePage = Math.min(page, pageCount);
  const visibleBoarders = useMemo(() => printing ? report?.boarders || [] : report?.boarders.slice((safePage - 1) * pageSize, safePage * pageSize) || [], [printing, report, safePage]);

  function printReport() {
    setPrinting(true);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => { window.print(); setPrinting(false); }));
  }

  function exportCsv() {
    if (!report || !property) return;
    const rows = [
      ["BahayRentahan monthly report", periodLabel(period)],
      ["Property", property.name],
      ["Rent billed", report.billedRent],
      ["Paid toward billing period", report.rentPaidTowardPeriod],
      ["Outstanding rent", report.outstandingRent],
      ["Cash received during month", report.cashReceived],
      ["Deposits collected during month", report.depositsCollected],
      [],
      ["Boarder", "Bedspace", "Due date", "Rent charged", "Paid", "Balance", "Status"],
      ...report.boarders.map((row) => [row.boarderName, row.bedspace, row.dueDate, row.charged, row.paid, row.balance, row.status]),
    ];
    downloadFile(`bahayrentahan-${fileSafe(property.name)}-${period}.csv`, rows.map((row) => row.map(csvCell).join(",")).join("\r\n"), "text/csv;charset=utf-8");
    push({ title: "Monthly report downloaded", description: `${periodLabel(period)} was saved as a CSV file.` });
  }

  async function downloadBackup() {
    if (!property) return;
    setBackingUp(true);
    try {
      const backup = await repository.createBackup(property.id);
      const date = new Date().toLocaleDateString("en-CA", { timeZone: property.timezone });
      downloadFile(`bahayrentahan-${fileSafe(property.name)}-backup-${date}.json`, JSON.stringify(backup, null, 2), "application/json;charset=utf-8");
      push({ title: "Complete property backup downloaded", description: "Store this JSON file in a private, secure location." });
    } catch (caught) {
      push({ tone: "error", title: "Backup could not be created", description: userError(caught, "Please try again.") });
    } finally { setBackingUp(false); }
  }

  return (
    <div className="view-stack reports-view printable-report animate-in-view">
      <div className="section-intro report-heading">
        <div><span className="eyebrow">OWNER REPORTING</span><h2>Know what came in—and what is still due.</h2><p>Review monthly rent obligations, actual cash received, deposits, and each boarder's remaining balance.</p></div>
        <div className="header-actions report-actions"><Button variant="outline" onClick={() => void downloadBackup()} disabled={!property || backingUp}><Archive /> {backingUp ? "Preparing backup…" : "Download backup"}</Button><Button variant="outline" onClick={printReport} disabled={!report}><Printer /> Print</Button><Button className="lime-button" onClick={exportCsv} disabled={!report}><FileSpreadsheet /> Export CSV</Button></div>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} retrying={loading} />}

      <section className="report-period-bar">
        <div><span><ReceiptText /></span><div><small>Reporting period</small><strong>{periodLabel(period)}</strong></div></div>
        <label><span>Choose month</span><Input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} max={zonedMonthKey(new Date(), property?.timezone || "Asia/Manila")} /></label>
      </section>

      <div className="report-metrics" aria-busy={loading}>
        <article><span><ReceiptText /></span><small>Rent billed</small><strong>{loading ? "—" : peso.format(report?.billedRent || 0)}</strong><p>Expected for {periodLabel(period)}</p></article>
        <article><span><WalletCards /></span><small>Paid toward period</small><strong>{loading ? "—" : peso.format(report?.rentPaidTowardPeriod || 0)}</strong><p>May include early or late payments</p></article>
        <article className={(report?.outstandingRent || 0) > 0 ? "attention" : ""}><span><Banknote /></span><small>Still outstanding</small><strong>{loading ? "—" : peso.format(report?.outstandingRent || 0)}</strong><p>Unpaid balance for the period</p></article>
        <article><span><BedDouble /></span><small>Occupied beds</small><strong>{loading ? "—" : report?.occupiedBeds || 0}</strong><p>Occupied at any point this month</p></article>
      </div>

      <section className="report-cash-panel">
        <div><span className="eyebrow">CASH FLOW</span><h3>Money actually received in {periodLabel(period)}</h3><p>This view follows payment dates, so it can differ from the amount paid toward this month's rent.</p></div>
        <div className="report-cash-grid"><span><small>All confirmed payments</small><strong>{peso.format(report?.cashReceived || 0)}</strong><em>{report?.paidPayments || 0} receipts</em></span><span><small>Security deposits received</small><strong>{peso.format(report?.depositsCollected || 0)}</strong><em>Held funds, not rent revenue</em></span><span><small>Other charges received</small><strong>{peso.format(report?.otherCollected || 0)}</strong><em>Utilities, damage, or manual charges</em></span></div>
      </section>

      <section className="report-ledger-panel">
        <div className="panel-heading"><div><span className="eyebrow">BOARDER BREAKDOWN</span><h3>Monthly rent ledger</h3></div><span className="report-count">{report?.boarders.length || 0} boarders billed</span></div>
        <div className="report-table">
          <div className="report-row report-row-head"><span>Boarder</span><span>Bedspace</span><span>Due date</span><span>Charged</span><span>Paid</span><span>Balance</span><span>Status</span></div>
          {!loading && !visibleBoarders.length && <div className="empty-state compact-empty"><ReceiptText /><h3>No rent charges for this month</h3><p>Active leases that overlap this period will appear here.</p></div>}
          {visibleBoarders.map((row) => <div className="report-row" key={row.boarderId}><span data-label="Boarder"><strong>{row.boarderName}</strong></span><span data-label="Bedspace">{row.bedspace}</span><span data-label="Due date">{new Date(`${row.dueDate}T12:00:00Z`).toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "UTC" })}</span><span data-label="Charged">{peso.format(row.charged)}</span><span data-label="Paid">{peso.format(row.paid)}</span><span data-label="Balance"><strong>{peso.format(row.balance)}</strong></span><span data-label="Status"><b className={`report-status ${row.status}`}>{row.status}</b></span></div>)}
        </div>
        <PaginationControls page={safePage} pageCount={pageCount} from={report?.boarders.length ? (safePage - 1) * pageSize + 1 : 0} to={Math.min(safePage * pageSize, report?.boarders.length || 0)} total={report?.boarders.length || 0} label="boarders" onPageChange={setPage} />
      </section>

      <div className="backup-note"><ShieldCheck /><span><strong>What the complete backup contains</strong><small>Property settings, rooms, archived and active bedspaces, boarders, occupancy history, lease terms, charges, payments, allocations, and maintenance records. Authentication passwords are never included.</small></span></div>
    </div>
  );
}
