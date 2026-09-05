import { useMemo, useState } from "react";
import { Bell, BedDouble, CircleAlert, LayoutDashboard, ReceiptText } from "lucide-react";
import { useSpaces } from "@/features/spaces/application/spaces-provider";
import { usePayments } from "@/features/payments/application/payments-provider";
import { useNeeds } from "@/features/needs/application/needs-provider";
import type { ViewKey } from "@/lib/bedkeep/types";

export function NotificationCenter({ onNavigate }: { onNavigate: (view: ViewKey) => void }) {
  const { beds, property } = useSpaces(); const { payments } = usePayments(); const { needs } = useNeeds(); const [open, setOpen] = useState(false);
  const items = useMemo(() => { const preferences = property?.notifications || { overdue: true, moveOut: true, maintenance: true, weeklyReport: false }; const pending = payments.filter((item) => item.status === "pending"); const urgent = needs.filter((item) => item.priority === "urgent" && item.status !== "resolved"); const vacant = beds.filter((item) => item.status === "vacant"); const overdue = beds.filter((item) => item.status === "due"); const monday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: property?.timezone || "Asia/Manila" }).format(new Date()) === "Mon"; return [
    ...(preferences.maintenance && urgent.length ? [{ id: "urgent", view: "needs" as ViewKey, icon: CircleAlert, title: `${urgent.length} urgent request${urgent.length === 1 ? "" : "s"}`, note: "Maintenance needs attention" }] : []),
    ...(preferences.overdue && overdue.length ? [{ id: "overdue", view: "payments" as ViewKey, icon: CircleAlert, title: `${overdue.length} overdue bedspace${overdue.length === 1 ? "" : "s"}`, note: "Rent remains unpaid after the due date" }] : []),
    ...(pending.length ? [{ id: "pending", view: "payments" as ViewKey, icon: ReceiptText, title: `${pending.length} pending payment${pending.length === 1 ? "" : "s"}`, note: "Confirm received payments" }] : []),
    ...(preferences.moveOut && vacant.length ? [{ id: "vacant", view: "spaces" as ViewKey, icon: BedDouble, title: `${vacant.length} vacant bedspace${vacant.length === 1 ? "" : "s"}`, note: "Available for assignment" }] : []),
    ...(preferences.weeklyReport && monday ? [{ id: "weekly", view: "dashboard" as ViewKey, icon: LayoutDashboard, title: "Weekly summary is ready", note: "Review occupancy and rent collection" }] : []),
  ]; }, [beds, needs, payments, property]);
  return <div className="notification-wrap"><button className="icon-button" aria-label={`${items.length} notifications`} aria-expanded={open} onClick={() => setOpen((value) => !value)}><Bell />{items.length > 0 && <i />}</button>{open && <div className="notification-panel"><div><strong>Notifications</strong><span>{items.length} active</span></div>{items.map(({ id, view, icon: Icon, title, note }) => <button key={id} onClick={() => { onNavigate(view); setOpen(false); }}><span><Icon /></span><span><strong>{title}</strong><small>{note}</small></span></button>)}{!items.length && <div className="notification-empty"><Bell />You're all caught up.</div>}</div>}</div>;
}
