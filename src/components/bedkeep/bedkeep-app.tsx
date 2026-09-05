import { lazy, Suspense, useEffect, useState } from "react";
import { BedDouble, ChevronDown, CircleHelp, FileBarChart, LayoutDashboard, LoaderCircle, Menu, MoreHorizontal, ReceiptText, Settings, ShieldCheck, UserRound, Users, Wrench, X } from "lucide-react";
import { BrandMark } from "./brand-mark";
import { AuthView } from "@/features/auth/auth-view";
import { PasswordRecoveryView } from "@/features/auth/password-recovery-view";
import { ConfigurationRequiredView } from "@/features/auth/configuration-required-view";
import { useAuth } from "@/features/auth/auth-provider";
import { SpacesProvider, useSpaces } from "@/features/spaces/application/spaces-provider";
import { PaymentsProvider } from "@/features/payments/application/payments-provider";
import { NeedsProvider, useNeeds } from "@/features/needs/application/needs-provider";
import { PropertySwitcher } from "./property-switcher";
import { GlobalSearch } from "./global-search";
import { NotificationCenter } from "./notification-center";
import { OnlineStatus } from "./online-status";
import { LandingPage } from "@/features/landing/landing-page";
import { AccessRequiredView } from "@/features/auth/access-required-view";
import type { ViewKey } from "@/lib/bedkeep/types";

const DashboardView = lazy(() => import("@/features/dashboard/dashboard-view").then((module) => ({ default: module.DashboardView })));
const SpacesView = lazy(() => import("@/features/spaces/spaces-view").then((module) => ({ default: module.SpacesView })));
const TenantsView = lazy(() => import("@/features/tenants/tenants-view").then((module) => ({ default: module.TenantsView })));
const PaymentsView = lazy(() => import("@/features/payments/payments-view").then((module) => ({ default: module.PaymentsView })));
const ReportsView = lazy(() => import("@/features/reports/reports-view").then((module) => ({ default: module.ReportsView })));
const NeedsView = lazy(() => import("@/features/needs/needs-view").then((module) => ({ default: module.NeedsView })));
const SettingsView = lazy(() => import("@/features/settings/settings-view").then((module) => ({ default: module.SettingsView })));
const HelpCenterView = lazy(() => import("@/features/help/help-center-view").then((module) => ({ default: module.HelpCenterView })));
const ProfileView = lazy(() => import("@/features/profile/profile-view").then((module) => ({ default: module.ProfileView })));
const AdminView = lazy(() => import("@/features/admin/admin-view").then((module) => ({ default: module.AdminView })));

const nav = [
  { id: "dashboard" as const, label: "Overview", icon: LayoutDashboard },
  { id: "spaces" as const, label: "Bedspaces", icon: BedDouble },
  { id: "tenants" as const, label: "Boarders", icon: Users },
  { id: "payments" as const, label: "Payments", icon: ReceiptText },
  { id: "reports" as const, label: "Reports", icon: FileBarChart },
  { id: "needs" as const, label: "Needs", icon: Wrench, count: 3 },
];

const mobileMoreItems = [
  { id: "needs" as const, label: "Needs & requests", icon: Wrench },
  { id: "reports" as const, label: "Reports & backup", icon: FileBarChart },
  { id: "settings" as const, label: "Settings", icon: Settings },
  { id: "help" as const, label: "Help center", icon: CircleHelp },
  { id: "profile" as const, label: "Owner profile", icon: UserRound },
];

const titles: Record<ViewKey, { eyebrow: string; title: string }> = {
  dashboard: { eyebrow: "TODAY", title: "Welcome back, Owner." },
  spaces: { eyebrow: "BAHAYRENTAHAN", title: "Bedspaces" },
  tenants: { eyebrow: "BAHAYRENTAHAN", title: "Boarders" },
  payments: { eyebrow: "BAHAYRENTAHAN", title: "Payments" },
  reports: { eyebrow: "BAHAYRENTAHAN", title: "Reports & backup" },
  needs: { eyebrow: "BAHAYRENTAHAN", title: "Needs & requests" },
  admin: { eyebrow: "PLATFORM CONTROL", title: "Administration" },
  settings: { eyebrow: "OWNER WORKSPACE", title: "Settings" },
  help: { eyebrow: "SUPPORT & GUIDES", title: "Help center" },
  profile: { eyebrow: "OWNER ACCOUNT", title: "Profile" },
};

