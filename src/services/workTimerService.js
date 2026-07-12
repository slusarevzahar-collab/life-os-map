import { requestJson } from '../lib/lifeMapRuntime.js';

function timezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function dateKey() {
  const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const read = (type) => parts.find((part) => part.type === type)?.value;
  return `${read('year')}-${read('month')}-${read('day')}`;
}

export const workTimerService = {
  start(input = {}) {
    return requestJson('/api/life-os/work-sessions/start', {
      method: 'POST',
      body: JSON.stringify({ ...input, timezone: timezone(), dateKey: dateKey() }),
    });
  },
  pause(sessionId) {
    return requestJson('/api/life-os/work-sessions/pause', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    });
  },
  active() {
    return requestJson('/api/life-os/work-sessions/active', { requiresSecret: true });
  },
  today() {
    const today = dateKey();
    return requestJson(`/api/life-os/work-sessions/stats?from=${today}&to=${today}&timezone=${encodeURIComponent(timezone())}`, { requiresSecret: true });
  },
};

