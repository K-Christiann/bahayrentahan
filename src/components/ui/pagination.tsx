import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  page: number;
  pageCount: number;
  from: number;
  to: number;
  total: number;
  label?: string;
  onPageChange: (page: number) => void;
}

export function PaginationControls({ page, pageCount, from, to, total, label = "records", onPageChange }: PaginationProps) {
  if (pageCount <= 1) return null;
  return <nav className="pagination" aria-label={`${label} pagination`}><span>Showing {from}–{to} of {total} {label}</span><div><button type="button" disabled={page === 1} onClick={() => onPageChange(page - 1)} aria-label={`Previous ${label} page`}><ChevronLeft /></button><span>Page {page} of {pageCount}</span><button type="button" disabled={page === pageCount} onClick={() => onPageChange(page + 1)} aria-label={`Next ${label} page`}><ChevronRight /></button></div></nav>;
}
