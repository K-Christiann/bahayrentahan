export function Skeleton({ className = "" }: { className?: string }) { return <span className={`skeleton ${className}`.trim()} aria-hidden="true" />; }
export function ListSkeleton({ rows = 4 }: { rows?: number }) { return <div className="list-skeleton" aria-label="Loading content">{Array.from({ length: rows }, (_, index) => <div key={index}><Skeleton className="skeleton-avatar" /><span><Skeleton /><Skeleton /></span></div>)}</div>; }

