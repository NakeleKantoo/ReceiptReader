export function relativeTime(timestamp: number | null): string {
  if (!timestamp) return 'nunca';

  const diff = Date.now() - timestamp;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return 'agora';
  if (diff < hour) return `há ${Math.floor(diff / minute)} min`;
  if (diff < day) return `há ${Math.floor(diff / hour)} h`;
  if (diff < 7 * day) return `há ${Math.floor(diff / day)} d`;

  return new Date(timestamp).toLocaleDateString('pt-BR');
}

export function formatDateTime(timestamp: number | null): string {
  if (!timestamp) return '—';
  return new Date(timestamp).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return 'Boa madrugada';
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}
