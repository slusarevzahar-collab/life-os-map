import { test, expect } from '@playwright/test';

const MORPH = '.lifemapV2MorphFrame';
const MOUNT = '.lifemapV2WindowMount';
const PILL = '.lifemapV2Pill';
const INBOX = '.lifemapV2PillInbox';
const AI = '.lifemapV2PillAI';
const CLOSE = '.lifemapV2WindowClose';

async function installFixtureApi(page) {
  await page.route('**/api/life-os/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path.endsWith('/snapshot')) return json(503, { error: 'morph-fixture-offline' });
    if (path.endsWith('/work-sessions/active')) return json(200, { session: null, lastSession: null });
    if (path.endsWith('/inbox/assets')) return json(200, {
      signals: [{
        id: 'signal-morph-e2e',
        title: 'Morph handoff fixture',
        summary: 'Disposable fixture signal for Inbox to Assistant handoff.',
        status: 'New',
        source: 'e2e',
        capturedAt: '2026-07-14T09:00:00.000Z',
        assets: [],
      }],
    });
    if (path.endsWith('/inbox/reprocess/status')) return json(200, { job: null });
    if (path.endsWith('/assistant/status')) return json(200, { providers: [] });
    return json(200, {});
  });
}

async function gotoFixture(page, viewport = { width: 1280, height: 800 }) {
  await page.setViewportSize(viewport);
  await page.goto('/?uiv2=1&fixture=1');
  await expect(page.locator(PILL)).toBeVisible();
  await expect(page.locator(MORPH)).toHaveAttribute('data-morph-state', 'closed');
}

async function waitOpen(page, target) {
  await expect(page.locator(MORPH)).toHaveAttribute('data-morph-state', 'open', { timeout: 2_000 });
  await expect(page.locator(MORPH)).toHaveAttribute('data-morph-target', target);
}

async function waitClosed(page) {
  await expect(page.locator(MORPH)).toHaveAttribute('data-morph-state', 'closed', { timeout: 2_000 });
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
}

async function openInbox(page) {
  await page.locator(INBOX).click();
  await waitOpen(page, 'inbox');
}

async function openAssistant(page) {
  await page.locator(AI).click();
  await waitOpen(page, 'assistant');
}

async function animationDescriptor(locator) {
  return locator.evaluate((element) => {
    const animation = element.getAnimations()[0];
    if (!animation) return null;
    const timing = animation.effect.getTiming();
    return {
      duration: timing.duration,
      easing: timing.easing,
      keyframes: animation.effect.getKeyframes().map((frame) => ({
        left: frame.left,
        top: frame.top,
        width: frame.width,
        height: frame.height,
        borderRadius: frame.borderRadius,
        opacity: frame.opacity,
        offset: frame.computedOffset,
      })),
    };
  });
}

async function morphProfile(page) {
  return page.locator(MORPH).evaluate((element) => JSON.parse(element.dataset.morphProfile));
}

async function movingRectDelta(page) {
  return page.evaluate(({ morphSelector, mountSelector }) => {
    const morph = document.querySelector(morphSelector)?.getBoundingClientRect();
    const mount = document.querySelector(mountSelector)?.getBoundingClientRect();
    if (!morph || !mount) return null;
    const differences = {
      left: Math.abs(morph.left - mount.left),
      top: Math.abs(morph.top - mount.top),
      width: Math.abs(morph.width - mount.width),
      height: Math.abs(morph.height - mount.height),
    };
    return { ...differences, maximum: Math.max(...Object.values(differences)) };
  }, { morphSelector: MORPH, mountSelector: MOUNT });
}

async function dragPillToLeft(page) {
  const divider = page.locator('.lifemapV2PillDivider');
  const box = await divider.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(58, 390, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => page.locator(PILL).evaluate((el) => Math.round(parseFloat(el.style.left)))).toBe(20);
}

test.beforeEach(async ({ page }) => {
  await installFixtureApi(page);
});

