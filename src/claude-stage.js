const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 800;
const MORPH_STORAGE_KEY = 'lifemap.claude.morph.v1';
const VIEWPORT_STORAGE_KEY = 'lifemap.map.viewport.v2';
const LAYOUT_MIGRATION_KEY = 'lifemap.claude.layout-migration.v4';

function resetStaleViewportOnce() {
  try {
    if (window.localStorage.getItem(LAYOUT_MIGRATION_KEY) === 'done') return;
    window.localStorage.removeItem(VIEWPORT_STORAGE_KEY);
    window.localStorage.setItem(LAYOUT_MIGRATION_KEY, 'done');
  } catch {}
}

function updateDesignScale() {
  const width = Math.max(320, window.innerWidth || DESIGN_WIDTH);
  const height = Math.max(480, window.innerHeight || DESIGN_HEIGHT);
  const scale = Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT);
  const root = document.documentElement;
  root.style.setProperty('--claude-stage-scale', String(scale));
  root.style.setProperty('--claude-stage-width', `${DESIGN_WIDTH}px`);
  root.style.setProperty('--claude-stage-height', `${DESIGN_HEIGHT}px`);
}

function preparePendingMorphClass() {
  try {
    const pending = JSON.parse(window.sessionStorage.getItem(MORPH_STORAGE_KEY) || 'null');
    const inboxRoute = window.location.hash.includes('sphere-inbox');
    if (pending?.mode === 'open-inbox' && inboxRoute) {
      document.documentElement.classList.add('claudePendingInboxMorph');
    }
  } catch {}
}

resetStaleViewportOnce();
preparePendingMorphClass();
updateDesignScale();
window.addEventListener('resize', updateDesignScale, { passive: true });
window.addEventListener('orientationchange', updateDesignScale, { passive: true });
