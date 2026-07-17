// LifeMap UI V2 — useCameraFlight (Stage 2)
// Explicit phase state machine for the cinematic camera transition:
//   idle -> descend -> idle   (planet clicked, deeper level)
//   idle -> ascend  -> idle   (core clicked, back to parent)
//   idle -> lateral -> idle   (sibling-to-sibling, same depth)
// Owns exactly ONE DOM node (the CameraFlightLayer, via layerRef) and the
// declarative background pose. Never touches user pan/zoom (MapViewport's job)
// and never mutates window/document/global state. No setInterval, no
// MutationObserver. setTimeout usage is tracked and cleared on unmount and
// before every new flight. State-switch is timer-driven, not animation
// 'finish'-gated (finish events stall in throttled/background tabs).
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CENTER_X,
  CENTER_Y,
  DEFAULT_FLIGHT_MS,
  DEFAULT_BLUR_PX,
  EASE_LANDING,
  EASE_DEPARTURE,
  DURATIONS,
  backgroundPose,
  descendExitKeyframes,
  descendEnterKeyframes,
  ascendExitKeyframes,
  ascendEnterKeyframes,
  lateralExitKeyframes,
  lateralEnterKeyframes,
} from './cameraMath.js';

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function settleStyles(el) {
  if (!el) return;
  el.style.opacity = '1';
  el.style.transform = 'none';
  el.style.filter = 'none';
  el.style.transformOrigin = '50% 50%';
}

