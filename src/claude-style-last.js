const RUNTIME_LINK_ID = 'claude-source-runtime-last';
const FINAL_STYLE_ID = 'claude-final-layout-overrides';
const PLANET_SELECTOR = '.app.actionApp .mapNode.orbitNode';
const MORPH_FRAME_SELECTOR = '.claudeMorphFrame';
let morphHideTimer = 0;

function appendRuntimeStylesLast() {
  if (document.getElementById(RUNTIME_LINK_ID)) return;
  const link = document.createElement('link');
  link.id = RUNTIME_LINK_ID;
  link.rel = 'stylesheet';
  link.href = '/src/claude-source-runtime.css?layout=20260714-1';
  document.head.appendChild(link);
}

function appendFinalLayoutOverrides() {
  if (document.getElementById(FINAL_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = FINAL_STYLE_ID;
  style.textContent = `
    .app.actionApp .claudeSpaceBackground {
      background-image: url('/assets/space-bg.jpg') !important;
      background-position: center !important;
      background-size: cover !important;
      background-repeat: no-repeat !important;
      image-rendering: auto;
      filter: none !important;
    }

    .app.actionApp .mission:not(.missionCollapsed):not(.queueExpanded) {
      top: 112px !important;
      bottom: auto !important;
      width: 496px !important;
      height: 228px !important;
      min-height: 228px !important;
      max-height: 228px !important;
      display: flex !important;
      flex-direction: column !important;
      overflow: hidden !important;
    }

    .app.actionApp .mission.queueExpanded {
      top: 112px !important;
      bottom: auto !important;
      width: 496px !important;
      height: 656px !important;
      min-height: 656px !important;
      max-height: 656px !important;
      display: flex !important;
      flex-direction: column !important;
      overflow: hidden !important;
    }

    .app.actionApp .missionTop { padding-right: 0 !important; }

    .app.actionApp .coreNode.rootCore,
    .app.actionApp .coreNode.titleCore {
      left: 640px !important;
      top: 400px !important;
      width: 196px !important;
      height: 196px !important;
    }

    .app.actionApp .coreNode b,
    .app.actionApp .coreNode.rootCore b,
    .app.actionApp .coreNode.titleCore b {
      max-width: none !important;
      font: 500 27px var(--claude-sans) !important;
      letter-spacing: .2px !important;
    }

    .app.actionApp .coreNode small,
    .app.actionApp .coreNode.rootCore small,
    .app.actionApp .coreNode.titleCore small {
      display: block !important;
      color: rgba(87,224,168,.7) !important;
      font: 500 10px var(--claude-mono) !important;
      letter-spacing: 2px !important;
    }

    .app.actionApp .mapGlow,
    .app.actionApp .orbit {
      left: 640px !important;
      top: 400px !important;
    }

    .app.actionApp .mapStage {
      opacity: 1 !important;
      transform: none !important;
      transition: none !important;
    }

    .app.actionApp .cameraShell,
    .app.actionApp .mapCanvas,
    .app.actionApp .claudeSpaceBackground {
      backface-visibility: hidden;
      -webkit-backface-visibility: hidden;
      transform-style: preserve-3d;
      will-change: transform, opacity, filter;
    }

    .app.actionApp .mapNode.orbitNode {
      translate: none !important;
      transform: translate(-50%, -50%) !important;
      transform-origin: 50% 50% !important;
    }

    .app.actionApp .planetArc { display: block !important; }

    .app.actionApp .inboxV2Head small {
      font-size: 10px !important;
    }
    .app.actionApp .inboxV2Head small::after { content: none !important; }

    .app.actionApp .assistantWorkspace {
      overflow: hidden !important;
      isolation: isolate;
    }
    .app.actionApp .assistantWorkspaceSidebar {
      position: relative !important;
      left: auto !important;
      top: auto !important;
      flex: 0 0 300px !important;
      width: 300px !important;
      min-width: 300px !important;
      max-width: 300px !important;
      height: 100% !important;
      opacity: 1 !important;
      transform: none !important;
    }
    .app.actionApp .assistantWorkspaceMain {
      position: relative !important;
      flex: 1 1 auto !important;
      min-width: 0 !important;
      width: auto !important;
      opacity: 1 !important;
      transform: none !important;
    }

    .claudeMorphFrame {
      pointer-events: none !important;
      contain: layout paint style;
      will-change: left, top, width, height, opacity, border-radius;
    }
    .claudeMorphFrame.claudeMorphSettled {
      display: none !important;
      opacity: 0 !important;
    }
  `;
  document.head.appendChild(style);
}

function enforcePlanetCoordinates() {
  document.querySelectorAll(PLANET_SELECTOR).forEach((planet) => {
    const left = planet.style.getPropertyValue('left');
    const top = planet.style.getPropertyValue('top');
    if (left && planet.style.getPropertyPriority('left') !== 'important') {
      planet.style.setProperty('left', left, 'important');
    }
    if (top && planet.style.getPropertyPriority('top') !== 'important') {
      planet.style.setProperty('top', top, 'important');
    }
  });
}

function settleMorphFrame(delay = 900) {
  window.clearTimeout(morphHideTimer);
  morphHideTimer = window.setTimeout(() => {
    const frame = document.querySelector(MORPH_FRAME_SELECTOR);
    if (!frame) return;
    frame.getAnimations?.().forEach((animation) => animation.cancel());
    frame.classList.add('claudeMorphSettled');
    frame.style.opacity = '0';
  }, delay);
}

function armMorphFrame() {
  const frame = document.querySelector(MORPH_FRAME_SELECTOR);
  if (!frame) return;
  window.clearTimeout(morphHideTimer);
  frame.classList.remove('claudeMorphSettled');
  frame.style.removeProperty('opacity');
  settleMorphFrame(1050);
}

function enforceLayout() {
  appendRuntimeStylesLast();
  appendFinalLayoutOverrides();
  enforcePlanetCoordinates();
  if (document.querySelector(MORPH_FRAME_SELECTOR)) settleMorphFrame(120);
}

document.addEventListener('pointerdown', (event) => {
  if (event.target.closest('.claudeMorphHudButton, .assistantCloseButton, .assistantWorkspaceOverlay, .backButton, .centerButton')) {
    armMorphFrame();
  }
}, true);

enforceLayout();

const layoutObserver = new MutationObserver((mutations) => {
  if (mutations.some((mutation) => mutation.type === 'childList' || mutation.type === 'attributes')) {
    enforcePlanetCoordinates();
    if (document.querySelector('.assistantWorkspace, .sideList.inboxV2Panel')) settleMorphFrame(900);
  }
});

layoutObserver.observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['style', 'class'],
});

window.addEventListener('pageshow', enforceLayout);
window.addEventListener('blur', () => settleMorphFrame(0));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) settleMorphFrame(0);
});
