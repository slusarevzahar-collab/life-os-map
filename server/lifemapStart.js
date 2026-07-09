import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
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

export function createLifeMapApp({ deferTask = null } = {}) {
  const envLoaded = loadLocalEnv();
  const runtime = createLifeMapRuntime({ envLoaded });
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  function codespacesBaseUrl() {
    const name = process.env.CODESPACE_NAME;
    const domain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN || 'app.github.dev';
    if (!name || process.env.CODESPACES !== 'true') return '';
    return `https://${name}-${runtime.config.port}.${domain}`;
  }

  function codespacesPublicUrl() {
    if (runtime.config.telegramWebhookUrl) return runtime.config.telegramWebhookUrl;
    const baseUrl = codespacesBaseUrl();
    return baseUrl ? `${baseUrl}/api/telegram/webhook` : '';
  }

  app.use((req, _res, next) => {
    const baseUrl = codespacesBaseUrl();
    const candidate = req.get('Origin') || req.get('Referer');
    if (baseUrl && candidate) {
      try {
        if (new URL(candidate).origin === baseUrl) req.headers['sec-fetch-site'] = 'same-origin';
      } catch {}
    }
    next();
  });

  registerCoreRoutes(app, runtime);
  registerInboxRoutes(app, runtime);
  registerTelegramRoutes(app, runtime, { codespacesPublicUrl, deferTask });

  const distDir = path.resolve(process.cwd(), 'dist');
  const distIndex = path.join(distDir, 'index.html');
  const uiAvailable = () => fs.existsSync(distIndex);

  app.use(express.static(distDir, { index: false }));

  app.get('/', (_req, res) => {
    if (uiAvailable()) {
      res.sendFile(distIndex);
      return;
    }
    res.status(503).type('text/plain').send('LifeMap UI build is not available yet. Run npm run app.');
  });

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      next();
      return;
    }
    if (uiAvailable()) {
      res.sendFile(distIndex);
      return;
    }
    res.status(503).type('text/plain').send('LifeMap UI build is not available yet. Run npm run app.');
  });

  async function publishCodespacesPort() {
    if (process.env.CODESPACES !== 'true') return;
    const codespaceName = process.env.CODESPACE_NAME;
    const args = ['codespace', 'ports', 'visibility', `${runtime.config.port}:public`];
    if (codespaceName) args.push('--codespace', codespaceName);
    try {
      await execGh(args);
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
    return new Promise((resolve, reject) => {
      const host = process.env.API_HOST || '0.0.0.0';
      const server = app.listen(runtime.config.port, host, async () => {
        console.log(`LifeMap listening on http://${host}:${runtime.config.port}`);
        console.log(uiAvailable()
          ? `LifeMap UI + API ready on http://localhost:${runtime.config.port}`
          : 'LifeMap API started, but UI build is not available yet.');
        const publicUiUrl = codespacesBaseUrl();
        if (publicUiUrl) console.log(`LifeMap public UI: ${publicUiUrl}/`);
        console.log(envLoaded ? '.env loaded' : '.env not found; using process env');
        console.log(`LifeMap AI providers: ${JSON.stringify(runtime.ai.status().providers)}`);
        await publishCodespacesPort();
        await syncTelegramWebhook();
        resolve(server);
      });

      server.on('error', (error) => {
        if (error?.code === 'EADDRINUSE') {
          reject(new Error(`LifeMap port ${runtime.config.port} is already in use. Run npm run app again; the startup script should remove stale listeners.`));
          return;
        }
        reject(error);
      });
    });
  }

  return { app, runtime, start };
}