test('1. Inbox follows the reference two-segment opening sequence', async ({ page }) => {
  await gotoFixture(page);
  await page.locator(INBOX).click();
  await waitOpen(page, 'inbox');
  const profile = await morphProfile(page);
  expect(profile.total).toBe(570);
  expect(profile.phaseA).toMatchObject({ duration: 276, easing: 'cubic-bezier(.5,.08,.72,.6)', from: { w: 126, h: 58, r: 18 } });
  expect(profile.phaseA.to.w).toBeCloseTo(380.7, 0);
  expect(profile.phaseB).toMatchObject({ duration: 294, easing: 'cubic-bezier(.22,.65,.28,1)', revealFullAt: 0.45, to: { x: 556, y: 60, w: 692, h: 708, r: 22 } });
});

test('2. Assistant follows the reference opening geometry and clock', async ({ page }) => {
  await gotoFixture(page);
  await page.locator(AI).click();
  await waitOpen(page, 'assistant');
  const profile = await morphProfile(page);
  expect(profile.phaseA).toMatchObject({ duration: 276, from: { w: 126, h: 58, r: 18 } });
  expect(profile.phaseB).toMatchObject({ duration: 294, to: { x: 344, y: 62, w: 912, h: 714, r: 22 } });
});

test('3. close uses the reference window-to-pill sequence and independent pill fades', async ({ page }) => {
  await gotoFixture(page);
  await openInbox(page);
  await page.locator(CLOSE).click();
  await expect(page.locator(MORPH)).toHaveAttribute('data-morph-state', 'morphing-back');
  const closing = await animationDescriptor(page.locator(MORPH));
  expect(closing.duration).toBe(570);
  expect(closing.easing).toBe('cubic-bezier(0.3, 0.15, 0.2, 1)');
  expect(closing.keyframes.at(-1)).toMatchObject({ width: '126px', height: '58px', borderRadius: '18px', opacity: '0' });
  await page.waitForTimeout(320);
  const fadeSample = await page.evaluate(() => ({
    labels: Number(getComputedStyle(document.querySelector('.lifemapV2PillLabels')).opacity),
    skin: Number(getComputedStyle(document.querySelector('.lifemapV2PillSkin')).opacity),
  }));
  expect(fadeSample.labels).toBeGreaterThan(0);
  expect(fadeSample.labels).toBeLessThan(1);
  expect(fadeSample.skin).toBe(0);
  await waitClosed(page);
  await expect(page.locator('.lifemapV2PillLabels')).toHaveCSS('opacity', '1', { timeout: 400 });
  await expect(page.locator('.lifemapV2PillSkin')).toHaveCSS('opacity', '1', { timeout: 400 });
});

test('4. opening starts at a different live snapped launcher position', async ({ page }) => {
  await gotoFixture(page);
  await dragPillToLeft(page);
  await page.locator(INBOX).click();
  await expect(page.locator(MORPH)).not.toHaveAttribute('data-morph-state', 'closed');
  const profile = await morphProfile(page);
  expect(profile.phaseA.from).toMatchObject({ x: 20, w: 126, h: 58 });
});

test('5. dragging the launcher does not activate a morph', async ({ page }) => {
  await gotoFixture(page);
  await dragPillToLeft(page);
  await expect(page.locator(MORPH)).toHaveAttribute('data-morph-state', 'closed');
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
});

test('6. close returns to the current launcher position', async ({ page }) => {
  await gotoFixture(page);
  await dragPillToLeft(page);
  const start = await page.locator(PILL).evaluate((el) => ({ left: el.style.left, top: el.style.top }));
  await openInbox(page);
  await page.locator(CLOSE).click();
  await expect(page.locator(MORPH)).toHaveAttribute('data-morph-state', 'morphing-back');
  const closeAnimation = await animationDescriptor(page.locator(MORPH));
  expect(closeAnimation.keyframes.at(-1)).toMatchObject({ left: start.left, top: start.top });
  await waitClosed(page);
  await expect(page.locator(PILL)).toHaveCSS('left', start.left);
});

test('7. Escape during the first opening phase closes safely', async ({ page }) => {
  await gotoFixture(page);
  await page.locator(INBOX).click();
  await expect(page.locator(MORPH)).toHaveAttribute('data-morph-state', 'camera-out');
  await page.keyboard.press('Escape');
  await waitClosed(page);
});

