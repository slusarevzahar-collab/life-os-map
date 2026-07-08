import assert from 'node:assert/strict';
import { buildSafeInboxPayload, compactForAssistant, sanitizeTextForAi } from '../server/aiPrivacy.js';
import { buildAssistantSystemPrompt, buildInboxSystemPrompt } from '../server/aiPrompts.js';
import { createLifeMapAiService } from '../server/lifemapAi.js';
import { AI_POLICY_VERSION } from '../server/lifemapAiPolicy.js';

const masked = sanitizeTextForAi('EMAIL=test@example.com PHONE=+7 999 123-45-67 ACCESS_TOKEN=very-secret-value');
assert(!masked.includes('test@example.com'));
assert(!masked.includes('+7 999 123-45-67'));
assert(!masked.includes('very-secret-value'));

const snapshot = {
  currentFocus: { id: 'focus-1', title: 'Improve AI Inbox relevance', project: 'LifeMap', status: 'Now', nextAction: 'Rank useful prompts and tools' },
  planning: { onTrack: 1, next: 2, waiting: 0, overdue: 0, done: 3 },
  tasks: Array.from({ length: 30 }, (_, index) => ({ id: `task-${index}`, title: `Task ${index}`, project: index < 12 ? 'LifeMap' : 'Other', status: index === 29 ? 'Done' : 'Next', priority: index + 1, nextAction: `Action ${index}` })),
  goals: Array.from({ length: 20 }, (_, index) => ({ id: `goal-${index}`, title: `Goal ${index}` })),
  signals: Array.from({ length: 20 }, (_, index) => ({ id: `signal-${index}`, title: `Signal ${index}`, status: 'Inbox' })),
  projectAreas: [{ name: 'LifeMap' }],
};

const compact = compactForAssistant(snapshot, { project: 'LifeMap' });
assert(compact.tasks.length <= 16);
assert(compact.goals.length <= 10);
assert(compact.signals.length <= 8);

const assistantPrompt = buildAssistantSystemPrompt();
assert(assistantPrompt.includes('Обращайся на «ты»'));
assert(assistantPrompt.includes('Не повторяй фокус'));
assert(assistantPrompt.includes(`POLICY_VERSION=${AI_POLICY_VERSION}`));

const inboxPrompt = buildInboxSystemPrompt(['LifeMap']);
assert(inboxPrompt.includes('Один входящий сигнал может дать 0, 1 или много отдельных assets'));
assert(inboxPrompt.includes('Prompt, Tool, Workflow, Task, Research, Idea, Reference, News, Instruction, File, Other'));
assert(inboxPrompt.includes('Запрещены банальности'));
assert(inboxPrompt.includes('конкретный проект, задачу или рабочий сценарий'));

const safeInbox = buildSafeInboxPayload({
  title: 'PDF guide',
  rawText: 'Описание материала',
  telegram: {
    document: {
      fileId: 'secret-telegram-file-id',
      fileName: 'guide.pdf',
      mimeType: 'application/pdf',
      fileSize: 42000,
    },
  },
}, snapshot);
assert.equal(safeInbox.signal.attachment.fileName, 'guide.pdf');
assert.equal(safeInbox.signal.attachment.mimeType, 'application/pdf');
assert(!JSON.stringify(safeInbox).includes('secret-telegram-file-id'));
assert(safeInbox.activeWork.length > 0);
assert(safeInbox.activeWork.length <= 6);
assert.equal(safeInbox.activeWork[0].project, 'LifeMap');

const aiWithoutProvider = createLifeMapAiService({});
assert.equal(aiWithoutProvider.status().configured, false);
const fallback = await aiWithoutProvider.chat({ message: 'Что дальше?', snapshot });
assert.equal(fallback.provider, 'deterministic-fallback');
assert(Array.isArray(fallback.proposedActions));

const aiPool = createLifeMapAiService({ GROQ_API_KEY: 'test-key' });
const poolStatus = aiPool.status();
assert.equal(poolStatus.configured, true);
assert(poolStatus.providers.filter((provider) => provider.provider === 'groq' && provider.configured).length >= 4);
assert(poolStatus.providerProfiles.inbox.length >= 3);
assert(poolStatus.providerProfiles.chat.length >= 4);
assert(poolStatus.model.includes('Groq pool'));
assert.equal(poolStatus.quotaProfiles.inbox.profile, 'inbox');
assert.equal(poolStatus.quotaProfiles.chat.profile, 'chat');
assert(poolStatus.quotaProfiles.inbox.configuredRoutes >= 3);
assert(poolStatus.quotaProfiles.chat.configuredRoutes >= 4);
assert.equal(poolStatus.quotaProfiles.chat.capacityPercent, null);

console.log('LifeMap AI policy tests passed.');
