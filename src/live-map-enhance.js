const DRAG_START_DISTANCE = 8;
const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 800;
const PILL_WIDTH = 126;
const PILL_HEIGHT = 58;
const DEFAULT_PILL_X = 1122;
const DEFAULT_PILL_Y = 710;
const FLIGHT_MS = 600;
const MORPH_DURATION = Math.round(FLIGHT_MS * 0.95);
const LATERAL_EXIT_MS = 220;
const PILL_STORAGE_KEY = 'lifemap.claude.pill.v1';
const MORPH_STORAGE_KEY = 'lifemap.claude.morph.v1';
const CAMERA_STORAGE_KEY = 'lifemap.claude.camera.v1';
const EASE_IN = 'cubic-bezier(.5,.08,.72,.6)';
const EASE_OUT = 'cubic-bezier(.22,.65,.28,1)';
const MORPH_EASE = 'cubic-bezier(.3,.15,.2,1)';

const WINDOW_RECTS = {
  assistant: { x: 344, y: 62, w: 912, h: 714, r: 22 },
  inbox: { x: 556, y: 60, w: 692, h: 708, r: 22 },
};

function apiCandidates(path) {
  const origin = window.location.origin;
  const candidates = [path];
  const codespaceApiOrigin = origin.replace(/-\d+\.app\.github\.dev$/i, '-3001.app.github.dev');
  if (codespaceApiOrigin !== origin) candidates.push(`${codespaceApiOrigin}${path}`);
  return [...new Set(candidates)];
}

async function patchTask(taskId, payload) {
  const errors = [];
  for (const url of apiCandidates(`/api/life-os/tasks/${taskId}`)) {
    try {
      const response = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) throw new Error(data.error || `API ${response.status}`);
      return data;
    } catch (error) {
      errors.push(`${url}: ${error.message}`);
    }
  }
  throw new Error(errors.join(' | '));
}

function taskIdFromRow(row) {
  const id = row?.getAttribute('data-reorder-id') || '';
  return id.startsWith('task-') ? id.slice(5) : '';
}

function enhanceEditableNotes() {
  document.querySelectorAll('.inlineTaskDetails:not(.inboxDetails):not([data-edit-ready="true"])').forEach((details) => {
    const row = details.closest('.sideItemRow');
    const taskId = taskIdFromRow(row);
    if (!taskId) return;
    const currentText = details.querySelector('p')?.textContent?.trim() || details.querySelector('textarea')?.value?.trim() || '';
    details.dataset.editReady = 'true';
    details.innerHTML = '';

    const label = document.createElement('label');
    label.className = 'noteEditorLabel';
    label.textContent = 'Заметка / следующий шаг';

    const textarea = document.createElement('textarea');
    textarea.className = 'noteEditor';
    textarea.value = currentText;
    textarea.rows = Math.min(6, Math.max(3, Math.ceil(currentText.length / 80)));

    const actions = document.createElement('div');
    actions.className = 'noteEditorActions';
    const status = document.createElement('span');
    status.className = 'noteSaveStatus';
    status.textContent = '';
    const save = document.createElement('button');
    save.type = 'button';
    save.textContent = 'Сохранить заметку';
    save.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      save.disabled = true;
      save.textContent = 'Сохраняю…';
      status.textContent = 'Сохраняю…';
      try {
        await patchTask(taskId, { nextAction: textarea.value.trim() });
        save.textContent = 'Сохранено';
        status.textContent = 'Готово';
        setTimeout(() => {
          save.textContent = 'Сохранить заметку';
          status.textContent = '';
          save.disabled = false;
        }, 1300);
      } catch (error) {
        save.textContent = 'Повторить';
        status.textContent = `Ошибка: ${error.message}`;
        save.disabled = false;
      }
    });

    actions.append(status, save);
    details.append(label, textarea, actions);
  });
}

function linkifyTextElement(element) {
  if (!element || element.dataset.linkified === 'true') return;
  const text = element.textContent || '';
  const urlPattern = /(https?:\/\/[^\s<>()]+[^\s<>().,;:!?])/gi;
  if (!urlPattern.test(text)) return;

  urlPattern.lastIndex = 0;
  const fragment = document.createDocumentFragment();
  let lastIndex = 0;
  let match;
  while ((match = urlPattern.exec(text)) !== null) {
    if (match.index > lastIndex) fragment.append(document.createTextNode(text.slice(lastIndex, match.index)));
    const anchor = document.createElement('a');
    anchor.href = match[0];
    anchor.textContent = match[0];
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.className = 'inboxTextLink';
    fragment.append(anchor);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) fragment.append(document.createTextNode(text.slice(lastIndex)));
  element.textContent = '';
  element.append(fragment);
  element.dataset.linkified = 'true';
}

