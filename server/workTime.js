const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validTimezone(timezone = 'UTC') {
  const value = String(timezone || 'UTC').trim() || 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return value;
  } catch {
    throw new Error('Invalid timezone. Use an IANA timezone such as Europe/Moscow.');
  }
}

export function dateKeyAt(value, timezone = 'UTC') {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid date.');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: validTimezone(timezone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function durationSeconds(startedAt, endedAt) {
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.floor((end - start) / 1000));
}

export function formatDuration(totalSeconds = 0) {
  const safe = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
}

function previousDateKey(dateKey) {
  if (!DATE_KEY_RE.test(dateKey)) throw new Error('Invalid date key.');
  const [year, month, day] = dateKey.split('-').map(Number);
  const previous = new Date(Date.UTC(year, month - 1, day - 1));
  return previous.toISOString().slice(0, 10);
}

function nextLocalMidnightMs(fromMs, timezone) {
  const currentKey = dateKeyAt(fromMs, timezone);
  let low = fromMs;
  let high = fromMs + (27 * 60 * 60 * 1000);
  while (dateKeyAt(high, timezone) === currentKey) high += 6 * 60 * 60 * 1000;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (dateKeyAt(middle, timezone) === currentKey) low = middle;
    else high = middle;
  }
  return high;
}

export function splitIntervalByLocalDay(startedAt, endedAt, timezone = 'UTC') {
  const zone = validTimezone(timezone);
  let cursor = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  if (!Number.isFinite(cursor) || !Number.isFinite(end) || end <= cursor) return [];
  const result = [];
  while (cursor < end) {
    const dateKey = dateKeyAt(cursor, zone);
    const boundary = Math.min(end, nextLocalMidnightMs(cursor, zone));
    result.push({ dateKey, seconds: Math.max(0, Math.floor((boundary - cursor) / 1000)) });
    cursor = boundary;
  }
  return result;
}

export function summarizeWorkSessions(sessions = [], { timezone = 'UTC', from, to, now = new Date() } = {}) {
  const zone = validTimezone(timezone);
  const nowDate = now instanceof Date ? now : new Date(now);
  const today = dateKeyAt(nowDate, zone);
  const fromKey = from && DATE_KEY_RE.test(from) ? from : today;
  const toKey = to && DATE_KEY_RE.test(to) ? to : today;
  if (fromKey > toKey) throw new Error('The stats start date must not be after the end date.');

  const byDate = new Map();
  let completedSessionCount = 0;
  let activeSessionCount = 0;

  for (const session of sessions) {
    if (!session?.startedAt) continue;
    const active = String(session.status || '').toLowerCase() === 'active' && !session.endedAt && !session.finishedAt;
    const endedAt = active ? nowDate.toISOString() : (session.endedAt || session.finishedAt);
    if (!endedAt) continue;
    if (active) activeSessionCount += 1;
    else completedSessionCount += 1;
    for (const part of splitIntervalByLocalDay(session.startedAt, endedAt, zone)) {
      if (part.dateKey < fromKey || part.dateKey > toKey) continue;
      const current = byDate.get(part.dateKey) || { dateKey: part.dateKey, totalSeconds: 0, completedSeconds: 0, activeSeconds: 0, sessionCount: 0 };
      current.totalSeconds += part.seconds;
      current[active ? 'activeSeconds' : 'completedSeconds'] += part.seconds;
      current.sessionCount += 1;
      byDate.set(part.dateKey, current);
    }
  }

  const days = [...byDate.values()].sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  const totalSeconds = days.reduce((sum, day) => sum + day.totalSeconds, 0);
  const activeDays = days.filter((day) => day.totalSeconds > 0);
  const mostProductiveDay = activeDays.reduce((best, day) => !best || day.totalSeconds > best.totalSeconds ? day : best, null);
  const worked = new Set(activeDays.map((day) => day.dateKey));
  let streakDays = 0;
  let cursor = worked.has(today) ? today : previousDateKey(today);
  while (worked.has(cursor)) {
    streakDays += 1;
    cursor = previousDateKey(cursor);
  }

  return {
    timezone: zone,
    from: fromKey,
    to: toKey,
    asOf: nowDate.toISOString(),
    totalSeconds,
    completedSessionCount,
    activeSessionCount,
    averageActiveDaySeconds: activeDays.length ? Math.round(totalSeconds / activeDays.length) : 0,
    mostProductiveDay,
    streakDays,
    days,
  };
}
