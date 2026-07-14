// LifeMap UI V2 — Claude Design Inbox/Assistant morph.
// Explicit, cancel-safe FSM with tracked WAAPI/timer/rAF handles. The motion
// values and phase split come from LifeMap Home.dc.html (handleNav,
// componentDidUpdate, _morphSeg and _morphRun).
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_BLUR_PX,
  DEFAULT_FLIGHT_MS,
  DURATIONS,
  EASE_DEPARTURE,
  EASE_LANDING,
  backgroundPose,
  descendExitKeyframes,
  ascendEnterKeyframes,
  lateralExitKeyframes,
  lateralEnterKeyframes,
} from '../stage/cameraMath.js';

export const PILL_SIZE = { w: 126, h: 58, r: 18 };
export const WINDOW_RECTS = {
  inbox: { x: 556, y: 60, w: 692, h: 708, r: 22 },
  assistant: { x: 344, y: 62, w: 912, h: 714, r: 22 },
};
export const MORPH_FLIGHT_MS = DEFAULT_FLIGHT_MS;
export const MORPH_MS = Math.round(MORPH_FLIGHT_MS * 0.95);
export const MORPH_EASE_IN = 'cubic-bezier(.5,.08,.72,.6)';
export const MORPH_EASE_OUT = 'cubic-bezier(.22,.65,.28,1)';
export const MORPH_EASE_RETURN = 'cubic-bezier(.3,.15,.2,1)';

const OPENING_STATES = new Set(['preparing', 'camera-out', 'revealing']);
const CLOSING_STATES = new Set(['hiding-content', 'morphing-back', 'camera-return']);

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

function hideFrame(element) {
  if (!element) return;
  Object.assign(element.style, { opacity: '0', left: '0px', top: '0px', width: '0px', height: '0px', borderRadius: '18px' });
}

function settleCamera(element, visible) {
  if (!element) return;
  element.style.opacity = visible ? '1' : '0';
  element.style.transform = 'none';
  element.style.filter = 'none';
  element.style.transformOrigin = '50% 50%';
}

function settleWindow(element, visible) {
  if (!element) return;
  element.style.opacity = visible ? '1' : '0';
  element.style.transform = 'none';
  element.style.transformOrigin = '0 0';
}

export function lerpRect(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    w: a.w + (b.w - a.w) * t,
    h: a.h + (b.h - a.h) * t,
    r: (a.r ?? 18) + ((b.r ?? 22) - (a.r ?? 18)) * t,
  };
}

export function affineRectTransform(from, to) {
  const sx = from.w / to.w;
  const sy = from.h / to.h;
  // The mount is already positioned at the destination rectangle. Its
  // transform therefore only needs the positional delta; scaling the
  // destination coordinates again would create a second, displaced window.
  const tx = from.x - to.x;
  const ty = from.y - to.y;
  return `translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px) scale(${sx.toFixed(4)},${sy.toFixed(4)})`;
}