function enhanceInboxTextLinks() {
  document.querySelectorAll('.inboxFullText:not([data-linkified="true"]), .contextDocCard p:not([data-linkified="true"])').forEach(linkifyTextElement);
}

let dragState = null;
let ghost = null;

function removeGhost() {
  if (ghost) ghost.remove();
  ghost = null;
}

function createGhost(row, x, y) {
  removeGhost();
  ghost = row.cloneNode(true);
  ghost.className = 'lifeDragGhost';
  ghost.removeAttribute('data-reorder-id');
  ghost.querySelectorAll('button').forEach((button) => button.setAttribute('tabindex', '-1'));
  document.body.appendChild(ghost);
  moveGhost(x, y);
}

function moveGhost(x, y) {
  if (!ghost) return;
  ghost.style.left = `${x}px`;
  ghost.style.top = `${y}px`;
}

function beginDragPreview(event) {
  const handle = event.target.closest?.('.dragHandle');
  if (!handle) return;
  const row = handle.closest('.sideItemRow');
  if (!row) return;
  dragState = { row, startX: event.clientX, startY: event.clientY, active: false };
}

function moveDragPreview(event) {
  if (!dragState) return;
  const dx = event.clientX - dragState.startX;
  const dy = event.clientY - dragState.startY;
  const distance = Math.hypot(dx, dy);
  if (!dragState.active && distance < DRAG_START_DISTANCE) return;
  if (!dragState.active) {
    dragState.active = true;
    createGhost(dragState.row, event.clientX, event.clientY);
  } else {
    moveGhost(event.clientX, event.clientY);
  }
  event.preventDefault();
}

function endDragPreview() {
  dragState = null;
  removeGhost();
}

