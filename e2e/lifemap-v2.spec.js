import { test, expect } from '@playwright/test';

const viewports = [
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
];

function realSnapshot({ done = false, twoTasks = false } = {}) {
  const tasks = [
    {
      id: 'task-alpha-1', title: 'Стабилизировать навигатор', project: 'Alpha', status: done ? 'Done' : 'Next',
      progress: done ? 100 : 15, priority: 10, nextAction: 'Проверить browser-регрессию', sessionNotes: '',
    },
  ];
  if (twoTasks) tasks.push({
    id: 'task-alpha-2', title: 'Проверить Preview', project: 'Alpha', status: 'Next', progress: 0, priority: 20,
    nextAction: 'Открыть прямой URL', sessionNotes: '',
  });
  return {
    meta: {
      source: 'notion-live', version: 'e2e-v1', updatedAt: '2026-07-14T09:00:00.000Z', warnings: [],
      connected: { tasks: true, goals: true, sessions: true, projectAreas: true, dreams: true, signals: true },
    },
    currentFocus: { id: 'task-alpha-1', title: tasks[0].title, project: 'Alpha', status: tasks[0].status, nextAction: tasks[0].nextAction },
    goals: [], tasks, sessions: [],
    projectAreas: [{ id: 'project-alpha', name: 'Alpha', type: 'Project', status: 'Active', focusLevel: 'Primary', nextAction: 'Ship' }],
    dreams: [], signals: [], planning: { onTrack: 1, next: tasks.length, waiting: 0, overdue: 0, done: done ? 1 : 0 },
  };
}

async function installApi(page, options = {}) {
  const state = {
    snapshotMode: options.snapshotMode || 'offline',
    snapshot: options.snapshot || realSnapshot(),
    timerActive: null,
    patches: [],
  };

  await page.route('**/api/life-os/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (path.endsWith('/work-sessions/active')) return json(200, { session: state.timerActive, lastSession: null });
    if (path.endsWith('/work-sessions/start')) {
      state.timerActive = { id: 'session-e2e', status: 'Active', startedAt: new Date().toISOString(), initialSeconds: 0, dateKey: '2026-07-14' };
      return json(200, { session: state.timerActive });
    }
    if (path.endsWith('/work-sessions/pause')) {
      const session = { ...(state.timerActive || {}), id: 'session-e2e', status: 'Paused', timerSeconds: 2 };
      state.timerActive = null;
      return json(200, { session });
    }
    if (path.endsWith('/snapshot')) {
      return state.snapshotMode === 'real' ? json(200, state.snapshot) : json(503, { error: 'offline-e2e' });
    }
    if (/\/tasks\/[^/]+$/.test(path) && request.method() === 'PATCH') {
      state.patches.push({ path, body: JSON.parse(request.postData() || '{}') });
      return json(200, { ok: true });
    }
    if (path.endsWith('/inbox/assets')) return json(200, { assets: [] });
    if (path.endsWith('/inbox/reprocess/status')) return json(200, { job: null });
    if (path.endsWith('/assistant/status')) return json(200, { providers: [] });
    return json(200, {});
  });
  return state;
}

async function gotoFixture(page) {
  await page.goto('/?uiv2=1&fixture=1');
  await expect(page.getByRole('button', { name: /Проекты — открыть/ })).toBeVisible();
}

async function openAlphaProject(page) {
  await page.getByRole('button', { name: /Проекты — открыть/ }).click();
  await expect(page.getByRole('button', { name: /Alpha — открыть/ })).toBeVisible({ timeout: 4_000 });
  await page.getByRole('button', { name: /Alpha — открыть/ }).click();
  await expect(page.getByRole('region', { name: 'Задачи ветки: Alpha' })).toBeVisible({ timeout: 4_000 });
}

test.beforeEach(async ({ page }) => {
  await installApi(page);
});