export function BedKeepApp() {
  const { access, configured, loading, recoveryMode, session, isAdmin } = useAuth();
  const path = window.location.pathname.replace(/\/+$/, "") || "/";

  if (path === "/") return <LandingPage authenticated={Boolean(session)} />;
  if (loading) return <main className="app-loader"><BrandMark /><LoaderCircle /><span>Opening your workspace…</span></main>;
  if (!configured) return <ConfigurationRequiredView />;
  if (recoveryMode) return <PasswordRecoveryView />;
  if (path === "/login") return session ? <RouteRedirect to="/app" /> : <AuthView />;
  if (path !== "/app") return <RouteRedirect to="/" />;
  if (!session) return <RouteRedirect to="/login" />;
  if (!isAdmin && access?.status !== "active") return <AccessRequiredView />;

  return <SpacesProvider><PaymentsProvider><NeedsProvider><BedKeepWorkspace /></NeedsProvider></PaymentsProvider></SpacesProvider>;
}

function RouteRedirect({ to }: { to: string }) {
  useEffect(() => { window.location.replace(to); }, [to]);
  return <main className="app-loader"><BrandMark /><LoaderCircle /><span>Taking you to BahayRentahan…</span></main>;
}

function BedKeepWorkspace() {
  const { displayName, isAdmin } = useAuth();
  const { property } = useSpaces();
  const { needs } = useNeeds();
  const validViews = (Object.keys(titles) as ViewKey[]).filter((item) => item !== "admin" || isAdmin);
  const moreItems = isAdmin ? [...mobileMoreItems, { id: "admin" as const, label: "Administration", icon: ShieldCheck }] : mobileMoreItems;
  const hashView = window.location.hash.replace("#/", "") as ViewKey;
  const [view, setView] = useState<ViewKey>(validViews.includes(hashView) ? hashView : "dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [paymentBoarderId, setPaymentBoarderId] = useState<string | null>(null);
  const [paymentPeriod, setPaymentPeriod] = useState<string | null>(null);
  const firstName = displayName.split(/\s+/)[0] || "Owner";
  const propertyTimeZone = property?.timezone || "Asia/Manila";
  const hour = Number(new Intl.DateTimeFormat("en-PH", { hour: "2-digit", hourCycle: "h23", timeZone: propertyTimeZone }).formatToParts(new Date()).find((part) => part.type === "hour")?.value || new Date().getHours());
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const current = view === "dashboard"
    ? { eyebrow: new Intl.DateTimeFormat("en-PH", { weekday: "long", day: "numeric", month: "long", timeZone: propertyTimeZone }).format(new Date()).toUpperCase(), title: `${greeting}, ${firstName}.` }
    : { ...titles[view], eyebrow: ["settings", "profile", "admin"].includes(view) ? titles[view].eyebrow : (property?.name || "BahayRentahan").toUpperCase() };
  const ownerInitials = displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "YO";

  useEffect(() => {
    const sync = () => { const next = window.location.hash.replace("#/", "") as ViewKey; setView(validViews.includes(next) ? next : "dashboard"); };
    window.addEventListener("hashchange", sync); return () => window.removeEventListener("hashchange", sync);
  }, [isAdmin]);

  useEffect(() => {
    if (!moreOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setMoreOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [moreOpen]);

  function navigate(next: ViewKey) {
    if (!window.dispatchEvent(new Event("bahayrentahan:navigate", { cancelable: true }))) return;
    setView(next);
    window.location.hash = `#/${next}`;
    setMenuOpen(false);
    setMoreOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="app-shell">
      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <div className="sidebar-top"><BrandMark /><button className="mobile-close" onClick={() => setMenuOpen(false)} aria-label="Close navigation"><X /></button></div>
        <PropertySwitcher />
        <nav className="main-nav" aria-label="Primary navigation">
          <span className="nav-label">WORKSPACE</span>
          {nav.map(({ id, label, icon: Icon, count }) => { const badge = id === "needs" ? needs.filter((item) => item.status !== "resolved").length : count; return <button key={id} className={view === id ? "active" : ""} onClick={() => navigate(id)}><Icon /><span>{label}</span>{Boolean(badge) && <b>{badge}</b>}</button>; })}
        </nav>
        <nav className="secondary-nav" aria-label="Secondary navigation">{isAdmin && <button className={view === "admin" ? "active" : ""} onClick={() => navigate("admin")}><ShieldCheck /><span>Administration</span></button>}<button className={view === "settings" ? "active" : ""} onClick={() => navigate("settings")}><Settings /><span>Settings</span></button><button className={view === "help" ? "active" : ""} onClick={() => navigate("help")}><CircleHelp /><span>Help center</span></button></nav>
        <button className={`owner-card ${view === "profile" ? "active" : ""}`} onClick={() => navigate("profile")}><span className="avatar-owner">{ownerInitials}</span><span><strong>{displayName}</strong><small>Owner profile</small></span><ChevronDown /></button>
      </aside>
      {menuOpen && <button className="mobile-scrim" aria-label="Close menu" onClick={() => setMenuOpen(false)} />}

      <section className="app-content">
        <OnlineStatus />
        <header className="topbar">
          <button className="mobile-menu" onClick={() => { setMoreOpen(false); setMenuOpen(true); }} aria-label="Open navigation"><Menu /></button>
          <div className="page-title"><span>{current.eyebrow}</span><h1>{current.title}</h1></div>
          <div className="topbar-actions"><GlobalSearch onNavigate={navigate} /><NotificationCenter onNavigate={navigate} /><button className="mobile-avatar" onClick={() => navigate("profile")} aria-label="Open owner profile">{ownerInitials}</button></div>
        </header>
        <div className="content-canvas">
          <Suspense fallback={<div className="workspace-loading" role="status"><LoaderCircle /><span>Opening section…</span></div>}>
            {view === "dashboard" && <DashboardView onNavigate={navigate} onOpenPayments={(period) => { setPaymentPeriod(period || null); navigate("payments"); }} />}
            {view === "spaces" && <SpacesView />}
            {view === "tenants" && <TenantsView onRecordPayment={(boarderId) => { setPaymentBoarderId(boarderId); navigate("payments"); }} onAssignBoarder={() => navigate("spaces")} />}
            {view === "payments" && <PaymentsView initialBoarderId={paymentBoarderId} onInitialBoarderHandled={() => setPaymentBoarderId(null)} initialPeriod={paymentPeriod} onInitialPeriodHandled={() => setPaymentPeriod(null)} onAssignBoarder={() => navigate("spaces")} />}
            {view === "reports" && <ReportsView />}
            {view === "needs" && <NeedsView />}
            {view === "admin" && isAdmin && <AdminView />}
            {view === "settings" && <SettingsView />}
            {view === "help" && <HelpCenterView />}
            {view === "profile" && <ProfileView />}
          </Suspense>
        </div>
      </section>

      {moreOpen && <button className="mobile-more-scrim" aria-label="Close more navigation" onClick={() => setMoreOpen(false)} />}
      {moreOpen && <div className="mobile-more-sheet" role="menu" aria-label="More destinations"><div><strong>More</strong><button onClick={() => setMoreOpen(false)} aria-label="Close more menu"><X /></button></div>{moreItems.map(({ id, label, icon: Icon }) => <button role="menuitem" key={id} className={view === id ? "active" : ""} onClick={() => navigate(id)}><span><Icon /></span><strong>{label}</strong>{id === "needs" && needs.some((item) => item.status !== "resolved") && <b>{needs.filter((item) => item.status !== "resolved").length}</b>}</button>)}</div>}
      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        {nav.slice(0, 4).map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? "active" : ""} onClick={() => navigate(id)}><Icon /><span>{label === "Boarders" ? "People" : label}</span></button>)}
        <button className={moreItems.some((item) => item.id === view) || moreOpen ? "active" : ""} aria-expanded={moreOpen} onClick={() => setMoreOpen((value) => !value)}><MoreHorizontal /><span>More</span>{needs.some((item) => item.status !== "resolved") && <b>{needs.filter((item) => item.status !== "resolved").length}</b>}</button>
      </nav>
    </main>
  );
}
