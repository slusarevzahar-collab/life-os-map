import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { preview } from 'vite';

const repo = process.cwd();
const referenceRoot = path.resolve(repo, '..', 'claude-design-reference');
const outRoot = path.join(repo, 'artifacts', 'lifemap-morph-continuation');
const referenceOut = path.join(outRoot, 'comparison', 'reference');
const implementationOut = path.join(outRoot, 'comparison', 'implementation');
const videoOut = path.join(outRoot, 'videos');
await Promise.all([referenceOut, implementationOut, videoOut].map((dir) => fs.mkdir(dir, { recursive: true })));

const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.css', 'text/css; charset=utf-8'],
]);

const staticServer = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const relative = pathname === '/' ? 'LifeMap Home.dc.html' : pathname.replace(/^\/+/, '');
    const filePath = path.resolve(referenceRoot, relative);
    if (!filePath.startsWith(referenceRoot)) throw new Error('outside reference root');
    const data = await fs.readFile(filePath);
    response.writeHead(200, { 'content-type': mime.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream' });
    response.end(data);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
});
await new Promise((resolve) => staticServer.listen(4175, '127.0.0.1', resolve));

const viteServer = await preview({
  root: repo,
  preview: { host: '127.0.0.1', port: 4174, strictPort: true },
  logLevel: 'silent',
});

const browser = await chromium.launch({ headless: true });
const viewports = [
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

function slug(target, viewport, state) {
  return `${target}-${viewport.width}x${viewport.height}-${state}.png`;
}

async function installApi(page) {
  await page.route('**/api/life-os/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (pathname.endsWith('/snapshot')) return json(503, { error: 'evidence-fixture-offline' });
    if (pathname.endsWith('/work-sessions/active')) return json(200, { session: null, lastSession: null });
    if (pathname.endsWith('/inbox/assets')) return json(200, { signals: [] });
    if (pathname.endsWith('/inbox/reprocess/status')) return json(200, { job: null });
    if (pathname.endsWith('/assistant/status')) return json(200, { providers: [] });
    return json(200, {});
  });
}

async function captureImplementation(page, viewport, target) {
  const button = target === 'inbox' ? '.lifemapV2PillInbox' : '.lifemapV2PillAI';
  await page.goto('http://127.0.0.1:4174/?uiv2=1&fixture=1');
  await page.locator(button).waitFor({ state: 'visible' });
  await page.screenshot({ path: path.join(implementationOut, slug(target, viewport, '00-closed')) });
  await page.locator(button).click();
  await page.screenshot({ path: path.join(implementationOut, slug(target, viewport, '01-immediate')) });
  await page.waitForTimeout(110);
  await page.screenshot({ path: path.join(implementationOut, slug(target, viewport, '02-open-25')) });
  await page.waitForTimeout(105);
  await page.screenshot({ path: path.join(implementationOut, slug(target, viewport, '03-open-50')) });
  await page.waitForTimeout(105);
  await page.screenshot({ path: path.join(implementationOut, slug(target, viewport, '04-open-75')) });
  await page.locator('.lifemapV2MorphFrame[data-morph-state="open"]').waitFor({ state: 'attached' });
  await page.screenshot({ path: path.join(implementationOut, slug(target, viewport, '05-open')) });
  await page.locator('.lifemapV2WindowClose').click();
  await page.waitForTimeout(110);
  await page.screenshot({ path: path.join(implementationOut, slug(target, viewport, '06-close-25')) });
  await page.waitForTimeout(130);
  await page.screenshot({ path: path.join(implementationOut, slug(target, viewport, '07-close-50')) });
  await page.locator('.lifemapV2MorphFrame[data-morph-state="closed"]').waitFor({ state: 'attached' });
  await page.waitForTimeout(260);
  await page.screenshot({ path: path.join(implementationOut, slug(target, viewport, '08-settled')) });
}

