import type { HTMLAttributes } from "react";

type ProgressProps = HTMLAttributes<HTMLDivElement> & { value?: number };

export function Progress({ value = 0, className = "", ...props }: ProgressProps) {
  const safeValue = Math.max(0, Math.min(100, value));
  return (
    <div className={`ui-progress ${className}`.trim()} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={safeValue} {...props}>
      <div className="ui-progress-indicator" style={{ width: `${safeValue}%` }} />
    </div>
  );
}
