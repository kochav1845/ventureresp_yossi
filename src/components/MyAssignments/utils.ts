import { Assignment } from './types';
import { isDatePast } from '../../lib/dateUtils';

export const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'urgent': return 'bg-red-100 text-red-800 border-red-300';
    case 'high': return 'bg-orange-100 text-orange-800 border-orange-300';
    case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    case 'low': return 'bg-green-100 text-green-800 border-green-300';
    default: return 'bg-gray-100 text-gray-800 border-gray-300';
  }
};

export const getStatusColor = (status: string) => {
  switch (status) {
    case 'open': return 'bg-blue-100 text-blue-800';
    case 'in_progress': return 'bg-purple-100 text-purple-800';
    case 'resolved': return 'bg-green-100 text-green-800';
    case 'closed': return 'bg-gray-100 text-gray-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

export const getColorStatusStyle = (colorStatus: string | null) => {
  switch (colorStatus) {
    case 'green':
      return 'bg-green-100 text-green-800 border-green-300';
    case 'orange':
      return 'bg-orange-100 text-orange-800 border-orange-300';
    case 'red':
      return 'bg-red-100 text-red-800 border-red-300';
    default:
      return '';
  }
};

export const getColorStatusLabel = (colorStatus: string | null) => {
  switch (colorStatus) {
    case 'green':
      return 'Will Pay';
    case 'orange':
      return 'Will Take Care';
    case 'red':
      return 'Will Not Pay';
    default:
      return null;
  }
};

export const calculateTotalBalance = (invoices: Assignment[]) => {
  return invoices.reduce((sum, inv) => sum + (inv.balance || 0), 0);
};

export const isPromiseBroken = (invoice: Assignment) => {
  if (invoice.color_status !== 'green' || !invoice.promise_date) {
    return false;
  }
  const dateStr = invoice.promise_date.split('T')[0];
  return isDatePast(dateStr);
};

export const getPriorityOrder = (priority: string): number => {
  switch (priority) {
    case 'urgent': return 1;
    case 'high': return 2;
    case 'medium': return 3;
    case 'low': return 4;
    default: return 5;
  }
};

export const sortTicketsByPriority = <T extends { ticket_priority: string }>(tickets: T[]): T[] => {
  return [...tickets].sort((a, b) => {
    return getPriorityOrder(a.ticket_priority) - getPriorityOrder(b.ticket_priority);
  });
};

export type InvoiceSortField = 'invoice_reference_number' | 'invoice_status' | 'date' | 'due_date' | 'collection_date' | 'amount' | 'balance' | 'color_status' | 'days';
export type SortDirection = 'asc' | 'desc';

export const sortInvoices = (invoices: Assignment[], field: InvoiceSortField, direction: SortDirection): Assignment[] => {
  return [...invoices].sort((a, b) => {
    let cmp = 0;
    switch (field) {
      case 'invoice_reference_number':
        cmp = (a.invoice_reference_number || '').localeCompare(b.invoice_reference_number || '');
        break;
      case 'invoice_status':
        cmp = (a.invoice_status || '').localeCompare(b.invoice_status || '');
        break;
      case 'date':
        cmp = (a.date || '').localeCompare(b.date || '');
        break;
      case 'due_date':
        cmp = (a.due_date || '').localeCompare(b.due_date || '');
        break;
      case 'collection_date':
        cmp = (a.collection_date || '').localeCompare(b.collection_date || '');
        break;
      case 'amount':
        cmp = (a.amount ?? 0) - (b.amount ?? 0);
        break;
      case 'balance':
        cmp = (a.balance ?? 0) - (b.balance ?? 0);
        break;
      case 'color_status':
        cmp = (a.color_status || '').localeCompare(b.color_status || '');
        break;
      case 'days': {
        const daysA = a.date && a.collection_date ? Math.ceil((new Date(a.collection_date).getTime() - new Date(a.date).getTime()) / 86400000) : null;
        const daysB = b.date && b.collection_date ? Math.ceil((new Date(b.collection_date).getTime() - new Date(b.date).getTime()) / 86400000) : null;
        if (daysA === null && daysB === null) cmp = 0;
        else if (daysA === null) cmp = 1;
        else if (daysB === null) cmp = -1;
        else cmp = daysA - daysB;
        break;
      }
    }
    return direction === 'asc' ? cmp : -cmp;
  });
};