function readJsonStorage(storage, key, fallback) {
  try {
    return JSON.parse(storage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function writeJsonStorage(storage, key, value) {
  try {
    if (value == null) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(value));
  } catch {}
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function lerpRect(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    w: a.w + (b.w - a.w) * t,
    h: a.h + (b.h - a.h) * t,
    r: (a.r ?? 18) + ((b.r ?? 22) - (a.r ?? 18)) * t,
  };
}

function rectFrame(rect) {
  return {
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.w}px`,
    height: `${rect.h}px`,
    borderRadius: `${rect.r ?? 18}px`,
  };
}

function cancelAnimations(element) {
  element?.getAnimations?.().forEach((animation) => animation.cancel());
}

function animateWithSafety(element, keyframes, options) {
  return new Promise((resolve) => {
    if (!element || document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      resolve();
      return;
    }
    cancelAnimations(element);
    const animation = element.animate(keyframes, options);
    let resolved = false;
    const finish = () => {
      if (resolved) return;
      resolved = true;
      resolve();
    };
    animation.addEventListener('finish', finish, { once: true });
    animation.addEventListener('cancel', finish, { once: true });
    window.setTimeout(finish, Number(options.duration || 0) + 140);
  });
}

function waitForElement(selector, timeout = 2600) {
  return new Promise((resolve) => {
    const existing = document.querySelector(selector);
    if (existing) {
      resolve(existing);
      return;
    }

    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (!element) return;
      observer.disconnect();
      window.clearTimeout(timer);
      resolve(element);
    });

    const timer = window.setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);

    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
}

function routeParts() {
  return window.location.hash.replace(/^#/, '').split('/').filter(Boolean).map((part) => decodeURIComponent(part));
}

function isInboxRoute() {
  return routeParts().includes('sphere-inbox');
}

function navigateAndReload(parts) {
  const safe = parts.length ? parts : ['root'];
  window.location.hash = `#${safe.map((part) => encodeURIComponent(part)).join('/')}`;
  window.location.reload();
}

const morphState = {
  app: null,
  hud: null,
  skin: null,
  labels: null,
  frame: null,
  pillX: DEFAULT_PILL_X,
  pillY: DEFAULT_PILL_Y,
  morphing: false,
  dragging: false,
  suppressAssistantEvent: false,
  internalAssistantClose: false,
};

function pillRect() {
  return {
    x: morphState.pillX,
    y: morphState.pillY,
    w: PILL_WIDTH,
    h: PILL_HEIGHT,
    r: 18,
  };
}

function applyPillPosition() {
  if (!morphState.hud) return;
  morphState.hud.style.left = `${morphState.pillX}px`;
  morphState.hud.style.top = `${morphState.pillY}px`;
}

function setHudGhost({ skin, labels, pointer = true }) {
  if (!morphState.hud) return;
  morphState.hud.classList.toggle('ghostSkin', Boolean(skin));
  morphState.hud.classList.toggle('ghostLabels', Boolean(labels));
  morphState.hud.style.pointerEvents = pointer ? 'auto' : 'none';
}

function morphSegment(a, b, duration, accelerate) {
  const frame = morphState.frame;
  if (!frame || document.hidden) return Promise.resolve();
  if (accelerate) {
    return animateWithSafety(frame, [
      { ...rectFrame(a), opacity: 1 },
      { ...rectFrame(b), opacity: 1 },
    ], {
      duration,
      easing: EASE_IN,
      fill: 'forwards',
    });
  }
  return animateWithSafety(frame, [
    { ...rectFrame(a), opacity: 1 },
    { opacity: .9, offset: .55 },
    { ...rectFrame(b), opacity: 0 },
  ], {
    duration,
    easing: EASE_OUT,
    fill: 'forwards',
  });
}

function morphRun(a, b, duration, reverse) {
  const frame = morphState.frame;
  if (!frame || document.hidden) return Promise.resolve();
  const frames = reverse
    ? [
      { ...rectFrame(a), opacity: .95 },
      { opacity: .85, offset: .6 },
      { ...rectFrame(b), opacity: 0 },
    ]
    : [
      { ...rectFrame(a), opacity: 1 },
      { opacity: .85, offset: .45 },
      { ...rectFrame(b), opacity: 0 },
    ];
  return animateWithSafety(frame, frames, {
    duration,
    easing: MORPH_EASE,
    fill: 'forwards',
  });
}

function animateWindowEntrance(element, midpoint, target, duration) {
  if (!element) return Promise.resolve();
  const sx = midpoint.w / target.w;
  const sy = midpoint.h / target.h;
  const tx = midpoint.x - target.x * sx;
  const ty = midpoint.y - target.y * sy;
  element.style.transformOrigin = '0 0';
  return animateWithSafety(element, [
    { opacity: .2, transform: `translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px) scale(${sx.toFixed(4)},${sy.toFixed(4)})` },
    { opacity: 1, offset: .45 },
    { opacity: 1, transform: 'translate(0px,0px) scale(1,1)' },
  ], {
    duration,
    easing: EASE_OUT,
    fill: 'both',
  });
}

function animateWindowCollapse(element, source, target, duration) {
  if (!element) return Promise.resolve();
  const sx = target.w / source.w;
  const sy = target.h / source.h;
  const tx = target.x - source.x * sx;
  const ty = target.y - source.y * sy;
  element.style.transformOrigin = '0 0';
  return animateWithSafety(element, [
    { opacity: 1, transform: 'translate(0px,0px) scale(1,1)' },
    { opacity: 0, offset: .6 },
    { opacity: 0, transform: `translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px) scale(${sx.toFixed(4)},${sy.toFixed(4)})` },
  ], {
    duration,
    easing: MORPH_EASE,
    fill: 'forwards',
  });
}

function dispatchAssistantOpen() {
  morphState.suppressAssistantEvent = true;
  window.dispatchEvent(new CustomEvent('lifemap:assistant-target', {
    detail: { target: null, context: {} },
  }));
  window.setTimeout(() => {
    morphState.suppressAssistantEvent = false;
  }, 0);
}

async function openAssistantMorph({ dispatch = true } = {}) {
  if (morphState.morphing || document.querySelector('.assistantWorkspace')) return;
  morphState.morphing = true;
  const start = pillRect();
  const target = WINDOW_RECTS.assistant;
  const outgoingDuration = LATERAL_EXIT_MS;
  const duration2 = Math.max(240, MORPH_DURATION - outgoingDuration);
  const t0 = clamp(outgoingDuration / MORPH_DURATION, .2, .45);
  const midpoint = lerpRect(start, target, t0);

  setHudGhost({ skin: true, labels: true, pointer: false });
  window.__lifemapPrepareOverlayExit?.();
  morphSegment(start, midpoint, outgoingDuration, true);

  window.setTimeout(() => {
    if (dispatch) dispatchAssistantOpen();
  }, Math.max(0, outgoingDuration - 10));

  const workspace = await waitForElement('.assistantWorkspace');
  if (!workspace) {
    morphState.morphing = false;
    setHudGhost({ skin: false, labels: false, pointer: true });
    window.__lifemapRestoreOverlay?.({ x: start.x + 97, y: start.y + 29 });
    return;
  }

  workspace.dataset.claudeMorphHandled = 'true';
  await Promise.all([
    morphSegment(midpoint, target, duration2, false),
    animateWindowEntrance(workspace, midpoint, target, duration2),
  ]);
  workspace.style.opacity = '1';
  workspace.style.transform = 'none';
  workspace.style.transformOrigin = '0 0';
  morphState.morphing = false;
}

async function closeAssistantMorph() {
  if (morphState.morphing) return;
  const workspace = document.querySelector('.assistantWorkspace');
  if (!workspace) return;
  morphState.morphing = true;
  const target = pillRect();
  const source = WINDOW_RECTS.assistant;
  morphRun(source, target, MORPH_DURATION, true);
  animateWindowCollapse(workspace, source, target, MORPH_DURATION);

  window.setTimeout(() => setHudGhost({ skin: true, labels: false, pointer: false }), Math.round(MORPH_DURATION * .5));
  window.setTimeout(() => setHudGhost({ skin: false, labels: false, pointer: true }), Math.round(MORPH_DURATION * .86));

  window.setTimeout(() => {
    morphState.internalAssistantClose = true;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    window.setTimeout(() => {
      morphState.internalAssistantClose = false;
    }, 0);
    window.__lifemapRestoreOverlay?.({ x: target.x + 97, y: target.y + 29 });
    morphState.morphing = false;
  }, Math.max(0, MORPH_DURATION - 10));
}

function storePendingMorph(value) {
  writeJsonStorage(window.sessionStorage, MORPH_STORAGE_KEY, value);
}

function readPendingMorph() {
  return readJsonStorage(window.sessionStorage, MORPH_STORAGE_KEY, null);
}

async function openInboxMorph() {
  if (morphState.morphing || isInboxRoute()) return;
  morphState.morphing = true;
  const start = pillRect();
  const target = WINDOW_RECTS.inbox;
  const outgoingDuration = LATERAL_EXIT_MS;
  const duration2 = Math.max(240, MORPH_DURATION - outgoingDuration);
  const t0 = clamp(outgoingDuration / MORPH_DURATION, .2, .45);
  const midpoint = lerpRect(start, target, t0);

  setHudGhost({ skin: true, labels: true, pointer: false });
  window.__lifemapPrepareOverlayExit?.();
  morphSegment(start, midpoint, outgoingDuration, true);
  storePendingMorph({
    mode: 'open-inbox',
    start,
    target,
    midpoint,
    duration2,
    createdAt: Date.now(),
  });
  document.documentElement.classList.add('claudePendingInboxMorph');

  window.setTimeout(() => {
    navigateAndReload(['root', 'sphere-inbox']);
  }, Math.max(0, outgoingDuration - 10));
}

async function resumePendingInboxMorph() {
  const pending = readPendingMorph();
  if (!pending || pending.mode !== 'open-inbox' || !isInboxRoute()) return;
  setHudGhost({ skin: true, labels: true, pointer: false });
  const panel = await waitForElement('.sideList.inboxV2Panel');
  document.documentElement.classList.remove('claudePendingInboxMorph');
  if (!panel) {
    storePendingMorph(null);
    morphState.morphing = false;
    return;
  }

  morphState.morphing = true;
  panel.dataset.claudeMorphHandled = 'true';
  await Promise.all([
    morphSegment(pending.midpoint, pending.target, pending.duration2, false),
    animateWindowEntrance(panel, pending.midpoint, pending.target, pending.duration2),
  ]);
  panel.style.opacity = '1';
  panel.style.transform = 'none';
  panel.style.transformOrigin = '0 0';
  storePendingMorph(null);
  morphState.morphing = false;
}

async function closeInboxMorph() {
  if (morphState.morphing || !isInboxRoute()) return;
  const panel = document.querySelector('.sideList.inboxV2Panel');
  const target = pillRect();
  const source = WINDOW_RECTS.inbox;
  morphState.morphing = true;
  morphRun(source, target, MORPH_DURATION, true);
  animateWindowCollapse(panel, source, target, MORPH_DURATION);

  window.setTimeout(() => setHudGhost({ skin: true, labels: false, pointer: false }), Math.round(MORPH_DURATION * .5));
  window.setTimeout(() => setHudGhost({ skin: false, labels: false, pointer: true }), Math.round(MORPH_DURATION * .86));

  const origin = { x: target.x + 29, y: target.y + 29 };
  writeJsonStorage(window.sessionStorage, CAMERA_STORAGE_KEY, {
    mode: 'ascend',
    origin,
    targetId: 'root',
  });

  window.setTimeout(() => {
    storePendingMorph(null);
    navigateAndReload(['root']);
  }, Math.max(0, MORPH_DURATION - 10));
}

function beginPillDrag(event) {
  if (!morphState.app || morphState.morphing) return;
  event.preventDefault();
  event.stopPropagation();
  const stageRect = morphState.app.getBoundingClientRect();
  const scale = stageRect.width / DESIGN_WIDTH || 1;
  const startX = event.clientX;
  const startY = event.clientY;
  const originX = morphState.pillX;
  const originY = morphState.pillY;
  morphState.dragging = true;
  morphState.hud?.classList.add('dragging');

  const move = (moveEvent) => {
    const nextX = originX + (moveEvent.clientX - startX) / scale;
    const nextY = originY + (moveEvent.clientY - startY) / scale;
    morphState.pillX = clamp(nextX, 12, DESIGN_WIDTH - PILL_WIDTH - 12);
    morphState.pillY = clamp(nextY, 12, DESIGN_HEIGHT - PILL_HEIGHT - 12);
    applyPillPosition();
  };

  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    const centerX = morphState.pillX + PILL_WIDTH / 2;
    const centerY = morphState.pillY + PILL_HEIGHT / 2;
    const distances = [centerX, DESIGN_WIDTH - centerX, centerY, DESIGN_HEIGHT - centerY];
    const minimum = Math.min(...distances);
    if (minimum === distances[0]) morphState.pillX = 20;
    else if (minimum === distances[1]) morphState.pillX = DESIGN_WIDTH - PILL_WIDTH - 20;
    else if (minimum === distances[2]) morphState.pillY = 20;
    else morphState.pillY = DESIGN_HEIGHT - PILL_HEIGHT - 20;
    morphState.pillX = clamp(morphState.pillX, 20, DESIGN_WIDTH - PILL_WIDTH - 20);
    morphState.pillY = clamp(morphState.pillY, 20, DESIGN_HEIGHT - PILL_HEIGHT - 20);
    morphState.dragging = false;
    morphState.hud?.classList.remove('dragging');
    applyPillPosition();
    writeJsonStorage(window.localStorage, PILL_STORAGE_KEY, { x: morphState.pillX, y: morphState.pillY });
  };

  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up, { once: true });
}

