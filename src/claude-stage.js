const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 800;

function updateDesignScale() {
  const width = Math.max(320, window.innerWidth || DESIGN_WIDTH);
  const height = Math.max(480, window.innerHeight || DESIGN_HEIGHT);
  const scale = Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT);
  const root = document.documentElement;
  root.style.setProperty('--claude-stage-scale', String(scale));
  root.style.setProperty('--claude-stage-width', `${DESIGN_WIDTH}px`);
  root.style.setProperty('--claude-stage-height', `${DESIGN_HEIGHT}px`);
}

updateDesignScale();
window.addEventListener('resize', updateDesignScale, { passive: true });
window.addEventListener('orientationchange', updateDesignScale, { passive: true });
