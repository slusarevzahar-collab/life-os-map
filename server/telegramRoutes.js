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

export function registerTelegramRoutes(app, runtime, { codespacesPublicUrl }) {
  const { config, ai, buildLiveSnapshot, telegramSecretOk } = runtime;

  app.post('/api/telegram/webhook', async (req, res) => {
    if (!telegramSecretOk(req)) {
      res.status(403).json({ ok: false, error: 'Bad Telegram webhook secret.' });
      return;
    }

    const baseSignal = buildSignalFromTelegramUpdate(req.body || {});
    if (!baseSignal) {
      res.json({ ok: true, skipped: true });
      return;
    }

    let signal = await enrichSignalWithTelegramDocument({
      signal: baseSignal,
      botToken: config.telegramBotToken,
    });

    if (!allowedTelegramUser(signal, config.telegramAllowedUserIds)) {
      res.json({ ok: true, rejected: true });
      return;
    }

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
    let notionResult = null;
    try {
      if (!config.notionToken || !config.signalsDbId) throw new Error('Notion signal storage is not configured.');
      notionResult = await createAiSignal({
        notionToken: config.notionToken,
        signalsDbId: config.signalsDbId,
        payload: signal,
      });
      storage = `notion:${notionResult.mode}`;
    } catch (error) {
      appendLocalSignal({ ...signal, storageError: error.message });
      storage = 'local-fallback';
    }

    sendTelegramMessage({
      botToken: config.telegramBotToken,
      chatId: signal.telegram?.chatId,
      text: 'Принято в AIinbox',
    }).catch((error) => console.warn(`LifeMap Telegram ack failed: ${error.message}`));

    res.json({
      ok: true,
      storage,
      signal: { id: signal.id, title: signal.title, type: signal.type, priority: signal.priority },
      notion: notionResult,
    });
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
      });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });
}
