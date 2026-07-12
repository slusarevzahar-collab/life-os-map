import assert from 'node:assert/strict';
import express from 'express';
import { registerCoreRoutes } from '../server/coreRoutes.js';
import { createWorkSessionService } from '../server/workSessionService.js';

const records = [];
let sequence = 0;
let clock = new Date('2026-07-11T09:00:00.000Z');
const store = {
  async list({ status } = {}) { return records.filter((item) => !status || item.status === status).map((item) => ({ ...item })); },
  async get(id) { return records.find((item) => item.id === id) || null; },
  async create(payload) { const item = { id: `api-${++sequence}`, ...payload }; records.push(item); return { ...item }; },
  async update(id, patch) { const index = records.findIndex((item) => item.id === id); records[index] = { ...records[index], ...patch, finishedAt: patch.endedAt ?? records[index].finishedAt }; return { ...records[index] }; },
};
const workSessions = createWorkSessionService({ store, now: () => new Date(clock), settle: async () => {}, logger: { info() {}, warn() {} } });
const app = express();
app.use(express.json());
registerCoreRoutes(app, {
  config: { defaultTimezone: 'UTC', notionToken: '', sessionsDbId: '' },
  ai: { status: () => ({ configured: false }), chat: async () => ({ proposedActions: [] }) },
  buildLiveSnapshot: async () => ({ meta: {}, tasks: [], goals: [], sessions: [], projectAreas: [], dreams: [], signals: [] }),
  executeActions: async () => [],
  assistantSecretOk: (req) => req.get('X-LifeMap-Assistant-Secret') === 'test',
  listInboxAssets: async () => [],
  inboxSignal: async () => null,
  startInboxReprocessJob: async () => ({}),
  inboxReprocessJobStatus: () => ({ status: 'idle' }),
  workSessions,
});

const server = await new Promise((resolve) => {
  const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
});
const base = `http://127.0.0.1:${server.address().port}`;
const request = async (path, options = {}) => {
  const response = await fetch(`${base}${path}`, { ...options, headers: { 'Content-Type': 'application/json', 'X-LifeMap-Assistant-Secret': 'test', ...(options.headers || {}) } });
  return { status: response.status, body: await response.json() };
};

try {
  const first = await request('/api/life-os/work-sessions/start', { method: 'POST', body: JSON.stringify({ timezone: 'Europe/Moscow' }) });
  assert.equal(first.status, 201);
  const second = await request('/api/life-os/work-sessions/start', { method: 'POST', body: JSON.stringify({ timezone: 'Europe/Moscow' }) });
  assert.equal(second.status, 200);
  assert.equal(second.body.session.id, first.body.session.id);
  const restored = await request('/api/life-os/work-sessions/active');
  assert.equal(restored.body.session.id, first.body.session.id);
  clock = new Date('2026-07-11T09:15:00.000Z');
  const paused = await request('/api/life-os/work-sessions/pause', { method: 'POST', body: JSON.stringify({ sessionId: first.body.session.id }) });
  assert.equal(paused.body.session.durationSeconds, 900);
  const repeatedPause = await request('/api/life-os/work-sessions/pause', { method: 'POST', body: '{}' });
  assert.equal(repeatedPause.body.completed, false);
  const stats = await request('/api/life-os/work-sessions/stats?from=2026-07-11&to=2026-07-11&timezone=Europe%2FMoscow');
  assert.equal(stats.body.stats.totalSeconds, 900);
  const context = await request('/api/life-os/work-sessions/context?days=7&timezone=Europe%2FMoscow');
  assert.equal(context.body.context.today.totalSeconds, 900);
} finally {
  await new Promise((resolve) => server.close(resolve));
}

console.log('LifeMap work session API integration tests passed.');

