import { PencilLine } from 'lucide-react';

/**
 * The single marker for a hand-entered record. Used on customers, invoices,
 * payments and cheque attachments so "this did not come from Acumatica" reads
 * the same everywhere in the app.
 */
export default function ManualBadge({
  source,
  size = 'md',
  label = 'Manual',
  title = 'Entered by hand in this app — not synced from Acumatica',
  className = '',
}: {
  source?: string | null;
  size?: 'xs' | 'sm' | 'md';
  label?: string;
  title?: string;
  className?: string;
}) {
  if (source !== 'manual') return null;

  const sizes = {
    xs: 'text-[9px] px-1 py-0 gap-0.5',
    sm: 'text-[10px] px-1.5 py-0.5 gap-1',
    md: 'text-xs px-2 py-0.5 gap-1',
  }[size];
  const icon = { xs: 'w-2 h-2', sm: 'w-2.5 h-2.5', md: 'w-3 h-3' }[size];

  return (
    <span
      title={title}
      className={`inline-flex items-center font-semibold uppercase tracking-wide rounded-full border border-violet-300 bg-violet-100 text-violet-700 whitespace-nowrap ${sizes} ${className}`}
    >
      <PencilLine className={icon} />
      {label}
    </span>
  );
}
