import {
  archiveDuplicateSignals,
  createWorkSession,
  updateItemTitle,
  updateTaskEvent,
} from './notionAdapter.js';
import { telegramApi } from './telegramAdapter.js';
import { EXECUTABLE_ACTIONS } from './lifemapAiPolicy.js';
import { requireLifeMapAccess, requireTrustedWrite } from './requestTrust.js';

const EXECUTABLE = new Set(EXECUTABLE_ACTIONS);

function enforceActionConfirmation(actions = []) {
  return actions.map((action) => {
    const type = String(action?.type || action.name || '');
    return EXECUTABLE.has(type) ? { ...action, requiresConfirmation: true } : action;
  });
}

function safeFilename(value = 'attachment') {
  return String(value || 'attachment').replace(/[\r\n"\\/]/g, '_').slice(0, 180) || 'attachment';
}

function noStore(res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
}

export function registerCoreRoutes(app, runtime) {
  const {
    config,
    ai,
    buildLiveSnapshot,
    executeActions,
    assistantSecretOk,
    listInboxAssets,
    inboxSignal,
    startInboxReprocessJob,
    inboxReprocessJobStatus,
    workSessions,
  } = runtime;

  app.get('/api/life-os/snapshot', async (req, res) => {
    if (!requireLifeMapAccess(req, res, assistantSecretOk)) return;
    noStore(res);
    try { res.json(await buildLiveSnapshot()); }
    catch (error) { res.status(500).json({ ok: false, error: 'Failed to build LifeMap snapshot', details: error.message }); }
  });

  app.get('/api/life-os/data-health', async (req, res) => {
    if (!requireLifeMapAccess(req, res, assistantSecretOk)) return;
    noStore(res);
    try {
      const snapshot = await buildLiveSnapshot();
      const counts = snapshot.meta?.dataQuality?.counts || {
        tasks: snapshot.tasks?.length || 0,
        goals: snapshot.goals?.length || 0,
        sessions: snapshot.sessions?.length || 0,
        projectAreas: snapshot.projectAreas?.length || 0,
        dreams: snapshot.dreams?.length || 0,
        signals: snapshot.signals?.length || 0,
      };
      res.json({
        ok: true,
        source: snapshot.meta?.source || 'unknown',
        version: snapshot.meta?.version || '',
        connected: snapshot.meta?.connected || {},
        counts,
        dataQuality: snapshot.meta?.dataQuality || {},
        warningCount: snapshot.meta?.warnings?.length || 0,
        noticeCount: snapshot.meta?.notices?.length || 0,
        checkedAt: new Date().toISOString(),
      });
    } catch (_error) {
      res.status(500).json({ ok: false, error: 'LifeMap data health check failed.' });
    }
  });

  app.post('/api/life-os/work-sessions/start', async (req, res) => {
    if (!requireLifeMapAccess(req, res, assistantSecretOk)) return;
    noStore(res);
    try {
      const result = await workSessions.start({
        timezone: req.body?.timezone,
        projectId: req.body?.projectId,
        project: req.body?.project,
        taskId: req.body?.taskId,
        title: req.body?.title,
      });
      res.status(result.created ? 201 : 200).json({ ok: true, ...result });
    } catch (error) {
      res.status(/invalid|missing|required/i.test(error.message) ? 400 : 500).json({ ok: false, error: 'Не удалось начать рабочую сессию.', details: error.message });
    }
  });

  app.post('/api/life-os/work-sessions/pause', async (req, res) => {
    if (!requireLifeMapAccess(req, res, assistantSecretOk)) return;
    noStore(res);
    try { res.json({ ok: true, ...(await workSessions.pause({ sessionId: req.body?.sessionId })) }); }
    catch (error) { res.status(500).json({ ok: false, error: 'Не удалось завершить рабочую сессию.', details: error.message }); }
  });

  app.get('/api/life-os/work-sessions/active', async (req, res) => {
    if (!requireLifeMapAccess(req, res, assistantSecretOk)) return;
    noStore(res);
    try {
      const [session, lastSession] = await Promise.all([
        workSessions.getActive({ logRestore: true }),
        workSessions.getLastCompleted(),
      ]);
      res.json({ ok: true, session, lastSession });
    }
    catch (error) { res.status(500).json({ ok: false, error: 'Не удалось восстановить рабочую сессию.', details: error.message }); }
  });

  app.get('/api/life-os/work-sessions/stats', async (req, res) => {
    if (!requireLifeMapAccess(req, res, assistantSecretOk)) return;
    noStore(res);
    try { res.json({ ok: true, stats: await workSessions.stats({ timezone: req.query.timezone || config.defaultTimezone, from: req.query.from, to: req.query.to }) }); }
    catch (error) { res.status(/invalid|must not/i.test(error.message) ? 400 : 500).json({ ok: false, error: 'Не удалось получить статистику рабочего времени.', details: error.message }); }
  });

  app.get('/api/life-os/work-sessions/context', async (req, res) => {
    if (!requireLifeMapAccess(req, res, assistantSecretOk)) return;
    noStore(res);
    try { res.json({ ok: true, context: await workSessions.context({ timezone: req.query.timezone || config.defaultTimezone, days: req.query.days }) }); }
    catch (error) { res.status(/invalid/i.test(error.message) ? 400 : 500).json({ ok: false, error: 'Не удалось получить контекст рабочего времени.', details: error.message }); }
  });

  app.post('/api/life-os/sessions', async (req, res) => {
    if (!requireTrustedWrite(req, res, assistantSecretOk)) return;
    try {
      const session = await createWorkSession({ notionToken: config.notionToken, sessionsDbId: config.sessionsDbId, payload: req.body || {} });
      res.status(201).json({ ok: true, session });
    } catch (error) { res.status(500).json({ ok: false, error: error.message }); }
  });

  app.patch('/api/life-os/tasks/:id', async (req, res) => {
    if (!requireTrustedWrite(req, res, assistantSecretOk)) return;
    try {
      const task = await updateTaskEvent({ notionToken: config.notionToken, taskId: req.params.id, event: req.body || {} });
      res.json({ ok: true, task });
    } catch (error) { res.status(500).json({ ok: false, error: error.message }); }
  });

  app.patch('/api/life-os/items/:id/title', async (req, res) => {
    if (!requireTrustedWrite(req, res, assistantSecretOk)) return;
    try {
      const item = await updateItemTitle({ notionToken: config.notionToken, itemId: req.params.id, kind: req.body?.kind, title: req.body?.title });
      res.json({ ok: true, item });
    } catch (error) { res.status(500).json({ ok: false, error: error.message }); }
  });

  app.post('/api/life-os/signals/dedupe', async (req, res) => {
    if (!requireTrustedWrite(req, res, assistantSecretOk)) return;
    try {
      const result = await archiveDuplicateSignals({ notionToken: config.notionToken, signalsDbId: config.signalsDbId });
      res.json({ ok: true, result });
    } catch (error) { res.status(500).json({ ok: false, error: error.message }); }
  });

  app.get('/api/life-os/inbox/assets', async (req, res) => {
    if (!requireLifeMapAccess(req, res, assistantSecretOk)) return;
    noStore(res);
    try { res.json({ ok: true, signals: await listInboxAssets() }); }
    catch (error) { res.status(500).json({ ok: false, error: error.message }); }
  });

  app.post('/api/life-os/inbox/reprocess', async (req, res) => {
    if (!requireTrustedWrite(req, res, assistantSecretOk)) return;
    try {
      const job = await startInboxReprocessJob({ onlyMissing: req.body?.onlyMissing !== false });
      res.status(202).json({ ok: true, job });
    } catch (error) { res.status(500).json({ ok: false, error: error.message }); }
  });

  app.get('/api/life-os/inbox/reprocess/status', (req, res) => {
    if (!requireLifeMapAccess(req, res, assistantSecretOk)) return;
    noStore(res);
    res.json({ ok: true, job: inboxReprocessJobStatus() });
  });

  app.get('/api/life-os/inbox/files/:signalId', async (req, res) => {
    if (!requireLifeMapAccess(req, res, assistantSecretOk)) return;
    try {
      if (!config.telegramBotToken) throw new Error('TELEGRAM_BOT_TOKEN is missing.');
      const signal = await inboxSignal(req.params.signalId);
      const attachment = signal?.attachment;
      if (!attachment?.fileId) {
        res.status(404).json({ ok: false, error: 'Direct download is unavailable for this old attachment. Open the original Telegram post instead.' });
        return;
      }
      const fileInfo = await telegramApi(config.telegramBotToken, 'getFile', { file_id: attachment.fileId });
      const filePath = fileInfo?.result?.file_path;
      if (!filePath) throw new Error('Telegram did not return a file path.');
      const upstream = await fetch(`https://api.telegram.org/file/bot${config.telegramBotToken}/${filePath}`);
      if (!upstream.ok) throw new Error(`Telegram file download failed: ${upstream.status}`);
      const buffer = Buffer.from(await upstream.arrayBuffer());
      res.setHeader('Content-Type', attachment.mimeType || upstream.headers.get('content-type') || 'application/octet-stream');
      res.setHeader('Content-Length', String(buffer.length));
      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename(attachment.fileName)}"`);
      res.setHeader('Cache-Control', 'private, no-store');
      res.send(buffer);
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.get('/api/life-os/assistant/status', (req, res) => {
    if (!requireLifeMapAccess(req, res, assistantSecretOk)) return;
    noStore(res);
    res.json({ ok: true, ...ai.status(), executionProtected: true, chatProtected: true, privateReadsProtected: true, canExecuteActions: Boolean(config.assistantSecret) });
  });

  app.post('/api/life-os/assistant/chat', async (req, res) => {
    if (!requireLifeMapAccess(req, res, assistantSecretOk)) return;
    noStore(res);
    try {
      const snapshot = await buildLiveSnapshot();
      const assistant = await ai.chat({ message: req.body?.message || '', messages: req.body?.messages || [], target: req.body?.target || {}, clientContext: req.body?.context || {}, snapshot });
      const actions = enforceActionConfirmation(assistant.proposedActions || []);
      const executedActions = req.body?.executeActions === true ? await executeActions({ actions, req }) : [];
      res.json({ ok: true, assistant: { ...assistant, proposedActions: actions }, executedActions, snapshotMeta: snapshot.meta });
    } catch (error) { res.status(500).json({ ok: false, error: error.message }); }
  });

  app.post('/api/life-os/assistant/actions', async (req, res) => {
    if (!requireTrustedWrite(req, res, assistantSecretOk)) return;
    try {
      const actions = enforceActionConfirmation(req.body?.actions || []);
      res.json({ ok: true, executedActions: await executeActions({ actions, req }) });
    } catch (error) { res.status(500).json({ ok: false, error: error.message }); }
  });

  app.get('/api/life-os/health', (_req, res) => {
    noStore(res);
    const reprocess = inboxReprocessJobStatus();
    res.json({
      ok: true,
      service: 'lifemap-api',
      port: config.port,
      envLoaded: config.envLoaded,
      notion: {
        token: Boolean(config.notionToken), tasks: Boolean(config.tasksDbId), goals: Boolean(config.goalsDbId), sessions: Boolean(config.sessionsDbId), projects: Boolean(config.projectsDbId), dreams: Boolean(config.dreamsDbId), signals: Boolean(config.signalsDbId),
      },
      telegram: { token: Boolean(config.telegramBotToken), secret: Boolean(config.telegramWebhookSecret), allowedUsersLocked: Boolean(config.telegramAllowedUserIds) },
      assistant: { configured: ai.status().configured, actionSecret: Boolean(config.assistantSecret), chatProtected: true, privateReadsProtected: true },
      inboxReprocess: { status: reprocess.status, total: reprocess.total, processed: reprocess.processed, failed: reprocess.failed },
    });
  });
}