async function captureReference(page, viewport, target) {
  await page.goto('http://127.0.0.1:4175/LifeMap%20Home.dc.html');
  const stage = page.locator('.dv-scene > div').first();
  await stage.waitFor({ state: 'visible' });
  await stage.screenshot({ path: path.join(referenceOut, slug(target, viewport, '00-closed')) });
  const box = await stage.boundingBox();
  const launchX = target === 'inbox' ? 1122 + 29 : 1122 + 97;
  await page.mouse.click(box.x + launchX, box.y + 710 + 29);
  await stage.screenshot({ path: path.join(referenceOut, slug(target, viewport, '01-immediate')) });
  await page.waitForTimeout(110);
  await stage.screenshot({ path: path.join(referenceOut, slug(target, viewport, '02-open-25')) });
  await page.waitForTimeout(105);
  await stage.screenshot({ path: path.join(referenceOut, slug(target, viewport, '03-open-50')) });
  await page.waitForTimeout(105);
  await stage.screenshot({ path: path.join(referenceOut, slug(target, viewport, '04-open-75')) });
  await page.waitForTimeout(360);
  await stage.screenshot({ path: path.join(referenceOut, slug(target, viewport, '05-open')) });
  await page.mouse.click(box.x + 82, box.y + 85);
  await page.waitForTimeout(110);
  await stage.screenshot({ path: path.join(referenceOut, slug(target, viewport, '06-close-25')) });
  await page.waitForTimeout(130);
  await stage.screenshot({ path: path.join(referenceOut, slug(target, viewport, '07-close-50')) });
  await page.waitForTimeout(620);
  await stage.screenshot({ path: path.join(referenceOut, slug(target, viewport, '08-settled')) });
}

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport, colorScheme: 'dark', locale: 'ru-RU' });
    const appPage = await context.newPage();
    await installApi(appPage);
    const referencePage = await context.newPage();
    for (const target of ['inbox', 'assistant']) {
      await captureImplementation(appPage, viewport, target);
      await captureReference(referencePage, viewport, target);
    }
    await context.close();
  }

  const videoContext = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    colorScheme: 'dark',
    locale: 'ru-RU',
    recordVideo: { dir: videoOut, size: { width: 1280, height: 800 } },
  });
  const videoPage = await videoContext.newPage();
  await installApi(videoPage);
  await videoPage.goto('http://127.0.0.1:4174/?uiv2=1&fixture=1');
  for (const selector of ['.lifemapV2PillInbox', '.lifemapV2PillAI']) {
    await videoPage.locator(selector).click();
    await videoPage.locator('.lifemapV2MorphFrame[data-morph-state="open"]').waitFor({ state: 'attached' });
    await videoPage.waitForTimeout(650);
    await videoPage.locator('.lifemapV2WindowClose').click();
    await videoPage.locator('.lifemapV2MorphFrame[data-morph-state="closed"]').waitFor({ state: 'attached' });
    await videoPage.waitForTimeout(650);
  }
  const recordedPath = await videoPage.video().path();
  await videoContext.close();
  await fs.copyFile(recordedPath, path.join(videoOut, 'implementation-inbox-ai-open-close.webm'));

  const summary = {
    generatedAt: new Date().toISOString(),
    referenceSource: path.join(referenceRoot, 'LifeMap Home.dc.html'),
    viewports,
    targets: ['inbox', 'assistant'],
    states: ['closed', 'immediate', 'open-25', 'open-50', 'open-75', 'open', 'close-25', 'close-50', 'settled'],
    implementationVideo: 'videos/implementation-inbox-ai-open-close.webm',
  };
  await fs.writeFile(path.join(outRoot, 'capture-summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
} finally {
  await browser.close();
  if (typeof viteServer.close === 'function') await viteServer.close();
  else if (viteServer.httpServer) await new Promise((resolve) => viteServer.httpServer.close(resolve));
  await new Promise((resolve) => staticServer.close(resolve));
}
