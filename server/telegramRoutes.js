import {
  findInboxSignalByMediaGroup,
  getInboxSignalRecord,
  mergeInboxSignalMedia,
  persistSignalAnalysis,
} from './inboxAssetStore.js';
import { findInboxSignalBySourceUrl } from './inboxDedupeStore.js';
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
const MEDIA_GROUP_SETTLE_MS = 1800;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function webhookKey(signal = {}) {
  if (signal.sourceUrl) return `source:${String(signal.sourceUrl).trim().toLowerCase()}`;
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

function documentFromAttachment(attachment = null) {
  return (attachment?.media || []).find((item) => item?.kind === 'document' && item?.fileId) || null;
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

  function markCompleted(key) {
    inFlightUpdates.delete(key);
    completedUpdates.set(key, Date.now());
  }

  async function persistAcceptedSignal(baseSignal) {
    if (config.notionToken && config.signalsDbId) {
      try {
        const mediaGroupId = baseSignal.telegram?.mediaGroupId || '';
        if (mediaGroupId) {
          const existing = await findInboxSignalByMediaGroup({
            notionToken: config.notionToken,
            signalsDbId: config.signalsDbId,
            mediaGroupId,
            chatId: baseSignal.telegram?.chatId,
          });
          if (existing?.id) {
            await mergeInboxSignalMedia({ notionToken: config.notionToken, signalId: existing.id, signal: baseSignal });
            return { storage: 'notion', signalId: existing.id, joined: true, dedupe: 'media-group' };
          }
        }

        if (baseSignal.sourceUrl) {
          const existingSource = await findInboxSignalBySourceUrl({
            notionToken: config.notionToken,
            signalsDbId: config.signalsDbId,
            sourceUrl: baseSignal.sourceUrl,
          });
          if (existingSource?.id) {
            if (baseSignal.attachment) {
              await mergeInboxSignalMedia({ notionToken: config.notionToken, signalId: existingSource.id, signal: baseSignal });
            }
            return { storage: 'notion', signalId: existingSource.id, joined: true, dedupe: 'source-url' };
          }
        }

        const result = await createSignal({
          notionToken: config.notionToken,
          signalsDbId: config.signalsDbId,
          payload: { ...baseSignal, assistantNote: ' ' },
        });
        if (!result?.id) throw new Error('Notion did not return a signal page id.');

        if (baseSignal.attachment || baseSignal.rawText) {
          await mergeInboxSignalMedia({ notionToken: config.notionToken, signalId: result.id, signal: baseSignal });
        }
        return { storage: 'notion', signalId: result.id, joined: false, dedupe: '' };
      } catch (error) {
        if (isServerlessRuntime()) throw error;
        appendLocalSignal({ ...baseSignal, storageError: error.message });
        return { storage: 'local-fallback', signalId: '', joined: false, dedupe: '' };
      }
    }

    const error = new Error('Notion signal storage is not configured.');
    if (isServerlessRuntime()) throw error;
    appendLocalSignal({ ...baseSignal, storageError: error.message });
    return { storage: 'local-fallback', signalId: '', joined: false, dedupe: '' };
  }

  async function processAcceptedSignal(baseSignal, key, stored) {
    let signal = baseSignal;
    try {
      if (baseSignal.telegram?.mediaGroupId) await sleep(MEDIA_GROUP_SETTLE_MS);

      if (stored.signalId) {
        const current = await getInboxSignalRecord({
          notionToken: config.notionToken,
          signalsDbId: config.signalsDbId,
          signalId: stored.signalId,
        }).catch(() => null);
        if (current) {
          const attachment = current.attachment || baseSignal.attachment || null;
          const document = documentFromAttachment(attachment) || baseSignal.telegram?.document || null;
          signal = {
            ...baseSignal,
            ...current,
            rawText: current.originalText || current.summary || baseSignal.rawText || '',
            attachment,
            telegram: {
              ...baseSignal.telegram,
              mediaGroupId: attachment?.mediaGroupId || baseSignal.telegram?.mediaGroupId || '',
              media: attachment?.media || baseSignal.telegram?.media || [],
              attachment,
              document,
            },
          };
        }
      }

      signal = await enrichSignalWithTelegramDocument({
        signal,
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
      if (stored.signalId) {
        await persistSignalAnalysis({
          notionToken: config.notionToken,
          signalId: stored.signalId,
          analysis: {
            ...baseSignal,
            assistantNote: ' ',
            nextAction: 'AI-разбор временно не завершён. Сигнал сохранён и будет доступен для последующего переразбора.',
            assets: [],
          },
        }).catch((persistError) => console.warn(`LifeMap Telegram failure note could not be stored: ${persistError.message}`));
      } else {
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
      markCompleted(key);
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

    if (stored.joined) {
      if (stored.dedupe === 'source-url') {
        await sendTelegramMessage({
          botToken: config.telegramBotToken,
          chatId: baseSignal.telegram?.chatId,
          text: 'Этот пост уже есть в LM Inbox',
        }).catch((error) => console.warn(`LifeMap Telegram duplicate ack failed: ${error.message}`));
      }
      markCompleted(key);
      res.status(202).json({
        ok: true,
        accepted: true,
        durable: true,
        storage: stored.storage,
        signalId: stored.signalId,
        joinedMediaGroup: stored.dedupe === 'media-group',
        duplicateSource: stored.dedupe === 'source-url',
      });
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
      mediaGroup: Boolean(baseSignal.telegram?.mediaGroupId),
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
          mediaGroupBundling: true,
          persistentSourceDedupe: true,
          failedAnalysisRecovery: true,
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
