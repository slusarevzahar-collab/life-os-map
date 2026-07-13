const MORPH_STORAGE_KEY = 'lifemap.claude.morph.v1';
const CAMERA_STORAGE_KEY = 'lifemap.claude.camera.v1';
const MORPH_SETTLE_MS = 1250;
const CAMERA_SETTLE_MS = 1050;

let morphTimer = 0;
let cameraTimer = 0;
let observerFrame = 0;
let cameraStartHash = '';

function cancelAnimations(element) {
  element?.getAnimations?.().forEach((animation) => {
    try {
      animation.cancel();
    } catch {}
  });
}

function safeSessionRead(key) {
  try {
    return JSON.parse(window.sessionStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}

function safeSessionRemove(key) {
  try {
    window.sessionStorage.removeItem(key);
  } catch {}
}

function settleMorphFrame() {
  const frame = document.querySelector('.claudeMorphFrame');
  if (!frame) return;

  cancelAnimations(frame);
  frame.dataset.settled = 'true';
  frame.style.opacity = '0';
  frame.style.width = '0px';
  frame.style.height = '0px';
  frame.style.borderWidth = '0px';
  frame.style.boxShadow = 'none';
}

function armMorphWatchdog() {
  window.clearTimeout(morphTimer);
  const frame = document.querySelector('.claudeMorphFrame');
  if (frame) {
    frame.dataset.settled = 'false';
    frame.style.removeProperty('width');
    frame.style.removeProperty('height');
    frame.style.removeProperty('border-width');
    frame.style.removeProperty('box-shadow');
  }

  morphTimer = window.setTimeout(() => {
    settleMorphFrame();
    settleOpenWindows();
  }, MORPH_SETTLE_MS);
}

function settleOpenWindows() {
  const workspace = document.querySelector('.assistantWorkspace');
  const inbox = document.querySelector('.sideList.inboxV2Panel');

  [workspace, inbox].forEach((element) => {
    if (!element) return;
    cancelAnimations(element);
    element.style.opacity = '1';
    element.style.transform = 'none';
    element.style.transformOrigin = '0 0';
  });

  const pending = safeSessionRead(MORPH_STORAGE_KEY);
  if (inbox && pending?.mode === 'open-inbox') {
    safeSessionRemove(MORPH_STORAGE_KEY);
    document.documentElement.classList.remove('claudePendingInboxMorph');
  }
}

function settleCamera() {
  const stage = document.querySelector('.mapStage');
  const shell = document.querySelector('.cameraShell');

  if (shell) {
    cancelAnimations(shell);
    shell.style.opacity = '1';
    shell.style.transform = 'none';
    shell.style.filter = 'none';
    shell.style.transformOrigin = '50% 50%';
  }

  if (stage?.classList.contains('cameraFlying')) {
    stage.classList.remove('cameraFlying');
    stage.querySelectorAll('.mapNode.orbitNode[disabled]').forEach((planet) => {
      planet.removeAttribute('disabled');
    });
  }

  window.dispatchEvent(new CustomEvent('lifemap:camera-settled'));
}

function armCameraWatchdog() {
  window.clearTimeout(cameraTimer);
  cameraStartHash = window.location.hash;

  cameraTimer = window.setTimeout(() => {
    const stage = document.querySelector('.mapStage.cameraFlying');
    if (!stage) return;

    const routeDidNotChange = window.location.hash === cameraStartHash;
    settleCamera();
    safeSessionRemove(CAMERA_STORAGE_KEY);

    if (routeDidNotChange) {
      window.setTimeout(() => window.location.reload(), 0);
    }
  }, CAMERA_SETTLE_MS);
}

function restoreHudAfterWindowClose() {
  if (document.querySelector('.assistantWorkspace')) return;
  if (window.location.hash.includes('sphere-inbox')) return;

  const hud = document.querySelector('.claudeMorphHud');
  if (!hud) return;

  hud.classList.remove('ghostSkin', 'ghostLabels');
  hud.style.pointerEvents = 'auto';
}

function clearStalePendingMorph() {
  const pending = safeSessionRead(MORPH_STORAGE_KEY);
  if (!pending) {
    document.documentElement.classList.remove('claudePendingInboxMorph');
    return;
  }

  const age = Date.now() - Number(pending.createdAt || 0);
  if (age > 8000) {
    safeSessionRemove(MORPH_STORAGE_KEY);
    document.documentElement.classList.remove('claudePendingInboxMorph');
  }
}

function inspectVisualState() {
  observerFrame = 0;
  clearStalePendingMorph();

  const workspace = document.querySelector('.assistantWorkspace');
  const inbox = document.querySelector('.sideList.inboxV2Panel');
  const flying = document.querySelector('.mapStage.cameraFlying');

  if (workspace || inbox) {
    window.clearTimeout(morphTimer);
    morphTimer = window.setTimeout(() => {
      settleMorphFrame();
      settleOpenWindows();
    }, MORPH_SETTLE_MS);
  }

  if (flying) {
    armCameraWatchdog();
  }

  if (!workspace && !inbox) {
    window.setTimeout(restoreHudAfterWindowClose, 80);
  }
}

function scheduleInspection() {
  if (observerFrame) return;
  observerFrame = window.requestAnimationFrame(inspectVisualState);
}

document.addEventListener('pointerdown', (event) => {
  if (event.target.closest?.('.claudeMorphHudButton')) {
    armMorphWatchdog();
  }

  if (event.target.closest?.('.mapNode.orbitNode, .backButton, .centerButton')) {
    armCameraWatchdog();
  }
}, true);

document.addEventListener('click', (event) => {
  if (event.target.closest?.('.assistantCloseButton')) {
    armMorphWatchdog();
  }
}, true);

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && document.querySelector('.assistantWorkspace')) {
    armMorphWatchdog();
  }
}, true);

window.addEventListener('hashchange', () => {
  window.clearTimeout(cameraTimer);
  window.setTimeout(settleCamera, CAMERA_SETTLE_MS);
});

window.addEventListener('pageshow', () => {
  settleMorphFrame();
  settleOpenWindows();
  settleCamera();
  restoreHudAfterWindowClose();
  clearStalePendingMorph();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  settleMorphFrame();
  settleOpenWindows();
  settleCamera();
  restoreHudAfterWindowClose();
  clearStalePendingMorph();
});

const observer = new MutationObserver(scheduleInspection);
observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
});

settleMorphFrame();
clearStalePendingMorph();
scheduleInspection();
