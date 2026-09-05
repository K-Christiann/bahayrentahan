export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand-lockup" aria-label="BahayRentahan home">
      <span className="brand-mark" aria-hidden="true"><i /><i /></span>
      {!compact && <span className="brand-word">bahayrentahan</span>}
    </div>
  );
}
