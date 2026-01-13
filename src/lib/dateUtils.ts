export const formatDate = (dateString: string | null | undefined): string => {
  if (!dateString) return 'N/A';

  if (dateString.includes('T') || dateString.includes(' ')) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC'
    });
  }

  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  });
};

export const formatDateTime = (dateString: string | null | undefined): string => {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC'
  });
};

export const formatUTCDate = (dateString: string | null | undefined, format: 'short' | 'long' | 'numeric' = 'short'): string => {
  if (!dateString) return 'N/A';

  const date = new Date(dateString);

  if (format === 'numeric') {
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    const year = date.getUTCFullYear();
    return `${month}/${day}/${year}`;
  }

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: format === 'long' ? 'long' : 'short',
    day: 'numeric',
    timeZone: 'UTC'
  });
};