for (const viewport of viewports) {
  test(`full-bleed, circles and no overflow at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await gotoFixture(page);
    const metrics = await page.evaluate(() => {
      const rect = (selector) => {
        const value = document.querySelector(selector)?.getBoundingClientRect();
        return value ? { left: value.left, top: value.top, width: value.width, height: value.height } : null;
      };
      return {
        app: rect('.lifemapV2'),
        backdrop: rect('.lifemapV2Backdrop'),
        frameRadius: getComputedStyle(document.querySelector('.lifemapV2Frame')).borderRadius,
        scroll: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
        planets: [...document.querySelectorAll('.lifemapV2PlanetBody')].map((item) => {
          const value = item.getBoundingClientRect();
          return { width: value.width, height: value.height, radius: getComputedStyle(item).borderRadius };
        }),
      };
    });
    expect(metrics.app).toEqual({ left: 0, top: 0, width: viewport.width, height: viewport.height });
    expect(metrics.backdrop).toEqual({ left: 0, top: 0, width: viewport.width, height: viewport.height });
    expect(metrics.frameRadius).toBe('0px');
    expect(metrics.scroll).toEqual({ width: viewport.width, height: viewport.height });
    expect(metrics.planets.length).toBeGreaterThan(1);
    for (const planet of metrics.planets) {
      expect(Math.abs(planet.width - planet.height)).toBeLessThan(0.2);
      expect(planet.radius).toBe('50%');
    }
    await page.screenshot({ path: testInfo.outputPath(`fixture-${viewport.width}x${viewport.height}.png`), fullPage: true });
  });
}

test('normal offline mode is honest and never renders demo planets', async ({ page }, testInfo) => {
  await page.goto('/?uiv2=1');
  await expect(page.getByTestId('lifemap-data-state')).toContainText('Демонстрационные объекты отключены');
  await expect(page.getByRole('status', { name: /Статус LifeMap/ })).toContainText('OFFLINE');
  await expect(page.locator('.lifemapV2Planet')).toHaveCount(1);
  await expect(page.getByText('21 active')).toHaveCount(0);
  await expect(page.getByText('12 later')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('offline-honest.png'), fullPage: true });
});

test('fixture data is available only through the explicit fixture flag', async ({ page }) => {
  await gotoFixture(page);
  await expect(page.getByRole('status', { name: /Статус LifeMap/ })).toContainText('MOCK');
  await expect(page.getByText('21 active')).toBeVisible();
  await expect(page.getByTestId('lifemap-data-state')).toHaveCount(0);
});

test('a backend mock response is rejected by the normal URL', async ({ page }) => {
  const snapshot = realSnapshot();
  snapshot.meta.source = 'server-mock';
  await installApi(page, { snapshotMode: 'real', snapshot });
  await page.goto('/?uiv2=1');
  await expect(page.getByTestId('lifemap-data-state')).toContainText('Демо-данные отключены');
  await expect(page.locator('.lifemapV2Planet')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /Проекты — открыть/ })).toHaveCount(0);
});

test('camera descends and ascends without leaving a transformed layer', async ({ page }) => {
  await gotoFixture(page);
  await page.getByRole('button', { name: /Проекты — открыть/ }).click();
  await expect(page.getByRole('button', { name: /LifeMap — открыть/ })).toBeVisible({ timeout: 4_000 });
  await page.locator('.lifemapV2PlanetCentral').click();
  await expect(page.getByRole('button', { name: /Проекты — открыть/ })).toBeVisible({ timeout: 4_000 });
  const layer = await page.locator('.lifemapV2CameraLayer').evaluate((element) => ({
    opacity: getComputedStyle(element).opacity,
    transform: getComputedStyle(element).transform,
    filter: getComputedStyle(element).filter,
  }));
  expect(layer).toEqual({ opacity: '1', transform: 'none', filter: 'none' });
});

test('resize during camera flight settles on the requested level', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await gotoFixture(page);
  await page.getByRole('button', { name: /Проекты — открыть/ }).click();
  await page.waitForTimeout(80);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect(page.getByRole('button', { name: /LifeMap — открыть/ })).toBeVisible({ timeout: 4_000 });
  await expect(page.locator('.lifemapV2CameraLayer')).toHaveCSS('opacity', '1');
});

test('resize settles tracked camera animation when getAnimations is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Element.prototype, 'getAnimations', {
      configurable: true,
      value: undefined,
    });
  });
  await page.setViewportSize({ width: 1366, height: 768 });
  await gotoFixture(page);
  await page.getByRole('button', { name: /Проекты — открыть/ }).click();
  await page.waitForTimeout(80);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect(page.getByRole('button', { name: /LifeMap — открыть/ })).toBeVisible({ timeout: 4_000 });
  await page.waitForTimeout(1_500);
  const layer = page.locator('.lifemapV2CameraLayer');
  const pose = await layer.evaluate((element) => ({
    opacity: getComputedStyle(element).opacity,
    transform: getComputedStyle(element).transform,
    filter: getComputedStyle(element).filter,
  }));
  expect(pose.opacity).toBe('1');
  expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(pose.transform);
  expect(['none', 'blur(0px)']).toContain(pose.filter);
});

test('pan and cursor-anchored zoom remain usable', async ({ page }) => {
  await gotoFixture(page);
  const viewport = page.locator('.lifemapV2Viewport');
  const before = await viewport.getAttribute('style');
  const box = await page.locator('.lifemapV2Frame').boundingBox();
  await page.mouse.move(box.x + box.width - 80, box.y + 80);
  await page.mouse.wheel(0, -150);
  await expect.poll(() => viewport.getAttribute('style')).not.toBe(before);
  const afterZoom = await viewport.getAttribute('style');
  await page.mouse.move(box.x + 70, box.y + 70);
  await page.mouse.down();
  await page.mouse.move(box.x + 130, box.y + 115, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => viewport.getAttribute('style')).not.toBe(afterZoom);
});

test('Mission Control accepts a rapid expand-collapse reversal', async ({ page }) => {
  await gotoFixture(page);
  const toggle = page.getByRole('button', { name: 'Развернуть Mission Control' });
  await toggle.click();
  await page.getByRole('button', { name: 'Свернуть Mission Control' }).click();
  await expect(page.getByRole('button', { name: 'Развернуть Mission Control' })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('region', { name: 'Mission Control' })).toHaveCSS('height', '228px');
});

test('Escape safely reverses an Inbox morph that is still opening', async ({ page }) => {
  await gotoFixture(page);
  await page.getByRole('button', { name: 'Открыть Inbox' }).click();
  await expect(page.locator('#lifemap-v2-inbox-window')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('#lifemap-v2-inbox-window')).toHaveCount(0, { timeout: 3_000 });
  await expect(page.getByRole('button', { name: 'Открыть Inbox' })).toBeEnabled();
});

test('Inbox and Assistant morph open, close and restore launcher focus', async ({ page }, testInfo) => {
  await gotoFixture(page);
  await page.getByRole('button', { name: 'Открыть Inbox' }).click();
  await expect(page.getByRole('dialog', { name: 'LM Inbox' })).toBeVisible();
  const tabGeometry = await page.getByRole('tab').evaluateAll((tabs) => tabs.map((tab) => ({
    top: Math.round(tab.getBoundingClientRect().top),
    background: getComputedStyle(tab).backgroundColor,
    radius: getComputedStyle(tab).borderRadius,
  })));
  expect(new Set(tabGeometry.map((tab) => tab.top)).size).toBe(1);
  expect(tabGeometry.every((tab) => tab.radius === '10px' && tab.background !== 'rgb(239, 239, 239)')).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath('inbox-open.png'), fullPage: true });
  await page.getByRole('button', { name: 'Закрыть Inbox' }).click();
  await expect(page.getByRole('dialog', { name: 'LM Inbox' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Открыть AI Assistant' }).click();
  await expect(page.getByRole('dialog', { name: /Assistant/i })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: /Assistant/i })).toHaveCount(0);
});

test('plain Assistant opening clears a previous targeted boot context', async ({ page }) => {
  await installApi(page, { snapshotMode: 'real', snapshot: realSnapshot() });
  await page.goto('/?uiv2=1');
  await openAlphaProject(page);
  await page.getByRole('button', { name: 'Обсудить с AI: Стабилизировать навигатор', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Стабилизировать навигатор', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Закрыть Assistant', exact: true }).click();
  await expect(page.getByRole('dialog', { name: /Assistant/i })).toHaveCount(0);
  await page.getByRole('button', { name: 'Открыть AI Assistant', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Стабилизировать навигатор', exact: true })).toHaveCount(0);
  await expect(page.getByPlaceholder('Опиши решение, которое нужно принять, или проблему в работе…')).toBeVisible();
});

test('timer keeps the same mounted widget through camera navigation and pause', async ({ page }) => {
  await gotoFixture(page);
  const timer = page.getByRole('region', { name: 'Учёт рабочего времени' });
  await timer.evaluate((element) => { element.dataset.mountProbe = 'same-node'; });
  await page.getByRole('button', { name: 'Начать учёт времени' }).click();
  await expect(page.getByRole('button', { name: 'Поставить таймер на паузу' })).toBeVisible();
  await page.getByRole('button', { name: /Проекты — открыть/ }).click();
  await expect(page.getByRole('button', { name: /LifeMap — открыть/ })).toBeVisible({ timeout: 4_000 });
  await expect(timer).toHaveAttribute('data-mount-probe', 'same-node');
  await timer.hover();
  await expect(timer).toHaveCSS('height', '58px');
  await page.getByRole('button', { name: 'Поставить таймер на паузу' }).click();
  await expect(page.getByRole('button', { name: 'Продолжить учёт времени' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Остановить таймер' })).toBeVisible();
});

test('a versioned real snapshot survives reload as explicit stale data', async ({ page }) => {
  const state = await installApi(page, { snapshotMode: 'real', snapshot: realSnapshot() });
  await page.goto('/?uiv2=1');
  await expect(page.getByRole('status', { name: /Статус LifeMap/ })).toContainText('CONNECTED');
  await page.getByRole('button', { name: /Проекты — открыть/ }).click();
  await expect(page.getByRole('button', { name: /Alpha — открыть/ })).toBeVisible({ timeout: 4_000 });
  state.snapshotMode = 'offline';
  await page.reload();
  await expect(page.getByRole('status', { name: /Статус LifeMap/ })).toContainText('STALE');
  await expect(page.getByTestId('lifemap-data-state')).toContainText('последний валидный snapshot');
  await expect(page.getByRole('button', { name: /Alpha — открыть/ })).toBeVisible({ timeout: 4_000 });
});

test('Done and note mutations preserve the existing API payload contracts', async ({ page }) => {
  const state = await installApi(page, { snapshotMode: 'real', snapshot: realSnapshot() });
  await page.goto('/?uiv2=1');
  await openAlphaProject(page);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect.poll(() => state.patches.length).toBe(1);
  expect(state.patches[0].body).toEqual({ status: 'Done', progress: 100 });
  await page.getByRole('button', { name: 'Стабилизировать навигатор', exact: true }).click();
  await page.getByLabel('Заметка к задаче').fill('Browser проверен');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect.poll(() => state.patches.length).toBe(2);
  expect(state.patches[1].body).toEqual({ sessionNotes: 'Browser проверен' });
});

test('Restore mutation preserves the existing API payload contract', async ({ page }) => {
  const state = await installApi(page, { snapshotMode: 'real', snapshot: realSnapshot({ done: true }) });
  await page.goto('/?uiv2=1');
  await openAlphaProject(page);
  await page.getByRole('tab', { name: /Завершено/ }).click();
  await page.getByRole('button', { name: 'Восстановить', exact: true }).click();
  await expect.poll(() => state.patches.length).toBe(1);
  expect(state.patches[0].body).toEqual({ status: 'Next', progress: 0 });
});
