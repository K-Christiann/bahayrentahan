import { useMemo, useState } from "react";
import { BookOpen, CheckCircle2, CircleHelp, Mail, MessageCircle, PlayCircle, Search, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PaginationControls } from "@/components/ui/pagination";
import { usePagination } from "@/lib/use-pagination";

const faqs = [
  { topic: "getting-started", question: "How do I assign a boarder to a bed?", answer: "Open Bedspaces, choose a vacant bed, select an unassigned boarder, and confirm. To move an existing boarder, use Transfer from the Boarders page so BahayRentahan preserves occupancy history." },
  { topic: "spaces", question: "How is the occupancy percentage calculated?", answer: "BahayRentahan divides occupied beds by the total active beds across all rooms. Beds marked as rent-due still count as occupied." },
  { topic: "payments", question: "Can I record GCash and cash payments?", answer: "Yes. Record GCash, cash, or bank payments and allocate each receipt to rent, advance rent, a security deposit, or another open charge. Paid entries receive a printable receipt; pending entries can be confirmed later, and mistakes can be voided without deleting the audit record." },
  { topic: "payments", question: "Why are deposits separate from rent revenue?", answer: "A security deposit is tracked as money held against its own charge, not as monthly rent collected. The Payments summary therefore shows rent collected and deposits held separately." },
  { topic: "payments", question: "When is each boarder's rent due?", answer: "The due day and optional grace period are saved in the lease terms created when a boarder is assigned. BahayRentahan generates that boarder's monthly charge using those terms; day 29, 30, or 31 falls on the month's final day when necessary." },
  { topic: "payments", question: "How do I add utilities or another fee?", answer: "Choose Add charge in Payments, select an assigned boarder, describe the obligation, and set its amount and due date. It can then be selected in the payment-allocation dialog without changing rent revenue or deposit totals." },
  { topic: "spaces", question: "What happens when a boarder transfers rooms?", answer: "BahayRentahan closes the current occupancy, releases the old bed, and creates a new occupancy for the selected vacant bedspace. The previous history is preserved." },
  { topic: "getting-started", question: "How do I add another property?", answer: "Use the property switcher at the top of the sidebar, choose Add property, and enter its name and location. Every property has separate rooms, boarders, payments, requests, and settings." },
  { topic: "getting-started", question: "How does account activation work?", answer: "New owner accounts start as pending. After the BahayRentahan administrator verifies a Cash, GCash, or bank payment, the account can be activated until a selected renewal date or deliberately given no expiration. Expired or suspended access does not delete property records." },
  { topic: "getting-started", question: "How do I back up my records?", answer: "Open Reports & backup and choose Download backup. The JSON file contains property settings, rooms, bedspaces, boarders, occupancy history, leases, charges, payments, allocations, and maintenance records. Keep it in a private location outside Supabase." },
  { topic: "payments", question: "Why can cash received differ from rent paid for the month?", answer: "Cash received follows the date money entered the business. Paid toward period follows the rent month that a payment was allocated to. Late and advance payments can make those totals different, so the monthly report shows both." },
  { topic: "getting-started", question: "What if BahayRentahan is temporarily unavailable?", answer: "Check your internet connection, wait a few minutes, and reload the page. If the issue continues, contact the person who manages your BahayRentahan service." },
  { topic: "getting-started", question: "Are boarders able to log in?", answer: "No. BahayRentahan currently provides owner-only access. Boarders are managed as records and cannot sign in." },
];

const topics = [
  { id: "getting-started", title: "Getting started", description: "Learn the owner workspace and account basics.", icon: PlayCircle },
  { id: "payments", title: "Rent & payments", description: "Record collections and understand balances.", icon: BookOpen },
  { id: "spaces", title: "Rooms & maintenance", description: "Manage beds, transfers, and reported needs.", icon: Wrench },
] as const;

export function HelpCenterView() {
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState<string | null>(null);
  const filtered = useMemo(() => faqs.filter((item) => (!topic || item.topic === topic) && `${item.question} ${item.answer}`.toLowerCase().includes(query.toLowerCase())), [query, topic]);
  const pagination = usePagination(filtered, 8, `${query}|${topic || "all"}`);

  return (
    <div className="view-stack animate-in-view">
      <section className="help-hero">
        <span className="help-icon"><CircleHelp /></span><span className="eyebrow">BAHAYRENTAHAN HELP CENTER</span><h2>What can we help you manage?</h2><p>Find quick answers about beds, boarders, rent, and requests.</p>
        <label className="help-search"><Search /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the help center" /></label>
      </section>

      <section className="help-shortcuts" aria-label="Help topics">{topics.map((item) => <button type="button" className={topic === item.id ? "active" : ""} aria-pressed={topic === item.id} onClick={() => setTopic((current) => current === item.id ? null : item.id)} key={item.id}><span><item.icon /></span><div><h3>{item.title}</h3><p>{item.description}</p></div><strong>{faqs.filter((faq) => faq.topic === item.id).length} answers</strong></button>)}</section>

      <section className="help-layout">
        <div className="faq-panel">
          <div className="panel-heading"><div><span className="eyebrow">COMMON QUESTIONS</span><h2>{query ? `Results for “${query}”` : topic ? topics.find((item) => item.id === topic)?.title : "Frequently asked"}</h2></div><span className="period-pill">{filtered.length} answers</span></div>
          <div className="faq-list">
            {pagination.visible.map((item, index) => <details key={item.question} open={!query && !topic && pagination.page === 1 && index === 0}><summary>{item.question}<span>+</span></summary><p>{item.answer}</p></details>)}
            {filtered.length === 0 && <div className="empty-help"><Search /><strong>No matching answer</strong><span>Try a simpler search or contact support below.</span></div>}
          </div>
          <PaginationControls {...pagination} total={filtered.length} label="answers" onPageChange={pagination.setPage} />
        </div>

        <aside className="support-card">
          <span className="support-orbit"><MessageCircle /></span><h3>Still need a hand?</h3><p>Send your concern and include the screen where you encountered it.</p>
          <Button className="lime-button" onClick={() => { window.location.href = "mailto:?subject=BahayRentahan%20support%20request&body=Please%20describe%20what%20you%20were%20doing%20and%20which%20screen%20you%20were%20using."; }}><Mail /> Open email draft</Button>
          <div className="support-note"><CheckCircle2 /><span><strong>Useful details</strong><small>Include the screen and steps that caused the issue.</small></span></div>
        </aside>
      </section>
    </div>
  );
}
