import { waitUntil } from '@vercel/functions';
import { createLifeMapApp } from '../server/lifemapStart.js';
import { getTelegramWebhookInfo, setTelegramWebhook } from '../server/telegramAdapter.js';

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
  if (runtime.config.telegramWebhookUrl) return runtime.config.telegramWebhookUrl;
  const productionDomain = process.env.VERCEL_PROJECT_PRODUCTION_URL || '';
  return productionDomain ? `https://${productionDomain}/api/telegram/webhook` : '';
}

function ensureProductionTelegramWebhook() {
  if (process.env.VERCEL_ENV !== 'production') return;
  if (webhookSyncState === 'pending' || webhookSyncState === 'ready') return;
  if (!runtime.config.telegramBotToken) return;

  const webhookUrl = productionWebhookUrl();
  if (!webhookUrl) return;

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