export function useWindowMorph({
  cameraLayerRef,
  flightMs = MORPH_FLIGHT_MS,
  blurPx = DEFAULT_BLUR_PX,
  onOpened,
  onClosed,
  onPillLabelReveal,
  onPillSkinReveal,
} = {}) {
  const morphRef = useRef(null);
  const windowMountRef = useRef(null);
  const timersRef = useRef([]);
  const framesRef = useRef([]);
  const animationsRef = useRef([]);
  const generationRef = useRef(0);
  const stateRef = useRef('closed');
  const targetRef = useRef(null);
  const contextRef = useRef(null);
  const callbackRef = useRef({ onOpened, onClosed, onPillLabelReveal, onPillSkinReveal });
  callbackRef.current = { onOpened, onClosed, onPillLabelReveal, onPillSkinReveal };

  const [state, setState] = useState('closed');
  const [target, setTarget] = useState(null);
  const [contentVisible, setContentVisible] = useState(false);
  const [windowBackgroundPose, setWindowBackgroundPose] = useState(null);
  const [inspectionProfile, setInspectionProfile] = useState(null);

  const moveToState = useCallback((nextState) => {
    stateRef.current = nextState;
    setState(nextState);
  }, []);

  const moveToTarget = useCallback((nextTarget) => {
    targetRef.current = nextTarget;
    setTarget(nextTarget);
  }, []);

  const cancelAnimations = useCallback(() => {
    const tracked = animationsRef.current;
    animationsRef.current = [];
    tracked.forEach((animation) => {
      try { animation?.cancel?.(); } catch { /* Detached/finished handles are harmless. */ }
    });
    [morphRef.current, windowMountRef.current, cameraLayerRef?.current].forEach((element) => {
      (element?.getAnimations?.() || []).forEach((animation) => {
        try { animation.cancel(); } catch { /* Best-effort cleanup of untracked browser animations. */ }
      });
    });
  }, [cameraLayerRef]);

  const clearScheduledWork = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
    framesRef.current.forEach((id) => window.cancelAnimationFrame(id));
    framesRef.current = [];
    cancelAnimations();
  }, [cancelAnimations]);

  const schedule = useCallback((callback, delay, generation) => {
    const id = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter((timer) => timer !== id);
      if (generation === generationRef.current) callback();
    }, Math.max(0, delay));
    timersRef.current.push(id);
    return id;
  }, []);

  const scheduleFrame = useCallback((callback, generation) => {
    const id = window.requestAnimationFrame(() => {
      framesRef.current = framesRef.current.filter((frame) => frame !== id);
      if (generation === generationRef.current) callback();
    });
    framesRef.current.push(id);
    return id;
  }, []);

  const trackAnimation = useCallback((element, keyframes, options) => {
    if (!element || typeof element.animate !== 'function') return null;
    const animation = element.animate(keyframes, options);
    animationsRef.current.push(animation);
    return animation;
  }, []);

  const settleOpen = useCallback((notify = false) => {
    cancelAnimations();
    hideFrame(morphRef.current);
    settleCamera(cameraLayerRef?.current, false);
    settleWindow(windowMountRef.current, true);
    setContentVisible(true);
    moveToState('open');
    if (notify) callbackRef.current.onOpened?.(targetRef.current);
  }, [cameraLayerRef, cancelAnimations, moveToState]);

  const settleClosed = useCallback((closedTarget, notify = true) => {
    clearScheduledWork();
    hideFrame(morphRef.current);
    settleWindow(windowMountRef.current, false);
    settleCamera(cameraLayerRef?.current, true);
    setContentVisible(false);
    setWindowBackgroundPose(null);
    contextRef.current = null;
    moveToState('closed');
    moveToTarget(null);
    if (notify) callbackRef.current.onClosed?.(closedTarget);
  }, [cameraLayerRef, clearScheduledWork, moveToState, moveToTarget]);

  useEffect(() => () => {
    generationRef.current += 1;
    clearScheduledWork();
    settleCamera(cameraLayerRef?.current, true);
    hideFrame(morphRef.current);
  }, [cameraLayerRef, clearScheduledWork]);

  const open = useCallback((targetName, geometry) => {
    const pillRect = geometry?.pillRect;
    const segmentRect = geometry?.segmentRect;
    const windowRect = WINDOW_RECTS[targetName];
    if (!pillRect || !segmentRect || !windowRect || stateRef.current !== 'closed') return false;

    clearScheduledWork();
    const generation = (generationRef.current += 1);
    const effectiveFlightMs = Math.max(300, Math.min(3000, Number(flightMs) || MORPH_FLIGHT_MS));
    const total = Math.round(effectiveFlightMs * 0.95);
    const cameraMode = geometry.cameraMode === 'lateral' ? 'lateral' : 'descend';
    const exitDuration = cameraMode === 'lateral' ? DURATIONS.lateralExit() : DURATIONS.descendExit(effectiveFlightMs);
    const secondDuration = Math.max(240, total - exitDuration);
    const split = Math.max(0.2, Math.min(0.45, exitDuration / total));
    const midRect = lerpRect(pillRect, windowRect, split);
    const origin = {
      x: segmentRect.x + segmentRect.w / 2,
      y: segmentRect.y + segmentRect.h / 2,
    };
    const basePose = geometry.baseBackgroundPose || null;
    contextRef.current = { targetName, pillRect, segmentRect, windowRect, midRect, origin, cameraMode, total, effectiveFlightMs, basePose };
    setInspectionProfile({
      target: targetName,
      origin,
      total,
      phaseA: { from: pillRect, to: midRect, duration: exitDuration, easing: MORPH_EASE_IN },
      phaseB: { from: midRect, to: windowRect, duration: secondDuration, easing: MORPH_EASE_OUT, revealFullAt: 0.45 },
      close: { from: windowRect, to: pillRect, duration: total, easing: MORPH_EASE_RETURN, contentHiddenAt: 0.6 },
    });

    moveToTarget(targetName);
    moveToState('preparing');
    setContentVisible(true);
    setWindowBackgroundPose(
      cameraMode === 'descend'
        ? backgroundPose({ camIn: true, origin, flightMs: effectiveFlightMs })
        : basePose
    );

    scheduleFrame(() => {
      const camera = cameraLayerRef?.current;
      const frame = morphRef.current;
      const mount = windowMountRef.current;
      if (prefersReducedMotion() || document.hidden || !camera || !frame || !mount) {
        settleOpen(true);
        return;
      }

      moveToState('camera-out');
      Object.assign(frame.style, frameStyle(pillRect), { opacity: '1' });
      settleWindow(mount, false);
      camera.style.transformOrigin = cameraMode === 'descend' ? `${origin.x}px ${origin.y}px` : '50% 50%';
      trackAnimation(
        camera,
        cameraMode === 'descend' ? descendExitKeyframes(origin, blurPx) : lateralExitKeyframes(),
        { duration: exitDuration, easing: cameraMode === 'descend' ? EASE_DEPARTURE : 'ease-in', fill: 'forwards' }
      );
      trackAnimation(frame, [
        { ...frameStyle(pillRect), opacity: 1 },
        { ...frameStyle(midRect), opacity: 1 },
      ], { duration: exitDuration, easing: MORPH_EASE_IN, fill: 'forwards' });

      schedule(() => {
        cancelAnimations();
        settleCamera(camera, false);
        Object.assign(frame.style, frameStyle(midRect), { opacity: '1' });
        const fromTransform = affineRectTransform(midRect, windowRect);
        Object.assign(mount.style, { opacity: '0.2', transform: fromTransform, transformOrigin: '0 0' });
        moveToState('revealing');
        trackAnimation(frame, [
          { ...frameStyle(midRect), opacity: 1 },
          { opacity: 0.9, offset: 0.55 },
          { ...frameStyle(windowRect), opacity: 0 },
        ], { duration: secondDuration, easing: MORPH_EASE_OUT, fill: 'forwards' });
        trackAnimation(mount, [
          { opacity: 0.2, transform: fromTransform },
          { opacity: 1, offset: 0.45 },
          { opacity: 1, transform: 'translate(0px,0px) scale(1,1)' },
        ], { duration: secondDuration, easing: MORPH_EASE_OUT, fill: 'forwards' });
        schedule(() => settleOpen(true), secondDuration, generation);
      }, exitDuration, generation);
    }, generation);
    return true;
  }, [blurPx, cameraLayerRef, cancelAnimations, clearScheduledWork, flightMs, moveToState, moveToTarget, schedule, scheduleFrame, settleOpen, trackAnimation]);

  const close = useCallback((geometry) => {
    if (stateRef.current === 'closed' || !targetRef.current || !geometry?.pillRect) return false;
    const closingTarget = targetRef.current;
    const windowRect = WINDOW_RECTS[closingTarget];
    if (!windowRect) {
      settleClosed(closingTarget);
      return true;
    }

    if (OPENING_STATES.has(stateRef.current)) settleOpen(false);
    if (CLOSING_STATES.has(stateRef.current)) return false;

    clearScheduledWork();
    const generation = (generationRef.current += 1);
    const context = contextRef.current || {};
    const effectiveFlightMs = context.effectiveFlightMs || MORPH_FLIGHT_MS;
    const total = context.total || Math.round(effectiveFlightMs * 0.95);
    const pillRect = geometry.pillRect;
    const segmentRect = geometry.segmentRect || context.segmentRect || pillRect;
    const origin = {
      x: segmentRect.x + segmentRect.w / 2,
      y: segmentRect.y + segmentRect.h / 2,
    };
    const cameraMode = context.cameraMode || 'descend';
    const returnStart = Math.max(0, Math.round(total * 0.62) - 10);
    const returnDuration = cameraMode === 'lateral' ? DURATIONS.lateralEnter() : DURATIONS.ascendEnter(effectiveFlightMs);
    const finishAt = Math.max(total, returnStart + returnDuration);
    const toPillTransform = affineRectTransform(pillRect, windowRect);
    setInspectionProfile((current) => current ? {
      ...current,
      close: { from: windowRect, to: pillRect, duration: total, easing: MORPH_EASE_RETURN, contentHiddenAt: 0.6 },
    } : current);

    moveToState('hiding-content');
    setContentVisible(true);
    setWindowBackgroundPose(context.basePose);

    scheduleFrame(() => {
      const camera = cameraLayerRef?.current;
      const frame = morphRef.current;
      const mount = windowMountRef.current;
      if (prefersReducedMotion() || document.hidden || !camera || !frame || !mount) {
        callbackRef.current.onPillLabelReveal?.();
        callbackRef.current.onPillSkinReveal?.();
        settleClosed(closingTarget);
        return;
      }

      moveToState('morphing-back');
      settleCamera(camera, false);
      settleWindow(mount, true);
      Object.assign(frame.style, frameStyle(windowRect), { opacity: '0.95' });
      trackAnimation(frame, [
        { ...frameStyle(windowRect), opacity: 0.95 },
        { opacity: 0.85, offset: 0.6 },
        { ...frameStyle(pillRect), opacity: 0 },
      ], { duration: total, easing: MORPH_EASE_RETURN, fill: 'forwards' });
      trackAnimation(mount, [
        { opacity: 1, transform: 'translate(0px,0px) scale(1,1)' },
        { opacity: 0, offset: 0.6 },
        { opacity: 0, transform: toPillTransform },
      ], { duration: total, easing: MORPH_EASE_RETURN, fill: 'forwards' });

      schedule(() => callbackRef.current.onPillLabelReveal?.(), Math.round(total * 0.5), generation);
      schedule(() => callbackRef.current.onPillSkinReveal?.(), Math.round(total * 0.86), generation);
      schedule(() => {
        moveToState('camera-return');
        camera.style.transformOrigin = cameraMode === 'lateral' ? '50% 50%' : `${origin.x}px ${origin.y}px`;
        trackAnimation(
          camera,
          cameraMode === 'lateral' ? lateralEnterKeyframes() : ascendEnterKeyframes(origin, blurPx),
          { duration: returnDuration, easing: EASE_LANDING, fill: 'forwards' }
        );
      }, returnStart, generation);
      schedule(() => {
        hideFrame(frame);
        settleWindow(mount, false);
        setContentVisible(false);
      }, total, generation);
      schedule(() => settleClosed(closingTarget), finishAt, generation);
    }, generation);
    return true;
  }, [blurPx, cameraLayerRef, clearScheduledWork, moveToState, schedule, scheduleFrame, settleClosed, settleOpen, trackAnimation]);

  useEffect(() => {
    const settleOnResize = () => {
      const currentState = stateRef.current;
      if (currentState === 'closed' || currentState === 'open') return;
      generationRef.current += 1;
      if (OPENING_STATES.has(currentState)) {
        clearScheduledWork();
        settleOpen(false);
        return;
      }
      if (CLOSING_STATES.has(currentState)) {
        const closingTarget = targetRef.current;
        callbackRef.current.onPillLabelReveal?.();
        callbackRef.current.onPillSkinReveal?.();
        settleClosed(closingTarget);
      }
    };
    window.addEventListener('resize', settleOnResize, { passive: true });
    window.addEventListener('orientationchange', settleOnResize, { passive: true });
    return () => {
      window.removeEventListener('resize', settleOnResize);
      window.removeEventListener('orientationchange', settleOnResize);
    };
  }, [clearScheduledWork, settleClosed, settleOpen]);

  return {
    morphRef,
    windowMountRef,
    state,
    target,
    contentVisible,
    windowBackgroundPose,
    inspectionProfile,
    open,
    close,
    hidesHud: state !== 'closed' && state !== 'camera-return',
    isBusy: state !== 'closed' && state !== 'open',
    isActive: state !== 'closed',
    MORPH_MS,
  };
}
