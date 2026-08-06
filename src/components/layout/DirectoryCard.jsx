import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import AdminCard from './AdminCard';
import Pagination from './Pagination';

/**
 * DirectoryCard — the AdminLTE `users.html` page template.
 *
 * One card holding a table: title + controls in the header, rows in a `p-0`
 * body, and a "Showing X to Y of Z" range beside pagination in the footer.
 *
 * Every directory in the app (users, players, teams) renders through this so
 * the four pages cannot drift apart — the shell, the header rhythm and the
 * footer range are defined once here. Rows stay bespoke because each entity
 * has its own columns and its own expanded detail panel.
 *
 * `columns` entries: { key, label, align?: 'right', className?, sortable?,
 * sortDir?: 'asc' | 'desc' | null, onSort? }. Pass the same `className` to the
 * matching `<td>` to hide a column responsively.
 */
export default function DirectoryCard({
  title,
  icon,
  toolbar,
  columns = [],
  prepend,
  children,
  page = 1,
  pageCount = 1,
  total = 0,
  from = 0,
  to = 0,
  onPageChange,
  noun = 'item',
  nounPlural,
}) {
  const plural = nounPlural || `${noun}s`;

  return (
    <AdminCard
      title={title}
      icon={icon}
      bodyClassName="p-0"
      tools={toolbar}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            Showing {from} to {to} of {total} {total === 1 ? noun : plural}
          </span>
          <Pagination page={page} pageCount={pageCount} onChange={onPageChange} />
        </div>
      }
    >
      {prepend}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn('px-4 py-2.5 font-semibold', col.align === 'right' && 'text-right', col.className)}
                  aria-sort={col.sortable ? ariaSort(col.sortDir) : undefined}
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      onClick={col.onSort}
                      className="inline-flex select-none items-center gap-1 uppercase transition-colors hover:text-foreground"
                    >
                      {col.label}
                      <SortIcon dir={col.sortDir} />
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </AdminCard>
  );
}

/** Full-width row for an expanded detail panel beneath its parent row. */
export function DetailRow({ colSpan, children, className }) {
  return (
    <tr className={cn('border-b border-border bg-foreground/[0.03]', className)}>
      <td colSpan={colSpan} className="px-4 py-3">
        {children}
      </td>
    </tr>
  );
}

/** Placeholder row for an empty or fully-filtered-out table. */
export function EmptyRow({ colSpan, children }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-sm font-semibold text-muted-foreground">
        {children}
      </td>
    </tr>
  );
}

function SortIcon({ dir }) {
  if (dir === 'asc') return <ArrowUp size={12} />;
  if (dir === 'desc') return <ArrowDown size={12} />;
  return <ChevronsUpDown size={12} className="opacity-40" />;
}

function ariaSort(dir) {
  if (dir === 'asc') return 'ascending';
  if (dir === 'desc') return 'descending';
  return 'none';
}