test('8. close during the reveal phase reaches a canonical closed state', async ({ page }) => {
  await gotoFixture(page);
  await page.locator(INBOX).click();
  await expect(page.locator(MORPH)).toHaveAttribute('data-morph-state', 'revealing');
  await page.keyboard.press('Escape');
  await waitClosed(page);
  await expect(page.locator('.lifemapV2CameraLayer')).toHaveCSS('opacity', '1');
  await expect(page.locator('.lifemapV2PillSkin')).toHaveCSS('opacity', '1');
});

test('9. an attempted open during closing is rejected without a second dialog', async ({ page }) => {
  await gotoFixture(page);
  await openInbox(page);
  await page.locator(CLOSE).click();
  await page.waitForTimeout(520);
  const aiBox = await page.locator(AI).boundingBox();
  await page.mouse.click(aiBox.x + aiBox.width / 2, aiBox.y + aiBox.height / 2);
  await expect(page.locator('[role="dialog"]')).toHaveCount(1);
  await waitClosed(page);
  await openAssistant(page);
});

test('10. Inbox to Assistant handoff closes then opens one Assistant', async ({ page }) => {
  await gotoFixture(page);
  await openInbox(page);
  await page.locator('.lifemapV2InboxRowMainBtn').first().click();
  await page.getByRole('button', { name: 'Чат с AI' }).first().click();
  await waitOpen(page, 'assistant');
  await expect(page.locator('#lifemap-v2-assistant-window')).toHaveCount(1);
  await expect(page.locator('[role="dialog"]')).toHaveCount(1);
});

test('11. plain AI after a targeted handoff is generic', async ({ page }) => {
  await gotoFixture(page);
  await openInbox(page);
  await page.locator('.lifemapV2InboxRowMainBtn').first().click();
  await page.getByRole('button', { name: 'Чат с AI' }).first().click();
  await waitOpen(page, 'assistant');
  await expect(page.locator('.lifemapV2AssistantTargetTitle')).toHaveCount(1);
  await page.locator(CLOSE).click();
  await waitClosed(page);
  await openAssistant(page);
  await expect(page.locator('.lifemapV2AssistantTargetTitle')).toHaveCount(0);
  await expect(page.locator('.lifemapV2WindowTitle')).toContainText('LifeMap Assistant');
});

test('12. resize during opening atomically settles open', async ({ page }) => {
  await gotoFixture(page, { width: 1440, height: 900 });
  await page.locator(INBOX).click();
  await expect(page.locator(MORPH)).toHaveAttribute('data-morph-state', 'camera-out');
  await page.setViewportSize({ width: 1920, height: 1080 });
  await waitOpen(page, 'inbox');
  await expect(page.locator(MOUNT)).toHaveCSS('transform', 'none');
  await expect(page.locator('.lifemapV2CameraLayer')).toHaveCSS('opacity', '0');
});

test('13. resize while open preserves one correctly laid-out dialog', async ({ page }) => {
  await gotoFixture(page, { width: 1440, height: 900 });
  await openAssistant(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect(page.locator('[role="dialog"]')).toHaveCount(1);
  const metrics = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight, vw: innerWidth, vh: innerHeight }));
  expect(metrics).toEqual({ w: 1920, h: 1080, vw: 1920, vh: 1080 });
});

test('14. resize during closing atomically settles closed', async ({ page }) => {
  await gotoFixture(page, { width: 1440, height: 900 });
  await openInbox(page);
  await page.locator(CLOSE).click();
  await expect(page.locator(MORPH)).toHaveAttribute('data-morph-state', 'morphing-back');
  await page.setViewportSize({ width: 1920, height: 1080 });
  await waitClosed(page);
  await expect(page.locator('.lifemapV2CameraLayer')).toHaveCSS('opacity', '1');
});

test('15. rapid alternating Inbox and AI clicks still create one target', async ({ page }) => {
  await gotoFixture(page);
  const inboxBox = await page.locator(INBOX).boundingBox();
  const aiBox = await page.locator(AI).boundingBox();
  await page.mouse.click(inboxBox.x + inboxBox.width / 2, inboxBox.y + inboxBox.height / 2);
  await page.mouse.click(aiBox.x + aiBox.width / 2, aiBox.y + aiBox.height / 2);
  await waitOpen(page, 'inbox');
  await expect(page.locator('[role="dialog"]')).toHaveCount(1);
});

