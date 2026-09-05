import { useState, type FormEvent } from "react";
import { Check, KeyRound, ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/bedkeep/brand-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { userError } from "@/lib/user-error";
import { useAuth } from "./auth-provider";

export function PasswordRecoveryView() {
  const { completeRecovery } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirmation) { setError("Passwords do not match."); return; }
    setBusy(true); setError("");
    try { await completeRecovery(password); window.location.hash = "#/dashboard"; }
    catch (caught) { setError(userError(caught, "Your password could not be updated.")); }
    finally { setBusy(false); }
  }

  return <main className="auth-page recovery-page">
    <section className="auth-story"><BrandMark /><div><span className="eyebrow">SECURE RECOVERY</span><h1>Choose a fresh password.</h1><p>Your recovery link has been verified. Set a new password to return to your BahayRentahan workspace.</p></div><ul><li><Check />Encrypted authentication</li><li><Check />Owner-only access</li><li><Check />Secure recovery session</li></ul></section>
    <section className="auth-panel-wrap"><div className="auth-panel"><span className="auth-icon"><KeyRound /></span><span className="eyebrow">PASSWORD RESET</span><h2>Almost done.</h2><p>Use at least eight characters and avoid reusing an old password.</p><form className="auth-form recovery-form" onSubmit={submit}><label><span>New password</span><Input required minLength={8} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label><label><span>Confirm new password</span><Input required minLength={8} type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>{error && <div className="form-message error" role="alert">{error}</div>}<Button className="lime-button auth-submit" disabled={busy || password.length < 8}>{busy ? "Updating…" : "Update password"}</Button></form><div className="auth-security"><ShieldCheck /><span><strong>Recovery session verified</strong><small>Your new password is encrypted and protected.</small></span></div></div></section>
  </main>;
}
