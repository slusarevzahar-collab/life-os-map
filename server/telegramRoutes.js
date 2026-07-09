import { createAiSignal } from './aiSignalStore.js';
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

export function registerTelegramRoutes(app, runtime, { codespacesPublicUrl }) {
  const { config, ai, buildLiveSnapshot, telegramSecretOk } = runtime;
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

  async function processAcceptedSignal(baseSignal, key) {
    let signal = baseSignal;
    try {
      signal = await enrichSignalWithTelegramDocument({
        signal: baseSignal,
        botToken: config.telegramBotToken,
      });

      try {
        const snapshot = await buildLiveSnapshot();
        signal = await ai.analyzeInboxSignal({ signal, snapshot });
      } catch (error) {
        signal = {
          ...signal,
          assistantNote: `AI-разбор временно недоступен. Сигнал сохранён без потери данных. Причина: ${error.message}`,
        };
      }

      let storage = 'local';
      try {
        if (!config.notionToken || !config.signalsDbId) throw new Error('Notion signal storage is not configured.');
        await createAiSignal({
          notionToken: config.notionToken,
          signalsDbId: config.signalsDbId,
          payload: signal,
        });
        storage = 'notion';
      } catch (error) {
        appendLocalSignal({ ...signal, storageError: error.message });
        storage = 'local-fallback';
      }

      await sendTelegramMessage({
        botToken: config.telegramBotToken,
        chatId: signal.telegram?.chatId,
        text: 'Доставлено в LM Inbox',
      }).catch((error) => console.warn(`LifeMap Telegram ack failed: ${error.message}`));

      console.log(`LifeMap Telegram signal processed: ${signal.id} → ${storage}`);
    } catch (error) {
      console.error(`LifeMap Telegram background processing failed for ${baseSignal.id}: ${error.message}`);
      try {
        appendLocalSignal({
          ...baseSignal,
          assistantNote: 'Фоновая обработка Telegram не завершилась. Сигнал сохранён локально для восстановления.',
          storageError: error.message,
        });
      } catch (fallbackError) {
        console.error(`LifeMap Telegram local recovery failed: ${fallbackError.message}`);
      }
    } finally {
      inFlightUpdates.delete(key);
      completedUpdates.set(key, Date.now());
    }
  }

  app.post('/api/telegram/webhook', (req, res) => {
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

    // Return quickly so Telegram does not retry the same update while AI analysis is still running.
    res.status(202).json({ ok: true, accepted: true, signalId: baseSignal.id });
    void processAcceptedSignal(baseSignal, key);
  });

  app.post('/api/telegram/set-webhook', async (req, res) => {
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
        computedWebhookUrl: codespacesPublicUrl() || config.telegramWebhookUrl || '',
        webhook,
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
