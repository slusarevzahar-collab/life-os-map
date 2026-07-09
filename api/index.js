import { waitUntil } from '@vercel/functions';
import { createLifeMapApp } from '../server/lifemapStart.js';
import { getTelegramWebhookInfo, setTelegramWebhook } from '../server/telegramAdapter.js';

if (!process.env.TELEGRAM_WEBHOOK_URL && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
  process.env.TELEGRAM_WEBHOOK_URL = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}/api/telegram/webhook`;
}

const { app, runtime } = createLifeMapApp({ deferTask: waitUntil });
let webhookSyncState = 'idle';

function restoreApiPath(req) {
  const parsed = new URL(req.url || '/api', 'http://lifemap.local');
  const routePath = parsed.searchParams.get('path');
  if (!routePath) return;

  parsed.searchParams.delete('path');
  const query = parsed.searchParams.toString();
  req.url = `/api/${routePath.replace(/^\/+/, '')}${query ? `?${query}` : ''}`;
}

function productionWebhookUrl() {
  return runtime.config.telegramWebhookUrl || '';
}

function productionIntakeReady() {
  const config = runtime.config;
  return Boolean(
    config.telegramBotToken &&
    config.telegramWebhookSecret &&
    config.telegramAllowedUserIds &&
    config.notionToken &&
    config.signalsDbId &&
    productionWebhookUrl()
  );
}

function ensureProductionTelegramWebhook() {
  if (process.env.VERCEL_ENV !== 'production') return;
  if (webhookSyncState === 'pending' || webhookSyncState === 'ready') return;
  if (!productionIntakeReady()) return;

  const webhookUrl = productionWebhookUrl();
  webhookSyncState = 'pending';
  waitUntil((async () => {
    try {
      const current = await getTelegramWebhookInfo(runtime.config.telegramBotToken);
      if (current?.url !== webhookUrl) {
        await setTelegramWebhook({
          botToken: runtime.config.telegramBotToken,
          webhookUrl,
          secretToken: runtime.config.telegramWebhookSecret,
        });
      }
      webhookSyncState = 'ready';
      console.log(`LifeMap Telegram production webhook ready: ${webhookUrl}`);
    } catch (error) {
      webhookSyncState = 'idle';
      console.warn(`LifeMap Telegram production webhook sync failed: ${error.message}`);
    }
  })());
}

export default function handler(req, res) {
  restoreApiPath(req);
  ensureProductionTelegramWebhook();
  return app(req, res);
}
