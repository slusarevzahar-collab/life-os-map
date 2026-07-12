// LifeMap UI V2 — useWindowMorph (Stage 3).
// Finite state machine: closed -> opening -> open -> closing -> closed.
// Runs one React-owned morph frame in place; no reload, DOM clone, observer,
// global event bus or storage handoff.
import { useCallback, useEffect, useRef, useState } from 'react';

export const PILL_SIZE = { w: 126, h: 58, r: 18 };
export const WINDOW_RECTS = {
  inbox: { x: 556, y: 60, w: 692, h: 708, r: 22 },
  assistant: { x: 344, y: 62, w: 912, h: 714, r: 22 },
};
export const MORPH_MS = 570;
const MORPH_EASE = 'cubic-bezier(.3,.15,.2,1)';
const CONTENT_REVEAL_AT = 0.45;

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function frameStyle(rect) {
  return {
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.w}px`,
    height: `${rect.h}px`,
    borderRadius: `${rect.r ?? 18}px`,
  };
}

export function useWindowMorph({ onOpened, onClosed } = {}) {
  const morphRef = useRef(null);
  const timersRef = useRef([]);
  const frameRequestRef = useRef(0);
  const [state, setState] = useState('closed');
  const [target, setTarget] = useState(null);
  const [contentVisible, setContentVisible] = useState(false);

  const clearScheduledWork = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
    window.cancelAnimationFrame(frameRequestRef.current);
    frameRequestRef.current = 0;
    const element = morphRef.current;
    (element?.getAnimations?.() || []).forEach((animation) => animation.cancel());
  }, []);

  const schedule = useCallback((callback, delay) => {
    const id = window.setTimeout(callback, delay);
    timersRef.current.push(id);
    return id;
  }, []);

  useEffect(() => () => clearScheduledWork(), [clearScheduledWork]);

  const runFrame = useCallback((from, to, mode) => {
    const element = morphRef.current;
    if (!element) return;

    (element.getAnimations?.() || []).forEach((animation) => animation.cancel());
    const keyframes =
      mode === 'open'
        ? [
            { ...frameStyle(from), opacity: 1 },
            { opacity: 0.85, offset: 0.45 },
            { ...frameStyle(to), opacity: 0 },
          ]
        : [
            { ...frameStyle(from), opacity: 0.95 },
            { opacity: 0.85, offset: 0.6 },
            { ...frameStyle(to), opacity: 0 },
          ];

    if (typeof element.animate === 'function') {
      element.animate(keyframes, {
        duration: MORPH_MS,
        easing: MORPH_EASE,
        fill: 'forwards',
      });
      return;
    }

    Object.assign(element.style, frameStyle(to), { opacity: '0' });
  }, []);

  const queueFrame = useCallback(
    (from, to, mode) => {
      frameRequestRef.current = window.requestAnimationFrame(() => {
        frameRequestRef.current = 0;
        runFrame(from, to, mode);
      });
    },
    [runFrame]
  );

  const open = useCallback(
    (targetName, segmentRect) => {
      if (state !== 'closed' || !segmentRect) return;
      const windowRect = WINDOW_RECTS[targetName];
      if (!windowRect) return;

      clearScheduledWork();
      setTarget(targetName);

      if (prefersReducedMotion()) {
        setState('open');
        setContentVisible(true);
        onOpened?.(targetName);
        return;
      }

      setState('opening');
      setContentVisible(false);
      queueFrame(segmentRect, windowRect, 'open');
      schedule(() => setContentVisible(true), Math.round(MORPH_MS * CONTENT_REVEAL_AT));
      schedule(() => {
        setState('open');
        onOpened?.(targetName);
      }, MORPH_MS);
    },
    [clearScheduledWork, onOpened, queueFrame, schedule, state]
  );

  const close = useCallback(
    (segmentRect) => {
      if (state !== 'open' || !segmentRect) return;
      const currentTarget = target;
      const windowRect = WINDOW_RECTS[currentTarget];

      clearScheduledWork();
      setContentVisible(false);

      const finish = () => {
        setState('closed');
        setTarget(null);
        onClosed?.(currentTarget);
      };

      if (prefersReducedMotion() || !windowRect) {
        finish();
        return;
      }

      setState('closing');
      queueFrame(windowRect, segmentRect, 'close');
      schedule(finish, MORPH_MS);
    },
    [clearScheduledWork, onClosed, queueFrame, schedule, state, target]
  );

  return {
    morphRef,
    state,
    target,
    contentVisible,
    open,
    close,
    isBusy: state === 'opening' || state === 'closing',
    isActive: state !== 'closed',
    MORPH_MS,
  };
}
