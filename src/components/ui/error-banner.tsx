import { CircleAlert, RefreshCw } from "lucide-react";
import { Button } from "./button";

export function ErrorBanner({ message, onRetry, retrying = false }: { message: string; onRetry?: () => void | Promise<void>; retrying?: boolean }) {
  return <div className="error-banner error-banner-action" role="alert"><CircleAlert /><span><strong>We couldn’t update this section.</strong><small>{message}</small></span>{onRetry && <Button variant="outline" size="sm" disabled={retrying} onClick={() => void onRetry()}><RefreshCw />{retrying ? "Retrying…" : "Retry"}</Button>}</div>;
}

export function FieldError({ id, children }: { id?: string; children?: string }) {
  if (!children) return null;
  return <small className="field-error" id={id} role="alert">{children}</small>;
}
