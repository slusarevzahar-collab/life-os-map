import assert from 'node:assert/strict';
import express from 'express';
import { registerCoreRoutes } from '../server/coreRoutes.js';
import { createWorkSessionService } from '../server/workSessionService.js';

const previousAssistantSecret = process.env.LIFEMAP_ASSISTANT_API_SECRET;
process.env.LIFEMAP_ASSISTANT_API_SECRET = 'test';
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
  const { includeSecret = true, ...fetchOptions } = options;
  const response = await fetch(`${base}${path}`, {
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      ...(includeSecret ? { 'X-LifeMap-Assistant-Secret': 'test' } : {}),
      ...(fetchOptions.headers || {}),
    },
  });
  return { status: response.status, body: await response.json(), headers: response.headers };
};

try {
  const first = await request('/api/life-os/work-sessions/start', { method: 'POST', body: JSON.stringify({ timezone: 'Europe/Moscow', startedAt: '2026-07-11T08:59:42.250Z' }) });
  assert.equal(first.status, 201);
  assert.equal(first.body.session.startedAt, '2026-07-11T08:59:42.250Z');
  const accessCookie = first.headers.get('set-cookie')?.split(';')[0];
  assert.ok(accessCookie?.startsWith('lifemap_access='));
  const second = await request('/api/life-os/work-sessions/start', {
    method: 'POST',
    body: JSON.stringify({ timezone: 'Europe/Moscow' }),
    includeSecret: false,
    headers: { Cookie: accessCookie },
  });
  assert.equal(second.status, 200);
  assert.equal(second.body.session.id, first.body.session.id);
  const restored = await request('/api/life-os/work-sessions/active');
  assert.equal(restored.body.session.id, first.body.session.id);
  clock = new Date('2026-07-11T09:15:00.000Z');
  const paused = await request('/api/life-os/work-sessions/pause', {
    method: 'POST',
    body: JSON.stringify({ sessionId: first.body.session.id }),
    includeSecret: false,
    headers: { Cookie: accessCookie },
  });
  assert.equal(paused.body.session.durationSeconds, 917);
  assert.equal(paused.body.session.timerSeconds, 917);
  const stoppedState = await request('/api/life-os/work-sessions/active');
  assert.equal(stoppedState.body.session, null);
  assert.equal(stoppedState.body.lastSession.durationSeconds, 917);
  assert.equal(stoppedState.body.lastSession.timerSeconds, 917);
  clock = new Date('2026-07-11T09:20:00.000Z');
  const resumed = await request('/api/life-os/work-sessions/start', {
    method: 'POST',
    body: JSON.stringify({ timezone: 'Europe/Moscow', startedAt: clock.toISOString(), initialSeconds: 917 }),
    includeSecret: false,
    headers: { Cookie: accessCookie },
  });
  assert.equal(resumed.body.session.initialSeconds, 917);
  clock = new Date('2026-07-11T09:20:03.000Z');
  const resumedStop = await request('/api/life-os/work-sessions/pause', {
    method: 'POST',
    body: JSON.stringify({ sessionId: resumed.body.session.id }),
    includeSecret: false,
    headers: { Cookie: accessCookie },
  });
  assert.equal(resumedStop.body.session.durationSeconds, 3);
  assert.equal(resumedStop.body.session.timerSeconds, 920);
  const protectedWrite = await request('/api/life-os/sessions', {
    method: 'POST',
    body: '{}',
    includeSecret: false,
    headers: { Cookie: accessCookie },
  });
  assert.equal(protectedWrite.status, 403);
  const repeatedPause = await request('/api/life-os/work-sessions/pause', { method: 'POST', body: '{}' });
  assert.equal(repeatedPause.body.completed, false);
  const stats = await request('/api/life-os/work-sessions/stats?from=2026-07-11&to=2026-07-11&timezone=Europe%2FMoscow');
  assert.equal(stats.body.stats.totalSeconds, 920);
  const context = await request('/api/life-os/work-sessions/context?days=7&timezone=Europe%2FMoscow');
  assert.equal(context.body.context.today.totalSeconds, 920);
} finally {
  await new Promise((resolve) => server.close(resolve));
  if (previousAssistantSecret === undefined) delete process.env.LIFEMAP_ASSISTANT_API_SECRET;
  else process.env.LIFEMAP_ASSISTANT_API_SECRET = previousAssistantSecret;
}

console.log('LifeMap work session API integration tests passed.');
