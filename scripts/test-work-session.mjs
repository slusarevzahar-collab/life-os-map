import assert from 'node:assert/strict';
import { createWorkSessionService } from '../server/workSessionService.js';

function fakeStore() {
  const sessions = [];
  let sequence = 0;
  return {
    sessions,
    async list({ status } = {}) { return sessions.filter((session) => !status || session.status === status).map((session) => ({ ...session })); },
    async get(id) { const session = sessions.find((item) => item.id === id); return session ? { ...session } : null; },
    async create(payload) { const session = { id: `session-${++sequence}`, createdAt: payload.startedAt, updatedAt: payload.startedAt, ...payload }; sessions.push(session); return { ...session }; },
    async update(id, patch) { const index = sessions.findIndex((item) => item.id === id); sessions[index] = { ...sessions[index], ...patch, finishedAt: patch.endedAt ?? sessions[index].finishedAt }; return { ...sessions[index] }; },
  };
}

const store = fakeStore();
let clock = new Date('2026-07-11T09:00:00.000Z');
const service = createWorkSessionService({ store, now: () => new Date(clock), logger: { info() {}, warn() {} }, settle: async () => {} });

const [first, duplicate] = await Promise.all([
  service.start({ timezone: 'Europe/Moscow' }),
  service.start({ timezone: 'Europe/Moscow' }),
]);
assert.equal(first.session.id, duplicate.session.id);
assert.equal(store.sessions.filter((session) => session.status === 'Active').length, 1);
assert.equal(first.session.dateKey, '2026-07-11');

clock = new Date('2026-07-11T09:45:10.000Z');
const paused = await service.pause({ sessionId: first.session.id });
assert.equal(paused.completed, true);
assert.equal(paused.session.durationSeconds, 2710);
assert.equal(await service.getActive(), null);
assert.equal((await service.pause({ sessionId: first.session.id })).completed, false);

clock = new Date('2026-07-11T10:00:00.000Z');
const active = await service.start({ timezone: 'Europe/Moscow', taskId: 'task-1', projectId: 'project-1' });
const restoredService = createWorkSessionService({ store, now: () => new Date('2026-07-11T10:30:00.000Z'), logger: { info() {}, warn() {} }, settle: async () => {} });
assert.equal((await restoredService.getActive()).id, active.session.id);
const stats = await restoredService.stats({ timezone: 'Europe/Moscow', from: '2026-07-11', to: '2026-07-11' });
assert.equal(stats.totalSeconds, 4510);
const context = await restoredService.context({ timezone: 'Europe/Moscow', days: 7 });
assert.equal(context.activeSession.id, active.session.id);
assert.equal(context.today.totalSeconds, 4510);

console.log('LifeMap work session integration tests passed.');
