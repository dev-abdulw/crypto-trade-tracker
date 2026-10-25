import { format } from 'date-fns';

/** Value for an <input type="datetime-local"> in the browser's time zone. */
export function toLocalInput(v: Date | string = new Date()): string {
  return format(new Date(v), "yyyy-MM-dd'T'HH:mm");
}

/** datetime-local value (local time, no offset) → ISO timestamp. */
export function fromLocalInput(s: string): string {
  return new Date(s).toISOString();
}

export function formatDateTime(v: Date | string): string {
  return format(new Date(v), 'd MMM yyyy, HH:mm');
}

export function formatDate(v: Date | string): string {
  return format(new Date(v), 'd MMM yyyy');
}

/** 90061000 → "1d 1h"; 5400000 → "1h 30m". */
export function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return '<1m';
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
