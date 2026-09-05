import { useState, type FormEvent } from "react";
import { ArrowRight, BedDouble, Check, ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/bedkeep/brand-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { userError } from "@/lib/user-error";
import { useAuth } from "./auth-provider";

export function AuthView() {
  const { signIn, signUp, resetPassword } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [propertyName, setPropertyName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (mode === "signin") {
        await signIn(email, password);
      } else if (mode === "signup") {
        setMessage(await signUp({ email, password, fullName, propertyName }));
      } else {
        await resetPassword(email);
        setMessage("Password recovery email sent. Open the link to choose a new password.");
      }
    } catch (caught) {
      setError(userError(caught, "Something went wrong. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-story">
        <a href="/" className="auth-home-link" aria-label="Back to BahayRentahan home"><BrandMark /></a>
        <div><span className="eyebrow">BEDSPACE OPERATIONS</span><h1>Keep every bed, boarder, and payment in view.</h1><p>A focused workspace for small property owners—built to replace scattered notebooks and spreadsheets.</p></div>
        <ul><li><Check />Owner-isolated records</li><li><Check />Mobile-friendly occupancy map</li><li><Check />Secure owner access</li></ul>
      </section>
      <section className="auth-panel-wrap">
        <div className="auth-panel">
          <span className="auth-icon"><BedDouble /></span>
          <span className="eyebrow">OWNER ACCESS</span>
          <h2>{mode === "signin" ? "Welcome back." : mode === "signup" ? "Create your workspace." : "Reset your password."}</h2>
          <p>{mode === "signin" ? "Sign in to manage your property." : mode === "signup" ? "Your first property is created automatically." : "We'll email you a secure recovery link."}</p>
          {mode !== "reset" ? <div className="auth-tabs"><button className={mode === "signin" ? "active" : ""} onClick={() => setMode("signin")}>Sign in</button><button className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>Create account</button></div> : <button className="auth-back" onClick={() => setMode("signin")}>← Back to sign in</button>}
          <form onSubmit={submit} className="auth-form">
            {mode === "signup" && <><label><span>Full name</span><Input required autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Your name" /></label><label><span>Property name</span><Input required value={propertyName} onChange={(event) => setPropertyName(event.target.value)} placeholder="Sunrise Bedspace" /></label></>}
            <label><span>Email address</span><Input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="owner@example.com" /></label>
            {mode !== "reset" && <label><span>Password</span><Input required minLength={8} type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" /></label>}
            {mode === "signin" && <button type="button" className="forgot-link" onClick={() => { setMode("reset"); setError(""); setMessage(""); }}>Forgot password?</button>}
            {error && <div className="form-message error" role="alert">{error}</div>}
            {message && <div className="form-message success" role="status">{message}</div>}
            <Button className="lime-button auth-submit" disabled={busy}>{busy ? "Please wait…" : <>{mode === "signin" ? "Sign in" : mode === "signup" ? "Create free workspace" : "Send recovery email"}<ArrowRight /></>}</Button>
          </form>
          <div className="auth-security"><ShieldCheck /><span><strong>Secure account access</strong><small>Your password is encrypted and protected.</small></span></div>
        </div>
      </section>
    </main>
  );
}
