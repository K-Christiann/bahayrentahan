import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";

type ToastTone = "success" | "error" | "info";
interface ToastInput { title: string; description?: string; tone?: ToastTone; actionLabel?: string; onAction?: () => void | Promise<void>; }
interface ToastItem extends ToastInput { id: string; }
const Context = createContext<{ push: (toast: ToastInput) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: string) => setItems((current) => current.filter((item) => item.id !== id)), []);
  const push = useCallback((toast: ToastInput) => {
    const id = crypto.randomUUID(); setItems((current) => [...current.slice(-2), { ...toast, id }]);
    window.setTimeout(() => dismiss(id), toast.tone === "error" ? 6500 : 4200);
  }, [dismiss]);
  return <Context.Provider value={{ push }}>{children}<div className="toast-viewport" aria-live="polite" aria-atomic="false">{items.map((item) => { const Icon = item.tone === "error" ? CircleAlert : item.tone === "info" ? Info : CheckCircle2; return <div className={`toast-card ${item.tone || "success"}`} key={item.id} role={item.tone === "error" ? "alert" : "status"}><Icon /><span><strong>{item.title}</strong>{item.description && <small>{item.description}</small>}</span>{item.actionLabel && <button onClick={() => { void item.onAction?.(); dismiss(item.id); }}>{item.actionLabel}</button>}<button className="toast-close" onClick={() => dismiss(item.id)} aria-label="Dismiss notification"><X /></button></div>; })}</div></Context.Provider>;
}
export function useToast() { const value = useContext(Context); if (!value) throw new Error("useToast must be used inside ToastProvider"); return value; }