export function useCameraFlight({ flightMs = DEFAULT_FLIGHT_MS, blurPx = DEFAULT_BLUR_PX, onSwap } = {}) {
  const layerRef = useRef(null);
  const flyingRef = useRef(false);
  const animationsRef = useRef([]);
  const timeoutsRef = useRef([]);
  const generationRef = useRef(0);
  const pendingSwapRef = useRef(null);
  const [phase, setPhase] = useState('idle');
  const [pose, setPose] = useState(() =>
    backgroundPose({ camIn: false, origin: { x: CENTER_X, y: CENTER_Y }, flightMs })
  );

  const clearTimers = useCallback(() => {
    timeoutsRef.current.forEach((id) => window.clearTimeout(id));
    timeoutsRef.current = [];
  }, []);

  const schedule = useCallback((fn, ms, generation) => {
    const id = window.setTimeout(() => {
      if (generation === generationRef.current) fn();
    }, ms);
    timeoutsRef.current.push(id);
    return id;
  }, []);

  const cancelLayerAnimations = useCallback(() => {
    const tracked = animationsRef.current;
    animationsRef.current = [];
    tracked.forEach((animation) => {
      try {
        animation?.cancel?.();
      } catch {
        // A finished or detached animation must not block camera recovery.
      }
    });
    (layerRef.current?.getAnimations?.() || []).forEach((animation) => {
      try {
        animation.cancel();
      } catch {
        // Best-effort cleanup for animations not created by this hook.
      }
    });
  }, []);

  const settleLayer = useCallback(() => {
    cancelLayerAnimations();
    settleStyles(layerRef.current);
  }, [cancelLayerAnimations]);

  useEffect(
    () => () => {
      generationRef.current += 1;
      clearTimers();
      pendingSwapRef.current = null;
      settleLayer();
    },
    [clearTimers, settleLayer]
  );

  const isFlying = useCallback(() => flyingRef.current, []);

  // Starts the EXIT half of a transition. targetLevelId is only forwarded to
  // onSwap for the caller to know what to render next; this hook does not read
  // any level/route data itself.
  const flyTo = useCallback(
    (mode, origin, targetLevelId) => {
      if (flyingRef.current) return;
      clearTimers();
      const generation = (generationRef.current += 1);
      const el = layerRef.current;
      const reduced = prefersReducedMotion();
      flyingRef.current = true;
      setPhase(mode);

      const effectiveOrigin = origin || { x: CENTER_X, y: CENTER_Y };
      pendingSwapRef.current = { targetLevelId, mode, origin: effectiveOrigin, generation };
      const finishSwap = () => {
        const pending = pendingSwapRef.current;
        if (!pending || pending.generation !== generation) return;
        pendingSwapRef.current = null;
        onSwap?.(targetLevelId, mode, effectiveOrigin);
      };

      if (!el || reduced || typeof el.animate !== 'function') {
        setPose(backgroundPose({ camIn: mode === 'descend', origin: effectiveOrigin, flightMs: 0 }));
        settleLayer();
        finishSwap();
        flyingRef.current = false;
        setPhase('idle');
        return;
      }

      cancelLayerAnimations();
      setPose(backgroundPose({ camIn: mode === 'descend', origin: effectiveOrigin, flightMs }));

      let duration;
      let keyframes;
      let easing;
      if (mode === 'descend') {
        duration = DURATIONS.descendExit(flightMs);
        keyframes = descendExitKeyframes(effectiveOrigin, blurPx);
        easing = EASE_DEPARTURE;
        el.style.transformOrigin = `${effectiveOrigin.x}px ${effectiveOrigin.y}px`;
      } else if (mode === 'ascend') {
        duration = DURATIONS.ascendExit(flightMs);
        keyframes = ascendExitKeyframes(blurPx);
        easing = EASE_DEPARTURE;
        el.style.transformOrigin = '50% 50%';
      } else {
        duration = DURATIONS.lateralExit();
        keyframes = lateralExitKeyframes();
        easing = 'ease-in';
        el.style.transformOrigin = '50% 50%';
      }

      animationsRef.current = [el.animate(keyframes, { duration, easing, fill: 'forwards' })];
      schedule(finishSwap, Math.max(0, duration - 10), generation);
    },
    [flightMs, blurPx, onSwap, schedule, clearTimers, cancelLayerAnimations, settleLayer]
  );

  // Called by the host AFTER the new level's DOM has actually rendered (i.e. from
  // an effect keyed on the route/level id) — mirrors the approved design's
  // componentDidUpdate pattern.
  const playEntry = useCallback(
    (mode, origin) => {
      clearTimers();
      cancelLayerAnimations();
      const generation = (generationRef.current += 1);
      pendingSwapRef.current = null;
      const el = layerRef.current;
      const reduced = prefersReducedMotion();
      const effectiveOrigin = origin || { x: CENTER_X, y: CENTER_Y };

      const doSettle = () => {
        settleLayer();
        flyingRef.current = false;
        setPhase('idle');
        setPose(backgroundPose({ camIn: mode === 'descend', origin: effectiveOrigin, flightMs }));
      };

      if (!el || reduced || typeof el.animate !== 'function') {
        doSettle();
        return;
      }

      let duration;
      let keyframes;
      if (mode === 'descend') {
        duration = DURATIONS.descendEnter(flightMs);
        keyframes = descendEnterKeyframes(blurPx);
        el.style.transformOrigin = `${effectiveOrigin.x}px ${effectiveOrigin.y}px`;
      } else if (mode === 'ascend') {
        duration = DURATIONS.ascendEnter(flightMs);
        keyframes = ascendEnterKeyframes(effectiveOrigin, blurPx);
        el.style.transformOrigin = `${effectiveOrigin.x}px ${effectiveOrigin.y}px`;
      } else {
        duration = DURATIONS.lateralEnter();
        keyframes = lateralEnterKeyframes();
        el.style.transformOrigin = '50% 50%';
      }

      animationsRef.current = [el.animate(keyframes, { duration, easing: EASE_LANDING, fill: 'both' })];
      schedule(doSettle, duration + 120, generation);
    },
    [flightMs, blurPx, schedule, clearTimers, cancelLayerAnimations, settleLayer]
  );

  useEffect(() => {
    const settleOnResize = () => {
      if (!flyingRef.current) return;
      const pending = pendingSwapRef.current;
      generationRef.current += 1;
      clearTimers();
      settleLayer();
      if (pending) {
        pendingSwapRef.current = null;
        onSwap?.(pending.targetLevelId, pending.mode, pending.origin);
        return;
      }
      flyingRef.current = false;
      setPhase('idle');
    };
    window.addEventListener('resize', settleOnResize, { passive: true });
    window.addEventListener('orientationchange', settleOnResize, { passive: true });
    return () => {
      window.removeEventListener('resize', settleOnResize);
      window.removeEventListener('orientationchange', settleOnResize);
    };
  }, [clearTimers, onSwap, settleLayer]);

  return { layerRef, phase, pose, flyTo, playEntry, isFlying };
}
