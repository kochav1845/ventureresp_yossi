import { Assignment } from './types';

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
  if (invoice.color_status !== 'green' || !invoice.promise_date || (invoice.balance ?? 0) <= 0) {
    return false;
  }
  const promiseDate = new Date(invoice.promise_date);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return promiseDate < now;
};
