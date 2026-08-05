import { ChevronLeft, ChevronRight } from 'lucide-react';
import { pageWindow } from '../../utils/pagination';

/**
 * Pagination — AdminLTE's `.pagination.pagination-sm` card footer control.
 *
 * Renders nothing at a single page: a control that can only point at where you
 * already are is noise, and the sibling "Showing X of Y" line already says the
 * list is short.
 */
export default function Pagination({ page, pageCount, onChange }) {
  if (pageCount <= 1) return null;

  const pages = pageWindow(page, pageCount);

  return (
    <nav aria-label="Pagination">
      <ul className="flex items-center -space-x-px">
        <PageButton
          label="Previous page"
          disabled={page === 1}
          onClick={() => onChange(page - 1)}
          className="rounded-l-md"
        >
          <ChevronLeft size={14} />
        </PageButton>

        {pages.map((n) => (
          <PageButton key={n} label={`Page ${n}`} active={n === page} onClick={() => onChange(n)}>
            {n}
          </PageButton>
        ))}

        <PageButton
          label="Next page"
          disabled={page === pageCount}
          onClick={() => onChange(page + 1)}
          className="rounded-r-md"
        >
          <ChevronRight size={14} />
        </PageButton>
      </ul>
    </nav>
  );
}

function PageButton({ children, label, active, disabled, onClick, className = '' }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        className={`flex h-8 min-w-8 items-center justify-center border border-border px-2 text-xs font-semibold transition-colors ${
          active
            ? 'z-10 border-primary bg-primary text-primary-foreground'
            : 'bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
        } disabled:pointer-events-none disabled:opacity-40 ${className}`}
      >
        {children}
      </button>
    </li>
  );
}
