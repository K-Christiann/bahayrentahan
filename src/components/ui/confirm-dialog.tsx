import { AlertTriangle } from "lucide-react";
import { Button } from "./button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./dialog";

export function ConfirmDialog({ open, title, description, confirmLabel = "Confirm", busy = false, destructive = false, onConfirm, onOpenChange }: { open: boolean; title: string; description: string; confirmLabel?: string; busy?: boolean; destructive?: boolean; onConfirm: () => void | Promise<void>; onOpenChange: (open: boolean) => void; }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="confirm-dialog"><DialogHeader><span className={`confirm-icon ${destructive ? "destructive" : ""}`}><AlertTriangle /></span><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button className={destructive ? "destructive-button" : "lime-button"} disabled={busy} onClick={() => void onConfirm()}>{busy ? "Working…" : confirmLabel}</Button></DialogFooter></DialogContent></Dialog>;
}

