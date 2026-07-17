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

export function affineRectTransform(from, to) {
  const sx = from.w / to.w;
  const sy = from.h / to.h;
  const tx = from.x - to.x;
  const ty = from.y - to.y;
  return `translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px) scale(${sx.toFixed(4)},${sy.toFixed(4)})`;
}

export function useWindowMorph({ onOpened, onClosed } = {}) {
  const morphRef = useRef(null);
  const windowMountRef = useRef(null);
  const timersRef = useRef([]);
  const frameRequestRef = useRef(0);
  const animationsRef = useRef([]);
  const [state, setState] = useState('closed');
  const [target, setTarget] = useState(null);
  const [contentVisible, setContentVisible] = useState(false);

  const clearScheduledWork = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
    window.cancelAnimationFrame(frameRequestRef.current);
    frameRequestRef.current = 0;
    const tracked = animationsRef.current;
    animationsRef.current = [];
    tracked.forEach((animation) => {
      try { animation?.cancel?.(); } catch { /* Detached animation handles are harmless. */ }
    });
    [morphRef.current, windowMountRef.current].forEach((element) => {
      (element?.getAnimations?.() || []).forEach((animation) => {
        try { animation.cancel(); } catch { /* Best-effort cleanup. */ }
      });
    });
  }, []);

  const schedule = useCallback((callback, delay) => {
    const id = window.setTimeout(callback, delay);
    timersRef.current.push(id);
    return id;
  }, []);

  useEffect(() => () => clearScheduledWork(), [clearScheduledWork]);

  const runFrame = useCallback((from, to, mode) => {
    const element = morphRef.current;
    const mount = windowMountRef.current;
    if (!element || !mount) return;

    [element, mount].forEach((target) => {
      (target.getAnimations?.() || []).forEach((animation) => animation.cancel());
    });
    animationsRef.current = [];
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
    const mountTransform = affineRectTransform(mode === 'open' ? from : to, mode === 'open' ? to : from);
    const mountKeyframes = mode === 'open'
      ? [
          { opacity: 0, transform: mountTransform },
          { opacity: 0, offset: CONTENT_REVEAL_AT },
          { opacity: 1, transform: 'translate(0px,0px) scale(1,1)' },
        ]
      : [
          { opacity: 1, transform: 'translate(0px,0px) scale(1,1)' },
          { opacity: 0, offset: 0.6 },
          { opacity: 0, transform: mountTransform },
        ];

    if (typeof element.animate === 'function') {
      animationsRef.current = [element.animate(keyframes, {
        duration: MORPH_MS,
        easing: MORPH_EASE,
        fill: 'forwards',
      })];
      if (typeof mount.animate === 'function') {
        animationsRef.current.push(mount.animate(mountKeyframes, {
          duration: MORPH_MS,
          easing: MORPH_EASE,
          fill: 'forwards',
        }));
      }
      return;
    }

    Object.assign(element.style, frameStyle(to), { opacity: '0' });
    Object.assign(mount.style, { opacity: mode === 'open' ? '1' : '0', transform: mode === 'open' ? 'none' : mountTransform });
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
        clearScheduledWork();
        Object.assign(morphRef.current?.style || {}, { opacity: '0' });
        Object.assign(windowMountRef.current?.style || {}, { opacity: '1', transform: 'none' });
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
      setContentVisible(true);

      const finish = () => {
        clearScheduledWork();
        setContentVisible(false);
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
      schedule(() => setContentVisible(false), Math.round(MORPH_MS * 0.6));
      schedule(finish, MORPH_MS);
    },
    [clearScheduledWork, onClosed, queueFrame, schedule, state, target]
  );

  return {
    morphRef,
    windowMountRef,
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
