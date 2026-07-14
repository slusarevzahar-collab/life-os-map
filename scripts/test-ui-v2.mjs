import assert from 'node:assert/strict';
import { buildVisualTree, deriveMetric, INBOX_SPHERE_ID } from '../src/ui-v2/adapters/lifeMapUiAdapter.js';
import { attachCustomObjects } from '../src/ui-v2/adapters/localMapExtensions.js';
import { isValidLifeMapSnapshot, readCachedSnapshot, SNAPSHOT_CACHE_KEY } from '../src/ui-v2/data/useLifeMapSnapshot.js';

let assertions = 0;
function check(condition, message) {
  assertions += 1;
  assert.ok(condition, message);
}

function branch(id, children = [], taskList = []) {
  return { id, title: id, kind: 'branch', children, taskList, progress: 0, totalTasks: taskList.length };
}

for (const count of [0, 1, 3, 8, 12]) {
  const children = Array.from({ length: count }, (_, index) => branch(`branch-${index}`));
  const visual = buildVisualTree(branch('root', children));
  check(visual.root.planets.length === count, `${count} branches must all be placed`);
  check(new Set(visual.root.planets.map((item) => item.id)).size === count, `${count} branches must have unique slots`);
  check(children.every((item) => visual[item.id]), `${count} branches must remain addressable`);
}

const leaf = { id: 'task-1', title: 'Leaf', kind: 'task', state: 'next', progress: 0 };
const withLeaf = buildVisualTree(branch('root', [branch('project', [], [leaf]), leaf]));
check(withLeaf.root.planets.length === 1, 'leaf tasks must not become planets');
check(deriveMetric({ taskList: [{ id: 'a', state: 'done' }, { id: 'b', state: 'next' }] }) === '1/2 готово', 'task metric must use real completion counts');

const withInbox = buildVisualTree(branch('root', [branch(INBOX_SPHERE_ID), branch('visible')]));
check(!withInbox.root.planets.some((item) => item.id === INBOX_SPHERE_ID), 'Inbox must stay out of the root orbit');
check(Boolean(withInbox[INBOX_SPHERE_ID]), 'Inbox must remain addressable in the flat map');

const localRoot = attachCustomObjects(branch('root', [branch('server-first')]), {
  root: [{ id: 'local-last', title: 'Local last', createdAt: '2026-07-14T00:00:00.000Z' }],
});
check(localRoot.children.map((item) => item.id).join(',') === 'server-first,local-last', 'local objects must append after server objects');

const validSnapshot = {
  meta: { source: 'notion-live' }, currentFocus: {}, goals: [], tasks: [], sessions: [], projectAreas: [], dreams: [], signals: [],
};
check(isValidLifeMapSnapshot(validSnapshot), 'valid snapshot shape must be accepted');
check(!isValidLifeMapSnapshot({ meta: {}, currentFocus: {}, tasks: [] }), 'partial snapshot must be rejected');
const storage = { getItem: (key) => key === SNAPSHOT_CACHE_KEY ? JSON.stringify({ version: 1, savedAt: 'now', snapshot: validSnapshot }) : null };
check(readCachedSnapshot(storage)?.snapshot?.meta?.source === 'notion-live', 'cache reader must deserialize a valid versioned snapshot');
check(readCachedSnapshot({ getItem: () => JSON.stringify({ version: 1, snapshot: { ...validSnapshot, meta: { source: 'mock' } } }) }) === null, 'mock snapshots must never enter last-good mode');

console.log(`UI V2 model assertions passed: ${assertions}`);