function createMorphHud(app) {
  if (morphState.hud?.isConnected) return;
  const saved = readJsonStorage(window.localStorage, PILL_STORAGE_KEY, { x: DEFAULT_PILL_X, y: DEFAULT_PILL_Y });
  morphState.app = app;
  morphState.pillX = clamp(Number(saved.x) || DEFAULT_PILL_X, 20, DESIGN_WIDTH - PILL_WIDTH - 20);
  morphState.pillY = clamp(Number(saved.y) || DEFAULT_PILL_Y, 20, DESIGN_HEIGHT - PILL_HEIGHT - 20);

  const hud = document.createElement('div');
  hud.className = 'claudeMorphHud';
  const skin = document.createElement('div');
  skin.className = 'claudeMorphHudSkin';
  const labels = document.createElement('div');
  labels.className = 'claudeMorphHudLabels';

  const inbox = document.createElement('button');
  inbox.type = 'button';
  inbox.className = 'claudeMorphHudButton claudeMorphHudInbox';
  inbox.textContent = 'Inbox';
  inbox.title = 'Открыть LM Inbox';
  inbox.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    openInboxMorph();
  });

  const handle = document.createElement('div');
  handle.className = 'claudeMorphHudHandle';
  handle.setAttribute('role', 'separator');
  handle.setAttribute('aria-label', 'Переместить кнопку Inbox и AI');
  handle.addEventListener('pointerdown', beginPillDrag);

  const ai = document.createElement('button');
  ai.type = 'button';
  ai.className = 'claudeMorphHudButton claudeMorphHudAI';
  ai.textContent = 'AI';
  ai.title = 'Открыть LM Assistant';
  ai.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    openAssistantMorph({ dispatch: true });
  });

  labels.append(inbox, handle, ai);
  hud.append(skin, labels);

  const frame = document.createElement('div');
  frame.className = 'claudeMorphFrame';
  app.append(hud, frame);

  morphState.hud = hud;
  morphState.skin = skin;
  morphState.labels = labels;
  morphState.frame = frame;
  applyPillPosition();

  if (isInboxRoute()) setHudGhost({ skin: true, labels: true, pointer: false });
  else setHudGhost({ skin: false, labels: false, pointer: true });

  resumePendingInboxMorph();
}

