import {
  ArrowRight,
  Banknote,
  BedDouble,
  Building2,
  Check,
  CircleDot,
  ClipboardCheck,
  Droplets,
  Menu,
  ReceiptText,
  ShieldCheck,
  Smartphone,
  UserRoundPlus,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { BrandMark } from "@/components/bedkeep/brand-mark";

type BoardView = "beds" | "rent" | "needs";

const bedRows = [
  { room: "Room A", floor: "Second floor", beds: ["current", "current", "due", "vacant"] },
  { room: "Room B", floor: "Ground floor", beds: ["current", "current", "current", "vacant"] },
  { room: "Room C", floor: "Ground floor", beds: ["current", "current", "vacant", "current"] },
];

const rentRows = [
  { initials: "MC", name: "Mariel Cruz", bed: "Room A · Bed 03", amount: "₱1,200", state: "Due today", tone: "due" },
  { initials: "JR", name: "Jon Reyes", bed: "Room B · Bed 02", amount: "₱1,200", state: "Paid Sep 2", tone: "paid" },
  { initials: "AL", name: "Ana Lim", bed: "Room C · Bed 04", amount: "₱600", state: "Partial", tone: "partial" },
];

const needRows = [
  { icon: Droplets, title: "Leaking faucet", place: "Room B · Shared washroom", state: "New", tone: "due" },
  { icon: Wrench, title: "Window latch", place: "Room A · Bed 01", state: "In progress", tone: "partial" },
  { icon: ClipboardCheck, title: "Hallway light", place: "Second floor", state: "Completed", tone: "paid" },
];

const ownerQuestions = [
  {
    number: "01",
    question: "Which beds can I fill today?",
    answer: "Open the property map and see vacancies, monthly rates, and current assignments together.",
    view: "beds" as BoardView,
    label: "Show the bed map",
  },
  {
    number: "02",
    question: "Who still has rent due?",
    answer: "Check the current month, record cash or digital payments, and keep the receipt with the boarder.",
    view: "rent" as BoardView,
    label: "Show the rent ledger",
  },
  {
    number: "03",
    question: "What needs attention at the property?",
    answer: "Log a need against the right room or bedspace, then follow it from new to completed.",
    view: "needs" as BoardView,
    label: "Show property needs",
  },
];

export function LandingPage({ authenticated }: { authenticated: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [boardView, setBoardView] = useState<BoardView>("beds");
  const appHref = authenticated ? "/app" : "/login";

  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  const showBoardView = (view: BoardView) => {
    setBoardView(view);
    document.querySelector("#live-board")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <main className="field-page">
      <header className="field-header">
        <a className="field-brand" href="/" aria-label="BahayRentahan home"><BrandMark /></a>
        <nav className={menuOpen ? "open" : ""} aria-label="Public navigation">
          <a href="#live-board" onClick={() => setMenuOpen(false)}>Working board</a>
          <a href="#rent-ledger" onClick={() => setMenuOpen(false)}>Rent ledger</a>
          <a href="#mobile-work" onClick={() => setMenuOpen(false)}>Mobile use</a>
          <a className="field-nav-signin" href={appHref}>{authenticated ? "Open workspace" : "Owner sign in"}</a>
        </nav>
        <div className="field-header-actions">
          <a href={appHref}>{authenticated ? "My account" : "Sign in"}</a>
          <a className="field-button field-button-lime" href={appHref}>{authenticated ? "Open BahayRentahan" : "Set up my property"}<ArrowRight /></a>
        </div>
        <button className="field-menu" type="button" onClick={() => setMenuOpen((value) => !value)} aria-expanded={menuOpen} aria-label={menuOpen ? "Close navigation" : "Open navigation"}>{menuOpen ? <X /> : <Menu />}</button>
      </header>

      <section className="field-command" aria-labelledby="field-title">
        <div className="field-command-copy">
          <span className="field-kicker"><CircleDot /> Bed-level operations for independent rentals</span>
          <h1 id="field-title">Run the boarding house from one clear board.</h1>
          <p>See every room and bedspace, keep boarders tied to the right place, record rent, and follow property needs—without rebuilding the story from notebooks and spreadsheets.</p>
          <div className="field-command-actions">
            <a className="field-button field-button-lime" href={appHref}>{authenticated ? "Go to my property" : "Set up my property"}<ArrowRight /></a>
            <a href="#live-board">Explore the working board</a>
          </div>
          <div className="field-command-note"><Building2 /><span><strong>Made for the property you actually run</strong><small>Boarding houses, dormitories, and bedspace rentals.</small></span></div>
        </div>

        <div className="field-board-shell" id="live-board">
          <div className="field-board-topline">
            <span><small>ILLUSTRATIVE WORKSPACE</small><strong>Maricel Bedspace</strong></span>
            <span className="field-live"><i /> Wednesday · Sep 3</span>
          </div>
          <div className="field-board-tabs" role="group" aria-label="Preview a BahayRentahan workflow">
            <button type="button" aria-pressed={boardView === "beds"} aria-controls="field-board-panel" onClick={() => setBoardView("beds")}><BedDouble /> Beds</button>
            <button type="button" aria-pressed={boardView === "rent"} aria-controls="field-board-panel" onClick={() => setBoardView("rent")}><Banknote /> Rent</button>
            <button type="button" aria-pressed={boardView === "needs"} aria-controls="field-board-panel" onClick={() => setBoardView("needs")}><Wrench /> Needs</button>
          </div>

          <div className="field-board-panel" id="field-board-panel" aria-live="polite">
            {boardView === "beds" && <>
              <div className="field-board-summary"><span><small>Total beds</small><strong>12</strong></span><span><small>Occupied</small><strong>9</strong></span><span><small>Vacant</small><strong>3</strong></span><span className="field-board-action"><UserRoundPlus /> Add boarder</span></div>
              <div className="field-bed-map">
                {bedRows.map((row) => <article key={row.room}><header><span><strong>{row.room}</strong><small>{row.floor}</small></span><b>{row.beds.filter((bed) => bed !== "vacant").length}/4 filled</b></header><div>{row.beds.map((status, index) => <div className={status} key={row.room + index} aria-label={`${row.room}, bed ${index + 1}: ${status === "current" ? "occupied" : status === "due" ? "rent due" : "vacant"}`}><BedDouble /><span>Bed {String(index + 1).padStart(2, "0")}</span><small>{status === "current" ? "Occupied" : status === "due" ? "Rent due" : "Vacant"}</small></div>)}</div></article>)}
              </div>
            </>}

            {boardView === "rent" && <>
              <div className="field-board-summary field-rent-summary"><span><small>Collected</small><strong>₱8,400</strong></span><span><small>Still due</small><strong>₱1,800</strong></span><span><small>Rent period</small><strong>September</strong></span><span className="field-board-action"><ReceiptText /> Record payment</span></div>
              <div className="field-list-preview">{rentRows.map((row) => <article key={row.name}><i>{row.initials}</i><span><strong>{row.name}</strong><small>{row.bed}</small></span><b>{row.amount}</b><em className={row.tone}>{row.state}</em></article>)}</div>
            </>}

            {boardView === "needs" && <>
              <div className="field-board-summary"><span><small>Open</small><strong>2</strong></span><span><small>In progress</small><strong>1</strong></span><span><small>Completed</small><strong>6</strong></span><span className="field-board-action"><Wrench /> Add need</span></div>
              <div className="field-list-preview">{needRows.map((row) => <article key={row.title}><i><row.icon /></i><span><strong>{row.title}</strong><small>{row.place}</small></span><em className={row.tone}>{row.state}</em></article>)}</div>
            </>}
          </div>
          <p className="field-preview-caption">A product preview—not customer activity or performance data.</p>
        </div>
      </section>

      <section className="field-questions" aria-labelledby="questions-title">
        <div className="field-section-heading">
          <span>THE OWNER’S DAILY QUESTIONS</span>
          <h2 id="questions-title">Start with the answer you need.</h2>
          <p>BahayRentahan is organized around the decisions an owner makes, not a list of software modules.</p>
        </div>
        <div className="field-question-list">
          {ownerQuestions.map((item) => <article key={item.number}><span>{item.number}</span><div><h3>{item.question}</h3><p>{item.answer}</p></div><button type="button" onClick={() => showBoardView(item.view)}>{item.label}<ArrowRight /></button></article>)}
        </div>
      </section>

      <section className="field-ledger-section" id="rent-ledger" aria-labelledby="ledger-title">
        <div className="field-ledger-copy">
          <span>RENT, WITH CONTEXT</span>
          <h2 id="ledger-title">A month that closes cleanly.</h2>
          <p>A payment should never be a loose number. BahayRentahan keeps the boarder, bedspace, rent period, method, balance, and receipt together.</p>
          <ul><li><Check />Cash, GCash, or bank-transfer records</li><li><Check />Full and partial payments</li><li><Check />Printable receipts and payment history</li></ul>
        </div>
        <div className="field-paper-ledger" aria-label="Illustrative September rent ledger">
          <header><span><small>RENT ROLL</small><strong>September 2026</strong></span><b>9 boarders</b></header>
          <div className="field-ledger-labels"><span>Boarder / bed</span><span>Rent</span><span>Status</span></div>
          {rentRows.map((row) => <div className="field-ledger-line" key={row.name}><span><strong>{row.name}</strong><small>{row.bed}</small></span><b>{row.amount}</b><em className={row.tone}>{row.state}</em></div>)}
          <footer><span><small>Recorded this month</small><strong>₱8,400</strong></span><span><small>Outstanding</small><strong>₱1,800</strong></span></footer>
        </div>
      </section>

      <section className="field-mobile-section" id="mobile-work" aria-labelledby="mobile-title">
        <div className="field-pocket" aria-label="Illustrative mobile daily view">
          <header><BrandMark /><span><small>MARICEL BEDSPACE</small><strong>Today</strong></span><i>MC</i></header>
          <div className="field-pocket-status"><span><small>9 / 12</small><strong>Beds filled</strong></span><span><small>₱1,800</small><strong>Still due</strong></span></div>
          <section><h3>Needs attention</h3><article><Banknote /><span><strong>Rent due today</strong><small>Mariel Cruz · Bed A03</small></span><b>₱1,200</b></article><article><Droplets /><span><strong>Leaking faucet</strong><small>Room B · Shared washroom</small></span><b>New</b></article><span className="field-pocket-action">Open today’s work <ArrowRight /></span></section>
          <nav aria-label="Illustrative mobile navigation"><BedDouble /><Banknote /><Wrench /></nav>
        </div>
        <div className="field-mobile-copy"><Smartphone /><span>MOBILE IS THE MAIN VIEW, NOT A SHRUNK DESKTOP</span><h2 id="mobile-title">Check the property wherever the day takes you.</h2><p>The mobile layout prioritizes today’s vacancies, rent, and needs; controls stay reachable and the page keeps its natural scroll.</p><div><span><Check />Large, separated tap targets</span><span><Check />No sideways page scrolling</span><span><Check />Readable at browser zoom</span></div></div>
      </section>

      <section className="field-fit" aria-labelledby="fit-title">
        <div><span>A CLEAR SCOPE BUILDS TRUST</span><h2 id="fit-title">Know exactly what BahayRentahan is for.</h2></div>
        <dl>
          <div><dt><Check />A bedspace operations record</dt><dd>Rooms, individual beds, boarders, rent entries, receipts, transfers, move-outs, and property needs.</dd></div>
          <div><dt><ShieldCheck />Private owner workspace</dt><dd>Secure sign-in and row-level database policies separate one owner’s property records from another.</dd></div>
          <div><dt><X />Not a payment processor</dt><dd>BahayRentahan records the payments you receive. It does not move money or promise automatic GCash collection.</dd></div>
        </dl>
      </section>

      <section className="field-closing">
        <span>EVERY BED · EVERY BOARDER · EVERY PAYMENT</span>
        <h2>Give the property one dependable record.</h2>
        <a className="field-button field-button-dark" href={appHref}>{authenticated ? "Return to BahayRentahan" : "Set up my property"}<ArrowRight /></a>
      </section>

      <footer className="field-footer"><a href="/" aria-label="BahayRentahan home"><BrandMark /></a><p>Bed-level operations for independent boarding-house and bedspace owners.</p><a href={appHref}>{authenticated ? "Open workspace" : "Owner sign in"}</a></footer>
    </main>
  );
}
