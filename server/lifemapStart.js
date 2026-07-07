import { execFile } from 'node:child_process';
import express from 'express';
import { setTelegramWebhook } from './telegramAdapter.js';
import { createLifeMapRuntime, loadLocalEnv } from './lifemapRuntime.js';
import { registerCoreRoutes } from './coreRoutes.js';
import { registerInboxRoutes } from './inboxRoutes.js';
import { registerTelegramRoutes } from './telegramRoutes.js';

function execGh(args = []) {
  return new Promise((resolve, reject) => {
    execFile('gh', args, { timeout: 15000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error((stderr || stdout || error.message).trim()));
        return;
      }
      resolve((stdout || stderr || '').trim());
    });
  });
}

export function createLifeMapApp() {
  const envLoaded = loadLocalEnv();
  const runtime = createLifeMapRuntime({ envLoaded });
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  function codespacesPublicUrl() {
    if (runtime.config.telegramWebhookUrl) return runtime.config.telegramWebhookUrl;
    const name = process.env.CODESPACE_NAME;
    const domain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN || 'app.github.dev';
    if (!name || process.env.CODESPACES !== 'true') return '';
    return `https://${name}-${runtime.config.port}.${domain}/api/telegram/webhook`;
  }

  registerCoreRoutes(app, runtime);
  registerInboxRoutes(app, runtime);
  registerTelegramRoutes(app, runtime, { codespacesPublicUrl });

  async function publishCodespacesPort() {
    if (process.env.CODESPACES !== 'true') return;
    try {
      await execGh(['codespace', 'ports', 'visibility', `${runtime.config.port}:public`]);
    } catch (error) {
      console.warn(`LifeMap could not auto-public Codespaces port ${runtime.config.port}: ${error.message}`);
    }
  }

  async function syncTelegramWebhook() {
    const { telegramBotToken, telegramWebhookSecret } = runtime.config;
    if (!telegramBotToken) return;
    const webhookUrl = codespacesPublicUrl();
    if (!webhookUrl) return;
    try {
      await setTelegramWebhook({ botToken: telegramBotToken, webhookUrl, secretToken: telegramWebhookSecret });
      console.log(`LifeMap Telegram webhook synced: ${webhookUrl}`);
    } catch (error) {
      console.warn(`LifeMap Telegram webhook sync failed: ${error.message}`);
    }
  }

  async function start() {
    return new Promise((resolve) => {
      const server = app.listen(runtime.config.port, async () => {
        console.log(`LifeMap API listening on http://localhost:${runtime.config.port}`);
        console.log(envLoaded ? '.env loaded' : '.env not found; using process env');
        console.log(`LifeMap AI providers: ${JSON.stringify(runtime.ai.status().providers)}`);
        await publishCodespacesPort();
        await syncTelegramWebhook();
        resolve(server);
      });
    });
  }

  return { app, runtime, start };
}
