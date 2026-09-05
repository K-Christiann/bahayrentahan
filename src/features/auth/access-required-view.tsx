import { Ban, CalendarClock, CircleAlert, Clock3, LogOut, RefreshCw, ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/bedkeep/brand-mark";
import { Button } from "@/components/ui/button";
import { useAuth } from "./auth-provider";

const copy = {
  pending: {
    icon: Clock3,
    eyebrow: "AWAITING ACTIVATION",
    title: "Your account is ready for review.",
    description: "Send your payment confirmation to the BahayRentahan administrator. Once approved, the complete owner workspace will open automatically.",
  },
  expired: {
    icon: CalendarClock,
    eyebrow: "ACCESS EXPIRED",
    title: "Renew to reopen your workspace.",
    description: "Your property records remain protected. Contact the BahayRentahan administrator to renew access, then refresh this page.",
  },
  suspended: {
    icon: Ban,
    eyebrow: "ACCESS PAUSED",
    title: "This account needs administrator review.",
    description: "Your data has not been deleted. Contact the BahayRentahan administrator for help restoring access.",
  },
};

export function AccessRequiredView() {
  const { access, accessError, user, refreshAccess, signOut } = useAuth();
  const state = copy[access?.status === "expired" || access?.status === "suspended" ? access.status : "pending"];
  const Icon = accessError ? CircleAlert : state.icon;
  const expiry = access?.expiresAt ? new Intl.DateTimeFormat("en-PH", { dateStyle: "long", timeZone: "Asia/Manila" }).format(new Date(access.expiresAt)) : "";

  return (
    <main className="access-page">
      <header className="access-header"><a href="/" aria-label="BahayRentahan home"><BrandMark /></a><button onClick={() => void signOut()}><LogOut /> Sign out</button></header>
      <section className="access-card">
        <span className="access-icon"><Icon /></span>
        <span className="eyebrow">{accessError ? "SETUP REQUIRED" : state.eyebrow}</span>
        <h1>{accessError ? "Account verification is unavailable." : state.title}</h1>
        <p>{accessError || state.description}</p>
        <div className="access-summary">
          <span><small>Signed-in account</small><strong>{user?.email || "Owner account"}</strong></span>
          <span><small>Access plan</small><strong>{access?.plan || "Full access"}</strong></span>
          {expiry && <span><small>Previous expiry</small><strong>{expiry}</strong></span>}
        </div>
        <div className="access-next"><ShieldCheck /><span><strong>Your records stay protected</strong><small>Activation changes access only. It does not remove your property, boarder, or payment records.</small></span></div>
        <Button className="lime-button" onClick={() => void refreshAccess()}><RefreshCw /> Check activation again</Button>
      </section>
    </main>
  );
}
