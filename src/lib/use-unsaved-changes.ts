import { useCallback, useEffect } from "react";

export function useUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const warnNavigation = (event: Event) => { if (!window.confirm("Discard your unsaved changes?")) event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    window.addEventListener("bahayrentahan:navigate", warnNavigation);
    return () => { window.removeEventListener("beforeunload", warn); window.removeEventListener("bahayrentahan:navigate", warnNavigation); };
  }, [dirty]);
  return useCallback((close: () => void) => {
    if (!dirty || window.confirm("Discard your unsaved changes?")) close();
  }, [dirty]);
}
