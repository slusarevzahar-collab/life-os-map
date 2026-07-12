import spaceBackgroundDataUri from './assets/space-bg-data.js';

const RUNTIME_LINK_ID = 'claude-source-runtime-last';
const FINAL_STYLE_ID = 'claude-final-layout-overrides';
const PLANET_SELECTOR = '.app.actionApp .mapNode.orbitNode';

function appendRuntimeStylesLast() {
  if (document.getElementById(RUNTIME_LINK_ID)) return;

  const link = document.createElement('link');
  link.id = RUNTIME_LINK_ID;
  link.rel = 'stylesheet';
  link.href = '/src/claude-source-runtime.css?layout=20260712-4';
  document.head.appendChild(link);
}

function appendFinalLayoutOverrides() {
  if (document.getElementById(FINAL_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = FINAL_STYLE_ID;
  style.textContent = `
    .app.actionApp .claudeSpaceBackground {
      background-image: url("${spaceBackgroundDataUri}") !important;
      background-position: center !important;
      background-size: cover !important;
      background-repeat: no-repeat !important;
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

function enforceLayout() {
  appendRuntimeStylesLast();
  appendFinalLayoutOverrides();
  enforcePlanetCoordinates();
}

enforceLayout();

const layoutObserver = new MutationObserver((mutations) => {
  if (mutations.some((mutation) => mutation.type === 'childList' || mutation.type === 'attributes')) {
    enforcePlanetCoordinates();
  }
});

layoutObserver.observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['style'],
});

window.addEventListener('pageshow', enforceLayout);
