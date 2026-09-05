import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, type HTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

type DialogContextValue = { open: boolean; close: () => void; titleId: string; descriptionId: string };
const DialogContext = createContext<DialogContextValue>({ open: false, close: () => undefined, titleId: "dialog-title", descriptionId: "dialog-description" });

export function Dialog({ open = false, onOpenChange, children }: { open?: boolean; onOpenChange?: (open: boolean) => void; children: ReactNode }) {
  const onOpenChangeRef = useRef(onOpenChange);
  const generatedId = useId();
  onOpenChangeRef.current = onOpenChange;
  const close = useCallback(() => onOpenChangeRef.current?.(false), []);
  const value = useMemo(() => ({ open, close, titleId: `${generatedId}-title`, descriptionId: `${generatedId}-description` }), [close, generatedId, open]);
  return <DialogContext.Provider value={value}>{children}</DialogContext.Provider>;
}

export function DialogContent({ className = "", children, "aria-label": ariaLabel, ...props }: HTMLAttributes<HTMLDivElement>) {
  const { open, close, titleId, descriptionId } = useContext(DialogContext);
  const contentRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => contentRef.current?.querySelector<HTMLElement>("button, input, select, textarea")?.focus(), 0);
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { close(); return; }
      if (event.key !== "Tab" || !contentRef.current) return;
      const focusable = Array.from(contentRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')).filter((element) => !element.hasAttribute("hidden"));
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", keydown);
    return () => { window.clearTimeout(timer); window.removeEventListener("keydown", keydown); document.body.style.overflow = oldOverflow; previous?.focus(); };
  }, [close, open]);
  if (!open) return null;
  return createPortal(
    <div className="ui-dialog-layer" role="presentation">
      <button className="ui-dialog-overlay" onClick={close} aria-label="Close dialog" />
      <section ref={contentRef} className={`ui-dialog-content ${className}`.trim()} role="dialog" aria-modal="true" aria-label={ariaLabel} aria-labelledby={ariaLabel ? undefined : titleId} aria-describedby={ariaLabel ? undefined : descriptionId} {...props}>
        {children}
        <button className="ui-dialog-close" onClick={close} aria-label="Close"><X size={17} /></button>
      </section>
    </div>,
    document.body,
  );
}

export function DialogHeader(props: HTMLAttributes<HTMLDivElement>) { return <div className="ui-dialog-header" {...props} />; }
export function DialogFooter(props: HTMLAttributes<HTMLDivElement>) { return <div className="ui-dialog-footer" {...props} />; }
export function DialogTitle(props: HTMLAttributes<HTMLHeadingElement>) { const { titleId } = useContext(DialogContext); return <h2 id={titleId} data-slot="dialog-title" {...props} />; }
export function DialogDescription(props: HTMLAttributes<HTMLParagraphElement>) { const { descriptionId } = useContext(DialogContext); return <p id={descriptionId} data-slot="dialog-description" {...props} />; }
