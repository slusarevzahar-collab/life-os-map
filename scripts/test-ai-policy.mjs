import assert from 'node:assert/strict';
import { compactForAssistant, sanitizeTextForAi } from '../server/aiPrivacy.js';
import { buildAssistantSystemPrompt, buildInboxSystemPrompt } from '../server/aiPrompts.js';
import { createLifeMapAiService } from '../server/lifemapAi.js';
import { AI_POLICY_VERSION } from '../server/lifemapAiPolicy.js';

const masked = sanitizeTextForAi('EMAIL=test@example.com PHONE=+7 999 123-45-67 ACCESS_TOKEN=very-secret-value');
assert(!masked.includes('test@example.com'));
assert(!masked.includes('+7 999 123-45-67'));
assert(!masked.includes('very-secret-value'));

const snapshot = {
  currentFocus: { id: 'focus-1', title: 'Current task', project: 'LifeMap', status: 'Now', nextAction: 'Test AI' },
  planning: { onTrack: 1, next: 2, waiting: 0, overdue: 0, done: 3 },
  tasks: Array.from({ length: 30 }, (_, index) => ({ id: `task-${index}`, title: `Task ${index}`, project: 'LifeMap', priority: index + 1 })),
  goals: Array.from({ length: 20 }, (_, index) => ({ id: `goal-${index}`, title: `Goal ${index}` })),
  signals: Array.from({ length: 20 }, (_, index) => ({ id: `signal-${index}`, title: `Signal ${index}`, status: 'Inbox' })),
  projectAreas: [{ name: 'LifeMap' }],
};

const compact = compactForAssistant(snapshot, { project: 'LifeMap' });
assert(compact.tasks.length <= 16);
assert(compact.goals.length <= 10);
assert(compact.signals.length <= 8);

const assistantPrompt = buildAssistantSystemPrompt();
assert(assistantPrompt.includes('Обращайся к Захару на «ты»'));
assert(assistantPrompt.includes('Не повторяй одну и ту же сводку'));
assert(assistantPrompt.includes(`POLICY_VERSION=${AI_POLICY_VERSION}`));

const inboxPrompt = buildInboxSystemPrompt(['LifeMap']);
assert(inboxPrompt.includes('ИЗВЛЕЧЕНИЕ ASSETS'));
assert(inboxPrompt.includes('Prompt|Tool|Workflow|Task|Research|Idea|Reference'));
assert(inboxPrompt.includes('Один входящий пост может содержать несколько разных сущностей'));

const ai = createLifeMapAiService({});
assert.equal(ai.status().configured, false);
const fallback = await ai.chat({ message: 'Что дальше?', snapshot });
assert.equal(fallback.provider, 'deterministic-fallback');
assert(Array.isArray(fallback.proposedActions));

console.log('LifeMap AI policy tests passed.');
