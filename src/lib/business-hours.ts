const saoPauloFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  weekday: 'short',
});

function getSaoPauloParts(date: Date) {
  const parts = saoPauloFormatter.formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || '0');
  const weekday = (parts.find((part) => part.type === 'weekday')?.value || '').toLowerCase();

  return { hour, minute, weekday };
}

export function isWithinBusinessHours(date: Date = new Date()) {
  const { hour, minute, weekday } = getSaoPauloParts(date);
  const totalMinutes = hour * 60 + minute;
  const isWeekday = !weekday.startsWith('sáb') && !weekday.startsWith('dom');

  if (!isWeekday) {
    return false;
  }

  const morning = totalMinutes >= 9 * 60 && totalMinutes < 12 * 60;
  const afternoon = totalMinutes >= 14 * 60 && totalMinutes < 19 * 60;

  return morning || afternoon;
}