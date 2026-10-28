import type { SortDir } from '@/lib/admin/crm/filters';

export function SortableTh({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  className = 'px-4 py-3',
}: {
  label: string;
  sortKey: string;
  activeKey: string;
  dir: SortDir;
  onSort: (key: string) => void;
  className?: string;
}) {
  const active = activeKey === sortKey;
  return (
    <th className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 text-left text-[0.65rem] font-bold uppercase tracking-wide transition-colors ${
          active ? 'text-navy' : 'text-muted hover:text-navy'
        }`}
      >
        {label}
        <span className="text-[0.6rem] opacity-80" aria-hidden>
          {active ? (dir === 'asc' ? '▲' : '▼') : '⇅'}
        </span>
      </button>
    </th>
  );
}
