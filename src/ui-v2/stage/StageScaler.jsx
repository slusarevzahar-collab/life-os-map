// LifeMap UI V2 — StageScaler (Stage 0).
// Fixed internal coordinate system of 1280x800. Computes scale as the minimum
// ratio of the available safe-area content box to the design box and centers it
// in the viewport. rAF-debounced resize; no MutationObserver, no setInterval,
// no DOM mutation outside React; resize listeners are cleaned up.
import { useCallback, useLayoutEffect, useRef, useState } from 'react';

export const DESIGN_WIDTH = 1280;
export const DESIGN_HEIGHT = 800;

function cssPixels(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function StageScaler({ children }) {
  const stageRef = useRef(null);
  const frameRef = useRef(0);
  const [scale, setScale] = useState(1);

  const measure = useCallback(() => {
    const el = stageRef.current;
    if (!el) return;

    const styles = window.getComputedStyle(el);
    const horizontalPadding = cssPixels(styles.paddingLeft) + cssPixels(styles.paddingRight);
    const verticalPadding = cssPixels(styles.paddingTop) + cssPixels(styles.paddingBottom);
    const availWidth = Math.max(0, el.clientWidth - horizontalPadding);
    const availHeight = Math.max(0, el.clientHeight - verticalPadding);
    const next = Math.min(availWidth / DESIGN_WIDTH, availHeight / DESIGN_HEIGHT);

    setScale(Number.isFinite(next) && next > 0 ? next : 1);
  }, []);

  useLayoutEffect(() => {
    measure();
    const onResize = () => {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = window.requestAnimationFrame(measure);
    };

    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('orientationchange', onResize, { passive: true });
    return () => {
      window.cancelAnimationFrame(frameRef.current);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, [measure]);

  return (
    <div className="lifemapV2Stage" ref={stageRef} style={{ '--stage-scale': scale }}>
      <div
        className="lifemapV2DesignBox"
        style={{ width: DESIGN_WIDTH, height: DESIGN_HEIGHT, transform: `scale(${scale})` }}
      >
        {children}
      </div>
    </div>
  );
}
