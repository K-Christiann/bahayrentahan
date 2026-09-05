import { useEffect, useMemo, useRef, useState } from "react";
import { BedDouble, CircleAlert, ReceiptText, Search, Users } from "lucide-react";
import { useSpaces } from "@/features/spaces/application/spaces-provider";
import { usePayments } from "@/features/payments/application/payments-provider";
import { useNeeds } from "@/features/needs/application/needs-provider";
import type { ViewKey } from "@/lib/bedkeep/types";

export function GlobalSearch({ onNavigate }: { onNavigate: (view: ViewKey) => void }) {
  const { beds, boarders } = useSpaces(); const { payments } = usePayments(); const { needs } = useNeeds(); const [query, setQuery] = useState(""); const [open, setOpen] = useState(false); const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { const handler = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); inputRef.current?.focus(); setOpen(true); } if (event.key === "Escape") { setOpen(false); setQuery(""); inputRef.current?.blur(); } }; window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler); }, []);
  const results = useMemo(() => { const q = query.trim().toLowerCase(); if (!q) return []; return [
    ...boarders.filter((item) => `${item.name} ${item.phone} ${item.bed}`.toLowerCase().includes(q)).map((item) => ({ id: `b-${item.id}`, view: "tenants" as ViewKey, icon: Users, label: item.name, meta: item.bed })),
    ...beds.filter((item) => `${item.room} ${item.label} ${item.tenant || ""}`.toLowerCase().includes(q)).map((item) => ({ id: `s-${item.id}`, view: "spaces" as ViewKey, icon: BedDouble, label: `${item.room} · ${item.label}`, meta: item.tenant || "Vacant" })),
    ...payments.filter((item) => `${item.tenant} ${item.period} ${item.allocationLabel || ""} ${item.referenceNumber || ""}`.toLowerCase().includes(q)).map((item) => ({ id: `p-${item.id}`, view: "payments" as ViewKey, icon: ReceiptText, label: item.tenant, meta: `${item.allocationLabel || item.period} · ₱${item.amount.toLocaleString()}` })),
    ...needs.filter((item) => `${item.title} ${item.location} ${item.tenant}`.toLowerCase().includes(q)).map((item) => ({ id: `n-${item.id}`, view: "needs" as ViewKey, icon: CircleAlert, label: item.title, meta: item.location })),
  ].slice(0, 8); }, [beds, boarders, needs, payments, query]);
  function choose(view: ViewKey) { onNavigate(view); setOpen(false); setQuery(""); }
  return <div className="global-search-wrap"><label className="global-search"><Search /><input ref={inputRef} value={query} onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 140)} onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); document.querySelector<HTMLElement>(".search-results button")?.focus(); } }} onChange={(event) => setQuery(event.target.value)} placeholder="Search anything" role="combobox" aria-expanded={open && Boolean(query)} aria-controls="bedkeep-search-results" aria-label="Search BahayRentahan" /><kbd>⌘ K</kbd></label>{open && query && <div className="search-results" id="bedkeep-search-results" role="listbox">{results.map(({ id, view, icon: Icon, label, meta }) => <button role="option" aria-selected="false" key={id} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(view)}><Icon /><span><strong>{label}</strong><small>{meta}</small></span></button>)}{!results.length && <div className="search-empty">No matching beds, boarders, payments, or requests.</div>}</div>}</div>;
}
