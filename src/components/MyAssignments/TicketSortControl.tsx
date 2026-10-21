import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { SortDirection, TicketSortField, TICKET_SORT_DEFAULT_DIR } from './utils';

export interface TicketSort {
  field: TicketSortField;
  dir: SortDirection;
}

interface TicketSortControlProps {
  sort: TicketSort;
  onChange: (sort: TicketSort) => void;
}

const FIELD_LABELS: Record<TicketSortField, string> = {
  priority: 'Priority',
  outstanding: 'Total Outstanding',
  created: 'Date created',
  modified: 'Date modified',
};

// Say what the order IS rather than "asc"/"desc", which reads backwards for priority.
const DIR_LABELS: Record<TicketSortField, Record<SortDirection, string>> = {
  priority: { asc: 'Urgent first', desc: 'Low first' },
  outstanding: { desc: 'Highest first', asc: 'Lowest first' },
  created: { desc: 'Newest first', asc: 'Oldest first' },
  modified: { desc: 'Newest first', asc: 'Oldest first' },
};

export default function TicketSortControl({ sort, onChange }: TicketSortControlProps) {
  // Arrow shows which end leads: down = big/new/urgent at the top.
  const leadsWithTop = sort.dir === TICKET_SORT_DEFAULT_DIR[sort.field];

  return (
    <div className="flex items-center gap-2" data-tour="ticket-sort">
      <label htmlFor="ticket-sort-field" className="flex items-center gap-1 text-sm text-gray-500 whitespace-nowrap">
        <ArrowUpDown className="w-3.5 h-3.5" />
        Sort by
      </label>
      <select
        id="ticket-sort-field"
        value={sort.field}
        onChange={e => {
          const field = e.target.value as TicketSortField;
          onChange({ field, dir: TICKET_SORT_DEFAULT_DIR[field] });
        }}
        className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg bg-white text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      >
        {(Object.keys(FIELD_LABELS) as TicketSortField[]).map(field => (
          <option key={field} value={field}>{FIELD_LABELS[field]}</option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => onChange({ ...sort, dir: sort.dir === 'asc' ? 'desc' : 'asc' })}
        title="Reverse the order"
        className="px-3 py-1.5 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1 whitespace-nowrap"
      >
        {leadsWithTop ? <ArrowDown className="w-3.5 h-3.5" /> : <ArrowUp className="w-3.5 h-3.5" />}
        {DIR_LABELS[sort.field][sort.dir]}
      </button>
    </div>
  );
}
