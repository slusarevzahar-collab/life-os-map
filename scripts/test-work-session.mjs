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
assert.equal(paused.session.timerSeconds, 2710);
assert.equal(await service.getActive(), null);
assert.equal((await service.getLastCompleted()).id, paused.session.id);
assert.equal((await service.pause({ sessionId: first.session.id })).completed, false);

clock = new Date('2026-07-11T10:00:00.000Z');
const active = await service.start({ timezone: 'Europe/Moscow', taskId: 'task-1', projectId: 'project-1', startedAt: '2026-07-11T09:59:42.250Z' });
assert.equal(active.session.startedAt, '2026-07-11T09:59:42.250Z');
const storedActive = store.sessions.find((session) => session.id === active.session.id);
storedActive.startedAtExact = active.session.startedAt;
storedActive.startedAt = '2026-07-11T10:00:00.000Z';
storedActive.createdAt = '2026-07-11T10:00:37.000Z';
const restoredService = createWorkSessionService({ store, now: () => new Date('2026-07-11T10:30:00.000Z'), logger: { info() {}, warn() {} }, settle: async () => {} });
const restored = await restoredService.getActive();
assert.equal(restored.id, active.session.id);
assert.equal(restored.startedAt, '2026-07-11T09:59:42.250Z');
const stats = await restoredService.stats({ timezone: 'Europe/Moscow', from: '2026-07-11', to: '2026-07-11' });
assert.equal(stats.totalSeconds, 4527);
const context = await restoredService.context({ timezone: 'Europe/Moscow', days: 7 });
assert.equal(context.activeSession.id, active.session.id);
assert.equal(context.today.totalSeconds, 4527);

clock = new Date('2026-07-11T11:00:00.000Z');
await service.pause({ sessionId: active.session.id });
const safeFallback = await service.start({ timezone: 'Europe/Moscow', startedAt: '2026-07-10T00:00:00.000Z' });
assert.equal(safeFallback.session.startedAt, clock.toISOString());

const resumeStore = fakeStore();
let resumeClock = new Date('2026-07-11T12:00:00.000Z');
const resumeService = createWorkSessionService({ store: resumeStore, now: () => new Date(resumeClock), logger: { info() {}, warn() {} }, settle: async () => {} });
const resumeFirst = await resumeService.start({ timezone: 'Europe/Moscow' });
resumeClock = new Date('2026-07-11T12:00:12.000Z');
const resumePaused = await resumeService.pause({ sessionId: resumeFirst.session.id });
assert.equal(resumePaused.session.timerSeconds, 12);
resumeClock = new Date('2026-07-11T12:05:00.000Z');
const resumed = await resumeService.start({ timezone: 'Europe/Moscow', initialSeconds: resumePaused.session.timerSeconds });
assert.equal(resumed.session.initialSeconds, 12);
resumeClock = new Date('2026-07-11T12:05:08.000Z');
const resumeStopped = await resumeService.pause({ sessionId: resumed.session.id });
assert.equal(resumeStopped.session.durationSeconds, 8);
assert.equal(resumeStopped.session.timerSeconds, 20);
assert.equal((await resumeService.stats({ timezone: 'Europe/Moscow', from: '2026-07-11', to: '2026-07-11' })).totalSeconds, 20);

console.log('LifeMap work session integration tests passed.');
