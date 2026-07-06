import {
  archiveDuplicateSignals,
  createWorkSession,
  updateItemTitle,
  updateTaskEvent,
} from './notionAdapter.js';
import { EXECUTABLE_ACTIONS } from './lifemapAiPolicy.js';

const EXECUTABLE = new Set(EXECUTABLE_ACTIONS);

function enforceActionConfirmation(actions = []) {
  return actions.map((action) => {
    const type = String(action?.type || action?.name || '');
    return EXECUTABLE.has(type) ? { ...action, requiresConfirmation: true } : action;
  });
}

export function registerCoreRoutes(app, runtime) {
  const { config, ai, buildLiveSnapshot, executeActions, makeMockResponse, prepareSnapshot } = runtime;

  app.get('/api/life-os/snapshot', async (_req, res) => {
    try {
      res.json(await buildLiveSnapshot());
    } catch (error) {
      res.status(500).json({
        error: 'Failed to build LifeMap snapshot',
        details: error.message,
        fallback: prepareSnapshot(makeMockResponse(error.message)),
      });
    }
  });

  app.post('/api/life-os/sessions', async (req, res) => {
    try {
      const session = await createWorkSession({
        notionToken: config.notionToken,
        sessionsDbId: config.sessionsDbId,
        payload: req.body || {},
      });
      res.status(201).json({ ok: true, session });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.patch('/api/life-os/tasks/:id', async (req, res) => {
    try {
      const task = await updateTaskEvent({
        notionToken: config.notionToken,
        taskId: req.params.id,
        event: req.body || {},
      });
      res.json({ ok: true, task });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.patch('/api/life-os/items/:id/title', async (req, res) => {
    try {
      const item = await updateItemTitle({
        notionToken: config.notionToken,
        itemId: req.params.id,
        kind: req.body?.kind,
        title: req.body?.title,
      });
      res.json({ ok: true, item });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.post('/api/life-os/signals/dedupe', async (_req, res) => {
    try {
      const result = await archiveDuplicateSignals({
        notionToken: config.notionToken,
        signalsDbId: config.signalsDbId,
      });
      res.json({ ok: true, result });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.get('/api/life-os/assistant/status', (_req, res) => {
    res.json({
      ok: true,
      ...ai.status(),
      executionProtected: true,
      canExecuteActions: Boolean(config.assistantSecret),
    });
  });

  app.post('/api/life-os/assistant/chat', async (req, res) => {
    try {
      const snapshot = await buildLiveSnapshot();
      const assistant = await ai.chat({
        message: req.body?.message || '',
        messages: req.body?.messages || [],
        target: req.body?.target || {},
        clientContext: req.body?.context || {},
        snapshot,
      });
      const actions = enforceActionConfirmation(assistant.proposedActions || []);
      const executedActions = req.body?.executeActions === true
        ? await executeActions({ actions, req })
        : [];
      res.json({ ok: true, assistant: { ...assistant, proposedActions: actions }, executedActions, snapshotMeta: snapshot.meta });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.post('/api/life-os/assistant/actions', async (req, res) => {
    try {
      const actions = enforceActionConfirmation(req.body?.actions || []);
      const executedActions = await executeActions({ actions, req });
      res.json({ ok: true, executedActions });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.get('/api/life-os/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'lifemap-api',
      port: config.port,
      envLoaded: config.envLoaded,
      notion: {
        token: Boolean(config.notionToken),
        tasks: Boolean(config.tasksDbId),
        goals: Boolean(config.goalsDbId),
        sessions: Boolean(config.sessionsDbId),
        projects: Boolean(config.projectsDbId),
        dreams: Boolean(config.dreamsDbId),
        signals: Boolean(config.signalsDbId),
      },
      telegram: {
        token: Boolean(config.telegramBotToken),
        secret: Boolean(config.telegramWebhookSecret),
        allowedUsersLocked: Boolean(config.telegramAllowedUserIds),
      },
      assistant: {
        ...ai.status(),
        actionSecret: Boolean(config.assistantSecret),
      },
    });
  });
}
