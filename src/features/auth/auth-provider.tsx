import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import type { AccountAccess } from "@/lib/bedkeep/types";
import { userError } from "@/lib/user-error";

interface SignUpInput {
  email: string;
  password: string;
  fullName: string;
  propertyName: string;
}

interface ProfileInput {
  fullName: string;
  phone: string;
  location: string;
}

interface AuthContextValue {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  displayName: string;
  access: AccountAccess | null;
  accessError: string;
  isAdmin: boolean;
  recoveryMode: boolean;
  refreshAccess: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<string>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  completeRecovery: (password: string) => Promise<void>;
  updateProfile: (input: ProfileInput) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [access, setAccess] = useState<AccountAccess | null>(null);
  const [accessError, setAccessError] = useState("");
  const [recoveryMode, setRecoveryMode] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session);
        setLoading(false);
      }
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      setAccess((current) => current?.userId === nextSession?.user.id ? current : null);
      setAccessError("");
      if (event === "PASSWORD_RECOVERY") setRecoveryMode(true);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const refreshAccess = useCallback(async () => {
    if (!supabase || !session?.user) {
      setAccess(null);
      setAccessError("");
      return;
    }
    const { data, error } = await supabase.rpc("get_my_access").single();
    if (error) {
      setAccess(null);
      setAccessError(error.code === "PGRST202" || error.message.includes("get_my_access")
        ? "The activation system is not installed yet. Run Supabase migration 006."
        : userError(error, "Your account status could not be checked."));
    } else {
      const row = data as Record<string, unknown>;
      setAccess({
        userId: String(row.user_id),
        status: row.access_status as AccountAccess["status"],
        plan: String(row.plan || "Full access"),
        activatedAt: row.activated_at ? String(row.activated_at) : undefined,
        expiresAt: row.expires_at ? String(row.expires_at) : undefined,
        isAdmin: Boolean(row.is_admin),
      });
      setAccessError("");
    }
  }, [session?.user]);

  useEffect(() => { void refreshAccess(); }, [refreshAccess]);

  useEffect(() => {
    if (!session?.user) return;
    const recheck = () => void refreshAccess();
    const recheckWhenVisible = () => { if (document.visibilityState === "visible") recheck(); };
    const interval = window.setInterval(recheck, 5 * 60 * 1000);
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", recheckWhenVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", recheckWhenVisible);
    };
  }, [refreshAccess, session?.user]);

  const value = useMemo<AuthContextValue>(() => ({
    configured: isSupabaseConfigured,
    loading: loading || Boolean(session && !access && !accessError),
    session,
    user: session?.user ?? null,
    displayName: String(session?.user.user_metadata.full_name || "Owner"),
    access,
    accessError,
    isAdmin: Boolean(access?.isAdmin),
    recoveryMode,
    refreshAccess,
    async signIn(email, password) {
      if (!supabase) return;
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    async signUp({ email, password, fullName, propertyName }) {
      if (!supabase) throw new Error("Service connection is unavailable.");
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName, property_name: propertyName } },
      });
      if (error) throw error;
      return data.session
        ? "Account created. Your workspace will open after administrator activation."
        : "Account created. Confirm your email, then sign in to check the activation status.";
    },
    async signOut() {
      if (!supabase) return;
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },
    async resetPassword(email) {
      if (!supabase) return;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/app#/profile` });
      if (error) throw error;
    },
    async completeRecovery(password) {
      if (!supabase) return;
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setRecoveryMode(false);
    },
    async updateProfile(input) {
      if (!supabase || !session?.user) return;
      const { error: authError } = await supabase.auth.updateUser({
        data: { full_name: input.fullName, phone: input.phone, location: input.location },
      });
      if (authError) throw authError;
      const { error: profileError } = await supabase.from("profiles").update({
        full_name: input.fullName,
        phone: input.phone,
        location: input.location,
        updated_at: new Date().toISOString(),
      }).eq("id", session.user.id);
      if (profileError) throw profileError;
    },
    async updatePassword(password) {
      if (!supabase) return;
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
    },
  }), [access, accessError, loading, recoveryMode, refreshAccess, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
