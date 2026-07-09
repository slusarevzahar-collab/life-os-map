import { persistSignalAnalysis } from './inboxAssetStore.js';
import { createSignal } from './notionAdapter.js';
import {
  allowedTelegramUser,
  appendLocalSignal,
  buildSignalFromTelegramUpdate,
  enrichSignalWithTelegramDocument,
  getTelegramWebhookInfo,
  readLocalSignals,
  sendTelegramMessage,
  setTelegramWebhook,
} from './telegramAdapter.js';

const WEBHOOK_DEDUPE_TTL_MS = 6 * 60 * 60 * 1000;

function webhookKey(signal = {}) {
  const updateId = signal.telegram?.updateId;
  if (updateId !== undefined && updateId !== null) return `update:${updateId}`;
  return `signal:${signal.id || `${signal.telegram?.chatId || 'chat'}:${signal.telegram?.messageId || 'message'}`}`;
}

function isServerlessRuntime() {
  return Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
}

function secureIntakeReady(config = {}) {
  return Boolean(
    config.telegramBotToken &&
    config.telegramWebhookSecret &&
    config.telegramAllowedUserIds &&
    config.notionToken &&
    config.signalsDbId
  );
}

export function registerTelegramRoutes(app, runtime, { codespacesPublicUrl, deferTask = null }) {
  const { config, ai, buildLiveSnapshot, telegramSecretOk, assistantSecretOk } = runtime;
  const inFlightUpdates = new Set();
  const completedUpdates = new Map();

  function cleanupCompletedUpdates() {
    const threshold = Date.now() - WEBHOOK_DEDUPE_TTL_MS;
    completedUpdates.forEach((completedAt, key) => {
      if (completedAt < threshold) completedUpdates.delete(key);
    });
  }

  function alreadyAccepted(key) {
    cleanupCompletedUpdates();
    return inFlightUpdates.has(key) || completedUpdates.has(key);
  }

  async function persistAcceptedSignal(baseSignal) {
    if (config.notionToken && config.signalsDbId) {
      try {
        const result = await createSignal({
          notionToken: config.notionToken,
          signalsDbId: config.signalsDbId,
          payload: baseSignal,
        });
        if (!result?.id) throw new Error('Notion did not return a signal page id.');
        return { storage: 'notion', signalId: result.id };
      } catch (error) {
        if (isServerlessRuntime()) throw error;
        appendLocalSignal({ ...baseSignal, storageError: error.message });
        return { storage: 'local-fallback', signalId: '' };
      }
    }

    const error = new Error('Notion signal storage is not configured.');
    if (isServerlessRuntime()) throw error;
    appendLocalSignal({ ...baseSignal, storageError: error.message });
    return { storage: 'local-fallback', signalId: '' };
  }

  async function processAcceptedSignal(baseSignal, key, stored) {
    let signal = baseSignal;
    try {
      signal = await enrichSignalWithTelegramDocument({
        signal: baseSignal,
        botToken: config.telegramBotToken,
      });

      const snapshot = await buildLiveSnapshot();
      signal = await ai.analyzeInboxSignal({ signal, snapshot });

      if (stored.signalId) {
        await persistSignalAnalysis({
          notionToken: config.notionToken,
          signalId: stored.signalId,
          analysis: signal,
        });
      } else {
        appendLocalSignal(signal);
      }

      console.log(`LifeMap Telegram signal processed: ${signal.id} → ${stored.storage}`);
    } catch (error) {
      console.error(`LifeMap Telegram background processing failed for ${baseSignal.id}: ${error.message}`);
      if (!stored.signalId) {
        try {
          appendLocalSignal({
            ...baseSignal,
            assistantNote: 'Фоновая обработка Telegram не завершилась. Сигнал сохранён локально для восстановления.',
            storageError: error.message,
          });
        } catch (fallbackError) {
          console.error(`LifeMap Telegram local recovery failed: ${fallbackError.message}`);
        }
      }
    } finally {
      inFlightUpdates.delete(key);
      completedUpdates.set(key, Date.now());
    }
  }

  app.post('/api/telegram/webhook', async (req, res) => {
    if (isServerlessRuntime() && !secureIntakeReady(config)) {
      res.status(503).json({
        ok: false,
        accepted: false,
        retry: true,
        error: 'LM Inbox secure intake is not fully configured.',
      });
      return;
    }

    if (!telegramSecretOk(req)) {
      res.status(403).json({ ok: false, error: 'Bad Telegram webhook secret.' });
      return;
    }

    const baseSignal = buildSignalFromTelegramUpdate(req.body || {});
    if (!baseSignal) {
      res.json({ ok: true, skipped: true });
      return;
    }

    if (!allowedTelegramUser(baseSignal, config.telegramAllowedUserIds)) {
      res.json({ ok: true, rejected: true });
      return;
    }

    const key = webhookKey(baseSignal);
    if (alreadyAccepted(key)) {
      res.json({ ok: true, duplicate: true, accepted: true });
      return;
    }

    inFlightUpdates.add(key);

    let stored;
    try {
      stored = await persistAcceptedSignal(baseSignal);
    } catch (error) {
      inFlightUpdates.delete(key);
      console.error(`LifeMap Telegram durable intake failed for ${baseSignal.id}: ${error.message}`);
      res.status(503).json({ ok: false, accepted: false, retry: true, error: 'LM Inbox storage is temporarily unavailable.' });
      return;
    }

    await sendTelegramMessage({
      botToken: config.telegramBotToken,
      chatId: baseSignal.telegram?.chatId,
      text: 'Доставлено в LM Inbox',
    }).catch((error) => console.warn(`LifeMap Telegram ack failed: ${error.message}`));

    const processing = processAcceptedSignal(baseSignal, key, stored);
    if (typeof deferTask === 'function') deferTask(processing);
    else void processing;

    res.status(202).json({
      ok: true,
      accepted: true,
      durable: stored.storage === 'notion',
      storage: stored.storage,
      signalId: stored.signalId || baseSignal.id,
    });
  });

  app.post('/api/telegram/set-webhook', async (req, res) => {
    if (!assistantSecretOk(req)) {
      res.status(403).json({ ok: false, error: 'Assistant secret required.' });
      return;
    }

    try {
      const webhookUrl = req.body?.url || config.telegramWebhookUrl || codespacesPublicUrl();
      const result = await setTelegramWebhook({
        botToken: config.telegramBotToken,
        webhookUrl,
        secretToken: config.telegramWebhookSecret,
      });
      res.json({ ok: true, webhookUrl, result });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.get('/api/telegram/status', async (_req, res) => {
    try {
      const webhook = config.telegramBotToken ? await getTelegramWebhookInfo(config.telegramBotToken) : null;
      res.json({
        ok: true,
        configured: Boolean(config.telegramBotToken),
        hasSecret: Boolean(config.telegramWebhookSecret),
        allowedUsersLocked: Boolean(config.telegramAllowedUserIds),
        signalsDb: Boolean(config.signalsDbId),
        localSignals: readLocalSignals(50).length,
        computedWebhookUrl: config.telegramWebhookUrl || codespacesPublicUrl() || '',
        webhook,
        intake: {
          secureReady: secureIntakeReady(config),
          durableFirst: true,
          backgroundScheduler: typeof deferTask === 'function' ? 'vercel-waitUntil' : 'process-lifetime',
        },
        dedupe: {
          inFlight: inFlightUpdates.size,
          recentlyCompleted: completedUpdates.size,
          ttlMs: WEBHOOK_DEDUPE_TTL_MS,
        },
      });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });
}
