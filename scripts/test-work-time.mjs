import assert from 'node:assert/strict';
import { dateKeyAt, durationSeconds, formatDuration, splitIntervalByLocalDay, summarizeWorkSessions } from '../server/workTime.js';
import { createTimerSyncMessage, parseTimerSyncMessage } from '../src/hooks/useWorkTimer.js';
import { sessionContext } from '../src/services/workTimerService.js';

const clickEvent = {};
clickEvent.currentTarget = clickEvent;
assert.deepEqual(sessionContext(clickEvent), {});
assert.deepEqual(sessionContext({ project: 'LifeMap', taskId: 'task-1', ignored: clickEvent }), { project: 'LifeMap', taskId: 'task-1' });

const pausedMessage = createTimerSyncMessage('paused', { lastSessionSeconds: 125 }, 123456);
assert.deepEqual(pausedMessage, { type: 'timer-state', state: 'paused', lastSessionSeconds: 125, at: 123456 });
assert.deepEqual(parseTimerSyncMessage(JSON.stringify(pausedMessage)), pausedMessage);
assert.equal(parseTimerSyncMessage('{broken'), null);
assert.equal(parseTimerSyncMessage({ type: 'changed' }), null);

assert.equal(durationSeconds('2026-07-11T10:00:00.000Z', '2026-07-11T11:02:03.900Z'), 3723);
assert.equal(durationSeconds('2026-07-11T11:00:00.000Z', '2026-07-11T10:00:00.000Z'), 0);
assert.equal(formatDuration(3723), '01:02:03');
assert.equal(formatDuration(-50), '00:00:00');
assert.equal(dateKeyAt('2026-07-10T21:30:00.000Z', 'Europe/Moscow'), '2026-07-11');

const midnight = splitIntervalByLocalDay('2026-07-10T20:30:00.000Z', '2026-07-10T21:30:00.000Z', 'Europe/Moscow');
assert.deepEqual(midnight, [
  { dateKey: '2026-07-10', seconds: 1800 },
  { dateKey: '2026-07-11', seconds: 1800 },
]);

const dst = splitIntervalByLocalDay('2026-03-08T06:30:00.000Z', '2026-03-08T07:30:00.000Z', 'America/New_York');
assert.deepEqual(dst, [{ dateKey: '2026-03-08', seconds: 3600 }]);

const summary = summarizeWorkSessions([
  { id: 'finished', status: 'Finished', startedAt: '2026-07-11T06:00:00.000Z', finishedAt: '2026-07-11T07:00:00.000Z' },
  { id: 'active', status: 'Active', startedAt: '2026-07-11T08:00:00.000Z', finishedAt: null },
], { timezone: 'Europe/Moscow', from: '2026-07-11', to: '2026-07-11', now: new Date('2026-07-11T08:30:00.000Z') });
assert.equal(summary.totalSeconds, 5400);
assert.equal(summary.days[0].completedSeconds, 3600);
assert.equal(summary.days[0].activeSeconds, 1800);
assert.equal(summary.completedSessionCount, 1);
assert.equal(summary.activeSessionCount, 1);

console.log('LifeMap work time unit tests passed.');