function ensureMorphHud() {
  const app = document.querySelector('.app.actionApp');
  if (!app) return;
  createMorphHud(app);
}

function interceptNavigation(event) {
  const button = event.target.closest?.('.backButton, .centerButton');
  if (!button) return;
  if (document.querySelector('.assistantWorkspace')) return;

  const parts = routeParts();
  if (parts.length <= 1 && !isInboxRoute()) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();

  if (isInboxRoute()) {
    closeInboxMorph();
    return;
  }

  const targetParts = button.classList.contains('centerButton') ? ['root'] : parts.slice(0, -1);
  Promise.resolve(window.__lifemapPrepareCameraReturn?.()).finally(() => {
    navigateAndReload(targetParts.length ? targetParts : ['root']);
  });
}

function interceptAssistantClose(event) {
  const workspace = document.querySelector('.assistantWorkspace');
  if (!workspace) return;
  const closeButton = event.target.closest?.('.assistantCloseButton');
  const overlay = event.target.classList?.contains('assistantWorkspaceOverlay');
  if (!closeButton && !overlay) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  closeAssistantMorph();
}

function interceptAssistantEscape(event) {
  if (event.key !== 'Escape' || morphState.internalAssistantClose) return;
  if (!document.querySelector('.assistantWorkspace')) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  closeAssistantMorph();
}

