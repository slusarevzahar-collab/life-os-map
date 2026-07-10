import assert from 'node:assert/strict';
import { buildActionMap, findNode } from '../src/lib/actionMapModel.js';
import { dedupeInboxSignals, encodeLifeMapSecretHeader } from '../src/lib/lifeMapRuntime.js';
import { listItems, topItems } from '../src/lib/lifeMapSelectors.js';
import { compactForAssistant } from '../server/aiPrivacy.js';
import { decodeLifeMapSecretHeader } from '../server/lifemapRuntime.js';

const snapshot = {
  meta: {
    source: 'test',
    dataQuality: {
      counts: { tasks: 2, goals: 2, sessions: 2, projectAreas: 2, dreams: 2, signals: 1 },
      unlinkedSessions: 0,
      standaloneSessions: 1,
      tasksWithoutNextAction: 0,
      goalsWithoutSuccessCriteria: 0,
      goalsWithoutWhy: 0,
      linkedDreams: 1,
      hiddenDreams: 1,
      signalsMissingAnalysis: 0,
    },
  },
  currentFocus: { id: 'task-1', title: 'Review LifeMap data', project: 'LifeMap', status: 'Now', progress: 65, nextAction: 'Verify Notion visibility' },
  tasks: [
    {
      id: 'task-1', code: 'LM-101', title: 'Review LifeMap data', project: 'LifeMap', goalName: 'Reliable LifeMap', goalIds: ['goal-1'],
      status: 'Now', type: 'System', energy: 'High', progress: 65, priority: 1, nextAction: 'Verify Notion visibility',
      sessionCount: 1, sessionDurationMin: 45, lastSessionResult: 'Mapped missing fields', lastSessionNextStep: 'Run regression tests',
    },
    { id: 'task-2', code: 'SD-201', title: 'Sleda research', project: 'Sleda.net', goalName: '', goalIds: [], status: 'Next', progress: 20, priority: 2, nextAction: 'Collect sources' },
  ],
  goals: [
    { id: 'goal-1', title: 'Reliable LifeMap', area: 'LifeMap', status: 'Active', horizon: '1 month', progress: 50, targetDate: '2026-08-01', why: 'Trust the system', successCriteria: 'All core DB data is visible', nextAction: 'Finish review' },
    { id: 'goal-2', title: 'Goal without tasks', area: 'Learning', status: 'Next', horizon: '6 months', progress: 0, why: 'Still important', successCriteria: 'Defined later', nextAction: 'Clarify scope' },
  ],
  sessions: [
    { id: 'session-1', title: 'Data review', task: 'Review LifeMap data', taskCode: 'LM-101', taskIds: ['task-1'], project: 'LifeMap', scope: 'Task', status: 'Finished', energy: 'High', startedAt: '2026-07-10T09:00:00Z', finishedAt: '2026-07-10T09:45:00Z', durationMin: 45, result: 'Mapped missing fields', nextStep: 'Run regression tests' },
    { id: 'session-2', title: 'Historical architecture review', task: '', taskCode: '', taskIds: [], project: 'LifeMap', scope: 'Historical', status: 'Finished', energy: 'Medium', startedAt: '2026-06-01T09:00:00Z', finishedAt: '2026-06-01T09:30:00Z', durationMin: 30, result: 'Architecture captured', nextStep: '' },
  ],
  projectAreas: [
    { id: 'project-lm', name: 'LifeMap', type: 'Meta-system', status: 'Active', focusLevel: 'Primary', goal: 'Personal operating system', currentState: 'Reviewing data layer', nextAction: 'Finish audit', why: 'Source of truth' },
    { id: 'project-sd', name: 'Sleda.net', type: 'Project', status: 'Active', focusLevel: 'Secondary', goal: 'Research product', currentState: 'Discovery', nextAction: 'Collect sources', why: 'Product direction' },
  ],
  dreams: [
    { id: 'dream-1', title: 'AI mastery', type: 'Dream', status: 'Active', visibility: 'Focus', lifeSphere: 'Skills & Learning', linkedProject: 'LifeMap', nextStep: 'Practice daily', why: 'Professional freedom', targetDate: '2027-01-01' },
    { id: 'dream-2', title: 'Long trip', type: 'Dream', status: 'Someday', visibility: 'Hidden until later', lifeSphere: 'Travel & Places', linkedProject: '', nextStep: 'Return later', why: 'See the world' },
  ],
  signals: [
    { id: 'signal-1', title: 'Useful workflow', type: 'Research', status: 'Processed', priority: 'Normal', relatedProjects: ['LifeMap'], summary: 'Workflow details', assistantNote: 'Directly useful for current data review.', possibleUse: 'Apply to LifeMap', nextAction: '', assets: [{ kind: 'Workflow', category: 'Автоматизация', title: 'Audit flow', description: 'Repeatable audit', suggestedUse: 'LifeMap review' }], aiProcessingVersion: 'test' },
  ],
  planning: { onTrack: 1, next: 1, waiting: 0, overdue: 0, done: 0 },
};

