import { useEffect, useState } from "react";
import { BellRing, Building2, Check, CreditCard, RotateCcw, Save, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ErrorBanner, FieldError } from "@/components/ui/error-banner";
import { useSpaces } from "@/features/spaces/application/spaces-provider";
import { normalizePhone, normalizeText, phoneError } from "@/lib/validation";
import { useUnsavedChanges } from "@/lib/use-unsaved-changes";

const initialNotifications = {
  overdue: true,
  moveOut: true,
  maintenance: true,
  weeklyReport: false,
};

export function SettingsView() {
  const { property, updateProperty, mutating, error, loading, refresh } = useSpaces();
  const [notifications, setNotifications] = useState(initialNotifications);
  const [details, setDetails] = useState({ name: "", contactPhone: "", address: "", city: "", rentDueDay: 5, timezone: "Asia/Manila", preferredPaymentMethod: "GCash" as "GCash" | "Cash" | "Bank transfer", gcashNumber: "", receiptFooter: "" });
  const [saved, setSaved] = useState(false);
  const [baseline, setBaseline] = useState("");

  useEffect(() => {
    if (!property) return;
    const next = { name: property.name, contactPhone: property.contactPhone, address: property.address, city: property.city, rentDueDay: property.rentDueDay, timezone: property.timezone, preferredPaymentMethod: property.preferredPaymentMethod, gcashNumber: property.gcashNumber, receiptFooter: property.receiptFooter };
    setDetails(next);
    setNotifications(property.notifications);
    setBaseline(JSON.stringify({ details: next, notifications: property.notifications }));
  }, [property]);

  const currentSignature = JSON.stringify({ details, notifications });
  const dirty = Boolean(baseline) && currentSignature !== baseline;
  useUnsavedChanges(dirty);
  const contactError = phoneError(details.contactPhone);
  const gcashError = details.preferredPaymentMethod === "GCash" ? phoneError(details.gcashNumber) : "";
  const invalid = !normalizeText(details.name) || details.rentDueDay < 1 || details.rentDueDay > 31 || Boolean(contactError || gcashError);

  function toggle(key: keyof typeof notifications, checked: boolean) {
    setNotifications((current) => ({ ...current, [key]: checked }));
    setSaved(false);
  }

  async function saveSettings() {
    if (invalid) return;
    try {
      const next = { ...details, name: normalizeText(details.name), city: normalizeText(details.city), address: normalizeText(details.address), contactPhone: details.contactPhone.trim(), gcashNumber: details.gcashNumber.trim(), receiptFooter: details.receiptFooter.trim() };
      await updateProperty({ ...next, notifications });
      setDetails(next);
      setBaseline(JSON.stringify({ details: next, notifications }));
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2800);
    } catch {
      // The provider exposes the error in this view.
    }
  }

  function resetChanges() {
    if (!property) return;
    const next = { name: property.name, contactPhone: property.contactPhone, address: property.address, city: property.city, rentDueDay: property.rentDueDay, timezone: property.timezone, preferredPaymentMethod: property.preferredPaymentMethod, gcashNumber: property.gcashNumber, receiptFooter: property.receiptFooter };
    setDetails(next); setNotifications(property.notifications); setSaved(false);
  }

  return (
    <div className="view-stack animate-in-view">
      <div className="section-intro">
        <div><span className="eyebrow">WORKSPACE CONFIGURATION</span><h2>Settings that match your operation.</h2><p>Set property defaults, rent rules, payment instructions, and the alerts you want to receive.</p></div>
        <div className="header-actions">{dirty && <Button variant="outline" onClick={resetChanges}><RotateCcw /> Reset</Button>}<Button className="lime-button" disabled={mutating || !property || invalid || !dirty} onClick={saveSettings}>{saved ? <><Check /> Saved</> : mutating ? "Saving…" : <><Save /> Save settings</>}</Button></div>
      </div>

      {saved && <div className="success-banner" role="status"><Check /> Settings saved for {property?.name}.</div>}
      {error && <ErrorBanner message={error} onRetry={refresh} retrying={loading} />}

      <div className="settings-layout">
        <section className="settings-card">
          <div className="settings-card-title"><span><Building2 /></span><div><h3>Property details</h3><p>Information used across receipts and reports.</p></div></div>
          <div className="form-grid">
            <label className="form-field"><span>Property name</span><Input autoComplete="organization" maxLength={100} aria-invalid={!normalizeText(details.name)} value={details.name} onChange={(event) => { setSaved(false); setDetails((current) => ({ ...current, name: event.target.value })); }} /><FieldError>{!normalizeText(details.name) ? "Property name is required." : ""}</FieldError></label>
            <label className="form-field"><span>Contact number <small>Optional</small></span><Input type="tel" inputMode="tel" autoComplete="tel" aria-invalid={Boolean(contactError)} value={details.contactPhone} onChange={(event) => { setSaved(false); setDetails((current) => ({ ...current, contactPhone: normalizePhone(event.target.value) })); }} /><FieldError>{contactError}</FieldError></label>
            <label className="form-field"><span>City or municipality</span><Input value={details.city} maxLength={100} onChange={(event) => { setSaved(false); setDetails((current) => ({ ...current, city: event.target.value })); }} /></label>
            <label className="form-field"><span>Property address</span><Input value={details.address} maxLength={180} onChange={(event) => { setSaved(false); setDetails((current) => ({ ...current, address: event.target.value })); }} /></label>
            <label className="form-field"><span>Currency</span><select className="form-select" defaultValue="PHP"><option value="PHP">PHP — Philippine Peso</option></select></label>
            <label className="form-field"><span>Default rent due day</span><Input type="number" min="1" max="31" value={details.rentDueDay} onChange={(event) => setDetails((current) => ({ ...current, rentDueDay: Number(event.target.value) }))} /><small className="field-hint">New leases inherit this day. Shorter months use their last calendar day.</small></label>
            <label className="form-field"><span>Property timezone</span><select className="form-select" value={details.timezone} onChange={(event) => { setSaved(false); setDetails((current) => ({ ...current, timezone: event.target.value })); }}><option value="Asia/Manila">Asia/Manila — Philippine Time</option><option value="Asia/Singapore">Asia/Singapore</option><option value="Asia/Tokyo">Asia/Tokyo</option><option value="UTC">UTC</option></select></label>
          </div>
        </section>

        <section className="settings-card">
          <div className="settings-card-title"><span><BellRing /></span><div><h3>Owner notifications</h3><p>Choose which operational events need your attention.</p></div></div>
          <div className="toggle-list">
            <ToggleRow label="Overdue rent" description="Alert me when rent passes its due date." checked={notifications.overdue} onChange={(value) => toggle("overdue", value)} />
            <ToggleRow label="Vacant bedspaces" description="Show vacancies that are ready for assignment." checked={notifications.moveOut} onChange={(value) => toggle("moveOut", value)} />
            <ToggleRow label="New maintenance requests" description="Notify me when a new urgent need is logged." checked={notifications.maintenance} onChange={(value) => toggle("maintenance", value)} />
            <ToggleRow label="Weekly in-app summary" description="Show a Monday reminder to review occupancy and collections." checked={notifications.weeklyReport} onChange={(value) => toggle("weeklyReport", value)} />
          </div>
        </section>

        <section className="settings-card">
          <div className="settings-card-title"><span><CreditCard /></span><div><h3>Payment defaults</h3><p>Shown when recording rent and issuing receipts.</p></div></div>
          <div className="form-grid">
            <label className="form-field"><span>Preferred payment method</span><select className="form-select" value={details.preferredPaymentMethod} onChange={(event) => setDetails((current) => ({ ...current, preferredPaymentMethod: event.target.value as typeof current.preferredPaymentMethod }))}><option>GCash</option><option>Cash</option><option>Bank transfer</option></select></label>
            <label className="form-field"><span>GCash number <small>Optional</small></span><Input type="tel" inputMode="tel" autoComplete="tel" aria-invalid={Boolean(gcashError)} value={details.gcashNumber} onChange={(event) => { setSaved(false); setDetails((current) => ({ ...current, gcashNumber: normalizePhone(event.target.value) })); }} /><FieldError>{gcashError}</FieldError></label>
            <label className="form-field form-field-wide"><span>Receipt footer</span><Input value={details.receiptFooter} onChange={(event) => setDetails((current) => ({ ...current, receiptFooter: event.target.value }))} /></label>
          </div>
        </section>

        <section className="settings-card compact-settings-card">
          <div className="settings-card-title"><span><ShieldCheck /></span><div><h3>Data & security</h3><p>Owner-only access is active for this workspace.</p></div></div>
          <div className="security-summary"><span><ShieldCheck /><strong>Protected workspace</strong><small>Each owner's property records are isolated and protected.</small></span></div>
        </section>
      </div>
    </div>
  );
}

function ToggleRow({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <div className="toggle-row"><div><strong>{label}</strong><span>{description}</span></div><Switch checked={checked} onCheckedChange={onChange} aria-label={label} /></div>;
}