function handleExternalAssistantOpen() {
  if (morphState.suppressAssistantEvent || morphState.morphing || document.querySelector('.assistantWorkspace')) return;
  window.setTimeout(() => openAssistantMorph({ dispatch: false }), 0);
}

function handleUnexpectedAssistantWorkspace() {
  const workspace = document.querySelector('.assistantWorkspace:not([data-claude-morph-handled="true"])');
  if (!workspace || morphState.morphing) return;
  workspace.dataset.claudeMorphHandled = 'true';
  const start = pillRect();
  const target = WINDOW_RECTS.assistant;
  setHudGhost({ skin: true, labels: true, pointer: false });
  const midpoint = lerpRect(start, target, .38);
  morphSegment(start, midpoint, LATERAL_EXIT_MS, true);
  animateWindowEntrance(workspace, midpoint, target, MORPH_DURATION - LATERAL_EXIT_MS);
  morphSegment(midpoint, target, MORPH_DURATION - LATERAL_EXIT_MS, false);
}

function runEnhancements() {
  enhanceEditableNotes();
  enhanceInboxTextLinks();
  ensureMorphHud();
  handleUnexpectedAssistantWorkspace();
}

document.addEventListener('pointerdown', beginDragPreview, true);
document.addEventListener('pointermove', moveDragPreview, { capture: true, passive: false });
document.addEventListener('pointerup', endDragPreview, true);
document.addEventListener('pointercancel', endDragPreview, true);
document.addEventListener('click', interceptNavigation, true);
document.addEventListener('click', interceptAssistantClose, true);
window.addEventListener('keydown', interceptAssistantEscape, true);
window.addEventListener('lifemap:assistant-target', handleExternalAssistantOpen);

const observer = new MutationObserver(() => runEnhancements());
observer.observe(document.documentElement, { childList: true, subtree: true });
runEnhancements();
setInterval(runEnhancements, 600);
