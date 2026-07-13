import assert from 'node:assert/strict';
import { createWorkSessionService } from '../server/workSessionService.js';

function fakeStore() {
  const sessions = [];
  let sequence = 0;
  return {
    sessions,
    async list({ status } = {}) { return sessions.filter((session) => !session.archived && (!status || session.status === status)).map((session) => ({ ...session })); },
    async get(id) { const session = sessions.find((item) => item.id === id && !item.archived); return session ? { ...session } : null; },
    async create(payload) {
      const session = { id: `session-${++sequence}`, sessionNumber: sequence, sessionCode: `S-${sequence}`, createdAt: payload.startedAt, updatedAt: payload.startedAt, ...payload };
      sessions.push(session);
      return { ...session };
    },
    async update(id, patch) {
      const index = sessions.findIndex((item) => item.id === id);
      sessions[index] = { ...sessions[index], ...patch, finishedAt: Object.prototype.hasOwnProperty.call(patch, 'endedAt') ? patch.endedAt : sessions[index].finishedAt, updatedAt: patch.endedAt || patch.startedAtExact || sessions[index].updatedAt };
      return { ...sessions[index] };
    },
    async archive(id) { const session = sessions.find((item) => item.id === id); if (session) session.archived = true; return { id, archived: true }; },
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
assert.equal(first.session.sessionCode, 'S-1');
assert.equal(first.session.dateKey, '2026-07-11');
assert.equal(store.sessions.filter((session) => !session.archived).length, 1);

clock = new Date('2026-07-11T09:45:10.000Z');
const paused = await service.pause({ sessionId: first.session.id });
assert.equal(paused.completed, true);
assert.equal(paused.session.durationSeconds, 2710);
assert.equal(paused.session.timerSeconds, 2710);
assert.equal(await service.getActive(), null);

clock = new Date('2026-07-11T10:00:00.000Z');
const resumed = await service.start({ timezone: 'Europe/Moscow', initialSeconds: paused.session.timerSeconds });
assert.equal(resumed.session.id, first.session.id);
assert.equal(resumed.created, false);
assert.equal(resumed.session.initialSeconds, 2710);
assert.equal(store.sessions.filter((session) => !session.archived).length, 1);

clock = new Date('2026-07-11T10:00:08.000Z');
const resumedPause = await service.pause({ sessionId: resumed.session.id });
assert.equal(resumedPause.session.durationSeconds, 2718);
assert.equal(resumedPause.session.timerSeconds, 2718);

clock = new Date('2026-07-11T10:05:00.000Z');
const restartedAfterStop = await service.start({ timezone: 'Europe/Moscow', initialSeconds: 0 });
assert.equal(restartedAfterStop.session.id, first.session.id);
assert.equal(restartedAfterStop.session.initialSeconds, 0);
clock = new Date('2026-07-11T10:05:05.000Z');
const restartedStop = await service.pause({ sessionId: restartedAfterStop.session.id });
assert.equal(restartedStop.session.durationSeconds, 2723);
assert.equal(restartedStop.session.timerSeconds, 5);
assert.equal(store.sessions.filter((session) => !session.archived).length, 1);
assert.equal((await service.stats({ timezone: 'Europe/Moscow', from: '2026-07-11', to: '2026-07-11' })).totalSeconds, 2723);

const midnightStore = fakeStore();
let midnightClock = new Date('2026-07-11T20:59:50.000Z');
const midnightService = createWorkSessionService({ store: midnightStore, now: () => new Date(midnightClock), logger: { info() {}, warn() {} }, settle: async () => {} });
const beforeMidnight = await midnightService.start({ timezone: 'Europe/Moscow' });
assert.equal(beforeMidnight.session.dateKey, '2026-07-11');

midnightClock = new Date('2026-07-11T21:00:05.000Z');
const rolled = await midnightService.rollover({ sessionId: beforeMidnight.session.id });
assert.equal(rolled.rolledOver, true);
assert.equal(rolled.session.dateKey, '2026-07-12');
assert.equal(rolled.session.sessionCode, 'S-2');
assert.equal(rolled.session.startedAt, '2026-07-11T21:00:00.000Z');
assert.equal(rolled.session.initialSeconds, 10);
assert.equal(rolled.session.initialSeconds + 5, 15);
const previousDay = midnightStore.sessions.find((session) => session.id === beforeMidnight.session.id);
assert.equal(previousDay.status, 'Finished');
assert.equal(previousDay.endedAt, '2026-07-11T21:00:00.000Z');
assert.equal(previousDay.durationSeconds, 10);
assert.equal(previousDay.timerSeconds, 10);

midnightClock = new Date('2026-07-11T21:00:08.000Z');
const afterMidnightStop = await midnightService.pause({ sessionId: rolled.session.id });
assert.equal(afterMidnightStop.session.durationSeconds, 8);
assert.equal(afterMidnightStop.session.timerSeconds, 18);
assert.equal(midnightStore.sessions.filter((session) => !session.archived).length, 2);
const midnightStats = await midnightService.stats({ timezone: 'Europe/Moscow', from: '2026-07-11', to: '2026-07-12' });
assert.deepEqual(midnightStats.days.map((day) => ({ dateKey: day.dateKey, totalSeconds: day.totalSeconds })), [
  { dateKey: '2026-07-11', totalSeconds: 10 },
  { dateKey: '2026-07-12', totalSeconds: 8 },
]);

midnightClock = new Date('2026-07-11T21:05:00.000Z');
const sameNewDay = await midnightService.start({ timezone: 'Europe/Moscow', initialSeconds: 0 });
assert.equal(sameNewDay.session.id, rolled.session.id);
midnightClock = new Date('2026-07-11T21:05:02.000Z');
const sameNewDayStop = await midnightService.pause({ sessionId: sameNewDay.session.id });
assert.equal(sameNewDayStop.session.durationSeconds, 10);
assert.equal(sameNewDayStop.session.timerSeconds, 2);
assert.equal(midnightStore.sessions.filter((session) => !session.archived).length, 2);

console.log('LifeMap work session integration tests passed.');
