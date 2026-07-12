// LifeMap UI V2 — camera math (Stage 2)
// Pure functions ported directly from the approved Claude Design prototype
// (LifeMap Home.dc.html, class Component: handleNav / componentDidUpdate /
// renderVals). No DOM access, no globals, no React — every value is computed
// from inputs and returned. Values below were read from that source, not guessed:
//   - flightMs default: data-props default is 600 (editor range 400-2000)
//   - blur default: flightBlur=true -> 3px
//   - descend exit duration  = round(flightMs * 0.46), easing cubic-bezier(.45,.05,.85,.4)
//   - descend enter duration = round(flightMs * 0.54), easing cubic-bezier(.22,1,.36,1)
//   - ascend  exit duration  = round(flightMs * 0.42), easing cubic-bezier(.45,.05,.85,.4)
//   - ascend  enter duration = round(flightMs * 0.58), easing cubic-bezier(.22,1,.36,1)
//   - lateral (neither descend nor ascend) exit = 220ms ease-in, enter = 300ms cubic-bezier(.22,1,.36,1)
//   - background: scale 1.32 while camIn, dim layer opacity 1 while camIn (layer's own
//     color is rgba(3,6,10,.72)), background transition duration = flightMs + 550,
//     easing cubic-bezier(.22,.1,.12,1)

export const CENTER_X = 640;
export const CENTER_Y = 400;
export const DEFAULT_FLIGHT_MS = 600;
export const DEFAULT_BLUR_PX = 3;
export const BACKGROUND_ZOOM_SCALE = 1.32;

export const EASE_LANDING = 'cubic-bezier(.22,1,.36,1)';
export const EASE_DEPARTURE = 'cubic-bezier(.45,.05,.85,.4)';
export const EASE_BACKGROUND = 'cubic-bezier(.22,.1,.12,1)';

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export const DURATIONS = {
  descendExit: (flightMs) => Math.round(flightMs * 0.46),
  descendEnter: (flightMs) => Math.round(flightMs * 0.54),
  ascendExit: (flightMs) => Math.round(flightMs * 0.42),
  ascendEnter: (flightMs) => Math.round(flightMs * 0.58),
  lateralExit: () => 220,
  lateralEnter: () => 300,
};

// Converts a map point into camera-layer coordinates after the current
// per-level viewport pan/zoom has been applied. MapViewport scales around the
// fixed design centre, then translates, so the camera must target the visual
// point rather than the raw planet coordinate.
export function pointThroughViewport(point, viewport) {
  const px = Number.isFinite(Number(point?.x)) ? Number(point.x) : CENTER_X;
  const py = Number.isFinite(Number(point?.y)) ? Number(point.y) : CENTER_Y;
  const scale = Number.isFinite(Number(viewport?.scale)) ? Number(viewport.scale) : 1;
  const translateX = Number.isFinite(Number(viewport?.x)) ? Number(viewport.x) : 0;
  const translateY = Number.isFinite(Number(viewport?.y)) ? Number(viewport.y) : 0;
  return {
    x: CENTER_X + (px - CENTER_X) * scale + translateX,
    y: CENTER_Y + (py - CENTER_Y) * scale + translateY,
  };
}

// Background pose while the camera is diving into (camIn=true) or resting at
// (camIn=false) a level. origin = the design-box {x,y} of the visual point used
// to enter that level (or, for ascend, the point we are returning to).
export function backgroundPose({ camIn, origin, flightMs = DEFAULT_FLIGHT_MS }) {
  const ox = Number.isFinite(Number(origin?.x)) ? Number(origin.x) : CENTER_X;
  const oy = Number.isFinite(Number(origin?.y)) ? Number(origin.y) : CENTER_Y;
  const transformOrigin = camIn ? `${ox + 128}px ${oy + 80}px` : `${CENTER_X}px ${CENTER_Y}px`;
  const translateX = camIn ? (CENTER_X - ox) * 0.16 : 0;
  const translateY = camIn ? (CENTER_Y - oy) * 0.16 : 0;
  const scale = camIn ? BACKGROUND_ZOOM_SCALE : 1;
  return {
    transformOrigin,
    transform: `translate(${translateX.toFixed(1)}px,${translateY.toFixed(1)}px) scale(${scale})`,
    dimOpacity: camIn ? 1 : 0,
    transitionMs: flightMs + 550,
  };
}

export function descendExitKeyframes(origin, blurPx = DEFAULT_BLUR_PX) {
  const tx = CENTER_X - origin.x;
  const ty = CENTER_Y - origin.y;
  return [
    { opacity: 1, transform: 'translate(0px,0px) scale(1)', filter: 'blur(0px)' },
    { opacity: 1, transform: `translate(${(tx * 0.45).toFixed(1)}px,${(ty * 0.45).toFixed(1)}px) scale(2.15)`, filter: `blur(${blurPx * 0.5}px)`, offset: 0.6 },
    { opacity: 0, transform: `translate(${tx}px,${ty}px) scale(3.8)`, filter: `blur(${blurPx}px)` },
  ];
}

export function descendEnterKeyframes(blurPx = DEFAULT_BLUR_PX) {
  return [
    { opacity: 0, transform: 'scale(.55)', filter: `blur(${blurPx}px)` },
    { opacity: 1, transform: 'scale(.86)', filter: `blur(${blurPx * 0.25}px)`, offset: 0.45 },
    { opacity: 1, transform: 'scale(1)', filter: 'blur(0px)' },
  ];
}

export function ascendExitKeyframes(blurPx = DEFAULT_BLUR_PX) {
  return [
    { opacity: 1, transform: 'scale(1)', filter: 'blur(0px)' },
    { opacity: 0, transform: 'scale(.6)', filter: `blur(${blurPx * 0.8}px)` },
  ];
}

export function ascendEnterKeyframes(origin, blurPx = DEFAULT_BLUR_PX) {
  const tx = CENTER_X - origin.x;
  const ty = CENTER_Y - origin.y;
  return [
    { opacity: 0, transform: `translate(${tx}px,${ty}px) scale(3.4)`, filter: `blur(${blurPx}px)` },
    { opacity: 1, transform: `translate(${(tx * 0.5).toFixed(1)}px,${(ty * 0.5).toFixed(1)}px) scale(1.7)`, filter: `blur(${blurPx * 0.3}px)`, offset: 0.5 },
    { opacity: 1, transform: 'translate(0px,0px) scale(1)', filter: 'blur(0px)' },
  ];
}

export function lateralExitKeyframes() {
  return [
    { opacity: 1, transform: 'scale(1)' },
    { opacity: 0, transform: 'scale(1.04)' },
  ];
}

export function lateralEnterKeyframes() {
  return [
    { opacity: 0, transform: 'scale(.9)' },
    { opacity: 1, transform: 'scale(1)' },
  ];
}
