import { useEffect, useState } from "react";
import { AtSign, Check, KeyRound, LogOut, MapPin, Phone, RotateCcw, Save, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FieldError } from "@/components/ui/error-banner";
import { useAuth } from "@/features/auth/auth-provider";
import { useSpaces } from "@/features/spaces/application/spaces-provider";
import { normalizePhone, normalizeText, phoneError } from "@/lib/validation";
import { useUnsavedChanges } from "@/lib/use-unsaved-changes";
import { userError } from "@/lib/user-error";

export function ProfileView() {
  const { user, displayName, configured, access, isAdmin, updateProfile, updatePassword, signOut } = useAuth();
  const { property } = useSpaces();
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [form, setForm] = useState({ fullName: "Owner", phone: "", location: "" });
  const [baseline, setBaseline] = useState("");

  useEffect(() => {
    const next = {
      fullName: String(user?.user_metadata.full_name || displayName),
      phone: String(user?.user_metadata.phone || ""),
      location: String(user?.user_metadata.location || property?.city || ""),
    };
    setForm(next); setBaseline(JSON.stringify(next));
  }, [displayName, property?.city, user]);

  const dirty = Boolean(baseline) && JSON.stringify(form) !== baseline;
  const guardClose = useUnsavedChanges(dirty);
  const nameError = !normalizeText(form.fullName) ? "Full name is required." : "";
  const contactError = phoneError(form.phone);

  async function saveProfile() {
    setBusy(true); setError("");
    try {
      const next = { fullName: normalizeText(form.fullName), phone: form.phone.trim(), location: normalizeText(form.location) };
      await updateProfile(next); setForm(next); setBaseline(JSON.stringify(next));
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2800);
    } catch (caught) {
      setError(userError(caught, "Profile changes could not be saved."));
    } finally { setBusy(false); }
  }

  async function changePassword() {
    setBusy(true); setError("");
    try {
      await updatePassword(newPassword);
      setNewPassword(""); setPasswordOpen(false); setSaved(true);
      window.setTimeout(() => setSaved(false), 2800);
    } catch (caught) {
      setError(userError(caught, "Password could not be updated."));
    } finally { setBusy(false); }
  }

  const initials = form.fullName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "YO";
  function resetChanges() { if (!baseline) return; setForm(JSON.parse(baseline) as typeof form); setSaved(false); }

  return (
    <div className="view-stack animate-in-view">
      <div className="section-intro"><div><span className="eyebrow">OWNER ACCOUNT</span><h2>Your profile and security.</h2><p>Keep your contact details current and review how your owner account is protected.</p></div><div className="header-actions"><Button variant="outline" disabled={!configured} onClick={() => guardClose(() => void signOut())}><LogOut /> Sign out</Button>{dirty && <Button variant="outline" onClick={resetChanges}><RotateCcw /> Reset</Button>}<Button className="lime-button" disabled={busy || !dirty || Boolean(nameError || contactError)} onClick={saveProfile}>{saved ? <><Check /> Profile saved</> : busy ? "Saving…" : <><Save /> Save changes</>}</Button></div></div>
      {saved && <div className="success-banner" role="status"><Check /> Your owner profile has been updated.</div>}
      {error && <div className="error-banner" role="alert">{error}</div>}

      <section className="profile-layout">
        <aside className="profile-identity-card">
          <span className="profile-avatar">{initials}</span><h3>{form.fullName}</h3><p>Owner · {property?.name || "BahayRentahan"}</p><span className="owner-badge"><ShieldCheck /> Owner access</span>
          <div className="profile-meta"><span><AtSign />{user?.email || "Email unavailable"}</span><span><Phone />{form.phone || "No phone added"}</span><span><MapPin />{form.location || property?.city || "No location added"}</span></div>
        </aside>

        <div className="profile-main">
          <section className="settings-card">
            <div className="settings-card-title"><span><UserRound /></span><div><h3>Personal information</h3><p>Used for account notices and owner identification.</p></div></div>
            <div className="form-grid">
              <label className="form-field form-field-wide"><span>Full name</span><Input autoComplete="name" maxLength={100} aria-invalid={Boolean(nameError)} value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} /><FieldError>{nameError}</FieldError></label>
              <label className="form-field"><span>Email address</span><Input type="email" autoComplete="email" readOnly value={user?.email || "Email unavailable"} /></label>
              <label className="form-field"><span>Phone number <small>Optional</small></span><Input type="tel" inputMode="tel" autoComplete="tel" aria-invalid={Boolean(contactError)} value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: normalizePhone(event.target.value) }))} /><FieldError>{contactError}</FieldError></label>
              <label className="form-field form-field-wide"><span>Home location</span><Input autoComplete="address-level2" value={form.location} onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} /></label>
            </div>
          </section>

          <section className="settings-card security-card">
            <div className="settings-card-title"><span><KeyRound /></span><div><h3>Account security</h3><p>Protected account access and password controls.</p></div></div>
            <div className="security-row"><div><strong>Password</strong><span>Use at least eight characters and avoid reused passwords.</span></div><Button variant="outline" disabled={!configured} onClick={() => setPasswordOpen(true)}>Change password</Button></div>
            <div className="security-row"><div><strong>Property data</strong><span>Only your owner account can access these records.</span></div><span className="owner-badge"><ShieldCheck /> Protected</span></div>
            <div className="security-row"><div><strong>{isAdmin ? "Administrator access" : "BahayRentahan access"}</strong><span>{isAdmin ? "Platform administration is enabled for this account." : access?.expiresAt ? `Active through ${new Intl.DateTimeFormat("en-PH", { dateStyle: "long", timeZone: "Asia/Manila" }).format(new Date(access.expiresAt))}.` : "Full access with no expiration date."}</span></div><span className="owner-badge"><ShieldCheck /> Active</span></div>
          </section>
        </div>
      </section>

      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent className="assign-dialog"><DialogHeader><DialogTitle>Change password</DialogTitle><DialogDescription>Your new password must contain at least eight characters.</DialogDescription></DialogHeader><label className="form-field"><span>New password</span><Input type="password" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label><DialogFooter><Button variant="outline" onClick={() => setPasswordOpen(false)}>Cancel</Button><Button className="lime-button" disabled={busy || newPassword.length < 8} onClick={changePassword}>{busy ? "Updating…" : "Update password"}</Button></DialogFooter></DialogContent>
      </Dialog>
    </div>
  );
}
