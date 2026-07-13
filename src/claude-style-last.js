const RUNTIME_LINK_ID = 'claude-source-runtime-last';
const FINAL_STYLE_ID = 'claude-final-layout-overrides';
const PLANET_SELECTOR = '.app.actionApp .mapNode.orbitNode';
let coordinateFrame = 0;

function appendRuntimeStylesLast() {
  if (document.getElementById(RUNTIME_LINK_ID)) return;

  const link = document.createElement('link');
  link.id = RUNTIME_LINK_ID;
  link.rel = 'stylesheet';
  link.href = '/src/claude-source-runtime.css?layout=20260712-5';
  document.head.appendChild(link);
}

function appendFinalLayoutOverrides() {
  if (document.getElementById(FINAL_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = FINAL_STYLE_ID;
  style.textContent = `
    .app.actionApp .claudeSpaceBackground {
      background-image: url('/assets/space-bg-original.jpg') !important;
      background-position: center !important;
      background-size: cover !important;
      background-repeat: no-repeat !important;
      image-rendering: auto;
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

    .app.actionApp .missionTop {
      padding-right: 0 !important;
    }

    .app.actionApp .missionLine {
      display: -webkit-box !important;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      overflow: hidden !important;
    }

    .app.actionApp .coreNode.rootCore,
    .app.actionApp .coreNode.titleCore {
      left: 640px !important;
      top: 400px !important;
      width: 196px !important;
      height: 196px !important;
      translate: none !important;
      transform: translate(-50%, -50%) !important;
      transform-origin: 50% 50% !important;
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
      translate: none !important;
      transform: translate(-50%, -50%) !important;
      transform-origin: 50% 50% !important;
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
    }

    .app.actionApp .cameraFlying .cameraShell,
    .app.actionApp .cameraFlying .mapCanvas,
    .app.actionApp .claudeSpaceBackground {
      will-change: transform, opacity, filter;
    }

    .app.actionApp .mapNode.orbitNode {
      translate: none !important;
      transform: translate(-50%, -50%) !important;
      transform-origin: 50% 50% !important;
    }

    .app.actionApp .planetArc {
      display: block !important;
    }

    .app.actionApp .inboxV2Head small {
      font-size: 11px !important;
    }

    .app.actionApp .inboxV2Head small::after {
      content: none !important;
      display: none !important;
    }

    .app.actionApp .assistantWorkspace,
    .app.actionApp .assistantWorkspace.compactMode,
    .app.actionApp .assistantDecisionWorkspace {
      display: grid !important;
      grid-template-columns: 300px minmax(0, 1fr) !important;
      grid-template-rows: minmax(0, 1fr) !important;
      gap: 0 !important;
      overflow: hidden !important;
    }

    .app.actionApp .assistantWorkspaceSidebar {
      width: auto !important;
      min-width: 0 !important;
      max-width: none !important;
      height: 100% !important;
      border: 0 !important;
      border-right: 1px solid rgba(255,255,255,.10) !important;
      border-radius: 0 !important;
      background: rgba(30,39,53,.60) !important;
      box-shadow: none !important;
    }

    .app.actionApp .assistantWorkspaceMain {
      width: auto !important;
      min-width: 0 !important;
      height: 100% !important;
      border: 0 !important;
      border-radius: 0 !important;
      background: rgba(20,28,40,.32) !important;
      box-shadow: none !important;
    }

    .app.actionApp .assistantChatThread {
      min-width: 0 !important;
      overflow-x: hidden !important;
      overflow-y: auto !important;
      overscroll-behavior: contain;
    }

    .app.actionApp .assistantMessageBubble {
      box-sizing: border-box !important;
      max-width: min(100%, 860px) !important;
    }

    .app.actionApp .assistantWorkspaceInput {
      width: 100% !important;
      min-width: 0 !important;
    }

    .app.actionApp .claudeMorphFrame {
      pointer-events: none !important;
      contain: layout paint style;
    }

    .app.actionApp .claudeMorphFrame[data-settled='true'] {
      opacity: 0 !important;
      width: 0 !important;
      height: 0 !important;
      border-width: 0 !important;
      box-shadow: none !important;
    }

    @media (max-width: 820px) {
      .app.actionApp .assistantWorkspace,
      .app.actionApp .assistantWorkspace.compactMode,
      .app.actionApp .assistantDecisionWorkspace {
        grid-template-columns: minmax(0, 1fr) !important;
      }

      .app.actionApp .assistantWorkspaceSidebar {
        display: none !important;
      }
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

function scheduleCoordinatePass() {
  if (coordinateFrame) return;
  coordinateFrame = window.requestAnimationFrame(() => {
    coordinateFrame = 0;
    enforcePlanetCoordinates();
  });
}

function enforceLayout() {
  appendRuntimeStylesLast();
  appendFinalLayoutOverrides();
  scheduleCoordinatePass();
}

enforceLayout();

const layoutObserver = new MutationObserver((mutations) => {
  if (mutations.some((mutation) => mutation.type === 'childList')) {
    scheduleCoordinatePass();
  }
});

layoutObserver.observe(document.documentElement, {
  childList: true,
  subtree: true,
});

window.addEventListener('pageshow', enforceLayout);