test('16. reduced motion preserves logical open, focus and close states', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await gotoFixture(page);
  await page.locator(INBOX).click();
  await waitOpen(page, 'inbox');
  await expect(page.locator(CLOSE)).toBeFocused();
  await page.locator(CLOSE).click();
  await waitClosed(page);
  await expect(page.locator(INBOX)).toBeFocused();
});

test('17. tracked handles settle when getAnimations is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Element.prototype, 'getAnimations', { configurable: true, value: undefined });
  });
  await gotoFixture(page);
  await page.locator(AI).click();
  await waitOpen(page, 'assistant');
  await page.locator(CLOSE).click();
  await waitClosed(page);
  await expect(page.locator('.lifemapV2CameraLayer')).toHaveCSS('opacity', '1');
});

test('18. repeated cycles leave no stuck camera, pill or morph frame', async ({ page }) => {
  await gotoFixture(page);
  for (const selector of [INBOX, AI, INBOX]) {
    await page.locator(selector).click();
    await expect(page.locator(MORPH)).toHaveAttribute('data-morph-state', 'open', { timeout: 2_000 });
    await page.locator(CLOSE).click();
    await waitClosed(page);
  }
  await expect(page.locator('.lifemapV2PillSkin')).toHaveCSS('opacity', '1', { timeout: 400 });
  await expect(page.locator('.lifemapV2PillLabels')).toHaveCSS('opacity', '1', { timeout: 400 });
  const settled = await page.evaluate(() => ({
    camera: getComputedStyle(document.querySelector('.lifemapV2CameraLayer')).opacity,
    skin: getComputedStyle(document.querySelector('.lifemapV2PillSkin')).opacity,
    labels: getComputedStyle(document.querySelector('.lifemapV2PillLabels')).opacity,
    frame: getComputedStyle(document.querySelector('.lifemapV2MorphFrame')).opacity,
  }));
  expect(settled).toEqual({ camera: '1', skin: '1', labels: '1', frame: '0' });
});

test('19. focus transfers to the window and returns to its launcher segment', async ({ page }) => {
  await gotoFixture(page);
  await page.locator(AI).focus();
  await page.locator(AI).click();
  await waitOpen(page, 'assistant');
  await expect(page.locator(CLOSE)).toBeFocused();
  await page.keyboard.press('Escape');
  await waitClosed(page);
  await expect(page.locator(AI)).toBeFocused();
});

test('20. at most one dialog exists throughout handoff and rapid input', async ({ page }) => {
  await gotoFixture(page);
  await page.locator(INBOX).click();
  await expect.poll(() => page.locator('[role="dialog"]').count()).toBe(1);
  await page.locator('.lifemapV2InboxRowMainBtn').first().click();
  await page.getByRole('button', { name: 'Чат с AI' }).first().click();
  let maximum = 0;
  for (let index = 0; index < 20; index += 1) {
    maximum = Math.max(maximum, await page.locator('[role="dialog"]').count());
    await page.waitForTimeout(40);
  }
  expect(maximum).toBe(1);
  await waitOpen(page, 'assistant');
});

test('21. the morph frame and real window remain one rectangle while moving', async ({ page }) => {
  await gotoFixture(page);
  await page.locator(INBOX).click();
  await expect(page.locator(MORPH)).toHaveAttribute('data-morph-state', 'revealing');
  await page.waitForTimeout(50);
  const opening = await movingRectDelta(page);
  expect(opening, 'opening morph and window must share one moving rectangle').not.toBeNull();
  expect(opening.maximum, JSON.stringify(opening)).toBeLessThan(2);

  await waitOpen(page, 'inbox');
  await page.locator(CLOSE).click();
  await expect(page.locator(MORPH)).toHaveAttribute('data-morph-state', 'morphing-back');
  await page.waitForTimeout(50);
  const closing = await movingRectDelta(page);
  expect(closing, 'closing morph and window must share one moving rectangle').not.toBeNull();
  expect(closing.maximum, JSON.stringify(closing)).toBeLessThan(2);
});