const map = buildActionMap(snapshot);
assert(findNode(map, 'sphere-sessions').children.some((item) => item.kind === 'session'));
assert(findNode(map, 'goal-goal-2').title === 'Goal without tasks');
assert(findNode(map, 'task-task-1').progress === 65);
assert(findNode(map, 'task-task-1').details.some((item) => String(item).includes('Сессий: 1')));
assert(findNode(map, 'project-lifemap').children.some((item) => item.id === 'dream-dream-1'));
assert(findNode(map, 'sphere-backlog').children.some((item) => item.id === 'dream-dream-2'));
const projects = findNode(map, 'sphere-projects').children;
assert.equal(projects[0].title, 'LifeMap');

const inboxSphere = findNode(map, 'sphere-inbox');
assert.equal(topItems(inboxSphere).length, 0);
assert.equal(listItems(inboxSphere).length, 1);
assert.equal(listItems(inboxSphere)[0].kind, 'signal');
assert.equal(listItems(inboxSphere)[0].sourceId, 'signal-1');

const assistant = compactForAssistant(snapshot, { project: 'LifeMap' });
assert.equal(assistant.goals[0].why, 'Trust the system');
assert.equal(assistant.goals[0].successCriteria, 'All core DB data is visible');
assert.equal(assistant.sessions[0].result, 'Mapped missing fields');
assert.equal(assistant.sessions[0].scope, 'Task');
assert.equal(assistant.projectAreas[0].focusLevel, 'Primary');
assert.equal(assistant.dreams[0].linkedProject, 'LifeMap');
assert.equal(assistant.tasks[0].sessionCount, 1);
assert.equal(assistant.dataQuality.counts.sessions, 2);
assert.equal(assistant.dataQuality.standaloneSessions, 1);

const duplicateSignals = dedupeInboxSignals([
  { id: 'old-copy', title: 'Same signal', sourceUrl: 'https://t.me/source/1', status: 'Archived', summary: 'old', aiProcessingVersion: 'v1' },
  { id: 'live-copy', title: 'Same signal', sourceUrl: 'https://t.me/source/1', status: 'New', summary: 'current', aiProcessingVersion: 'v1' },
]);
assert.equal(duplicateSignals.length, 1);
assert.equal(duplicateSignals[0].id, 'live-copy');

const unicodeSecret = 'Ключ LifeMap — Захар 🔐';
const encodedSecret = encodeLifeMapSecretHeader(unicodeSecret);
assert(encodedSecret.startsWith('uri:'));
assert(/^[\x00-\x7F]+$/.test(encodedSecret));
assert.equal(decodeLifeMapSecretHeader(encodedSecret), unicodeSecret);
assert.equal(decodeLifeMapSecretHeader('legacy-ascii-secret'), 'legacy-ascii-secret');
assert.equal(decodeLifeMapSecretHeader('uri:%E0%A4%A'), '');

console.log('LifeMap data model regression tests passed.');